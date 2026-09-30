import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ArcRotateCamera, Color3, Matrix, MeshBuilder, NullEngine, Scene, ShaderMaterial, StandardMaterial, Vector3, Viewport } from '@babylonjs/core';
import { applyFloorplanLightState, configureFloorplanLightInfluence, createFloorplanLightRig } from '../src/babylon/FloorplanLighting';
import { getMarkerProjection, setMarkerStyle } from '../src/babylon/MarkerProjection';
import type { LightConfig } from '../src/types';
import { positionAtDistanceToRef } from '../src/babylon/PathInterpolation';
import { createParkAtmosphereUpdater } from '../src/babylon/ParkAtmosphere';

test('atmosphere cache preserves day/night, weather and sub-step fog colors without idle color calculations', () => {
  const engine = new NullEngine(), scene = new Scene(engine);
  const originalLerp = Color3.Lerp;
  let interpolations = 0;
  Color3.Lerp = (...args) => { interpolations++; return originalLerp(...args); };
  try {
    const sky = new ShaderMaterial('sky', scene, {}, {});
    const uniforms = new Map<string, Color3>();
    let uploads = 0;
    sky.setColor3 = (name, color) => { uploads++; uniforms.set(name, color); return sky; };
    const ground = new StandardMaterial('ground', scene);
    ground.diffuseColor = new Color3(.3, .5, .2);
    const dry = ground.diffuseColor.clone();
    const update = createParkAtmosphereUpdater(scene, sky, [ground], [ground]);
    let previousKey = '', expectedSky = Color3.Black(), expectedGround = dry;
    let expectedEmission = Color3.Black();
    for (const [elevation, clouds, wet, snow, fog] of [
      [-20, 0, 0, 0, 0], [-4, 0, 0, 0, 0], [12, .4, 0, 0, 0],
      [12.01, .4, 0, 0, 0], [12.06, .4, 0, 0, 0], [12.06, .4, .8, 0, 0],
      [25, 1, .8, .6, .7], [25, 0, 0, 0, 0], [-20, 0, 0, 0, 0],
    ]) {
      const weather = { clouds, wet, snow, fog };
      scene.metadata = { sunAltitudeDeg: elevation, outdoorWeather: weather };
      const daylight = Math.max(0, Math.min(1, (elevation + 10) / 26));
      const tint = originalLerp(new Color3(.025, .03, .045), new Color3(.42, .47, .51), daylight);
      const horizon = originalLerp(originalLerp(new Color3(.045, .055, .10), new Color3(.78, .85, .89), daylight), tint, Math.max(clouds * .55, fog));
      const key = JSON.stringify([Math.round(elevation * 10), weather]);
      if (key !== previousKey) {
        expectedSky = horizon;
        expectedGround = originalLerp(dry.scale(1 - wet * .3), new Color3(.82, .86, .89), snow);
        expectedEmission = expectedGround.scale(.025 + .09 * daylight);
      }
      previousKey = key;
      update();
      assert.ok(scene.fogColor.equals(horizon));
      assert.deepEqual(scene.clearColor.asArray(), [...horizon.asArray(), 1]);
      assert.ok(uniforms.get('horizon')!.equals(expectedSky));
      assert.ok(ground.diffuseColor.equals(expectedGround));
      assert.ok(ground.emissiveColor.equals(expectedEmission));
      const calculations = interpolations, updates = uploads;
      // Simulate WeatherEffects overwriting fog despite identical weather values.
      scene.fogEnabled = false; scene.fogMode = Scene.FOGMODE_NONE;
      scene.fogStart = 0; scene.fogEnd = 1; scene.fogColor.set(0, 0, 0);
      scene.metadata.outdoorWeather = { ...weather };
      for (let frame = 0; frame < 60; frame++) update();
      assert.equal(interpolations, calculations);
      assert.equal(uploads, updates);
      assert.equal(scene.fogEnabled, true);
      assert.equal(scene.fogMode, Scene.FOGMODE_LINEAR);
      assert.equal(scene.fogStart, fog ? 18 : wet ? 55 : 85);
      assert.equal(scene.fogEnd, fog ? 110 : wet ? 210 : 230);
      assert.ok(scene.fogColor.equals(horizon));
    }
  } finally { Color3.Lerp = originalLerp; scene.dispose(); engine.dispose(); }
});

