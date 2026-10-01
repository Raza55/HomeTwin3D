import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MeshBuilder, NullEngine, Scene, TransformNode, Vector3 } from '@babylonjs/core';
import { doorPose, doorDuration, DOOR_TILT_AFTER_MS } from '../src/services/doorState';
import { createDoorRigs, doorMarkerAnchor, setDoorPose } from '../src/babylon/DoorAnimation';
import { assignmentOwners, saveFloorplanAssignment } from '../src/services/floorplanReassignment';
import { applyFloorplanMappings, exportFloorplanBindings, importFloorplanBindings, mergeFloorplan, validateManifest } from '../src/services/floorplanImport';
import { isDoorContact, suggestFloorplanMatches } from '../src/services/floorplanMatching';
import { lockStatus } from '../src/services/doorState';
import type { AppConfig, FloorplanManifest, HAState } from '../src/types';

const opened = Date.parse('2026-09-27T08:00:00Z');
const state: HAState = { entity_id: 'binary_sensor.fenster', state: 'on', last_changed: new Date(opened).toISOString(), attributes: {} };
test('door uses continuous HA open duration, including the precise 15-minute boundary', () => {
  assert.equal(doorPose(state, opened), 'open');
  assert.equal(doorPose(state, opened + DOOR_TILT_AFTER_MS), 'open');
  assert.equal(doorPose(state, opened + DOOR_TILT_AFTER_MS + 1), 'tilted');
  assert.equal(doorPose({ ...state, attributes: { battery_level: 90 } }, opened + 20 * 60000), 'tilted');
  assert.equal(doorPose({ ...state, state: 'off' }, opened + 20 * 60000), 'closed');
  assert.equal(doorPose({ ...state, last_changed: new Date(opened + 21 * 60000).toISOString() }, opened + 22 * 60000), 'open');
});
test('a tilt-only sash is tilted as soon as its contact opens', () => {
  assert.equal(doorPose(state, opened, 'double', true), 'tilted');
  assert.equal(doorPose({ ...state, state: 'off' }, opened, 'double', true), 'closed');
  assert.equal(doorPose({ ...state, state: 'unavailable' }, opened, 'double', true), null);
});
test('missing or invalid HA timestamps never invent a tilt; unknown contacts keep their pose', () => {
  for (const last_changed of [undefined, 'invalid', new Date(opened + 9999999).toISOString()]) assert.equal(doorPose({ ...state, last_changed }, opened), 'open');
  for (const status of ['unknown', 'unavailable', 'garbage']) assert.equal(doorPose({ ...state, state: status }), null);
  assert.equal(doorPose(undefined), null);
});
test('only the tagged right leaf moves around its hinge and returns exactly to its closed transform', () => {
  const engine = new NullEngine(); const scene = new Scene(engine);
  const right = new TransformNode('right', scene);right.position.set(1, 0, 0);
  const glass = MeshBuilder.CreateBox('glass', {}, scene);glass.parent = right;
  const left = MeshBuilder.CreateBox('left', {}, scene);const leftStart = left.position.clone();
  right.metadata = { gltf: { extras: { ha_id: 'door', ha_door: { hinge: [0, 0, 0], swingAxis: [0, 1, 0], tiltAxis: [0, 0, 1], swingDegrees: 90, tiltDegrees: 10 } } } };
  const rigs = createDoorRigs(scene); assert.equal(rigs.length, 1);
  setDoorPose(rigs[0], 'open'); assert.ok(Vector3.Distance(right.position, new Vector3(0, 0, -1)) < 1e-6);
  const open = right.position.clone();setDoorPose(rigs[0], null);assert.ok(right.position.equals(open));
  setDoorPose(rigs[0], 'tilted');assert.ok(right.position.y > .17);assert.ok(left.position.equals(leftStart));
  // Recreating UI bindings must not treat an already-open pose as the new baseline.
  setDoorPose(createDoorRigs(scene)[0], 'closed');assert.ok(Vector3.Distance(right.position, new Vector3(1, 0, 0)) < 1e-6);
  scene.dispose();engine.dispose();
});
const manifest: FloorplanManifest = { version: 1, source: 'doors.blend', coordinateSystem: 'babylon-lh-meters', objects: [
  { id: 'door', label: 'Fenstertür Essplatz', domain: 'binary_sensor', entityId: 'binary_sensor.fenster', door: { kind: 'double' }, position: { x: 0, y: 1, z: 0 }, size: { width: 1, height: 2, depth: .1 }, rotationY: 0 },
] };
test('door contact mappings survive replacement, reimport and independent binding backup without generic devices', () => {
  const empty: AppConfig = { location: { latitude: 0, longitude: 0 }, lights: [] };
  const mapped = applyFloorplanMappings(empty, manifest);
  assert.equal(mapped.displays!.length, 0);assert.equal(mapped.smartDevices!.length, 0);
  const backup = JSON.parse(exportFloorplanBindings(mapped));assert.equal(backup.bindings[0].door.kind, 'double');
  const restored = importFloorplanBindings(empty, backup);
  const next = structuredClone(manifest);next.objects[0].entityId = '';next.objects[0].position.x = 7;
  const imported = mergeFloorplan(restored, next);
  assert.equal(imported.model!.floorplan!.objects[0].entityId, 'binary_sensor.fenster');
  assert.equal(imported.model!.floorplan!.objects[0].position.x, 7);
  const unassigned = applyFloorplanMappings(imported, next);
  assert.equal(mergeFloorplan(unassigned, manifest).model!.floorplan!.objects[0].entityId, '');
  const invalid = structuredClone(manifest);invalid.objects[0].domain = 'cover';assert.throws(() => validateManifest(invalid));
});
test('door matching admits contacts and excludes known motion sensors and switches', () => {
  assert.equal(isDoorContact({ entity_id: 'binary_sensor.window', deviceClass: 'window' }), true);
  assert.equal(isDoorContact({ entity_id: 'binary_sensor.motion', deviceClass: 'motion' }), false);
  assert.equal(isDoorContact({ entity_id: 'switch.window' }), false);
  const proposals = suggestFloorplanMatches([{ ...manifest.objects[0], entityId: '' }], [
    { entity_id: 'binary_sensor.window', friendly_name: 'Fenstertür Essplatz', deviceClass: 'window' },
    { entity_id: 'binary_sensor.motion', friendly_name: 'Fenstertür Essplatz', deviceClass: 'motion' },
  ]).get('door')!;
  assert.equal(proposals.length, 1);assert.equal(proposals[0].entity.entity_id, 'binary_sensor.window');
});

