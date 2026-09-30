import { ClusteredLightContainer, Color3, Light, PointLight, SpotLight, ShadowGenerator, Vector3, PBRMaterial, StandardMaterial, type AbstractMesh, type Scene } from '@babylonjs/core';
import type { FloorplanEmitter, HAState, LightConfig } from '../types';
import { kelvinToRGB } from '../utils/color';
import { getRenderBatchSet } from './RenderBatch';
import { limitShadowCastersToRange } from './ShadowRange';
import { isTabletClass } from './DeviceClass';

export interface FloorplanLightRig {
  lights: Array<PointLight | SpotLight>;
  sources: FloorplanEmitter[];
  shadows: ShadowGenerator[];
  /** Emitters shaded by the scene's clustered light container (no shadows, no per-surface budget). */
  clustered?: Set<Light>;
}

export function createFloorplanLightRig(scene: Scene, config: LightConfig, casters: AbstractMesh[], scale: number, resolution: number): FloorplanLightRig {
  const sources = config.emitters ?? [];
  const lights = sources.map((source, index) => {
    const position = new Vector3(source.position.x, source.position.y, source.position.z);
    const light = source.kind === 'spot'
      ? new SpotLight(`blender-light:${config.entityId}:${index}`, position,
        new Vector3(source.direction!.x, source.direction!.y, source.direction!.z).normalize(), (source.angle ?? 100) * Math.PI / 180, 1, scene)
      : new PointLight(`blender-light:${config.entityId}:${index}`, position, scene);
    light.intensityMode = Light.INTENSITYMODE_LUMINOUSPOWER;
    light.falloffType = Light.FALLOFF_PHYSICAL;
    light.range = source.range * scale;
    light.radius = (source.radius ?? .04) * scale;
    light.intensity = 0;
    light.setEnabled(false);
    return light;
  });
  const rig = { lights, sources, shadows: [] };
  configureFloorplanShadows(rig, casters, resolution);
  return rig;
}

export function configureFloorplanShadows(rig: FloorplanLightRig, casters: AbstractMesh[], resolution: number): void {
  rig.shadows.forEach(s => s.dispose());
  rig.shadows = [];
  if (!casters.length) return;
  for (const light of rig.lights) {
    if (rig.clustered?.has(light)) continue;
    // Each spot uses one face; point emitters need six. Bound memory per source.
    const shadow = new ShadowGenerator(Math.max(256, Math.min(resolution || 256, 512)), light);
    shadow.usePercentageCloserFiltering = true;
    shadow.filteringQuality = ShadowGenerator.QUALITY_LOW;
    shadow.bias = .0005;
    shadow.normalBias = .002;
    light.shadowMinZ = .02;
    light.shadowMaxZ = light.range;
    for (const mesh of casters) if (mesh.isEnabled()) shadow.addShadowCaster(mesh, false);
    const map = shadow.getShadowMap();
    if (map) map.refreshRate = 0; // Recomputed on state/geometry changes, never permanently frozen.
    limitShadowCastersToRange(shadow);
    rig.shadows.push(shadow);
  }
}

export function invalidateFloorplanShadows(rig?: FloorplanLightRig): void {
  rig?.shadows.forEach(s => s.getShadowMap()?.resetRefreshCounter());
}

/** Keep every contributing emitter shadowed. Limit sources per surface rather than
 * disabling occlusion on the remaining lights when the GPU sampler budget is full.
 * Emissive fixture surfaces remain visible even outside the direct-light budget.
 */
/**
 * Lamps per surface. Every bound light costs a set of uniform uploads per draw;
 * on WebKit (iPad) these dominate the frame (~100 ms at six lamps with many lights
 * on). Touch devices keep the two strongest lamps per surface (plus sun and
 * ambient), which also keeps more render batches merged. `?lights=0..6` overrides.
 */
export function floorplanLightBudget(): number {
  const requested = typeof location === 'undefined' ? null : new URLSearchParams(location.search).get('lights');
  if (requested !== null && /^\d$/.test(requested)) return Math.min(6, Number(requested));
  return isTabletClass() ? 2 : 6;
}

