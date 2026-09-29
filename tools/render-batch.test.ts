import test from 'node:test';
import assert from 'node:assert/strict';
import { Color3, ArcRotateCamera, MeshBuilder, NullEngine, PointLight, RenderTargetTexture, Scene, StandardMaterial, Vector3 } from '@babylonjs/core';
import { batchStaticRendering } from '../src/babylon/RenderBatch';
import { refreshGlowOnChange } from '../src/babylon/GlowRefresh';
import { SceneChangeMonitor } from '../src/babylon/SceneChangeMonitor';

function candidates(scene: Scene) {
  const list = scene.getActiveMeshCandidates();
  return list.data.slice(0, list.length);
}

test('materials differing only in base color merge with per-vertex colors', () => {
  const engine = new NullEngine(); const scene = new Scene(engine);
  try {
    new ArcRotateCamera('camera', 0, 1, 10, Vector3.Zero(), scene);
    const colors = [new Color3(1, 0, 0), new Color3(0, .5, 1)];
    const boxes = colors.map((color, i) => {
      const material = new StandardMaterial(`paint${i}`, scene); material.diffuseColor = color;
      const box = MeshBuilder.CreateBox(`box${i}`, {}, scene); box.position.x = i * 2; box.material = material; return box;
    });
    const set = batchStaticRendering(scene, boxes, []);
    assert.deepEqual(set.stats, { batches: 1, sources: 2 });
    const proxy = scene.meshes.find(m => m.metadata?.renderBatch)!;
    const proxyMaterial = proxy.material as StandardMaterial;
    assert.ok(proxyMaterial !== boxes[0].material && proxyMaterial.diffuseColor.equals(Color3.White()));
    const vertexColors = proxy.getVerticesData('color')!;
    assert.deepEqual([...vertexColors.slice(0, 4)], [1, 0, 0, 1]);
    assert.deepEqual([...vertexColors.slice(-4)], [0, .5, 1, 1]);
    // Recoloring a source dissolves the batch; the batch-owned material goes with it.
    (boxes[1].material as StandardMaterial).diffuseColor = new Color3(0, 1, 0);
    scene.onBeforeRenderObservable.notifyObservers(scene);
    assert.equal(set.stats.batches, 0);
    assert.ok(proxyMaterial.isFrozen === false && !scene.materials.includes(proxyMaterial));
    set.dispose();
  } finally { scene.dispose(); engine.dispose(); }
});

test('static meshes with one material merge into a proxy that replaces them for the camera only', () => {
  const engine = new NullEngine(); const scene = new Scene(engine);
  try {
    new ArcRotateCamera('camera', 0, 1, 10, Vector3.Zero(), scene);
    const material = new StandardMaterial('wall', scene);
    const walls = [0, 1, 2].map(i => { const m = MeshBuilder.CreateBox(`wall${i}`, {}, scene); m.position.x = i * 2; m.material = material; return m; });
    // A different shading input (not just the base color) keeps the chair out of the batch.
    const chair = new StandardMaterial('chair', scene); chair.specularPower = 12;
    const other = MeshBuilder.CreateBox('chair', {}, scene); other.material = chair;
    const set = batchStaticRendering(scene, [...walls, other], []);
    assert.deepEqual(set.stats, { batches: 1, sources: 3 });
    const proxy = scene.meshes.find(m => m.metadata?.renderBatch)!;
    assert.equal(proxy.material, material);
    assert.equal(proxy.isPickable, false);
    assert.equal(proxy.getTotalVertices(), walls.reduce((n, m) => n + m.getTotalVertices(), 0));
    const drawn = candidates(scene);
    assert.ok(drawn.includes(proxy) && drawn.includes(other));
    assert.ok(walls.every(w => !drawn.includes(w) && w.isPickable && w.isVisible), 'sources stay pickable and visible for logic');
    // Changing a source's material dissolves the batch and restores the sources.
    walls[1].material = new StandardMaterial('painted', scene);
    scene.onBeforeRenderObservable.notifyObservers(scene);
    assert.equal(set.stats.batches, 0);
    assert.ok(proxy.isDisposed());
    assert.ok(walls.every(w => candidates(scene).includes(w)));
    set.dispose();
  } finally { scene.dispose(); engine.dispose(); }
});

test('batches draw sources individually while their lights would differ', () => {
  const engine = new NullEngine(); const scene = new Scene(engine);
  try {
    new ArcRotateCamera('camera', 0, 1, 10, Vector3.Zero(), scene);
    const light = new PointLight('lamp', new Vector3(0, 1, 0), scene); light.range = 50;
    const material = new StandardMaterial('floor', scene);
    const tiles = [0, 1].map(i => { const m = MeshBuilder.CreateBox(`tile${i}`, {}, scene); m.position.x = i * 2; m.material = material; return m; });
    const set = batchStaticRendering(scene, tiles, [light]);
    const proxy = scene.meshes.find(m => m.metadata?.renderBatch)!;
    set.recordLights(tiles[0], [light]); set.recordLights(tiles[1], [light]);
    assert.deepEqual([...set.resolveLights().entries()], [[proxy, [light]]]);
    assert.ok(candidates(scene).includes(proxy));
    set.recordLights(tiles[0], [light]); set.recordLights(tiles[1], []);
    assert.equal(set.resolveLights().size, 0, 'inconsistent light selection keeps the proxy unlit');
    const drawn = candidates(scene);
    assert.ok(!drawn.includes(proxy) && tiles.every(t => drawn.includes(t)), 'sources are drawn instead');
    set.dispose();
  } finally { scene.dispose(); engine.dispose(); }
});