test('unchanged light updates do not resync meshes or invalidate shadow maps', () => {
  const engine = new NullEngine(), scene = new Scene(engine);
  try {
    const mesh = MeshBuilder.CreateBox('surface', {}, scene);
    const config: LightConfig = { entityId: 'light.test', type: 'rgb', position: { x: 0, y: 2, z: 0 },
      emitters: [{ kind: 'point', position: { x: 0, y: 2, z: 0 }, lumens: 1000, range: 8 }] };
    const rig = createFloorplanLightRig(scene, config, [mesh], 1, 512);
    const state = { entity_id: config.entityId, state: 'on', attributes: { brightness: 128, rgb_color: [255, 128, 0] } };
    applyFloorplanLightState(rig, config, state);
    let enabledCalls = 0, shadowInvalidations = 0;
    const light = rig.lights[0], original = light.setEnabled.bind(light);
    light.setEnabled = value => { enabledCalls++; original(value); };
    rig.shadows[0].getShadowMap()!.resetRefreshCounter = () => { shadowInvalidations++; };
    for (let i = 0; i < 60; i++) applyFloorplanLightState(rig, config, { ...state, attributes: { ...state.attributes } });
    assert.equal(enabledCalls, 0);
    assert.equal(shadowInvalidations, 0);
    applyFloorplanLightState(rig, config, { ...state, attributes: { ...state.attributes, brightness: 255 } });
    assert.equal(enabledCalls, 0);
    assert.equal(shadowInvalidations, 0);
    applyFloorplanLightState(rig, config, { ...state, attributes: { brightness: 64, rgb_color: [0, 255, 0] } });
    assert.equal(shadowInvalidations, 0);
    assert.ok(light.diffuse.equals(new Color3(0, 1, 0)));
    applyFloorplanLightState(rig, config, { ...state, state: 'off' });
    assert.equal(enabledCalls, 1);
    assert.equal(light.intensity, 0);
    assert.equal(shadowInvalidations, 0);
    // Doors and blinds mark maps of switched-off lights stale themselves (Babylon keeps
    // that flag), so a scene with many lamps no longer re-renders every map at once.
    applyFloorplanLightState(rig, config, state);
    assert.equal(shadowInvalidations, 0, 'switching back on reuses the unchanged map');
    applyFloorplanLightState(rig, config, { ...state, state: 'off' });
    (light as typeof light & { position: Vector3 }).position.x += 1;
    applyFloorplanLightState(rig, config, state);
    assert.equal(shadowInvalidations, 1, 'a light moved while off renders a fresh map');
  } finally { scene.dispose(); engine.dispose(); }
});

test('optimized influence matches full stable sorting, including ties and out-of-range sources', () => {
  const engine = new NullEngine(), scene = new Scene(engine);
  try {
    const meshes = Array.from({ length: 12 }, (_, i) => {
      const mesh = MeshBuilder.CreateBox(`surface-${i}`, { width: 3, height: .2, depth: 4 }, scene);
      mesh.position.set(i - 6, 0, i % 3); return mesh;
    });
    const configs: LightConfig[] = Array.from({ length: 28 }, (_, i) => ({
      entityId: `light.test_${i}`, type: 'rgb', position: { x: 0, y: 2, z: 0 },
      emitters: [{ kind: 'point', position: { x: i < 8 ? 0 : i - 14, y: 2, z: 0 }, lumens: 1000, range: i % 2 ? 3 : 8 }],
    }));
    const rigs = configs.map(config => createFloorplanLightRig(scene, config, meshes, 1, 512));
    const lights = rigs.map(rig => rig.lights[0]);
    configs.forEach((config, i) => applyFloorplanLightState(rigs[i], config, { entity_id: config.entityId, state: 'on', attributes: {} }));
    configureFloorplanLightInfluence(scene, rigs, meshes);
    for (const mesh of meshes) {
      const b = mesh.getBoundingInfo().boundingBox;
      const expected = lights.map(light => {
        const position = light.getAbsolutePosition();
        return { light, distance: Vector3.DistanceSquared(position, Vector3.Clamp(position, b.minimumWorld, b.maximumWorld)),
          contribution: light.intensity / Math.max(.25, Vector3.DistanceSquared(position, b.centerWorld)) };
      }).filter(c => c.distance <= c.light.range ** 2).sort((a, b) => b.contribution - a.contribution).slice(0, 6).map(c => c.light);
      assert.deepEqual(lights.filter(light => light.canAffectMesh(mesh)).map(l => l.name).sort(), expected.map(l => l.name).sort());
    }
    const lists = lights.map(light => light.includedOnlyMeshes);
    // Uniform dimming preserves the ordering and should retain Babylon's hooked lists.
    configs.forEach((config, i) => applyFloorplanLightState(rigs[i], config, { entity_id: config.entityId, state: 'on', attributes: { brightness: 128 } }));
    scene.onBeforeRenderObservable.notifyObservers(scene);
    lights.forEach((light, i) => assert.equal(light.includedOnlyMeshes, lists[i]));
  } finally { scene.dispose(); engine.dispose(); }
});