export function configureFloorplanLightInfluence(scene: Scene, rigs: FloorplanLightRig[], meshes: AbstractMesh[], budget = floorplanLightBudget()): void {
  // Clustered emitters are shaded by the container, which counts as one light per surface.
  const lights = rigs.flatMap(r => r.lights.filter(light => !r.clustered?.has(light)));
  const container = getClusteredContainer(scene);
  // Reserve samplers for material textures and daylight shadows (max. six lamps).
  const previous = scene.metadata?.floorplanInfluenceObserver;
  if (previous) scene.onBeforeRenderObservable.remove(previous);
  const previousStates = lights.map(() => ({ enabled: false, intensity: NaN, shadow: false }));
  const nearest = Vector3.Zero();
  let initialized = false;
  let batchVersion = -1;
  const update = () => {
    const batches = getRenderBatchSet(scene);
    let changed = !initialized || (batches?.version ?? -1) !== batchVersion;
    for (let i = 0; i < lights.length; i++) {
      const light = lights[i], previous = previousStates[i];
      const enabled = light.isEnabled(), shadow = !!light.getShadowGenerator();
      if (enabled !== previous.enabled || light.intensity !== previous.intensity || shadow !== previous.shadow) {
        changed = true;
        previous.enabled = enabled;
        previous.intensity = light.intensity;
        previous.shadow = shadow;
      }
    }
    if (!changed) return;
    initialized = true;

    const selected = new Map(lights.map(l => [l, [] as AbstractMesh[]]));
    // Light positions and eligibility are shared by every surface in this update.
    const active = lights.filter(l => l.isEnabled() && l.intensity > 0 && l.getShadowGenerator())
      .map(light => ({ light, position: light.getAbsolutePosition(), rangeSquared: light.range * light.range }));
    const candidates: Array<{ light: PointLight | SpotLight; contribution: number }> = [];
    for (const mesh of meshes) {
      mesh.computeWorldMatrix();
      const b = mesh.getBoundingInfo().boundingBox;
      candidates.length = 0;
      for (const { light, position, rangeSquared } of active) {
        Vector3.ClampToRef(position, b.minimumWorld, b.maximumWorld, nearest);
        if (Vector3.DistanceSquared(position, nearest) > rangeSquared) continue;
        const contribution = light.intensity / Math.max(.25, Vector3.DistanceSquared(position, b.centerWorld));
        // Stable top-six insertion preserves the original sort's tie ordering.
        let index = 0;
        while (index < candidates.length && candidates[index].contribution >= contribution) index++;
        if (index >= budget) continue;
        candidates.splice(index, 0, { light, contribution });
        if (candidates.length > budget) candidates.pop();
      }
      candidates.forEach(c => selected.get(c.light)!.push(mesh));
      if (batches?.isBatchedSource(mesh)) batches.recordLights(mesh, candidates.map(c => c.light));
    }
    // Merged render proxies receive exactly the lights all their sources receive;
    // batches whose sources would differ are drawn per source instead.
    const proxies: AbstractMesh[] = [];
    if (batches) {
      for (const [proxy, proxyLights] of batches.resolveLights()) {
        proxies.push(proxy);
        for (const light of proxyLights) selected.get(light as PointLight | SpotLight)?.push(proxy);
      }
      batchVersion = batches.version;
    }
    // The container lights the apartment like the individual emitters did, never the exterior.
    if (container) {
      const included = [...meshes, ...proxies], previous = container.includedOnlyMeshes;
      if (previous.length !== included.length || previous.some((mesh, i) => mesh !== included[i])) container.includedOnlyMeshes = included;
    }
    for (const light of lights) {
      const included = selected.get(light)!;
      // An empty Babylon include-list means ALL meshes. Disable influence explicitly.
      const previous = light.includedOnlyMeshes;
      if (previous.length !== included.length || previous.some((mesh, i) => mesh !== included[i])) {
        light.includedOnlyMeshes = included;
      }
      light.includeOnlyWithLayerMask = included.length ? 0 : 0x80000000;
      light.shadowEnabled = included.length > 0;
    }
  };
  scene.metadata = { ...scene.metadata, floorplanInfluenceObserver: scene.onBeforeRenderObservable.add(update) };
  update();
  for (const mat of scene.materials) {
    if (mat instanceof PBRMaterial || mat instanceof StandardMaterial) mat.maxSimultaneousLights = budget + (container ? 3 : 2);
  }
}

