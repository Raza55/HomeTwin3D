import { Color3, Light, PointLight, SpotLight, ShadowGenerator, Vector3, PBRMaterial, StandardMaterial, type AbstractMesh, type Scene } from '@babylonjs/core';
import type { FloorplanEmitter, HAState, LightConfig } from '../types';
import { kelvinToRGB } from '../utils/color';

export interface FloorplanLightRig {
  lights: Array<PointLight | SpotLight>;
  sources: FloorplanEmitter[];
  shadows: ShadowGenerator[];
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
export function configureFloorplanLightInfluence(scene: Scene, rigs: FloorplanLightRig[], meshes: AbstractMesh[]): void {
  const lights = rigs.flatMap(r => r.lights);
  const budget = 6; // Reserve samplers for material textures and daylight shadows.
  const previous = scene.metadata?.floorplanInfluenceObserver;
  if (previous) scene.onBeforeRenderObservable.remove(previous);
  const previousStates = lights.map(() => ({ enabled: false, intensity: NaN, shadow: false }));
  const nearest = Vector3.Zero();
  let initialized = false;
  const update = () => {
    let changed = !initialized;
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
    if (mat instanceof PBRMaterial || mat instanceof StandardMaterial) mat.maxSimultaneousLights = budget + 2;
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

export function applyFloorplanLightState(rig: FloorplanLightRig, config: LightConfig, state: HAState): Color3 {
  const { color, factor } = floorplanLightState(state, config.warmth);
  const gain = Math.max(0, Math.min(10, config.brightness ?? 1));
  let activated = false;
  rig.lights.forEach((light, i) => {
    const intensity = rig.sources[i].lumens * factor * gain;
    const enabled = factor > 0 && gain > 0;
    activated ||= enabled && !light.isEnabled(false);
    light.diffuse.copyFrom(color);
    light.intensity = intensity;
    // Babylon resynchronizes all scene meshes even for redundant setEnabled calls.
    if (light.isEnabled(false) !== enabled) light.setEnabled(enabled);
  });
  // Depth depends on geometry and light pose, not emitted color or power.
  // Refresh on activation in case geometry changed while the light was off.
  if (activated) invalidateFloorplanShadows(rig);
  return color.scale(factor); // No artificial minimum brightness for imported fixtures.
}
