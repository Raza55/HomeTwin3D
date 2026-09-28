import test from 'node:test';
import assert from 'node:assert/strict';
import { NullEngine, Scene, MeshBuilder, StandardMaterial, Vector3, DirectionalLight, ShadowGenerator, ArcRotateCamera, RenderTargetTexture, TransformNode } from '@babylonjs/core';
import { batchStaticSunShadows } from '../src/babylon/ShadowCasterBatch';
import { optimizeTransmissionPass } from '../src/babylon/TransmissionCulling';

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