/** One state decoder for surface emission and all physical sources of a circuit. */
export function floorplanLightState(state: HAState, warmth = 2700): { color: Color3; factor: number } {
  const a = state.attributes;
  const brightness = typeof a.brightness === 'number' && Number.isFinite(a.brightness) ? a.brightness : 255;
  const factor = state.state === 'on' ? Math.min(1, Math.max(0, brightness / 255)) : 0;
  let color: Color3;
  if (a.color_mode === 'color_temp' || (!a.rgb_color && !a.hs_color && !a.xy_color)) {
    const k = typeof a.color_temp_kelvin === 'number' && Number.isFinite(a.color_temp_kelvin) ? a.color_temp_kelvin
      : typeof a.color_temp === 'number' && a.color_temp > 0 ? 1000000 / a.color_temp : warmth;
    const rgb = kelvinToRGB(Math.max(1000, Math.min(12000, k)));
    color = new Color3(rgb.r, rgb.g, rgb.b);
  } else if (a.rgb_color?.length === 3) {
    color = new Color3(...a.rgb_color.map(n => Math.min(1, Math.max(0, n / 255))) as [number,number,number]);
  } else if (a.hs_color?.length === 2) {
    color = Color3.FromHSV(a.hs_color[0], a.hs_color[1] / 100, 1);
  } else if (a.xy_color?.length === 2) {
    const [x,y] = a.xy_color;
    const X = x / Math.max(y, .0001), Z = (1-x-y) / Math.max(y, .0001);
    const linear = [3.2406*X-1.5372-.4986*Z, -.9689*X+1.8758+.0415*Z, .0557*X-.204+1.057*Z];
    const max = Math.max(...linear, 1);
    color = new Color3(...linear.map(n => Math.max(0,n/max)) as [number,number,number]).toGammaSpace();
  } else color = Color3.White();
  return { color, factor };
}

/** Light pose at its last activation; a map rendered for another pose is outdated. */
const activationPoses = new WeakMap<Light, string>();
function poseKey(light: Light): string {
  const l = light as Light & { direction?: Vector3 };
  const p = (light as Light & { getAbsolutePosition?: () => Vector3 }).getAbsolutePosition?.();
  return `${p?.x},${p?.y},${p?.z}/${l.direction?.x},${l.direction?.y},${l.direction?.z}`;
}

export function applyFloorplanLightState(rig: FloorplanLightRig, config: LightConfig, state: HAState): Color3 {
  const { color, factor } = floorplanLightState(state, config.warmth);
  const gain = Math.max(0, Math.min(10, config.brightness ?? 1));
  rig.lights.forEach((light, i) => {
    const intensity = rig.sources[i].lumens * factor * gain;
    const enabled = factor > 0 && gain > 0;
    // Depth depends on geometry and light pose, not emitted color or power. Geometry
    // changes (doors, blinds) already mark the maps of switched-off lights as stale,
    // and Babylon keeps that flag until the light renders again. Re-rendering every
    // map on activation made a scene with many lamps stall one frame; only a moved
    // light still needs a fresh map.
    if (enabled && !light.isEnabled(false)) {
      const pose = poseKey(light);
      if (activationPoses.get(light) !== pose) {
        activationPoses.set(light, pose);
        light.getShadowGenerator()?.getShadowMap()?.resetRefreshCounter();
      }
    }
    light.diffuse.copyFrom(color);
    light.intensity = intensity;
    // Babylon resynchronizes all scene meshes even for redundant setEnabled calls.
    if (light.isEnabled(false) !== enabled) light.setEnabled(enabled);
  });
  return color.scale(factor); // No artificial minimum brightness for imported fixtures.
}

