import { Frustum, Mesh, Vector3, type AbstractMesh, type Matrix, type RenderTargetTexture, type Scene } from '@babylonjs/core';
import { isReplacedByRenderBatch } from './RenderBatch';

const installed = new WeakSet<Scene>();

type TransmissionHelper = { getOpaqueTarget(): RenderTargetTexture | null; _transparentMeshesCache?: AbstractMesh[] };

/** Frames between refreshes while the camera is still (lights/animations behind glass may still change). */
const IDLE_REFRESH_FRAMES = 15;
/** Frames between refreshes while the camera moves; refraction lagging one frame is not noticeable. */
const MOVING_REFRESH_FRAMES = 2;

/**
 * Screen margin (in NDC units, 2 = full width) around each refractive mesh.
 * The opaque copy is only sampled at refractive pixels: with the model's
 * zero-thickness glass the lookup is the pixel itself, and roughness only
 * selects low mip levels (a few texels). 0.1 = 5 % of the screen is ample.
 */
const REFRACTION_SCREEN_MARGIN = 0.1;

type ScreenRect = { x0: number; y0: number; x1: number; y1: number };
const corner = Vector3.Zero();

/** NDC bounds of a mesh's world box; null when it cannot be bounded (behind the camera). */
function screenRect(mesh: AbstractMesh, transform: Matrix, out: ScreenRect): ScreenRect | null {
  out.x0 = out.y0 = Infinity; out.x1 = out.y1 = -Infinity;
  const m = transform.m;
  for (const point of mesh.getBoundingInfo().boundingBox.vectorsWorld) {
    if (point.x * m[3] + point.y * m[7] + point.z * m[11] + m[15] <= 1e-6) return null;
    Vector3.TransformCoordinatesToRef(point, transform, corner);
    if (corner.x < out.x0) out.x0 = corner.x; if (corner.x > out.x1) out.x1 = corner.x;
    if (corner.y < out.y0) out.y0 = corner.y; if (corner.y > out.y1) out.y1 = corner.y;
  }
  return out;
}

/** The glTF transmission helper uses an explicit list, bypassing normal frustum culling. */
export function optimizeTransmissionPass(scene: Scene): void {
  // Babylon 7's glTF loader attaches this helper without augmenting the Scene type.
  const helper = (scene as Scene & { _transmissionHelper?: TransmissionHelper })._transmissionHelper;
  const target = helper?.getOpaqueTarget();
  if (!helper || !target || installed.has(scene) || target.getCustomRenderList) return;
  installed.add(scene);
  const planes = Frustum.GetPlanes(scene.getTransformMatrix());
  const visible: AbstractMesh[] = [];
  const glassRects: ScreenRect[] = [];
  const rect: ScreenRect = { x0: 0, y0: 0, x1: 0, y1: 0 };
  target.getCustomRenderList = (_face, list, length) => {
    if (!list || !scene.activeCamera) return null;
    const transform = scene.getTransformMatrix();
    Frustum.GetPlanesToRef(transform, planes);
    visible.length = 0;
    // Screen regions where the opaque copy is actually read; null = whole screen.
    let regions: ScreenRect[] | null = helper._transparentMeshesCache ? glassRects : null;
    glassRects.length = 0;
    for (const glass of helper._transparentMeshesCache ?? []) {
      if (!regions) break;
      if (glass.isDisposed() || !glass.isEnabled() || !glass.isVisible || !glass.isInFrustum(planes)) continue;
      const r = screenRect(glass, transform, rect);
      if (!r) { regions = null; break; }
      glassRects.push({ x0: r.x0 - REFRACTION_SCREEN_MARGIN, y0: r.y0 - REFRACTION_SCREEN_MARGIN, x1: r.x1 + REFRACTION_SCREEN_MARGIN, y1: r.y1 + REFRACTION_SCREEN_MARGIN });
    }
    let disposed = 0;
    for (let i = 0; i < length; i++) {
      const mesh = list[i];
      // The loader's deferred mesh registration can retain already disposed
      // construction meshes (e.g. courtyard parts merged in the same task),
      // and model reloads leave every previous model mesh in the list.
      if (!mesh || mesh.isDisposed()) { disposed++; continue; }
      if (!mesh.isEnabled() || !mesh.isVisible || !mesh.subMeshes?.length) continue;
      // Draw either a render batch or its sources, as the camera does.
      if (isReplacedByRenderBatch(scene, mesh)) continue;
      mesh.computeWorldMatrix();
      // Keep instance families together: their source bounds need not enclose instances.
      if (mesh.alwaysSelectAsActiveMesh || mesh.isAnInstance || (mesh instanceof Mesh && (mesh.instances.length || mesh.hasThinInstances))) {
        visible.push(mesh);
        continue;
      }
      if (!mesh.isInFrustum(planes)) continue;
      if (regions) {
        const r = screenRect(mesh, transform, rect);
        if (r && !regions.some(g => r.x1 >= g.x0 && r.x0 <= g.x1 && r.y1 >= g.y0 && r.y0 <= g.y1)) continue;
      }
      visible.push(mesh);
    }
    // Drop disposed entries so they no longer retain memory or cost a check per frame.
    const renderList = target.renderList;
    if (disposed && renderList && list === renderList) {
      let kept = 0;
      for (let i = 0; i < renderList.length; i++) if (renderList[i] && !renderList[i].isDisposed()) renderList[kept++] = renderList[i];
      renderList.length = kept;
    }
    return visible;
  };
  const stopScheduling = scheduleTransmissionRefresh(scene, helper, target, planes);
  target.onDisposeObservable.addOnce(() => { stopScheduling?.(); installed.delete(scene); });
}

/**
 * The opaque scene copy costs a full extra scene pass. Only refresh it while a
 * refractive mesh is on screen: each MOVING_REFRESH_FRAMES while the view
 * changes, otherwise each IDLE_REFRESH_FRAMES.
 */
function scheduleTransmissionRefresh(scene: Scene, helper: TransmissionHelper, target: RenderTargetTexture, planes: ReturnType<typeof Frustum.GetPlanes>): (() => void) | undefined {
  if (!helper._transparentMeshesCache) return;
  target.refreshRate = 0;
  const lastView = Float64Array.from(scene.getTransformMatrix().m);
  let framesSinceRender = Infinity;
  let glassWasVisible = false;
  let wasMoving = false;
  const observer = scene.onBeforeRenderObservable.add(() => {
    framesSinceRender++;
    const glass = helper._transparentMeshesCache ?? [];
    Frustum.GetPlanesToRef(scene.getTransformMatrix(), planes);
    let glassVisible = false;
    for (const mesh of glass) {
      if (!mesh.isDisposed() && mesh.isEnabled() && mesh.isVisible && mesh.isInFrustum(planes)) { glassVisible = true; break; }
    }
    const becameVisible = glassVisible && !glassWasVisible;
    glassWasVisible = glassVisible;
    if (!glassVisible) return;
    const view = scene.getTransformMatrix().m;
    let moved = false;
    for (let i = 0; i < 16; i++) if (view[i] !== lastView[i]) { moved = true; lastView[i] = view[i]; }
    const stopped = wasMoving && !moved;
    wasMoving = moved;
    const interval = moved ? MOVING_REFRESH_FRAMES : IDLE_REFRESH_FRAMES;
    if (becameVisible || stopped || framesSinceRender >= interval) {
      framesSinceRender = 0;
      target.resetRefreshCounter();
    }
  });
  return () => scene.onBeforeRenderObservable.remove(observer);
}
