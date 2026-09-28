import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Color3, MeshBuilder, NullEngine, PBRMaterial, Scene, StandardMaterial, Vector3 } from '@babylonjs/core';
import { createITMaterialUpdater } from '../src/babylon/ITMaterialUpdates';
import { markerCenterToRef } from '../src/babylon/MarkerProjection';

test('static IT screens and powered-off RGB avoid repeated material writes; animated RGB keeps exact colors', () => {
  const engine = new NullEngine(), scene = new Scene(engine);
  try {
    for (const Material of [PBRMaterial, StandardMaterial]) {
      const material = new Material('screen', scene), base = new Color3(.2, .3, .4);
      const update = createITMaterialUpdater(material, true, base, 40);
      const diffuse = material instanceof PBRMaterial ? material.albedoColor : material.diffuseColor;
      let copies = 0;
      const copy = diffuse.copyFrom.bind(diffuse);
      diffuse.copyFrom = c => { copies++; return copy(c); };
      update(false, 0);
      for (let i = 1; i <= 120; i++) update(false, i * 16);
      assert.equal(copies, 1);
      for (const time of [0, 220, 9800]) {
        update(true, time);
        const expected = Color3.FromHSV((275 + time / 220 + 40) % 360, .9, .85);
        assert.ok(diffuse.equals(expected)); assert.ok(material.emissiveColor.equals(expected));
      }
      update(true, 10000, false); assert.ok(diffuse.equals(Color3.Black()));
      update(true, 10001, true); assert.ok(diffuse.equals(Color3.White()));
      update(false, 10002, true); assert.ok(diffuse.equals(Color3.Black()));
      const screen = createITMaterialUpdater(material, false, base, 0);
      screen(true, 0); const written = copies;
      for (let i = 0; i < 120; i++) screen(true, i * 16);
      assert.equal(copies, written); assert.ok(diffuse.equals(base));
      screen(false, 3000); assert.ok(material.emissiveColor.equals(Color3.Black()));
    }
  } finally { scene.dispose(); engine.dispose(); }
});

test('reused marker center matches allocating calculation and follows moved meshes without modifying source bounds', () => {
  const engine = new NullEngine(), scene = new Scene(engine);
  try {
    const meshes = [MeshBuilder.CreateBox('one', {}, scene), MeshBuilder.CreateBox('two', {}, scene)];
    const result = Vector3.Zero(), fallback = new Vector3(7, 8, 9);
    for (const offset of [0, 3, -8]) {
      meshes[0].position.set(offset, 2, 1); meshes[1].position.set(4, offset, 5);
      meshes.forEach(m => m.computeWorldMatrix(true));
      const bounds = meshes.map(m => m.getBoundingInfo().boundingBox.centerWorld.clone());
      const expected = bounds.reduce((sum, point) => sum.add(point), Vector3.Zero()).scale(.5);
      assert.equal(markerCenterToRef(meshes, fallback, result), result);
      assert.ok(result.equals(expected));
      meshes.forEach((m, i) => assert.ok(m.getBoundingInfo().boundingBox.centerWorld.equals(bounds[i])));
    }
    assert.ok(markerCenterToRef([], fallback, result).equals(fallback));
  } finally { scene.dispose(); engine.dispose(); }
});