test('duration describes the actual contact state without inventing times', () => {
  assert.equal(doorDuration(state, opened + 63000), '1 min');
  assert.equal(doorDuration(state, opened + 3660000), '1 h 1 min');
  assert.equal(doorDuration({ ...state, state: 'off' }, opened + 2000), '2 s');
  assert.equal(doorDuration({ ...state, state: 'unavailable' }, opened + 2000), 'Dauer unbekannt');
  assert.equal(doorDuration({ ...state, last_changed: 'invalid' }), 'Dauer unbekannt');
  assert.equal(doorDuration(state, opened - 1), 'Dauer unbekannt');
});

test('marker remains above the center of both leaves while the right leaf moves', () => {
  const engine = new NullEngine();const scene = new Scene(engine);
  const right = MeshBuilder.CreateBox('Window_Rechts', { width: 1, height: 2, depth: .1 }, scene);right.position.set(.5, 1, 0);
  const left = MeshBuilder.CreateBox('Window_Links', { width: 1, height: 2, depth: .1 }, scene);left.position.set(-.5, 1, 0);
  right.metadata = { gltf: { extras: { ha_id: 'door', ha_door: { hinge: [1, 0, 0], swingAxis: [0, 1, 0], tiltAxis: [1, 0, 0], swingDegrees: 90, tiltDegrees: 10 } } } };
  const rig = createDoorRigs(scene)[0], anchor = doorMarkerAnchor(scene, rig);
  assert.ok(Math.abs(anchor.x) < 1e-6);assert.ok(anchor.y > 2);
  for (const pose of ['open', 'tilted', 'closed'] as const) {
    setDoorPose(rig, pose);assert.ok(Vector3.Distance(anchor, doorMarkerAnchor(scene, rig)) < 1e-5);
  }
  scene.dispose();engine.dispose();
});