for (const halfZRange of [false, true]) test(`overlays share one measurement and preserve projection (half Z range: ${halfZRange})`, () => {
  const engine = new NullEngine(), scene = new Scene(engine);
  try {
    Object.defineProperty(engine, 'isNDCHalfZRange', { value: halfZRange });
    const camera = new ArcRotateCamera('camera', .4, .8, 12, Vector3.Zero(), scene);
    scene.activeCamera = camera;
    let frame = 0, reads = 0, width = 1200, height = 800;
    let rect = { left: 12, top: 25, width: 600, height: 400 } as DOMRect;
    scene.getFrameId = () => frame;
    engine.getRenderWidth = () => width;
    engine.getRenderHeight = () => height;
    engine.getRenderingCanvas = () => ({ getBoundingClientRect: () => { reads++; return rect; } }) as HTMLCanvasElement;
    for (frame = 0; frame < 3; frame++) {
      camera.alpha += .2;
      camera.viewport = new Viewport(.1 * frame, .05 * frame, 1 - .1 * frame, 1 - .05 * frame);
      if (frame === 2) {
        camera.mode = 1; // Orthographic dashboard mode.
        camera.orthoLeft = -8; camera.orthoRight = 8;
        camera.orthoTop = 6; camera.orthoBottom = -6;
      }
      width += 100; height += 50;
      rect = { ...rect, left: rect.left + 30, width: rect.width + 50 };
      scene.setTransformMatrix(camera.getViewMatrix(), camera.getProjectionMatrix(true));
      for (let overlay = 0; overlay < 4; overlay++) {
        const projection = getMarkerProjection(scene)!;
        assert.equal(projection.rect, rect);
        for (const point of [Vector3.Zero(), new Vector3(3, 1, -2), new Vector3(-20, 8, 3)]) {
          const expected = Vector3.Project(point, Matrix.Identity(), scene.getTransformMatrix(), camera.viewport.toGlobal(width, height));
          assert.ok(projection.project(point).equalsWithEpsilon(expected, 1e-10));
        }
      }
      assert.equal(reads, frame + 1);
    }
  } finally { scene.dispose(); engine.dispose(); }
});

test('stationary markers do not rewrite their layout styles', () => {
  let writes = 0;
  const style = new Proxy({ left: '', top: '', translate: '', display: '', visibility: '' }, {
    set(target, property, value) { writes++; Reflect.set(target, property, value); return true; },
  });
  const element = { style } as unknown as HTMLElement;
  for (let i = 0; i < 60; i++) {
    setMarkerStyle(element, 'left', '12px');
    setMarkerStyle(element, 'top', '25px');
    setMarkerStyle(element, 'display', 'grid');
  }
  // One-time anchor (left/top 0), two translate updates while x then y arrive, display once.
  assert.equal(writes, 5);
  assert.equal((style as { translate: string }).translate, '12px 25px');
  assert.equal(style.left, '0px');
  setMarkerStyle(element, 'left', '13px');
  setMarkerStyle(element, 'display', 'none');
  assert.equal(writes, 7, 'a moved marker writes only its translate');
  assert.equal((style as { translate: string }).translate, '13px 25px');
});

