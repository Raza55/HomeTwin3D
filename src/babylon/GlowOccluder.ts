import { Matrix, Mesh, StandardMaterial, Vector3, VertexData, type AbstractMesh, type GlowLayer, type Node, type RenderTargetTexture, type Scene } from '@babylonjs/core';
import { DYNAMIC_EXTRAS, getRenderBatchSet } from './RenderBatch';

/**
 * Cheaper glow pass.
 *
 * Babylon's GlowLayer draws every active mesh into its glow texture: emissive
 * surfaces in their emissive color, all others black so walls hide the glow of
 * lamps behind them. For this apartment that doubles the draw calls of a frame,
 * although only a few dozen surfaces actually glow.
 *
 * The glow texture now receives:
 * - the currently emissive meshes (checked every glow render, so lamps, LEDs and
 *   screens that switch on are drawn as before),
 * - a position-only copy of the large static opaque geometry, merged per area
 *   cell and frustum-culled per cell, as the black occluder. It is drawn with a
 *   polygon offset, so an emissive surface at the same depth still wins,
 * - every other large mesh as before (doors, blinds and other moving parts).
 * Small non-emissive objects are skipped: in the half-resolution, blurred glow
 * texture they only ever blocked a few texels.
 *
 * The occluders stay disabled outside the glow render, so no other pass
 * (camera, shadows, reflection probes, picking) ever sees them. A source that
 * is hidden, becomes transparent or moves is dropped from its cell.
 */

/** Objects smaller than this (bounding-sphere radius, metres) are not needed as occluders. */
const MIN_OCCLUDER_RADIUS = .25;
/** Non-emissive meshes outside the occluder (doors, blinds, fixtures) still block glow from this size on. */
const MIN_DYNAMIC_RADIUS = .5;
/** Meshes with more triangles per square metre of bounding radius are simplified. */
const DENSE_TRIANGLES = 20000;
/** Vertex clustering grid (metres) for those detailed meshes. */
const CLUSTER_SIZE = .03;
/** Horizontal cell size (metres) for frustum culling of the merged occluders. */
const CELL_SIZE = 4;

interface Source { mesh: Mesh; matrix: Matrix; valid: boolean }
interface Cell { sources: Source[]; mesh: Mesh | null; dirty: boolean }

export interface GlowOccluders {
  readonly stats: { cells: number; sources: number; triangles: number };
  dispose(): void;
}

const sceneOccluders = new WeakMap<Scene, GlowOccluders>();

type EmissiveLike = { emissiveColor?: { r: number; g: number; b: number }; emissiveTexture?: unknown; subMaterials?: unknown[] };

function isEmissive(mesh: AbstractMesh): boolean {
  const material = mesh.material as (EmissiveLike & object) | null;
  if (!material) return false;
  if (material.subMaterials || material.emissiveTexture) return true;
  const c = material.emissiveColor;
  return !!c && (c.r > 0 || c.g > 0 || c.b > 0);
}

function isStatic(mesh: AbstractMesh, animated: Set<unknown>): boolean {
  for (let node: Node | null = mesh; node; node = node.parent) {
    const extras = node.metadata?.gltf?.extras;
    if (extras && DYNAMIC_EXTRAS.some(key => extras[key])) return false;
    if (animated.has(node) || node.animations.length) return false;
  }
  return true;
}

/** Current state allows the mesh to stand in the merged occluder. */
function usable(mesh: Mesh): boolean {
  const material = mesh.material;
  return !mesh.isDisposed() && mesh.isEnabled() && mesh.isVisible && mesh.visibility === 1
    && mesh.layerMask === 0x0FFFFFFF && !!material && !material.needAlphaBlendingForMesh(mesh) && !material.needAlphaTestingForMesh(mesh);
}