test('exclusive reassignment is opt-in for every device category and survives reimport/backup', () => {
  for (const domain of ['light', 'cover', 'binary_sensor', 'sensor', 'switch', 'fan', 'vacuum', 'media_player', 'lock'] as const) {
    const entityId = `${domain}.occupied`;
    const item = { ...manifest.objects[0], door: undefined, domain, entityId };
    const plan: FloorplanManifest = { ...manifest, objects: [{ ...item, id: 'old', label: 'Old' }, { ...item, id: 'new', label: 'New', entityId: '' }] };
    const config = applyFloorplanMappings({ location: { latitude: 0, longitude: 0 }, lights: [] }, plan);
    config.floorplanBindings!.push({ id: 'absent', domain, label: 'Absent', entityId });
    const before = JSON.stringify(config);
    const draft = structuredClone(plan);draft.objects[1].entityId = entityId;
    assert.equal(assignmentOwners(config, 'new').length, 2);
    assert.throws(() => saveFloorplanAssignment(config, draft, 'new', false), /bereits zugeordnet/);
    assert.equal(JSON.stringify(config), before);
    const transferred = saveFloorplanAssignment(config, draft, 'new', true);
    assert.equal(transferred.model!.floorplan!.objects[0].entityId, '');
    assert.equal(transferred.model!.floorplan!.objects[1].entityId, entityId);
    assert.equal(transferred.floorplanBindings!.find(o => o.id === 'absent')!.entityId, '');
    assert.equal(JSON.stringify(config), before);
    const restored = importFloorplanBindings({ location: { latitude: 0, longitude: 0 }, lights: [] }, JSON.parse(exportFloorplanBindings(transferred)));
    const reimported = mergeFloorplan(restored, plan);
    assert.equal(reimported.model!.floorplan!.objects[0].entityId, '');
    assert.equal(reimported.model!.floorplan!.objects[1].entityId, entityId);
  }
});


test('entrance never tilts; lock states are independent from contact geometry', () => {
  assert.equal(doorPose(state, opened + 24 * 3600000, 'entrance'), 'open');
  assert.equal(doorPose({ ...state, state: 'off' }, opened, 'entrance'), 'closed');
  assert.equal(doorPose({ ...state, state: 'locked' }, opened, 'entrance'), null);
  assert.equal(lockStatus({ ...state, state: 'locked' }), 'Verriegelt');
  assert.equal(lockStatus({ ...state, state: 'unlocked' }), 'Entriegelt');
  assert.equal(lockStatus({ ...state, state: 'jammed' }), 'Schloss blockiert');
  assert.equal(lockStatus({ ...state, state: 'unavailable' }), 'Schlossstatus unbekannt');
});

test('entrance contact and lock survive backup and reimport without device controls', () => {
  const contact = { ...manifest.objects[0], door: { kind: 'entrance' as const } };
  const lock = { ...contact, id: 'lock', label: 'Haustür Schloss', domain: 'lock' as const, entityId: 'lock.front', door: undefined, doorLock: { doorId: contact.id } };
  const plan = { ...manifest, objects: [contact, lock] };
  const empty = { location: { latitude: 0, longitude: 0 }, lights: [] };
  const config = applyFloorplanMappings(empty, plan);
  assert.equal(config.smartDevices!.length, 0);
  assert.equal(config.displays!.length, 0);
  const restored = importFloorplanBindings(empty, JSON.parse(exportFloorplanBindings(config)));
  const imported = mergeFloorplan(restored, { ...plan, objects: plan.objects.map(o => ({ ...o, entityId: '' })) });
  assert.equal(imported.model!.floorplan!.objects[1].entityId, 'lock.front');
  assert.equal(imported.floorplanBindings!.find(o => o.id === 'lock')!.doorLock!.doorId, contact.id);
  const proposals = suggestFloorplanMatches([{ ...lock, entityId: '' }], [
    { entity_id: 'lock.front', friendly_name: 'Haustür Schloss' },
    { entity_id: 'binary_sensor.front', friendly_name: 'Haustür Schloss', deviceClass: 'door' },
  ]).get('lock')!;
  assert.equal(proposals.length, 1);
  assert.equal(proposals[0].entity.entity_id, 'lock.front');
});
