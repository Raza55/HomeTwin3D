import test from 'node:test';
import assert from 'node:assert/strict';
import { NullEngine, Scene, MeshBuilder, StandardMaterial, Vector3, DirectionalLight, PointLight, ShadowGenerator, ArcRotateCamera, RenderTargetTexture, TransformNode } from '@babylonjs/core';
import { batchStaticSunShadows } from '../src/babylon/ShadowCasterBatch';
import { optimizeTransmissionPass } from '../src/babylon/TransmissionCulling';
import { setupSunShadows } from '../src/babylon/SceneManager';
import { limitShadowCastersToRange, invalidateShadowsNear } from '../src/babylon/ShadowRange';

test('shadow batches preserve sources and fall back when a source moves', () => {
  const engine = new NullEngine(); const scene = new Scene(engine);
  try {
    const material = new StandardMaterial('opaque', scene);
    const meshes = Array.from({ length: 4 }, (_, i) => { const m = MeshBuilder.CreateBox(`box${i}`, {}, scene); m.material = material; return m; });
    const light = new DirectionalLight('sun', new Vector3(0, -1, 0), scene); const shadow = new ShadowGenerator(256, light);
    meshes.forEach(m => shadow.addShadowCaster(m, false));
    const dispose = batchStaticSunShadows(shadow)!; const map = shadow.getShadowMap()!;
    assert.equal(map.renderList!.length, 1); const proxy = map.renderList![0];
    assert.equal(proxy.isVisible, false); assert.equal(proxy.layerMask, 0); assert.equal(proxy.isPickable, false);
    assert.ok(meshes.every(m => m.isVisible && !m.isDisposed() && m.material === material));
    map.onBeforeBindObservable.notifyObservers(map); assert.equal(proxy.isVisible, true);
    map.onAfterUnbindObservable.notifyObservers(map); assert.equal(proxy.isVisible, false);
    meshes[0].position.x = 1; meshes[0].computeWorldMatrix(true);
    scene.onBeforeRenderObservable.notifyObservers(scene);
    assert.equal(proxy.isDisposed(), true); assert.deepEqual(new Set(map.renderList), new Set(meshes));
    dispose(); dispose(); assert.equal(map.renderList!.length, 4);
  } finally { scene.dispose(); engine.dispose(); }
});

test('HA devices and differing transforms cannot be batched', () => {
  const engine = new NullEngine(); const scene = new Scene(engine);
  try {
    const material = new StandardMaterial('opaque', scene); const parent = new TransformNode('device', scene);
    parent.metadata = { gltf: { extras: { ha_id: 'preserve-device' } } };
    const meshes = Array.from({ length: 6 }, (_, i) => { const m = MeshBuilder.CreateBox(`box${i}`, {}, scene); m.material = material; if (i < 3) m.parent = parent; else m.position.x = i; return m; });
    const light = new DirectionalLight('sun', new Vector3(0, -1, 0), scene); const shadow = new ShadowGenerator(256, light);
    meshes.forEach(m => shadow.addShadowCaster(m, false)); batchStaticSunShadows(shadow);
    assert.deepEqual([...shadow.getShadowMap()!.renderList!], meshes);
  } finally { scene.dispose(); engine.dispose(); }
});

test('idle shadow validation reads no vertex arrays and detects changed shared parents', () => {
  const engine = new NullEngine(), scene = new Scene(engine);
  try {
    const parent = new TransformNode('shared', scene), material = new StandardMaterial('opaque', scene);
    const meshes = Array.from({ length: 12 }, (_, i) => { const m = MeshBuilder.CreateBox(`mesh${i}`, {}, scene); m.parent = parent; m.material = material; return m; });
    const light = new DirectionalLight('sun', Vector3.Down(), scene), shadow = new ShadowGenerator(64, light);
    meshes.forEach(m => shadow.addShadowCaster(m, false)); batchStaticSunShadows(shadow);
    let reads = 0;
    meshes.forEach(m => { const original = m.getVerticesData.bind(m); m.getVerticesData = (...args) => { reads++; return original(...args); }; });
    for (let i = 0; i < 60; i++) scene.onBeforeRenderObservable.notifyObservers(scene);
    assert.equal(reads, 0, 'normal arrays are not fetched during idle validation');
    assert.equal(shadow.getShadowMap()!.renderList!.length, 1);
    parent.metadata = { gltf: { extras: { ha_room_door: { id: 'new-door' } } } };
    scene.onBeforeRenderObservable.notifyObservers(scene);
    assert.deepEqual(new Set(shadow.getShadowMap()!.renderList), new Set(meshes), 'new dynamic metadata invalidates immediately');
  } finally { scene.dispose(); engine.dispose(); }
});