test('particle interpolation retains its destination and matches positions along bends and endpoints', () => {
  const path = [new Vector3(0, 0, 0), new Vector3(3, 0, 0), new Vector3(3, 0, 0), new Vector3(3, 4, 0), new Vector3(3, 4, -5)];
  const distances = [0, 3, 3, 7, 12];
  const result = Vector3.Zero();
  const originalPath = path.map(p => p.clone());
  for (let d = -1; d <= 13; d += .125) {
    let expected: Vector3;
    if (d <= 0) expected = path[0];
    else if (d >= 12) expected = path[path.length - 1];
    else {
      // Independent linear segment lookup covers repeated vertices and exact joins.
      let hi = 1;
      while (distances[hi] <= d) hi++;
      const lo = hi - 1;
      expected = Vector3.Lerp(path[lo], path[hi], (d - distances[lo]) / (distances[hi] - distances[lo]));
    }
    assert.equal(positionAtDistanceToRef(path, distances, d, result), result);
    assert.ok(result.equalsWithEpsilon(expected, 1e-12));
  }
  path.forEach((point, i) => assert.ok(point.equals(originalPath[i])));
  assert.equal(positionAtDistanceToRef([path[0]], [0], 2, result), result);
  assert.ok(result.equals(path[0]));
});

test('fractional marker coordinates tolerate CSS serialization and external style changes', () => {
  let writes = 0, translate = '';
  const round = (part: string) => `${Number.parseFloat(part).toFixed(3)}px`;
  const element = { style: {
    left: '', top: '',
    get translate() { return translate; },
    set translate(value: string) { writes++; translate = value.split(' ').map(round).join(' '); },
  } } as unknown as HTMLElement;
  for (let i = 0; i < 60; i++) { setMarkerStyle(element, 'left', '123.123456789px'); setMarkerStyle(element, 'top', '7.5px'); }
  assert.equal(writes, 2, 'x then y, no rewrites despite CSS rounding');
  (element.style as unknown as { translate: string }).translate = '0px 0px';
  setMarkerStyle(element, 'left', '123.123456789px');
  assert.equal(writes, 4, 'an external change is corrected on the next update');
  assert.equal((element.style as unknown as { translate: string }).translate, '123.123px 7.500px');
});
import { DirectionalLight, HemisphericLight, ShadowGenerator } from '@babylonjs/core';
import { getSunPosition, updateSunPosition } from '../src/babylon/SunController';
import { updateBlindState, type BlindMeshEntry } from '../src/babylon/BlindMeshFactory';

test('night skips sunlight shadow rendering and dawn refreshes the map once', () => {
  const engine = new NullEngine(), scene = new Scene(engine);
  try {
    const sun = new DirectionalLight('sun', Vector3.Down(), scene), hemi = new HemisphericLight('sky', Vector3.Up(), scene);
    const shadow = new ShadowGenerator(256, sun);
    let resets = 0; shadow.getShadowMap()!.resetRefreshCounter = () => { resets++; };
    const minutes = Array.from({length:24}, (_,i)=>i*60);
    const day = minutes.find(m=>getSunPosition(0,0,m).isDay)!;
    const night = minutes.find(m=>!getSunPosition(0,0,m).isDay)!;
    updateSunPosition(sun,hemi,0,0,night);
    assert.equal(sun.intensity,0); assert.equal(sun.shadowEnabled,false);
    updateSunPosition(sun,hemi,0,0,night); assert.equal(resets,0);
    updateSunPosition(sun,hemi,0,0,day); assert.equal(sun.shadowEnabled,true); assert.ok(sun.intensity>0); assert.equal(resets,1);
    updateSunPosition(sun,hemi,0,0,day); assert.equal(resets,1);
  } finally { scene.dispose(); engine.dispose(); }
});