export function setupGlowOccluders(scene: Scene, glow: GlowLayer, meshes: AbstractMesh[], scale = 1): GlowOccluders {
  sceneOccluders.get(scene)?.dispose();
  const animated = new Set<unknown>(scene.animationGroups.flatMap(group => group.targetedAnimations.map(a => a.target)));
  const minRadius = MIN_OCCLUDER_RADIUS * scale, dynamicRadius = MIN_DYNAMIC_RADIUS * scale, cellSize = CELL_SIZE * scale;

  const material = new StandardMaterial('glow-occluder', scene);
  material.disableLighting = true;
  material.backFaceCulling = false;
  // Push the occluder slightly behind coplanar emissive surfaces (screens, fixtures).
  material.zOffset = 2;
  material.zOffsetUnits = 4;

  const cells = new Map<string, Cell>();
  const covered = new Set<AbstractMesh>();
  /** Small static meshes: neither merged nor drawn; they only matter inside render batches. */
  const negligible = new Set<AbstractMesh>();
  for (const mesh of new Set(meshes)) {
    if (!(mesh instanceof Mesh) || mesh.skeleton || mesh.morphTargetManager || mesh.hasThinInstances || !mesh.getTotalIndices()) continue;
    if (!usable(mesh) || mesh.getVertexBuffer('position')?.isUpdatable() || !isStatic(mesh, animated)) continue;
    const surface = mesh.material as { subSurface?: { isRefractionEnabled?: boolean } } | null;
    if (mesh.metadata?.windowGlass || surface?.subSurface?.isRefractionEnabled) continue;
    mesh.computeWorldMatrix(true);
    const sphere = mesh.getBoundingInfo().boundingSphere;
    if (sphere.radiusWorld < minRadius) { negligible.add(mesh); continue; }
    const key = `${Math.floor(sphere.centerWorld.x / cellSize)},${Math.floor(sphere.centerWorld.z / cellSize)}`;
    const cell = cells.get(key) ?? { sources: [], mesh: null, dirty: true };
    cell.sources.push({ mesh, matrix: mesh.getWorldMatrix().clone(), valid: true });
    cells.set(key, cell);
    covered.add(mesh);
  }

  const point = new Vector3();
  const clusterSize = CLUSTER_SIZE * scale;
  const build = (cell: Cell) => {
    cell.dirty = false;
    cell.mesh?.dispose(false, false);
    cell.mesh = null;
    const positions: number[] = [], indices: number[] = [];
    for (const { mesh, matrix, valid } of cell.sources) {
      if (!valid) continue;
      const local = mesh.getVerticesData('position')!, localIndices = mesh.getIndices()!;
      const radius = mesh.getBoundingInfo().boundingSphere.radiusWorld;
      // Detailed objects (plants, fabric, sculptures): vertex clustering on a small grid keeps
      // their silhouette for the blurred glow at a fraction of the triangles. Walls and other
      // coarse surfaces stay exact, so wall-mounted light strips are never covered.
      const cluster = localIndices.length / 3 / (radius * radius) > DENSE_TRIANGLES / (scale * scale) ? new Map<number, number>() : null;
      const remap = new Int32Array(local.length / 3);
      for (let k = 0, n = 0; k < local.length; k += 3, n++) {
        Vector3.TransformCoordinatesFromFloatsToRef(local[k], local[k + 1], local[k + 2], matrix, point);
        if (cluster) {
          // 17 bits per axis (±1.9 km at 3 cm) keep the packed key an exact integer.
          const key = ((Math.round(point.x / clusterSize) + 65536) * 131072 + Math.round(point.y / clusterSize) + 65536) * 131072
            + Math.round(point.z / clusterSize) + 65536;
          const existing = cluster.get(key);
          if (existing !== undefined) { remap[n] = existing; continue; }
          cluster.set(key, positions.length / 3);
        }
        remap[n] = positions.length / 3;
        positions.push(point.x, point.y, point.z);
      }
      for (let k = 0; k < localIndices.length; k += 3) {
        const a = remap[localIndices[k]], b = remap[localIndices[k + 1]], c = remap[localIndices[k + 2]];
        if (a !== b && b !== c && a !== c) indices.push(a, b, c);
      }
    }
    if (!indices.length) return;
    const occluder = new Mesh('glow-occluder', scene);
    const data = new VertexData();
    data.positions = new Float32Array(positions); data.indices = new Uint32Array(indices);
    data.applyToMesh(occluder, false);
    occluder.material = material;
    occluder.isPickable = false;
    occluder.metadata = { glowOccluder: true };
    occluder.freezeWorldMatrix();
    occluder.setEnabled(false);
    cell.mesh = occluder;
  };
  cells.forEach(build);

  // Proxies of render batches stand for their sources; cache per batch version.
  let coverVersion = 0, batchVersion = -1;
  const proxyCover = new WeakMap<AbstractMesh, [number, boolean]>();
  const isCovered = (mesh: AbstractMesh): boolean => {
    if (covered.has(mesh)) return true;
    const sources = getRenderBatchSet(scene)?.sourcesOf(mesh);
    if (!sources) return false;
    const cached = proxyCover.get(mesh);
    if (cached && cached[0] === coverVersion) return cached[1];
    const value = sources.every(source => covered.has(source) || negligible.has(source));
    proxyCover.set(mesh, [coverVersion, value]);
    return value;
  };

  const drop = (source: Source, cell: Cell) => {
    source.valid = false; covered.delete(source.mesh); cell.dirty = true; coverVersion++;
  };
  let cursor = 0;
  const allCells = [...cells.values()];
  const allSources = allCells.flatMap(cell => cell.sources.map(source => ({ source, cell })));
  /** Cheap state checks on every glow render; world matrices round-robin (static meshes rarely move). */
  const validate = (): boolean => {
    for (const { source, cell } of allSources) {
      if (!source.valid) {
        // A hidden source that is shown again joins its cell again.
        if (usable(source.mesh) && source.mesh.getWorldMatrix().equals(source.matrix)) { source.valid = true; covered.add(source.mesh); cell.dirty = true; coverVersion++; }
        continue;
      }
      if (!usable(source.mesh)) drop(source, cell);
    }
    for (let n = 0; n < 16 && allSources.length; n++) {
      cursor = (cursor + 1) % allSources.length;
      const { source, cell } = allSources[cursor];
      if (source.valid && !source.mesh.computeWorldMatrix().equals(source.matrix)) drop(source, cell);
    }
    let rebuilt = false;
    for (const cell of allCells) if (cell.dirty) { build(cell); rebuilt = true; }
    return rebuilt;
  };

  const list: AbstractMesh[] = [];
  let hooked: RenderTargetTexture | null = null;
  const observers: Array<() => void> = [];
  const hook = (texture: RenderTargetTexture) => {
    hooked = texture;
    const before = texture.onBeforeRenderObservable.add(() => { for (const cell of allCells) cell.mesh?.setEnabled(true); });
    const after = texture.onAfterRenderObservable.add(() => { for (const cell of allCells) cell.mesh?.setEnabled(false); });
    texture.getCustomRenderList = (_layer, renderList, length) => {
      list.length = 0;
      const planes = scene.frustumPlanes;
      for (const cell of allCells) if (cell.mesh && cell.mesh.isInFrustum(planes)) list.push(cell.mesh);
      if (!renderList) return list;
      for (let i = 0; i < length; i++) {
        const mesh = renderList[i];
        // The sky only writes black onto the black-cleared glow texture.
        if (!mesh || mesh.metadata?.glowOccluder || mesh.infiniteDistance || !mesh.material) continue;
        // Blended surfaces (glass, touch zones) tint the glow; they are few and keep their exact look.
        if (isEmissive(mesh) || mesh.material.needAlphaBlendingForMesh(mesh)
          || (!isCovered(mesh) && mesh.getBoundingInfo().boundingSphere.radiusWorld >= dynamicRadius)) list.push(mesh);
      }
      return list;
    };
    observers.push(() => {
      texture.onBeforeRenderObservable.remove(before);
      texture.onAfterRenderObservable.remove(after);
      texture.getCustomRenderList = null;
    });
  };
  // The glow texture can be recreated (resize); validate before each frame so a
  // changed occluder triggers a fresh glow render (GlowRefresh renders on demand).
  const frame = scene.onBeforeRenderObservable.add(() => {
    const texture = (glow as unknown as { _mainTexture?: RenderTargetTexture })._mainTexture;
    if (!texture) return;
    if (texture !== hooked) { observers.splice(0).forEach(remove => remove()); hook(texture); }
    const version = getRenderBatchSet(scene)?.version ?? -1;
    if (version !== batchVersion) { batchVersion = version; coverVersion++; }
    if (validate()) texture.resetRefreshCounter();
  });

  const handle: GlowOccluders = {
    get stats() {
      return {
        cells: allCells.filter(c => c.mesh).length,
        sources: covered.size,
        triangles: allCells.reduce((sum, c) => sum + (c.mesh?.getTotalIndices() ?? 0) / 3, 0),
      };
    },
    dispose() {
      scene.onBeforeRenderObservable.remove(frame);
      observers.splice(0).forEach(remove => remove());
      for (const cell of allCells) cell.mesh?.dispose(false, false);
      material.dispose();
      if (sceneOccluders.get(scene) === handle) sceneOccluders.delete(scene);
    },
  };
  sceneOccluders.set(scene, handle);
  if (import.meta.env?.DEV) (window as Window & { __glowOccluders?: GlowOccluders }).__glowOccluders = handle;
  return handle;
}