/**
 * Render-once shadow maps compile their depth shaders synchronously on first
 * use, which stalls the frame in which a lamp is switched on. Depth shader
 * variants depend on the light type and caster, not on the individual lamp,
 * so compiling them once per type in the background covers every lamp.
 *
 * Babylon's forceCompilationAsync() prepares effects in the *current* render
 * pass, which outside a shadow render is the main pass, and would overwrite
 * the materials' main-pass defines. The shadow map's own pass id is set here.
 */
export async function prewarmFloorplanShadowShaders(rigs: FloorplanLightRig[], isCancelled: () => boolean = () => false): Promise<void> {
  const byType = new Map<string, ShadowGenerator>();
  for (const rig of rigs) for (const shadow of rig.shadows) {
    const type = shadow.getLight().getClassName();
    if (!byType.has(type)) byType.set(type, shadow);
  }
  for (const shadow of byType.values()) {
    const map = shadow.getShadowMap();
    if (!map?.renderList) continue;
    const engine = map.getScene()!.getEngine();
    const passId = map.renderPassIds?.[0] ?? map.renderPassId;
    const subMeshes = map.renderList.flatMap(mesh => mesh.isDisposed() ? [] : mesh.subMeshes ?? []);
    const deadline = performance.now() + 60_000;
    let index = 0;
    while (index < subMeshes.length && performance.now() < deadline) {
      if (isCancelled() || shadow.getShadowMap() !== map) return;
      const slice = performance.now();
      while (index < subMeshes.length && performance.now() - slice < 4) {
        const subMesh = subMeshes[index];
        const previous = engine.currentRenderPassId;
        engine.currentRenderPassId = passId;
        let ready: boolean;
        try {
          ready = subMesh.getMesh().isDisposed()
            || shadow.isReady(subMesh, false, subMesh.getMaterial()?.needAlphaBlendingForMesh(subMesh.getMesh()) ?? false);
        } finally {
          engine.currentRenderPassId = previous;
        }
        if (!ready) break; // Compiling in parallel: retry this sub-mesh next slice.
        index++;
      }
      await new Promise(resolve => setTimeout(resolve, 16));
    }
  }
}

/**
 * Switching a lamp on or off changes how many lights reach each surface, which
 * needs new shader variants. Their JS-side preparation is synchronous and stalls
 * the frame (100-400 ms the first time). This prepares the variants for one
 * currently-off circuit per call, entirely between two frames: lights on, main
 * pass materials checked (effects created and cached), lights off again. No
 * frame renders in between, so nothing visible changes. Returns false when done.
 */
export function createLightVariantPrewarmer(scene: Scene, rigs: FloorplanLightRig[]): () => boolean {
  const queue = rigs.filter(rig => rig.lights.length);
  return () => {
    const influence = scene.metadata?.floorplanInfluenceObserver as { callback: (scene: Scene) => void } | undefined;
    if (!influence) return false;
    let rig: FloorplanLightRig | undefined;
    while ((rig = queue.shift()) && rig.lights.some(light => light.isEnabled(false))) { /* already on: variants exist */ }
    if (!rig) return false;
    const saved = rig.lights.map(light => light.intensity);
    rig.lights.forEach((light, i) => { light.intensity = Math.max(1, rig!.sources[i]?.lumens ?? 1); light.setEnabled(true); });
    influence.callback(scene);
    // Materials cache their readiness per render id; a new id forces the check.
    scene.incrementRenderId();
    const meshes = new Set(rig.lights.flatMap(light => light.includedOnlyMeshes));
    const prepare = (candidates: Iterable<AbstractMesh>) => {
      for (const mesh of candidates) {
        if (mesh.isDisposed()) continue;
        const instanced = !!((mesh as AbstractMesh & { instances?: unknown[] }).instances?.length || (mesh as AbstractMesh & { hasThinInstances?: boolean }).hasThinInstances);
        for (const subMesh of mesh.subMeshes ?? []) subMesh.getMaterial()?.isReadyForSubMesh(mesh, subMesh, instanced);
      }
    };
    prepare(meshes);
    // The glass (transmission) pass renders the same materials in linear space
    // with image processing deferred, which are separate shader variants. It
    // is prepared the way RenderTargetTexture renders it: own pass id, flag set
    // without marking materials dirty.
    const opaque = (scene as Scene & { _transmissionHelper?: { getOpaqueTarget(): { renderPassId: number; renderList: AbstractMesh[] | null } | null } })
      ._transmissionHelper?.getOpaqueTarget();
    if (opaque?.renderList) {
      const engine = scene.getEngine(), imageProcessing = scene.imageProcessingConfiguration as typeof scene.imageProcessingConfiguration & { _applyByPostProcess: boolean };
      const previousPass = engine.currentRenderPassId, previousApply = imageProcessing._applyByPostProcess;
      engine.currentRenderPassId = opaque.renderPassId;
      imageProcessing._applyByPostProcess = true;
      try {
        prepare(opaque.renderList.filter(mesh => meshes.has(mesh)));
      } finally {
        engine.currentRenderPassId = previousPass;
        imageProcessing._applyByPostProcess = previousApply;
      }
    }
    rig.lights.forEach((light, i) => { light.setEnabled(false); light.intensity = saved[i]; });
    influence.callback(scene);
    scene.incrementRenderId();
    return true;
  };
}

