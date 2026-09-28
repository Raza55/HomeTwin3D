import test from 'node:test';
import assert from 'node:assert/strict';
import { ArcRotateCamera, Camera, MeshBuilder, NullEngine, Scene, Vector3 } from '@babylonjs/core';
import { WalkthroughCamera, nextNavigationMode } from '../src/babylon/WalkthroughCamera';
import { RoomDoors } from '../src/babylon/RoomDoors';

test('room doors rotate leaf and handle together, reverse, and preserve initially open poses', () => {
  const engine = new NullEngine(), scene = new Scene(engine);
  try {
    const leaf = MeshBuilder.CreateBox('leaf', {}, scene), handle = MeshBuilder.CreateBox('handle', {}, scene);
    const wall = MeshBuilder.CreateBox('wall', {}, scene), alreadyOpen = MeshBuilder.CreateBox('open-door', {}, scene);
    const spec = { id: 'room', hinge: [0, 0, 0], closedDegrees: 0, openDegrees: -90 };
    leaf.position.x = 1; handle.position.x = 2;
    leaf.metadata = handle.metadata = { gltf: { extras: { ha_room_door: spec } } };
    alreadyOpen.metadata = { gltf: { extras: { ha_room_door: { ...spec, id: 'open', closedDegrees: 100, openDegrees: 0 } } } };
    alreadyOpen.position.x = 1;
    const doors = new RoomDoors([leaf, handle, wall, alreadyOpen]);
    assert.equal(doors.toggle(wall), false);
    assert.equal(doors.toggle(handle), true); doors.update(.25);
    assert.ok(leaf.position.x > 0 && leaf.position.x < 1, 'smooth intermediate pose');
    assert.ok(handle.position.equalsWithEpsilon(leaf.position.scale(2)), 'handle follows leaf');
    doors.toggle(leaf); doors.update(1); assert.ok(leaf.position.equalsWithEpsilon(new Vector3(1, 0, 0)));
    doors.toggle(leaf); doors.update(1); assert.ok(Math.abs(leaf.position.x) < 1e-6);
    doors.toggle(alreadyOpen); doors.update(1); assert.ok(alreadyOpen.position.x < 0, 'initially open door closes first');
    doors.toggle(alreadyOpen); doors.update(1); assert.ok(alreadyOpen.position.equalsWithEpsilon(new Vector3(1, 0, 0)));
  } finally { scene.dispose(); engine.dispose(); }
});

test('navigation cycles normal, walk, fly, normal', () => {
  assert.equal(nextNavigationMode('normal'), 'walk'); assert.equal(nextNavigationMode('walk'), 'fly'); assert.equal(nextNavigationMode('fly'), 'normal');
});
test('walk blocks walls, fly changes height, normal restores exact orbit pose', () => {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window'), previousDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'window', { configurable: true, value: new EventTarget() });
  Object.defineProperty(globalThis, 'document', { configurable: true, value: new EventTarget() });
  const engine = new NullEngine(), scene = new Scene(engine);
  const canvas = Object.assign(new EventTarget(), { focus() {} }) as unknown as HTMLCanvasElement;
  let controller: WalkthroughCamera | undefined;
  try {
    const camera = new ArcRotateCamera('camera', -.7, .4, 20, new Vector3(1, .5, 2), scene);
    camera.mode = Camera.ORTHOGRAPHIC_CAMERA; camera.lowerRadiusLimit = 5;
    const original = { alpha: camera.alpha, beta: camera.beta, radius: camera.radius, target: camera.target.clone(), minZ: camera.minZ, layerMask: camera.layerMask };
    const floor = MeshBuilder.CreateGround('floor', { width: 10, height: 10 }, scene);
    const wall = MeshBuilder.CreateBox('wall', { width: .2, height: 3, depth: 10 }, scene); wall.position.set(-2, 1.5, 0);
    const door = MeshBuilder.CreateBox('closed-door', { width: .1, height: 2.1, depth: 2 }, scene); door.position.set(-1, 1.05, 0);
    door.metadata = { originalMaterial: { name: 'F53_Tueren_Seidenweiss' } }; door.computeWorldMatrix(true);
    const ceiling = MeshBuilder.CreateGround('ceiling', { width: 10, height: 10 }, scene); ceiling.position.y = 3;
    ceiling.metadata = { gltf: { extras: { ha_cutaway: true } } }; ceiling.layerMask = 0x10000000; ceiling.computeWorldMatrix(true);
    const shadowWall = MeshBuilder.CreateBox('shadow_wall_0', {}, scene); shadowWall.layerMask = 0x10000000;
    wall.computeWorldMatrix(true); floor.computeWorldMatrix(true);
    controller = new WalkthroughCamera(scene, camera, canvas, new Vector3(0, 1.5, 0), new Vector3(10, 3, 10), [floor, wall, door, ceiling], () => controller!.setMode('normal'));
    let spawnRays = 0;
    const originalPick = scene.pickWithRay.bind(scene);
    scene.pickWithRay = (...args) => { spawnRays++; return originalPick(...args); };
    scene.skipPointerDownPicking = true;
    controller.setMode('walk'); assert.equal(camera.mode, Camera.PERSPECTIVE_CAMERA); assert.ok(Math.abs(camera.position.y - 1.65) < .001);
    assert.ok(spawnRays < 40, `nearest free entry avoids full grid scan: ${spawnRays}`);
    assert.equal(scene.skipPointerMovePicking, true);
    assert.equal(scene.skipPointerUpPicking, true);
    assert.notEqual(camera.layerMask & ceiling.layerMask, 0, 'actual ceiling visible');
    assert.equal(camera.layerMask & shadowWall.layerMask, 0, 'shadow walls stay hidden at windows');
    camera.alpha = 0; controller.keys.add('KeyW');
    for (let i = 0; i < 100; i++) controller.update(.05);
    assert.ok(camera.position.x > -1.9 && camera.position.x < -1.3, `passes closed door, stops at wall: ${camera.position.x}`);
    assert.ok(Math.abs(camera.position.y - 1.65) < .001);
    controller.setMode('fly'); assert.equal(controller.keys.size, 0); controller.keys.add('KeyE');
    for (let i = 0; i < 100; i++) controller.update(.05);
    assert.ok(camera.position.y > 2 && camera.position.y <= 2.901);
    canvas.dispatchEvent(new Event('blur')); assert.equal(controller.keys.size, 0);
    controller.setMode('normal'); assert.equal(camera.mode, Camera.ORTHOGRAPHIC_CAMERA);
    assert.equal(scene.skipPointerMovePicking, false); assert.equal(scene.skipPointerUpPicking, false); assert.equal(scene.skipPointerDownPicking, true);
    assert.equal(ceiling.layerMask, 0x10000000, 'ceiling hidden again in normal view');
    assert.equal(camera.alpha, original.alpha); assert.equal(camera.beta, original.beta); assert.equal(camera.radius, original.radius);
    assert.ok(camera.target.equals(original.target)); assert.equal(camera.lowerRadiusLimit, 5); assert.equal(camera.minZ, original.minZ); assert.equal(camera.layerMask, original.layerMask);
    controller.dispose(); controller.dispose();
  } finally {
    controller?.dispose(); scene.dispose(); engine.dispose();
    if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow); else Reflect.deleteProperty(globalThis, 'window');
    if (previousDocument) Object.defineProperty(globalThis, 'document', previousDocument); else Reflect.deleteProperty(globalThis, 'document');
  }
});
