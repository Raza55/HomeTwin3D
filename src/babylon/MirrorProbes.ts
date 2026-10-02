import {
  Ray, ReflectionProbe, Vector3,
  type AbstractMesh, type BaseTexture, type Observer, type PBRMaterial, type Scene,
} from '@babylonjs/core';
import { isReplacedByRenderBatch } from './RenderBatch';
import { reducedEffects } from './DeviceClass';

/**
 * Static reflections for mirrors.
 *
 * Each mirror gets a small cube map of its real surroundings, rendered once
 * (one probe per frame, after the scene has settled) instead of every frame.
 * Box projection maps the cube onto the room's walls, so the reflection lines
 * up with the room rather than looking like a distant sphere. A capture renders
 * one cube face per frame (six frames; all six at once were up to 45 000 draw
 * calls in one frame on tablets), so probes refresh only after daylight changes;
 * mirrors show the procedural environment until captured.
 */

const PROBE_SIZE = 256;
/** Only surroundings within this radius are captured. */
const CAPTURE_RADIUS = 5;
/** Settle time after loading, so floorplan lights exist before the first capture. */
const FIRST_CAPTURE_DELAY = 2500;

interface Mirror {
  material: PBRMaterial;
  meshes: AbstractMesh[];
  position: Vector3;
  probe: ReflectionProbe | null;
  captured: boolean;
  /** Cube face drawn in the current frame (0-5) while a capture runs. */
  face: number;
}

/** Room-facing normal of a flat mirror (thinnest direction among its face normals); null if not flat. */
function facing(scene: Scene, meshes: AbstractMesh[], center: Vector3): Vector3 | null {
  const points: Vector3[] = [], candidates: Vector3[] = [];
  for (const mesh of meshes) {
    const world = mesh.computeWorldMatrix(true), p = mesh.getVerticesData('position'), n = mesh.getVerticesData('normal');
    if (!p || !n) continue;
    for (let i = 0; i < p.length; i += 3) points.push(Vector3.TransformCoordinates(new Vector3(p[i], p[i + 1], p[i + 2]), world));
    for (let i = 0; i < n.length; i += 9) candidates.push(Vector3.TransformNormal(new Vector3(n[i], n[i + 1], n[i + 2]), world).normalize());
  }
  let normal: Vector3 | null = null, thinnest = Infinity;
  for (const dir of candidates) {
    let lo = Infinity, hi = -Infinity;
    for (const p of points) { const d = Vector3.Dot(p, dir); if (d < lo) lo = d; if (d > hi) hi = d; }
    if (hi - lo < thinnest) { thinnest = hi - lo; normal = dir; }
  }
  if (!normal || thinnest > .05) return null;
  const free = (dir: Vector3) => scene.pickWithRay(new Ray(center.add(dir.scale(thinnest / 2 + .01)), dir, 3),
    m => !meshes.includes(m) && m.isEnabled() && m.getTotalVertices() > 0)?.distance ?? 3;
  return free(normal) >= free(normal.negate()) ? normal : normal.negate();
}

/** Axis-aligned room box around a point, from rays to the nearest surfaces (for box-projected reflections). */
function roomBox(scene: Scene, origin: Vector3, ignore: AbstractMesh[]): { center: Vector3; size: Vector3 } {
  const reach = (dir: Vector3) => scene.pickWithRay(new Ray(origin, dir, 6),
    m => !ignore.includes(m) && m.isEnabled() && m.isVisible && m.getTotalVertices() > 0 && (m.material?.alpha ?? 1) >= 1)?.distance ?? 3;
  const min = new Vector3(-reach(new Vector3(-1, 0, 0)), -reach(new Vector3(0, -1, 0)), -reach(new Vector3(0, 0, -1)));
  const max = new Vector3(reach(new Vector3(1, 0, 0)), reach(new Vector3(0, 1, 0)), reach(new Vector3(0, 0, 1)));
  return { center: origin.add(min.add(max).scale(.5)), size: max.subtract(min) };
}

export interface MirrorProbes {
  /** Materials that reflect a captured probe (MetalReflections dims them with the daylight since the capture). */
  readonly materials: ReadonlySet<PBRMaterial>;
  /** Re-capture all mirrors, one per frame (e.g. after daylight changes). */
  refresh(): void;
  dispose(): void;
}