/**
 * A lamp's first activation renders its shadow map in that frame (six faces for
 * point emitters). This renders the maps of switched-off lamps ahead of time,
 * one per call, between two frames - the same way the scene renders a shadow
 * target. Afterwards the map counts as rendered, so switching the lamp on only
 * re-renders it if geometry or the light moved meanwhile. Returns false when done.
 */
export function createShadowMapPrewarmer(scene: Scene, rigs: FloorplanLightRig[]): () => boolean {
  const queue = rigs.flatMap(rig => rig.shadows);
  const attempts = new Map<ShadowGenerator, number>();
  type Target = { _shouldRender(): boolean; render(useCameraPostProcess?: boolean): void; isReadyForRendering(): boolean };
  type SceneInternals = { _intermediateRendering: boolean };
  return () => {
    while (queue.length) {
      const shadow = queue.shift()!, light = shadow.getLight();
      const map = shadow.getShadowMap() as unknown as Target | null;
      // Enabled lights render their own map; disposed generators are skipped.
      if (!map || light.isEnabled(false) || light.isDisposed() || light.getShadowGenerator() !== shadow) continue;
      if (!map.isReadyForRendering()) {
        // Shaders may still compile; give up on a map after a few tries (it renders on activation).
        const tries = (attempts.get(shadow) ?? 0) + 1;
        attempts.set(shadow, tries);
        if (tries < 5) queue.push(shadow);
        return true;
      }
      const internals = scene as unknown as SceneInternals;
      internals._intermediateRendering = true;
      try {
        // _shouldRender() is true only while the map was never rendered or marked stale.
        if (map._shouldRender()) {
          scene.incrementRenderId();
          map.render(false);
        }
      } finally {
        internals._intermediateRendering = false;
      }
      activationPoses.set(light, poseKey(light));
      return true;
    }
    return false;
  };
}

/** The clustered light container of a scene, if clustered lighting is active. */
export function getClusteredContainer(scene: Scene): ClusteredLightContainer | null {
  const container = scene.metadata?.floorplanClusteredLights as ClusteredLightContainer | undefined;
  return container && !container.isDisposed() ? container : null;
}

/**
 * Which emitters are clustered: 'multi' = multi-emitter fixtures (desktop default),
 * 'all' = every lamp (no lamp shadows, but every surface then gets the same
 * lights, so render batches never split and the draw count drops), 'off' = none
 * (touch default). `?cluster=0|multi|all`. Tablets are GPU-bound: two lamps per
 * surface cost far less per pixel than every lit lamp of a tile (iPad Safari:
 * 15-20 fps clustered, 30-35 fps off).
 */