test('disposing shadow target restores the original list and frees proxies', () => {
  const engine = new NullEngine(); const scene = new Scene(engine);
  try {
    const material = new StandardMaterial('opaque', scene);
    const meshes = Array.from({ length: 3 }, (_, i) => { const m = MeshBuilder.CreateBox(`box${i}`, {}, scene); m.material = material; return m; });
    const light = new DirectionalLight('sun', Vector3.Down(), scene); const shadow = new ShadowGenerator(256, light);
    meshes.forEach(m => shadow.addShadowCaster(m, false)); batchStaticSunShadows(shadow);
    assert.equal(scene.meshes.length, 4); shadow.dispose(); assert.equal(scene.meshes.length, 3);
    assert.ok(meshes.every(m => !m.isDisposed())); assert.equal(scene.materials.filter(m => m.name.startsWith('sun-shadow-batch:')).length, 0);
  } finally { scene.dispose(); engine.dispose(); }
});

test('transmission skips disposed and off-screen meshes while preserving instance families', () => {
  const engine = new NullEngine(); const scene = new Scene(engine);
  try {
    new ArcRotateCamera('camera', -Math.PI / 2, Math.PI / 2, 10, Vector3.Zero(), scene);
    scene.updateTransformMatrix(true);
    const inside = MeshBuilder.CreateBox('inside', {}, scene), outside = MeshBuilder.CreateBox('outside', {}, scene);
    outside.position.x = 10000; outside.computeWorldMatrix(true);
    const disposed = MeshBuilder.CreateBox('disposed', {}, scene); disposed.dispose();
    const family = MeshBuilder.CreateBox('family', {}, scene); family.position.x = 10000; family.computeWorldMatrix(true);
    const instance = family.createInstance('instance'); instance.position.x = 0;
    const target = new RenderTargetTexture('transmission', 256, scene);
    (scene as any)._transmissionHelper = { getOpaqueTarget: () => target };
    optimizeTransmissionPass(scene);
    const list = [inside, outside, disposed, family, instance];
    assert.deepEqual(target.getCustomRenderList!(0, list, list.length), [inside, family, instance]);
    outside.position.x = 0; outside.computeWorldMatrix(true);
    assert.deepEqual(target.getCustomRenderList!(0, list, list.length), [inside, outside, family, instance]);
  } finally { scene.dispose(); engine.dispose(); }
});

test('transmission drops disposed entries and refreshes only while glass is on screen', () => {
  const engine = new NullEngine(); const scene = new Scene(engine);
  try {
    const camera = new ArcRotateCamera('camera', -Math.PI / 2, Math.PI / 2, 10, Vector3.Zero(), scene);
    scene.updateTransformMatrix(true);
    const opaque = MeshBuilder.CreateBox('opaque', {}, scene), stale = MeshBuilder.CreateBox('stale', {}, scene);
    const glass = MeshBuilder.CreateBox('glass', {}, scene);
    const target = new RenderTargetTexture('transmission', 256, scene);
    target.renderList = [opaque, stale];
    (scene as any)._transmissionHelper = { getOpaqueTarget: () => target, _transparentMeshesCache: [glass] };
    optimizeTransmissionPass(scene);
    stale.dispose();
    target.getCustomRenderList!(0, target.renderList, target.renderList!.length);
    assert.deepEqual([...target.renderList!], [opaque], 'disposed meshes are removed, not retained');
    assert.equal(target.refreshRate, 0);
    let refreshes = 0; target.resetRefreshCounter = () => { refreshes++; };
    const frame = () => { scene.updateTransformMatrix(true); scene.onBeforeRenderObservable.notifyObservers(scene); };
    frame(); assert.equal(refreshes, 1, 'glass coming into view refreshes immediately');
    for (let i = 0; i < 14; i++) frame();
    assert.equal(refreshes, 1, 'a still view does not refresh every frame');
    frame(); assert.equal(refreshes, 2, 'a still view still refreshes periodically');
    camera.alpha += 0.1; frame(); frame(); frame();
    assert.ok(refreshes >= 3, 'camera movement refreshes');
    glass.position.x = 10000; glass.computeWorldMatrix(true);
    const before = refreshes; for (let i = 0; i < 40; i++) { camera.alpha += 0.01; frame(); }
    assert.equal(refreshes, before, 'no refresh while all glass is off screen');
  } finally { scene.dispose(); engine.dispose(); }
});