export function setupMirrorProbes(scene: Scene, groups: Map<PBRMaterial, AbstractMesh[]>, fallback: BaseTexture): MirrorProbes {
  const mirrors: Mirror[] = [];
  for (const [material, meshes] of groups) {
    let min = new Vector3(Infinity, Infinity, Infinity), max = new Vector3(-Infinity, -Infinity, -Infinity);
    for (const mesh of meshes) {
      const box = mesh.getBoundingInfo().boundingBox;
      min = Vector3.Minimize(min, box.minimumWorld); max = Vector3.Maximize(max, box.maximumWorld);
    }
    const center = min.add(max).scale(.5);
    // Flat mirrors: capture just in front of the glass. Grouped panels (cabinet): from their centre.
    const normal = facing(scene, meshes, center);
    mirrors.push({ material, meshes, position: normal ? center.add(normal.scale(.08)) : center, probe: null, captured: false, face: 0 });
  }

  const queue: Mirror[] = [];
  let active: Mirror | null = null;
  // Tablets: small things (cups, cables, decoration) are invisible at this size anyway.
  const minRadius = reducedEffects() ? .15 : 0;
  const start = performance.now();
  const refresh = () => { for (const mirror of mirrors) if (!queue.includes(mirror)) queue.push(mirror); };

  const capture = (mirror: Mirror) => {
    if (!mirror.probe) {
      const probe = new ReflectionProbe('mirror-probe:' + mirror.material.name, PROBE_SIZE, scene, true);
      probe.position.copyFrom(mirror.position);
      probe.refreshRate = 0; // render once, again only on resetRefreshCounter()
      const box = roomBox(scene, mirror.position, mirror.meshes);
      probe.cubeTexture.boundingBoxPosition = box.center;
      probe.cubeTexture.boundingBoxSize = box.size;
      // Same drawn set as the camera (batches stand in for sources), limited to the surroundings.
      probe.cubeTexture.renderListPredicate = m => !mirror.meshes.includes(m) && m.isEnabled() && m.isVisible
        && m.getTotalVertices() > 0 && !isReplacedByRenderBatch(scene, m) && m.getBoundingInfo().boundingSphere.radiusWorld >= minRadius
        && Vector3.Distance(m.getBoundingInfo().boundingSphere.centerWorld, mirror.position) < CAPTURE_RADIUS + m.getBoundingInfo().boundingSphere.radiusWorld;
      // One face per frame: the others draw nothing and keep their content (no clear).
      const cube = probe.cubeTexture;
      let current = -1;
      cube.getCustomRenderList = face => face === mirror.face ? null : [];
      cube.onBeforeRenderObservable.add(face => { current = face; });
      cube.onClearObservable.add(engine => { if (current === mirror.face) engine.clear(cube.clearColor ?? scene.clearColor, true, true, true); });
      cube.onAfterRenderObservable.add(face => {
        if (face !== 5) return;
        if (mirror.face < 5) { mirror.face++; cube.resetRefreshCounter(); return; }
        // Babylon renders probes only for materials that already use them: the capture
        // is requested explicitly and released once all six faces exist.
        mirror.face = 0;
        if (active === mirror) active = null;
        const targets = scene.customRenderTargets, index = targets.indexOf(cube);
        if (index >= 0) targets.splice(index, 1);
        // Swap only once real content exists, so mirrors never flash black.
        if (!mirror.captured) { mirror.captured = true; mirror.material.reflectionTexture = cube; mirror.material.environmentIntensity = 1; }
      });
      mirror.probe = probe;
    } else {
      mirror.face = 0;
      mirror.probe.cubeTexture.resetRefreshCounter();
    }
    active = mirror;
    if (!scene.customRenderTargets.includes(mirror.probe.cubeTexture)) scene.customRenderTargets.push(mirror.probe.cubeTexture);
  };

  const observer: Observer<Scene> | null = scene.onBeforeRenderObservable.add(() => {
    const now = performance.now();
    if (now - start < FIRST_CAPTURE_DELAY) return;
    if (!mirrors.some(m => m.probe)) refresh();
    // One capture at a time (it takes six frames).
    if (active) return;
    const next = queue.shift();
    if (next) capture(next);
  });

  return {
    materials: new Set(mirrors.map(m => m.material)),
    refresh,
    dispose() {
      scene.onBeforeRenderObservable.remove(observer);
      for (const mirror of mirrors) {
        if (mirror.material.reflectionTexture === mirror.probe?.cubeTexture) mirror.material.reflectionTexture = fallback;
        if (mirror.probe) {
          const index = scene.customRenderTargets.indexOf(mirror.probe.cubeTexture);
          if (index >= 0) scene.customRenderTargets.splice(index, 1);
          mirror.probe.dispose();
        }
      }
    },
  };
}