export function clusteredLightingMode(): 'off' | 'multi' | 'all' {
  const requested = typeof location === 'undefined' ? null : new URLSearchParams(location.search).get('cluster');
  if (requested === '0' || requested === 'off') return 'off';
  if (requested === 'all' || requested === 'multi') return requested;
  return isTabletClass() ? 'off' : 'multi';
}

/**
 * Multi-emitter fixtures (LED strips, TV gradients, panels with several spots)
 * move into one ClusteredLightContainer: the GPU bins them into screen tiles and
 * each surface binds the container as a single light, instead of up to six
 * emitters with their uniforms per draw. Clustered emitters cast no shadows (a
 * Babylon limitation); single-emitter lamps keep theirs and stay individual.
 * Returns the container, or null when the engine lacks support (then nothing changes).
 */
export function enableClusteredFloorplanLights(scene: Scene, rigs: FloorplanLightRig[]): ClusteredLightContainer | null {
  getClusteredContainer(scene)?.dispose();
  const mode = clusteredLightingMode();
  if (mode === 'off') return null;
  const candidates = mode === 'all' ? rigs.filter(rig => rig.lights.length) : rigs.filter(rig => rig.lights.length > 1);
  if (!candidates.length) return null;
  const container = new ClusteredLightContainer('floorplan-clustered-lights', [], scene);
  if (!container.isSupported) { container.dispose(); return null; }
  for (const rig of candidates) {
    rig.clustered = new Set();
    for (const light of rig.lights) {
      const shadow = light.getShadowGenerator();
      if (shadow) { rig.shadows = rig.shadows.filter(s => s !== shadow); shadow.dispose(); }
      light.shadowEnabled = false;
      // PBR's default falloff is the physical one; the container accepts only the default.
      light.falloffType = Light.FALLOFF_DEFAULT;
      light.includedOnlyMeshes = [];
      light.includeOnlyWithLayerMask = 0;
      if (!ClusteredLightContainer.IsLightSupported(light)) continue;
      container.addLight(light);
      rig.clustered.add(light);
    }
  }
  cullSwitchedOffClusteredLights(scene, container);
  scene.metadata = { ...scene.metadata, floorplanClusteredLights: container };
  return container;
}

/** Reach of a switched-off clustered emitter: it covers no screen tile. */
export const CLUSTERED_OFF_RANGE = 1e-4;

/**
 * The container bins every added light into its screen tiles, switched on or
 * not, and each pixel then evaluates all lights of its tile. Most lamps are off
 * most of the time (e.g. 19 of 82 emitters), so pixels computed dozens of dark
 * lights: on iPad that halved the frame rate. Switched-off emitters get a
 * vanishing range instead (no shader recompile, unlike removing them from the
 * container) and their own range back when they are switched on.
 */
export function cullSwitchedOffClusteredLights(scene: Scene, container: ClusteredLightContainer): void {
  const ranges = new Map<Light, number>();
  for (const light of container.lights) ranges.set(light, light.range);
  const observer = scene.onBeforeRenderObservable.add(() => {
    for (const [light, range] of ranges) {
      const lit = light.isEnabled() && light.intensity > 0;
      if (lit) {
        if (light.range === CLUSTERED_OFF_RANGE) light.range = range;
        else if (light.range !== range) ranges.set(light, light.range);
      } else if (light.range !== CLUSTERED_OFF_RANGE) {
        ranges.set(light, light.range);
        light.range = CLUSTERED_OFF_RANGE;
      }
    }
  });
  container.onDisposeObservable.addOnce(() => {
    scene.onBeforeRenderObservable.remove(observer);
    for (const [light, range] of ranges) if (!light.isDisposed()) light.range = range;
  });
}

/**
 * Lamps that light surfaces individually. Render batches group surfaces by the
 * lamps in reach; clustered emitters are identical for every surface and must
 * not split batches.
 */
export function individualFloorplanLights(entries: Array<{ floorplanRig?: FloorplanLightRig }>): Light[] {
  return entries.flatMap(entry => entry.floorplanRig?.lights.filter(light => !entry.floorplanRig!.clustered?.has(light)) ?? []);
}
