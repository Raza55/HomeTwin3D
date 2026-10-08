import test from 'node:test';
import assert from 'node:assert/strict';
import { Matrix, MeshBuilder, NullEngine, Quaternion, Scene, TransformNode, Vector3 } from '@babylonjs/core';
import { VacuumRig } from '../src/babylon/VacuumRig';
import type { FloorplanObject } from '../src/types';

test('vacuum parts keep their pose through interpolation, retargeting, docking and disposal', t => {
  let now = 0;
  t.mock.method(performance, 'now', () => now);
  const engine = new NullEngine(), scene = new Scene(engine);
  const root = new TransformNode('mirrored-model', scene);
  root.scaling.set(-2, 2, 2);
  root.metadata = { gltf: { extras: { ha_id: 'qa-vacuum' } } };
  const object = { id: 'qa-vacuum', position: { x: 2, y: 0, z: 3 }, vacuum: { restYawDeg: 170 } } as FloorplanObject;
  const rest = { x: 2, z: 3, yaw: 170 * Math.PI / 180 };
  const parts = Array.from({ length: 12 }, (_, i) => {
    const mesh = MeshBuilder.CreateBox(`part-${i}`, { size: .1 }, scene);
    mesh.parent = root;
    mesh.position.set(-2 + i * .01, i * .02, 3 - i * .03);
    mesh.rotation.set(i * .01, i * .02, -i * .03);
    if (i % 2) mesh.rotationQuaternion = Quaternion.FromEulerVector(mesh.rotation);
    mesh.freezeWorldMatrix();
    return { mesh, position: mesh.position.clone(), rotation: mesh.rotationQuaternion?.clone() ?? Quaternion.FromEulerVector(mesh.rotation) };
  });
  let requests = 0;
  const initialRotation = parts[1].mesh.rotationQuaternion!;
  const initialRotationCopy = initialRotation.clone();
  const rig = new VacuumRig(scene, object, () => requests++);
  const frame = (time: number) => { now = time; scene.onBeforeRenderObservable.notifyObservers(scene); };
  const expectPose = (pose: typeof rest) => {
    const rotation = Quaternion.RotationAxis(Vector3.Up(), pose.yaw - rest.yaw);
    const transform = Matrix.Compose(Vector3.One(), rotation, new Vector3(-pose.x, 0, pose.z));
    for (const part of parts) {
      if (part.mesh.isDisposed()) continue;
      const expectedPosition = Vector3.TransformCoordinates(part.position.subtract(new Vector3(-rest.x, 0, rest.z)), transform);
      const expectedRotation = rotation.multiply(part.rotation);
      assert.ok(part.mesh.position.equalsWithEpsilon(expectedPosition, 1e-6));
      assert.ok(part.mesh.rotationQuaternion!.equalsWithEpsilon(expectedRotation, 1e-6));
      const expectedWorld = Matrix.Compose(part.mesh.scaling, expectedRotation, expectedPosition).multiply(root.getWorldMatrix());
      for (let i = 0; i < 16; i++) assert.ok(Math.abs(part.mesh.getWorldMatrix().m[i] - expectedWorld.m[i]) < 1e-6);
    }
  };
  try {
    assert.equal(rig.empty, false);
    rig.moveTo({ x: 3, z: 3, yaw: -170 * Math.PI / 180 }, 1000);
    frame(250);
    expectPose({ x: 2.25, z: 3, yaw: 175 * Math.PI / 180 });
    assert.ok(initialRotation.equals(initialRotationCopy), 'do not mutate a quaternion shared with another mesh');
    const rotations = parts.map(p => p.mesh.rotationQuaternion);
    // A pose still overrides any Euler edits made since the previous frame.
    parts[1].mesh.reIntegrateRotationIntoRotationQuaternion = true;
    parts[1].mesh.rotation.set(.1, .2, .3);
    frame(500);
    expectPose({ x: 2.5, z: 3, yaw: Math.PI });
    parts.forEach((part, i) => assert.equal(part.mesh.rotationQuaternion, rotations[i], 'reuse the mesh quaternion'));
    // A new fix starts from the interpolated position, without a jump.
    rig.moveTo({ x: 2.5, z: 4, yaw: Math.PI / 2 }, 1000);
    frame(1000);
    expectPose({ x: 2.5, z: 3.5, yaw: 3 * Math.PI / 4 });
    parts[0].mesh.dispose();
    frame(1500);
    expectPose({ x: 2.5, z: 4, yaw: Math.PI / 2 });
    assert.equal(scene.onBeforeRenderObservable.hasObservers(), false);
    rig.moveTo(null, 2500);
    frame(1501);
    expectPose(rest);
    rig.moveTo({ x: 8, z: 9, yaw: 0 }, 2500);
    frame(1502);
    expectPose({ x: 8, z: 9, yaw: 0 });
    rig.dispose();
    expectPose(rest);
    assert.equal(scene.onBeforeRenderObservable.hasObservers(), false);
    assert.ok(requests > 0);
  } finally { rig.dispose(); scene.dispose(); engine.dispose(); }
});
