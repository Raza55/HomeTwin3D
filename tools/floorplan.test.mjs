import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readFloorplanManifest, validateManifest, mergeFloorplan, applyFloorplanMappings, exportFloorplanBindings, importFloorplanBindings } from '../src/services/floorplanImport.ts';

const object = (id, domain = 'light', entityId = '') => ({ id, domain, entityId, label: id,
  position: { x: -2, y: 1.4, z: 3 }, size: { width: 1.2, height: 1.8, depth: .03 }, rotationY: 45 });
const manifest = (...objects) => ({ version: 1, source: 'test.blend', coordinateSystem: 'babylon-lh-meters', objects });
const config = () => ({ location: { latitude: 0, longitude: 0 }, lights: [] });
function glb(extras) {
  const raw = JSON.stringify({ asset: { version: '2.0' }, scene: 0, scenes: [{ extras }] });
  const json = Buffer.from(raw.padEnd(Math.ceil(Buffer.byteLength(raw) / 4) * 4, ' '));
  const header = Buffer.alloc(20);
  header.writeUInt32LE(0x46546c67, 0); header.writeUInt32LE(2, 4); header.writeUInt32LE(20 + json.length, 8);
  header.writeUInt32LE(json.length, 12); header.writeUInt32LE(0x4e4f534a, 16);
  return new Blob([header, json]);
}
test('reads Blender scene extras and accepts ordinary GLB files', async () => {
  const m = manifest(object('lamp'));
  assert.deepEqual(await readFloorplanManifest(glb({ '3dash_manifest': JSON.stringify(m) })), m);
  assert.equal(await readFloorplanManifest(glb({})), undefined);
});
test('rejects malformed/truncated files and future schemas', async () => {
  await assert.rejects(readFloorplanManifest(new Blob(['BLENDER'])));
  await assert.rejects(readFloorplanManifest(glb({ '3dash_manifest': { ...manifest(), version: 2 } })));
  const bytes = new Uint8Array(await glb({}).arrayBuffer());
  bytes[8] = 0; await assert.rejects(readFloorplanManifest(new Blob([bytes])));
});
test('rejects duplicate IDs, wrong domains and non-finite transforms', () => {
  assert.throws(() => validateManifest(manifest(object('a'), object('a'))));
  assert.throws(() => validateManifest(manifest(object('a', 'cover', 'light.bad'))));
  const bad = object('b'); bad.position.x = Infinity;
  assert.throws(() => validateManifest(manifest(bad)));
});
test('unassigned objects remain available without fake HA entities', () => {
  const result = mergeFloorplan(config(), manifest(object('lamp'), object('blind', 'cover')));
  assert.equal(result.model.floorplan.objects.length, 2);
  assert.equal(result.lights.length, 0); assert.equal(result.blinds.length, 0);
});
test('maps lights, covers and devices with exported transforms', () => {
  const result = mergeFloorplan(config(), manifest(object('lamp', 'light', 'light.lamp'), object('blind', 'cover', 'cover.blind'), object('fan', 'fan', 'fan.dyson')));
  assert.deepEqual(result.lights[0].position, { x: -2, y: 1.4, z: 3 });
  assert.equal(result.blinds[0].rotationY, 45); assert.equal(result.smartDevices[0].action, 'toggle');
});
test('reimport updates geometry and retains assignments and manual controls', () => {
  const original = config(); original.lights.push({ entityId: 'light.manual', label: 'manual', type: 'toggle', position: { x: 0, y: 0, z: 0 } });
  const first = mergeFloorplan(original, manifest(object('lamp', 'light', 'light.kitchen')));
  const updated = object('lamp'); updated.position.x = -8;
  const second = mergeFloorplan(first, manifest(updated));
  assert.equal(second.lights.length, 2);
  assert.equal(second.lights[1].entityId, 'light.kitchen');
  assert.equal(second.lights[1].position.x, -8);
  assert.deepEqual(mergeFloorplan(second, manifest(updated)), second);
});
test('cleared assignment stays cleared, removed objects leave no controls', () => {
  const first = mergeFloorplan(config(), manifest(object('lamp', 'light', 'light.one')));
  const cleared = applyFloorplanMappings(first, manifest(object('lamp')));
  assert.equal(mergeFloorplan(cleared, manifest(object('lamp', 'light', 'light.one'))).lights.length, 0);
  assert.equal(mergeFloorplan(first, manifest()).lights.length, 0);
});
test('multiple light surfaces share one control; duplicate covers are rejected', () => {
  const result = mergeFloorplan(config(), manifest(object('a', 'light', 'light.one'), object('b', 'light', 'light.one')));
  assert.equal(result.lights.length, 1); assert.equal(result.lights[0].parts.length, 2);
  assert.throws(() => mergeFloorplan(config(), manifest(object('a', 'cover', 'cover.one'), object('b', 'cover', 'cover.one'))));
});
test('manual entity configuration remains authoritative', () => {
  const manual = config(); manual.lights.push({ entityId: 'light.one', type: 'toggle', position: { x: 1, y: 2, z: 3 } });
  const result = mergeFloorplan(manual, manifest(object('a', 'light', 'light.one')));
  assert.deepEqual(result.lights, manual.lights);
});
test('light calibration and room confirmations survive reimport with new source positions', () => {
  const lamp = object('lamp','light','light.one');
  lamp.haAreaId = 'kitchen'; lamp.lightCalibration = { lumens: 800, range: 4 };
  lamp.emitters = [{kind:'point',position:{x:0,y:2,z:0},lumens:800,range:4}];
  const first = mergeFloorplan(config(),manifest(lamp));
  const next = { ...lamp, emitters: [{kind:'point',position:{x:1,y:2,z:0},lumens:100,range:8},{kind:'point',position:{x:2,y:2,z:0},lumens:100,range:8}] };
  delete next.lightCalibration; delete next.haAreaId;
  const result = mergeFloorplan(first,manifest(next));
  assert.equal(result.lights[0].emitters.reduce((s,e)=>s+e.lumens,0),800);
  assert.equal(result.lights[0].emitters[1].range,4);
  assert.equal(result.lights[0].emitters[1].position.x,2);
  assert.equal(result.model.floorplan.objects[0].haAreaId,'kitchen');
});
test('independent bindings survive plan removal, replacement, JSON reload and renamed geometry', () => {
  const lamp = { ...object('lamp', 'light', 'light.kitchen'), haAreaId: 'kitchen', lightType: 'rgb', lightCalibration: { lumens: 900, range: 5 } };
  const original = mergeFloorplan(config(), manifest(lamp, object('blind', 'cover', 'cover.kitchen'), object('cleared')));
  const removed = mergeFloorplan(original);
  assert.equal(removed.model.floorplan, undefined);
  assert.equal(removed.lights.length, 0);
  assert.equal(removed.floorplanBindings.length, 3);
  const replacement = mergeFloorplan(removed, manifest(object('other', 'switch', 'switch.other')));
  const reloaded = JSON.parse(JSON.stringify(replacement));
  const moved = { ...object('lamp', 'light', 'light.exporter'), label: 'Renamed', position: { x: 20, y: 2, z: 3 }, emitters: [{kind:'point',position:{x:20,y:2,z:3},lumens:100,range:8}] };
  const restored = mergeFloorplan(reloaded, { ...manifest(moved, object('blind', 'cover'), object('cleared', 'light', 'light.exporter')), source: 'new-v76.blend' });
  assert.equal(restored.lights[0].entityId, 'light.kitchen');
  assert.equal(restored.lights[0].type, 'rgb');
  assert.equal(restored.lights[0].position.x, 20);
  assert.equal(restored.lights[0].emitters[0].lumens, 900);
  assert.equal(restored.lights[0].emitters[0].range, 5);
  assert.equal(restored.blinds[0].entityId, 'cover.kitchen');
  assert.equal(restored.model.floorplan.objects[2].entityId, '');
  assert.equal(restored.floorplanBindings.length, 4);
});