test('sun shadows render on demand when the light or a dynamic caster changes', () => {
  const engine = new NullEngine(); const scene = new Scene(engine);
  try {
    const sun = new DirectionalLight('sun', new Vector3(0, -1, 0), scene);
    const wall = MeshBuilder.CreateBox('wall', {}, scene), blind = MeshBuilder.CreateBox('blind', {}, scene);
    const shadow = setupSunShadows({ sunLight: sun } as any, [wall, blind], 10, 256)!;
    const map = shadow.getShadowMap()!;
    assert.equal(map.refreshRate, 0);
    let refreshes = 0; map.resetRefreshCounter = () => { refreshes++; };
    const frame = () => { scene.incrementRenderId(); scene.onBeforeRenderObservable.notifyObservers(scene); };
    for (let i = 0; i < 130; i++) frame(); // warm-up frames
    refreshes = 0;
    for (let i = 0; i < 30; i++) frame();
    assert.equal(refreshes, 0, 'an unchanged scene does not re-render the shadow map');
    blind.scaling.y = 0.5; frame(); assert.equal(refreshes, 1, 'moving a caster invalidates');
    frame(); assert.equal(refreshes, 1);
    blind.setEnabled(false); frame(); assert.equal(refreshes, 2, 'hiding a caster invalidates');
    sun.direction = new Vector3(1, -1, 0); frame(); assert.equal(refreshes, 3, 'sun movement invalidates');
  } finally { scene.dispose(); engine.dispose(); }
});

test('point-light shadows skip casters outside the light range and only nearby lights are invalidated', () => {
  const engine = new NullEngine(); const scene = new Scene(engine);
  try {
    new ArcRotateCamera('camera', 0, 1, 10, Vector3.Zero(), scene);
    const near = new PointLight('near', new Vector3(0, 2, 0), scene); near.range = 3;
    const far = new PointLight('far', new Vector3(50, 2, 0), scene); far.range = 3;
    const inside = MeshBuilder.CreateBox('inside', {}, scene);
    const edge = MeshBuilder.CreateBox('edge', { size: 2 }, scene); edge.position.x = 3.5; // bounds touch the sphere
    const outside = MeshBuilder.CreateBox('outside', {}, scene); outside.position.x = 20;
    const shadow = new ShadowGenerator(64, near);
    [inside, edge, outside].forEach(m => shadow.addShadowCaster(m, false));
    limitShadowCastersToRange(shadow);
    const map = shadow.getShadowMap()!;
    scene.incrementRenderId();
    assert.deepEqual(map.getCustomRenderList!(0, map.renderList!, map.renderList!.length), [inside, edge]);
    outside.position.x = 1; outside.computeWorldMatrix(true); scene.incrementRenderId();
    assert.deepEqual(map.getCustomRenderList!(0, map.renderList!, map.renderList!.length), [inside, edge, outside], 'moved casters are re-evaluated');
    const farShadow = new ShadowGenerator(64, far);
    let nearResets = 0, farResets = 0;
    map.resetRefreshCounter = () => { nearResets++; };
    farShadow.getShadowMap()!.resetRefreshCounter = () => { farResets++; };
    invalidateShadowsNear(scene, [inside]);
    // Released with the next frame (a few maps per frame).
    scene.onBeforeRenderObservable.notifyObservers(scene);
    assert.equal(nearResets, 1); assert.equal(farResets, 0, 'a distant light keeps its cached shadow');
  } finally { scene.dispose(); engine.dispose(); }
});

test('shadow refreshes spread over frames and wait for dark lamps', () => {
  const engine = new NullEngine(); const scene = new Scene(engine);
  try {
    new ArcRotateCamera('camera', 0, 1, 10, Vector3.Zero(), scene);
    const lamps = Array.from({ length: 9 }, (_, i) => { const l = new PointLight('lamp' + i, new Vector3(i * .1, 2, 0), scene); l.range = 5; return l; });
    const resets = lamps.map(() => 0);
    lamps.forEach((lamp, i) => { const map = new ShadowGenerator(64, lamp).getShadowMap()!; map.resetRefreshCounter = () => { resets[i]++; }; });
    lamps[8].intensity = 0;
    const box = MeshBuilder.CreateBox('door', {}, scene);
    invalidateShadowsNear(scene, [box]);
    scene.onBeforeRenderObservable.notifyObservers(scene);
    assert.equal(resets.reduce((a, b) => a + b, 0), 4, 'at most four maps in one frame (desktop)');
    scene.onBeforeRenderObservable.notifyObservers(scene);
    scene.onBeforeRenderObservable.notifyObservers(scene);
    assert.deepEqual(resets, [1, 1, 1, 1, 1, 1, 1, 1, 0], 'the dark lamp waits');
    lamps[8].intensity = 1;
    scene.onBeforeRenderObservable.notifyObservers(scene);
    assert.equal(resets[8], 1, 'refreshed once it lights up');
  } finally { scene.dispose(); engine.dispose(); }
});