test('blind shadow invalidation follows actual geometry, not repeated or unavailable state messages', () => {
  const engine = new NullEngine(), scene = new Scene(engine);
  try {
    const noop=()=>{};
    const ctx={clearRect:noop,beginPath:noop,moveTo:noop,lineTo:noop,quadraticCurveTo:noop,closePath:noop,fill:noop,fillText:noop};
    const entry={panel:MeshBuilder.CreateBox('panel',{},scene),label:MeshBuilder.CreateBox('label',{},scene),slats:[],panelMat:new StandardMaterial('panel',scene),labelTexture:{getContext:()=>ctx,update:noop},config:{position:{x:0,y:1,z:0},size:{width:1,height:2,depth:.1}}} as unknown as BlindMeshEntry;
    const state={entity_id:'cover.test',state:'open',attributes:{current_position:50}};
    assert.equal(updateBlindState(entry,state),true);
    assert.equal(updateBlindState(entry,{...state,attributes:{...state.attributes}}),false);
    const position=entry.panel.position.clone(),height=entry.panel.scaling.y;
    assert.equal(updateBlindState(entry,{...state,state:'unavailable'}),false);
    assert.ok(entry.panel.position.equals(position)); assert.equal(entry.panel.scaling.y,height);
    assert.equal(updateBlindState(entry,state),false);
    assert.equal(updateBlindState(entry,{...state,attributes:{current_position:25}}),true);
    assert.equal(updateBlindState(entry,{...state,state:'opening',attributes:{}}),false);
  } finally { scene.dispose(); engine.dispose(); }
});

test('glow pass draws emissive and moving meshes plus merged static occluders only', async () => {
  const { RenderTargetTexture } = await import('@babylonjs/core');
  const { setupGlowOccluders } = await import('../src/babylon/GlowOccluder');
  const engine = new NullEngine(), scene = new Scene(engine);
  try {
    new ArcRotateCamera('camera', 0, 1, 20, Vector3.Zero(), scene);
    const matte = new StandardMaterial('matte', scene), glowing = new StandardMaterial('glowing', scene);
    glowing.emissiveColor = new Color3(1, .5, 0);
    const wall = MeshBuilder.CreateBox('wall', { width: 4, height: 2.5, depth: .2 }, scene);
    const cup = MeshBuilder.CreateBox('cup', { size: .1 }, scene);
    const lamp = MeshBuilder.CreateBox('lamp', { size: 1 }, scene);
    const door = MeshBuilder.CreateBox('door', { width: 1, height: 2, depth: .05 }, scene);
    door.metadata = { gltf: { extras: { ha_room_door: 'hall' } } };
    for (const mesh of [wall, cup, door]) mesh.material = matte;
    lamp.material = glowing;
    lamp.position.x = 10; // separate occluder cell
    const texture = new RenderTargetTexture('glow-main', 64, scene);
    const glow = { _mainTexture: texture } as never;
    const occluders = setupGlowOccluders(scene, glow, [wall, cup, lamp, door]);
    scene.render();
    const cells = scene.meshes.filter(m => m.metadata?.glowOccluder);
    assert.equal(cells.length, 2, 'wall and lamp are merged; cup is too small, door moves');
    assert.ok(cells.every(m => !m.isEnabled()), 'occluders stay invisible to every other pass');
    const drawn = texture.getCustomRenderList!(0, [wall, cup, lamp, door], 4)!;
    assert.ok(drawn.includes(lamp) && drawn.includes(door));
    assert.ok(!drawn.includes(wall) && !drawn.includes(cup));
    assert.equal(drawn.filter(m => m.metadata?.glowOccluder).length, 2);
    // Hidden sources leave their cell; the occluder must not keep blocking the view.
    wall.isVisible = false;
    scene.render();
    assert.equal(scene.meshes.filter(m => m.metadata?.glowOccluder).length, 1);
    occluders.dispose();
    assert.equal(texture.getCustomRenderList, null);
  } finally { scene.dispose(); engine.dispose(); }
});