test('standalone binding backup restores without geometry and explicitly replaces current decisions', () => {
  const original = mergeFloorplan(config(), manifest(object('lamp', 'light', 'light.saved'), object('blind', 'cover', 'cover.saved')));
  const backup = JSON.parse(exportFloorplanBindings(original));
  assert.ok(backup.bindings.every(b => !('position' in b) && !('emitters' in b)));
  const empty = importFloorplanBindings(config(), backup);
  assert.equal(empty.floorplanBindings.length, 2);
  assert.equal(mergeFloorplan(empty, manifest(object('lamp'))).lights[0].entityId, 'light.saved');
  const current = mergeFloorplan(config(), manifest(object('lamp', 'light', 'light.current')));
  assert.equal(importFloorplanBindings(current, backup).lights[0].entityId, 'light.saved');
  assert.throws(() => importFloorplanBindings(current, { ...backup, version: 99 }));
  assert.throws(() => importFloorplanBindings(current, { ...backup, bindings: [{ ...backup.bindings[0], entityId: 'cover.wrong' }] }));
});

test('reused object ID with changed domain cannot inherit or erase a relationship', () => {
  const original = mergeFloorplan(config(), manifest(object('same', 'light', 'light.saved')));
  const changed = mergeFloorplan(original, manifest(object('same', 'cover', 'cover.exporter')));
  assert.equal(changed.blinds.length, 0);
  assert.equal(changed.floorplanBindings[0].entityId, 'light.saved');
  assert.equal(mergeFloorplan(changed, manifest(object('same'))).lights[0].entityId, 'light.saved');
});

if (process.env.FLOORPLAN_GLB) test('real Blender export has complete valid inventory and meter coordinates', async () => {
  const result = await readFloorplanManifest(new Blob([readFileSync(process.env.FLOORPLAN_GLB)]));
  assert.ok(result.objects.length >= 30);
  assert.equal(result.objects.filter(o => o.domain === 'cover').length, 6);
  assert.ok(result.objects.every(o => Object.values(o.position).every(n => Math.abs(n) < 30)));
  assert.ok(result.objects.filter(o => o.domain === 'cover').every(o => o.size.height > 1 && o.size.width > .5));
  assert.ok(result.objects.filter(o => o.domain === 'light').every(o => o.emitters?.length));
});


if (process.env.FLOORPLAN_GLB) test('real Ensis has separate downward and upward emitters and entities', async () => {
  const m=await readFloorplanManifest(new Blob([readFileSync(process.env.FLOORPLAN_GLB)]));
  const down=m.objects.find(o=>o.entityId==='light.hue_ensis_down_1');
  const up=m.objects.find(o=>o.entityId==='light.hue_ensis_up_1');
  assert.ok(down && up); assert.notEqual(down.id,up.id);
  assert.ok(down.emitters.every(e=>e.kind==='spot' && e.direction.y<-.99 && e.position.y<down.position.y));
  assert.ok(up.emitters.every(e=>e.kind==='spot' && e.direction.y>.99 && e.position.y>up.position.y));
});
