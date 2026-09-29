import test from 'node:test';
import assert from 'node:assert/strict';
import { ArcRotateCamera, MeshBuilder, NullEngine, PointLight, RenderTargetTexture, Scene, StandardMaterial, Vector3 } from '@babylonjs/core';
import { batchStaticRendering } from '../src/babylon/RenderBatch';
import { refreshGlowOnChange } from '../src/babylon/GlowRefresh';
import { SceneChangeMonitor } from '../src/babylon/SceneChangeMonitor';

function candidates(scene: Scene) {
  const list = scene.getActiveMeshCandidates();
  return list.data.slice(0, list.length);
}

test('static meshes with one material merge into a proxy that replaces them for the camera only', () => {
  const engine = new NullEngine(); const scene = new Scene(engine);
  try {
    new ArcRotateCamera('camera', 0, 1, 10, Vector3.Zero(), scene);
    const material = new StandardMaterial('wall', scene);
    const walls = [0, 1, 2].map(i => { const m = MeshBuilder.CreateBox(`wall${i}`, {}, scene); m.position.x = i * 2; m.material = material; return m; });
    const other = MeshBuilder.CreateBox('chair', {}, scene); other.material = new StandardMaterial('chair', scene);
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