test('shadow maps of switched-off lamps are rendered ahead of their first activation', async () => {
  const { createShadowMapPrewarmer } = await import('../src/babylon/FloorplanLighting');
  const engine = new NullEngine(), scene = new Scene(engine);
  try {
    new ArcRotateCamera('camera', 0, 1, 10, Vector3.Zero(), scene);
    const mesh = MeshBuilder.CreateBox('surface', {}, scene);
    const config: LightConfig = { entityId: 'light.test', type: 'rgb', position: { x: 0, y: 2, z: 0 },
      emitters: [{ kind: 'point', position: { x: 0, y: 2, z: 0 }, lumens: 1000, range: 8 }] };
    const rig = createFloorplanLightRig(scene, config, [mesh], 1, 512);
    const off = { entity_id: config.entityId, state: 'off', attributes: {} };
    applyFloorplanLightState(rig, config, off);
    const map = rig.shadows[0].getShadowMap()!;
    let renders = 0;
    map.onBeforeRenderObservable.add(() => { renders++; });
    // NullEngine never compiles shaders; treat the map as ready.
    map.isReadyForRendering = () => true;
    const prewarm = createShadowMapPrewarmer(scene, [rig]);
    // A map whose shaders are still compiling is retried on a later call.
    let steps = 0;
    while (prewarm() && steps < 20) steps++;
    assert.ok(steps < 20, 'the prewarmer finishes');
    assert.ok(renders > 0, 'the switched-off lamp map was rendered');
    let invalidations = 0;
    const reset = map.resetRefreshCounter.bind(map);
    map.resetRefreshCounter = () => { invalidations++; reset(); };
    applyFloorplanLightState(rig, config, { ...off, state: 'on', attributes: { brightness: 255 } });
    assert.equal(invalidations, 0, 'first activation reuses the prepared map');
  } finally { scene.dispose(); engine.dispose(); }
});

test('clustered PBR lighting compiles for sheen materials (Babylon include fix)', async () => {
  const { ShaderStore } = await import('@babylonjs/core');
  const { installShaderFixes } = await import('../src/babylon/ShaderFixes');
  installShaderFixes();
  for (const store of [ShaderStore.IncludesShadersStore, ShaderStore.IncludesShadersStoreWGSL]) {
    const source = store.pbrClusteredLightingFunctions;
    assert.equal(typeof source, 'string');
    assert.ok(!source.includes('computeSheenLighting(preInfo,normalW,'), 'sheen uses the function normal');
  }
});

import { parseShadows, transformScale } from '../src/babylon/MarkerRaster';

test('marker raster reads computed box shadows and hover scale', () => {
  assert.deepEqual(parseShadows('rgba(0, 0, 0, 0.47) 0px 2px 9px 0px, rgba(16, 33, 48, 0.667) 0px 0px 0px 2px'), [
    { color: 'rgba(0, 0, 0, 0.47)', x: 0, y: 2, blur: 9, spread: 0 },
    { color: 'rgba(16, 33, 48, 0.667)', x: 0, y: 0, blur: 0, spread: 2 },
  ]);
  assert.deepEqual(parseShadows('none'), []);
  assert.deepEqual(parseShadows('rgba(0, 0, 0, 0.5) 0px 0px 4px 0px inset'), []);
  assert.deepEqual(parseShadows('rgba(0, 0, 0, 0) 0px 2px 4px 0px'), []);
  assert.equal(transformScale('none'), 1);
  assert.equal(transformScale('matrix(1.4, 0, 0, 1.4, -18.2, -18.2)'), 1.4);
  assert.equal(transformScale('matrix(1, 0, 0, 1, -13, -13)'), 1);
});

import { Observable, PointLight as ClusterPointLight, type ClusteredLightContainer } from '@babylonjs/core';
import { cullSwitchedOffClusteredLights, CLUSTERED_OFF_RANGE } from '../src/babylon/FloorplanLighting';

test('switched-off clustered emitters leave the tiles and get their range back', () => {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const on = new ClusterPointLight('on', Vector3.Zero(), scene), off = new ClusterPointLight('off', Vector3.Zero(), scene);
  on.range = 7; on.intensity = 2;
  off.range = 3; off.intensity = 0;
  const container = { lights: [on, off], onDisposeObservable: new Observable() } as unknown as ClusteredLightContainer;
  cullSwitchedOffClusteredLights(scene, container);
  scene.onBeforeRenderObservable.notifyObservers(scene);
  assert.equal(on.range, 7);
  assert.equal(off.range, CLUSTERED_OFF_RANGE);
  off.intensity = 1; on.setEnabled(false);
  scene.onBeforeRenderObservable.notifyObservers(scene);
  assert.equal(off.range, 3);
  assert.equal(on.range, CLUSTERED_OFF_RANGE);
  container.onDisposeObservable.notifyObservers(container);
  assert.equal(on.range, 7);
  scene.dispose(); engine.dispose();
});
