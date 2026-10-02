import { DirectionalLight, Light, Vector3, type AbstractMesh, type Observer, type RenderTargetTexture, type Scene, type ShadowGenerator } from '@babylonjs/core';
import { reducedEffects } from './DeviceClass';

/**
 * A point or spot light only lights points inside its range sphere. The segment
 * from the light to such a point lies inside the sphere as well, so a caster
 * whose bounds do not touch the sphere can never shadow anything this light
 * reaches. Filtering by range therefore leaves every shadow unchanged while a
 * cube shadow map no longer draws the whole apartment six times.
 */

const nearest = Vector3.Zero();

function rangeOf(light: Light): number | null {
  if (light instanceof DirectionalLight) return null;
  const range = (light as Light & { range?: number }).range;
  return typeof range === 'number' && Number.isFinite(range) && range > 0 ? range : null;
}

function lightPosition(light: Light): Vector3 | null {
  return (light as Light & { getAbsolutePosition?: () => Vector3 }).getAbsolutePosition?.() ?? null;
}

/** True when the mesh's current world bounds (expanded by margin) touch the light's range sphere. */
export function meshWithinLightRange(light: Light, mesh: AbstractMesh, margin = 0): boolean {
  const range = rangeOf(light), position = lightPosition(light);
  if (range === null || !position) return true;
  mesh.computeWorldMatrix();
  const box = mesh.getBoundingInfo().boundingBox;
  Vector3.ClampToRef(position, box.minimumWorld, box.maximumWorld, nearest);
  const reach = range + margin;
  return Vector3.DistanceSquared(position, nearest) <= reach * reach;
}

/** Evaluate the caster list against the light's range whenever this shadow map renders. */
export function limitShadowCastersToRange(generator: ShadowGenerator): void {
  const map = generator.getShadowMap();
  const light = generator.getLight();
  if (!map || rangeOf(light) === null || map.getCustomRenderList) return;
  const inRange: AbstractMesh[] = [];
  let renderId = -1;
  map.getCustomRenderList = (_layerOrFace, list, length) => {
    if (!list) return null;
    // Cube maps ask once per face; the result is the same for all six.
    const current = light.getScene().getRenderId();
    if (current === renderId) return inRange;
    renderId = current;
    inRange.length = 0;
    for (let i = 0; i < length; i++) {
      const mesh = list[i];
      if (mesh && !mesh.isDisposed() && meshWithinLightRange(light, mesh)) inRange.push(mesh);
    }
    return inRange;
  };
}

/**
 * Re-render only shadow maps whose light can reach the changed meshes.
 * `margin` covers the space a mesh swept through since the last render
 * (e.g. a door leaf rotating around its hinge).
 */
export function invalidateShadowsNear(scene: Scene, meshes: AbstractMesh[], margin = 0): void {
  if (!meshes.length) return;
  for (const light of scene.lights) {
    if (!light.getShadowGenerator()?.getShadowMap()) continue;
    if (meshes.some(mesh => meshWithinLightRange(light, mesh, margin))) requestShadowRefresh(light);
  }
}

/**
 * Shadow maps to re-render, a few per frame. A door or a row of blinds reaches
 * dozens of lamps; re-rendering all their cube maps at once drew up to 45 000
 * calls in one frame (a visible freeze on tablets). Maps of lamps that are dark
 * at the moment (the day demo keeps lamps enabled at intensity 0) wait until
 * the lamp lights up: nobody sees their shadows meanwhile.
 */
interface RefreshQueue { lights: Set<Light>; observer: Observer<Scene> | null }
const queues = new WeakMap<Scene, RefreshQueue>();

export function requestShadowRefresh(light: Light): void {
  const scene = light.getScene();
  let queue = queues.get(scene);
  if (!queue) { queue = { lights: new Set(), observer: null }; queues.set(scene, queue); }
  queue.lights.add(light);
  if (queue.observer) return;
  const perFrame = reducedEffects() ? 2 : 4;
  const q = queue;
  q.observer = scene.onBeforeRenderObservable.add(() => {
    let released = 0;
    for (const lamp of q.lights) {
      const map = lamp.getShadowGenerator()?.getShadowMap() as RenderTargetTexture | null | undefined;
      if (!map || lamp.isDisposed()) { q.lights.delete(lamp); continue; }
      // Dark or switched off: nothing to see yet (switching on asks again).
      if (!lamp.isEnabled() || lamp.intensity <= 0) continue;
      map.resetRefreshCounter();
      q.lights.delete(lamp);
      if (++released >= perFrame) break;
    }
    let waiting = false;
    for (const lamp of q.lights) if (lamp.isEnabled() && lamp.intensity > 0) { waiting = true; break; }
    if (!!scene.metadata?.shadowRefreshPending !== waiting) scene.metadata = { ...scene.metadata, shadowRefreshPending: waiting };
    if (!q.lights.size) { scene.onBeforeRenderObservable.remove(q.observer); q.observer = null; }
  });
}
