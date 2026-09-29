import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Camera, FreeCamera, MeshBuilder, NullEngine, Scene, StandardMaterial, Vector3 } from '@babylonjs/core';
import { MarkerOcclusion } from '../src/babylon/MarkerOcclusion';

// Handedness is a scene setting fixed before cameras exist (Babylon 9 cameras keep it from construction).
function setup(rightHanded = false) {
  const engine = new NullEngine(), scene = new Scene(engine);
  scene.useRightHandedSystem = rightHanded;
  const camera = new FreeCamera('camera', new Vector3(0, 0, -10), scene);
  camera.setTarget(Vector3.Zero()); scene.activeCamera = camera; camera.getViewMatrix(true);
  const wall = MeshBuilder.CreateBox('wall', { width: 4, height: 4, depth: .2 }, scene);
  wall.computeWorldMatrix(true);
  const visibility = new MarkerOcclusion(scene, [wall]);
  const key = {}, point = new Vector3(0, 0, 2);
  function sample(now: number) { wall.computeWorldMatrix(true); visibility.visible(key, point, now); visibility.update(now); return visibility.visible(key, point, now); }
  return { engine, scene, camera, wall, visibility, key, point, sample };
}

test('overview shows all markers from 45 degrees down, skips ray tests, and resumes below the return threshold', () => {
  for (const rightHanded of [false, true]) {
    const f = setup(rightHanded);
    try {
      const tilt = (degrees: number) => {
        const angle = degrees * Math.PI / 180;
        f.camera.setTarget(f.camera.position.add(new Vector3(0, -Math.sin(angle), Math.cos(angle))));
        f.camera.getViewMatrix(true);
      };
      tilt(0);
      assert.equal(f.sample(0), false, 'wall hides marker at shallow angles');
      const original = f.wall.intersects.bind(f.wall);
      let rays = 0;
      f.wall.intersects = (...args) => { rays++; return original(...args); };
      for (const [i, angle] of [45, 60, 89.9, 44].entries()) {
        tilt(angle);
        assert.equal(f.sample(250 + i * 250), true);
      }
      assert.equal(rays, 0, 'overview does not cast visibility rays');
      tilt(42);
      assert.equal(f.sample(1250), false, 'occlusion resumes below the hysteresis margin');
      tilt(0);
      assert.equal(f.sample(1500), false);
      assert.ok(rays > 0);
    } finally { f.scene.dispose(); f.engine.dispose(); }
  }
});

test('opaque walls hide markers, moving a wall reveals them, hidden roofs and glass do not occlude', () => {
  const f = setup();
  try {
    assert.equal(f.sample(0), false);
    f.wall.position.x = 10;
    assert.equal(f.sample(250), true);
    f.wall.position.x = 0; f.wall.layerMask = 0x10000000;
    assert.equal(f.sample(500), true);
    f.wall.layerMask = f.camera.layerMask; f.wall.metadata = { windowGlass: true };
    assert.equal(f.sample(750), true);
    f.wall.metadata = {}; const material = new StandardMaterial('glass', f.scene); material.alpha = .2; f.wall.material = material;
    assert.equal(f.sample(1000), true);
    material.alpha = 1;
    assert.equal(f.sample(1250), false);
    f.wall.dispose();
    assert.equal(f.sample(1500), true);
  } finally { f.scene.dispose(); f.engine.dispose(); }
});

test('orthographic rays start at the projected marker and work in both handedness conventions', () => {
  for (const rightHanded of [false, true]) {
    const f = setup(rightHanded);
    try {
      f.camera.mode = Camera.ORTHOGRAPHIC_CAMERA; f.camera.setTarget(Vector3.Zero()); f.camera.getViewMatrix(true);
      f.point.x = 3; f.wall.position.x = 1.5; f.wall.scaling.x = .1;
      assert.equal(f.sample(0), true, 'a perspective ray would incorrectly hit the offset wall');
      f.wall.position.x = 3;
      assert.equal(f.sample(250), false);
    } finally { f.scene.dispose(); f.engine.dispose(); }
  }
});

test('geometry beyond the marker and its own shallow housing do not hide its icon', () => {
  const f = setup();
  try {
    f.wall.position.z = 3; assert.equal(f.sample(0), true);
    f.wall.position.z = 2; assert.equal(f.sample(250), true);
    f.wall.position.z = 1; assert.equal(f.sample(500), false);
  } finally { f.scene.dispose(); f.engine.dispose(); }
});

test('camera and anchor movement invalidate visibility even at low frame rates', () => {
  const f = setup();
  try {
    assert.equal(f.sample(0), false);
    f.camera.position.x = 20; f.camera.getViewMatrix(true);
    assert.equal(f.sample(250), true);
    f.camera.position.x = 0; f.camera.getViewMatrix(true);
    assert.equal(f.sample(500), false);
    f.point.x = 20;
    assert.equal(f.sample(750), true);
  } finally { f.scene.dispose(); f.engine.dispose(); }
});

test('shared budget limits checks, refresh is cached, and round robin does not starve later icons', () => {
  const f = setup();
  let checks = 0;
  const intersect = f.wall.intersects.bind(f.wall);
  f.wall.intersects = (...args) => { checks++; return intersect(...args); };
  const keys = Array.from({ length: 12 }, () => ({}));
  try {
    for (let frame = 0; frame < 12; frame++) {
      for (const key of keys) f.visibility.visible(key, f.point, frame);
      const before = checks; f.visibility.update(frame);
      assert.ok(checks - before <= 2);
    }
    assert.equal(checks, 12, 'each icon checked once; no redundant rays within 200 ms');
    for (let frame = 1000; frame < 2000; frame += 16) {
      for (const key of keys) f.visibility.visible(key, f.point, frame);
      f.visibility.update(frame);
    }
    assert.equal(checks, 12, 'stationary results survive beyond the refresh interval');
    f.wall.position.x = 10; f.wall.computeWorldMatrix(true);
    for (let frame = 2250; frame < 2262; frame++) {
      for (const key of keys) f.visibility.visible(key, f.point, frame);
      f.visibility.update(frame);
    }
    for (const key of keys) assert.equal(f.visibility.visible(key, f.point, 2262), true);
  } finally { f.scene.dispose(); f.engine.dispose(); }
});
