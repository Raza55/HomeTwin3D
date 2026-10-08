import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mapToModel, parseEcovacsPosition, vacuumPollDelay, validateVacuumTracking } from '../src/services/vacuumPosition.ts';
import { applyFloorplanMappings, collectFloorplanBindings, importFloorplanBindings, mergeFloorplan, validateManifest } from '../src/services/floorplanImport.ts';

const tracking = { positionEntityId: 'vacuum.robot_map', mapTransform: [0.001, 0, 2, 0, -0.001, 3] };
const response = (pos) => ({ 'vacuum.robot_map': { ret: 'ok', resp: { body: { code: 0, data: { deebotPos: pos, chargePos: [] } } } } });
const robot = { id: 'robot', label: 'Robot', domain: 'vacuum', entityId: 'vacuum.robot', position: { x: 2, y: 0, z: 3 },
  size: { width: .35, height: .1, depth: .35 }, rotationY: 0, vacuum: tracking };
const manifest = (objects) => ({ version: 1, source: 'test', coordinateSystem: 'babylon-lh-meters', objects });
const config = () => ({ lights: [], blinds: [], smartDevices: [], displays: [] });

test('reads the robot position from the service response', () => {
  assert.deepEqual(parseEcovacsPosition(response({ x: 122, y: -115, a: 143, invalid: 0 }), 'vacuum.robot_map'), { x: 122, y: -115, a: 143 });
  assert.equal(parseEcovacsPosition(response({ x: 1, y: 2, a: 0, invalid: 1 }), 'vacuum.robot_map'), null);
  assert.equal(parseEcovacsPosition(response({ x: 1, y: 2, a: 0 }), 'vacuum.other'), null);
  assert.equal(parseEcovacsPosition(undefined, 'vacuum.robot_map'), null);
});

test('maps millimetres and heading into model coordinates', () => {
  const pose = mapToModel(tracking, { x: 1000, y: 500, a: 90 });
  assert.equal(pose.x, 3);
  assert.equal(pose.z, 2.5);
  // Map +y (90°) becomes model −Z under this mirrored transform.
  assert.ok(Math.abs(pose.yaw + Math.PI / 2) < 1e-9);
});

test('polls only while the robot is away from its station', () => {
  assert.equal(vacuumPollDelay({ state: 'cleaning', attributes: {} }), 2500);
  assert.equal(vacuumPollDelay({ state: 'returning', attributes: {} }), 2500);
  assert.equal(vacuumPollDelay({ state: 'paused', attributes: {} }), 20000);
  assert.equal(vacuumPollDelay({ state: 'docked', attributes: {} }), null);
  assert.equal(vacuumPollDelay(undefined), null);
});

test('validates the map assignment', () => {
  validateVacuumTracking(tracking);
  assert.throws(() => validateVacuumTracking({ ...tracking, mapTransform: [1, 2, 3] }));
  assert.throws(() => validateVacuumTracking({ ...tracking, positionEntityId: 'input_text.robot' }));
  assert.throws(() => validateManifest(manifest([{ ...robot, domain: 'fan', entityId: '' }])));
});

test('keeps the map assignment across model reimports and binding files', () => {
  const mapped = applyFloorplanMappings(config(), validateManifest(manifest([robot])));
  assert.deepEqual(collectFloorplanBindings(mapped)[0].vacuum, tracking);
  const reimported = mergeFloorplan(mapped, manifest([{ ...robot, vacuum: undefined }]));
  assert.deepEqual(reimported.model.floorplan.objects[0].vacuum, tracking);
  const file = { schema: '3dash-bindings', version: 1, bindings: collectFloorplanBindings(mapped) };
  const restored = importFloorplanBindings({ ...config(), model: { floorplan: manifest([{ ...robot, vacuum: undefined }]) } }, file);
  assert.deepEqual(restored.model.floorplan.objects[0].vacuum, tracking);
});