test('glow texture re-renders only when the view, a mesh or an emissive input changes', () => {
  const engine = new NullEngine(); const scene = new Scene(engine);
  try {
    const camera = new ArcRotateCamera('camera', 0, 1, 10, Vector3.Zero(), scene);
    const lamp = MeshBuilder.CreateBox('lamp', {}, scene);
    const material = new StandardMaterial('bulb', scene); material.emissiveColor.set(1, .8, .5); lamp.material = material;
    const texture = new RenderTargetTexture('glow', 64, scene);
    let refreshes = 0; texture.resetRefreshCounter = () => { refreshes++; };
    refreshGlowOnChange(scene, { _mainTexture: texture } as never);
    const frame = () => { scene.updateTransformMatrix(true); scene.onAfterActiveMeshesEvaluationObservable.notifyObservers(scene); };
    (scene as any)._activeMeshes.push(lamp);
    for (let i = 0; i < 130; i++) frame(); // warm-up
    assert.equal(texture.refreshRate, 0);
    refreshes = 0;
    for (let i = 0; i < 20; i++) frame();
    assert.equal(refreshes, 0, 'a still scene reuses the glow texture');
    material.emissiveColor.set(.2, .2, .2); frame(); assert.equal(refreshes, 1, 'emissive change');
    frame(); assert.equal(refreshes, 1);
    lamp.position.y = 1; lamp.computeWorldMatrix(true); frame(); assert.equal(refreshes, 2, 'mesh moved');
    camera.alpha += .1; frame(); assert.equal(refreshes, 3, 'camera moved');
  } finally { scene.dispose(); engine.dispose(); }
});

test('scene change monitor reports only visible changes', () => {
  const engine = new NullEngine(); const scene = new Scene(engine);
  try {
    new ArcRotateCamera('camera', 0, 1, 10, Vector3.Zero(), scene);
    const light = new PointLight('lamp', new Vector3(0, 2, 0), scene);
    const box = MeshBuilder.CreateBox('box', {}, scene);
    const material = new StandardMaterial('m', scene); box.material = material;
    (scene as any)._activeMeshes.push(box);
    const monitor = new SceneChangeMonitor(scene);
    assert.equal(monitor.check(), true, 'first check sees everything as new');
    assert.equal(monitor.check(), false, 'nothing changed');
    material.emissiveColor.set(1, 0, 0); assert.equal(monitor.check(), true, 'material color');
    assert.equal(monitor.check(), false);
    light.intensity = 3; assert.equal(monitor.check(), true, 'light intensity');
    box.position.x = 1; box.computeWorldMatrix(true); assert.equal(monitor.check(), true, 'mesh moved');
    box.isVisible = false; assert.equal(monitor.check(), true, 'visibility');
    assert.equal(monitor.check(), false);
  } finally { scene.dispose(); engine.dispose(); }
});

test('color batches keep every source in place, including mirrored ones', () => {
  const engine = new NullEngine(); const scene = new Scene(engine);
  try {
    new ArcRotateCamera('camera', 0, 1, 10, Vector3.Zero(), scene);
    const boxes = [0, 1, 2].map(i => {
      const material = new StandardMaterial(`tone${i}`, scene); material.diffuseColor = new Color3(i / 2, .5, 1 - i / 2);
      const box = MeshBuilder.CreateBox(`part${i}`, { width: 1 + i, height: 1, depth: 1 }, scene);
      box.position.set(i * 3, i, -i); box.material = material;
      return box;
    });
    // Two mirrored parts share a batch key (same winding); mirroring must not move them.
    boxes[1].scaling.x = -1; boxes[2].scaling.x = -1; boxes[2].rotation.y = .7;
    const set = batchStaticRendering(scene, boxes.slice(1), []);
    assert.equal(set.stats.batches, 1);
    const proxy = scene.meshes.find(m => m.metadata?.renderBatch)!;
    proxy.computeWorldMatrix(true);
    let min = new Vector3(Infinity, Infinity, Infinity), max = new Vector3(-Infinity, -Infinity, -Infinity);
    for (const box of boxes.slice(1)) { box.computeWorldMatrix(true); const b = box.getBoundingInfo().boundingBox; min = Vector3.Minimize(min, b.minimumWorld); max = Vector3.Maximize(max, b.maximumWorld); }
    const box = proxy.getBoundingInfo().boundingBox;
    assert.ok(Vector3.Distance(box.minimumWorld, min) < 1e-4 && Vector3.Distance(box.maximumWorld, max) < 1e-4, 'proxy covers exactly its sources');
    assert.equal(proxy.getVerticesData('color')!.length / 4, proxy.getTotalVertices());
    set.dispose();
  } finally { scene.dispose(); engine.dispose(); }
});
