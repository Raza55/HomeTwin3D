import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fanState, statusIndicatorActive } from '../src/services/fanState.ts';
import { validateManifest, applyFloorplanMappings, mergeFloorplan, exportFloorplanBindings, importFloorplanBindings } from '../src/services/floorplanImport.ts';
const object = (id, domain, entityId) => ({ id, domain, entityId, label: id, room: 'Balkon', position: { x: -7, y: 1, z: 11 }, size: { width: .3, height: 1.2, depth: .3 }, rotationY: 0 });
const smoke = { ...object('smoke', 'sensor', 'sensor.rauchstatus_balkon'), statusIndicator: { kind: 'smoke', activeStates: ['Ja'] } };
const manifest = { version: 1, source: 'test.blend', coordinateSystem: 'babylon-lh-meters', objects: [object('tower', 'fan', 'fan.turmventilator'), object('purifier', 'fan', 'fan.balcony_air_purifier'), smoke] };
test('fans import as separate controls; smoke creates neither a control nor a permanent display', () => {
  const config = applyFloorplanMappings({ lights: [] }, validateManifest(manifest));
  assert.equal(config.smartDevices.length, 2);
  assert.equal(config.displays.length, 0);
  assert.deepEqual(config.smartDevices.map(o => o.type), ['fan', 'fan']);
  config.model.floorplan.objects[0].entityId = '';
  const reimported = mergeFloorplan(config, manifest);
  assert.equal(reimported.model.floorplan.objects[0].entityId, '');
  const restored = importFloorplanBindings(reimported, JSON.parse(exportFloorplanBindings(reimported)));
  assert.deepEqual(restored.floorplanBindings.find(o => o.id === 'smoke').statusIndicator, smoke.statusIndicator);
});
test('smoke requires an explicit active state and a connection', () => {
  for (const value of ['Nein', 'off', 'unknown', 'unavailable', '']) assert.equal(statusIndicatorActive(smoke, { state: value }, true), false);
  assert.equal(statusIndicatorActive(smoke, { state: 'Ja' }, false), false);
  assert.equal(statusIndicatorActive(smoke, undefined, true), false);
  assert.equal(statusIndicatorActive(smoke, { state: 'Ja' }, true), true);
  assert.throws(() => validateManifest({ ...manifest, objects: [{ ...smoke, statusIndicator: { kind: 'smoke', activeStates: ['unavailable'] } }] }));
});
test('fan availability, percentage and supported speed steps follow HA', () => {
  const state = { state: 'on', attributes: { percentage: 70, percentage_step: 10, supported_features: 63 } };
  assert.deepEqual(fanState(state, true), { available: true, on: true, percentage: 70, step: 10, supportsSpeed: true });
  assert.equal(fanState({ ...state, state: 'off' }, true).percentage, 0);
  for (const value of [undefined, { ...state, state: 'unavailable' }, { ...state, state: 'unknown' }]) assert.equal(fanState(value, true).available, false);
  assert.equal(fanState(state, false).on, false);
  assert.equal(fanState(state, false).percentage, null);
  assert.equal(fanState({ state: 'on', attributes: {} }, true).supportsSpeed, false);
  assert.equal(fanState({ state: 'on', attributes: {} }, true).percentage, null);
});
