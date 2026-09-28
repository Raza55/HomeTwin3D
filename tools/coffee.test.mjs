import { test } from 'node:test';
import assert from 'node:assert/strict';
import { coffeeState, coffeeProgram } from '../src/services/coffeeState.ts';
import { validateManifest, applyFloorplanMappings, mergeFloorplan, exportFloorplanBindings, importFloorplanBindings } from '../src/services/floorplanImport.ts';
const object = { id: 'coffee', label: 'Siemens', domain: 'switch', entityId: 'switch.coffee_power',
  position: { x: 1, y: 1, z: 1 }, size: { width: .3, height: .4, depth: .5 }, rotationY: 0,
  coffee: { statusEntityId: 'sensor.operation', activeProgramEntityId: 'select.program', remainingEntityId: 'sensor.end_time', progressEntityId: 'sensor.progress', remoteStartEntityId: 'binary_sensor.remote', connectivityEntityId: 'binary_sensor.connected', localControlEntityId: 'binary_sensor.local', stopEntityId: 'button.stop' } };
const c = object.coffee, now = Date.parse('2026-09-28T09:00:00Z');
const s = (state, attributes = {}, last_changed = '2026-09-28T08:59:30Z') => ({ state, attributes, last_changed });
const program = 'consumer_products_coffee_maker_program_beverage_cappuccino';
const states = () => ({
  [object.entityId]: s('on'), [c.statusEntityId]: s('ready'),
  [c.connectivityEntityId]: s('on'), [c.remoteStartEntityId]: s('on'), [c.localControlEntityId]: s('off'),
  [c.activeProgramEntityId]: s('unknown', { options: [program] }), [c.stopEntityId]: s('unknown'),
  [c.remainingEntityId]: s('2026-09-28T09:00:45Z', { device_class: 'timestamp' }), [c.progressEntityId]: s('40'),
});
test('running uses operation state rather than power, with real program and countdown', () => {
  const data = states();
  assert.equal(coffeeState(object, data, true, now).running, false);
  data[c.statusEntityId] = s('run'); data[c.activeProgramEntityId] = s(program);
  const value = coffeeState(object, data, true, now);
  assert.equal(value.running, true); assert.equal(value.program, 'Cappuccino');
  assert.equal(value.remaining, '0:45'); assert.equal(value.elapsed, '0:30'); assert.equal(value.progress, 40);
  data[c.remainingEntityId] = s('unavailable');
  assert.equal(coffeeState(object, data, true, now).remaining, '');
  data[c.statusEntityId] = s('pause');
  assert.equal(coffeeState(object, data, true, now).running, false);
  assert.equal(coffeeState(object, data, true, now).elapsed, '');
});
test('start requires online ready machine, remote permission and no local operation', () => {
  assert.equal(coffeeState(object, states(), true, now).canStart, true);
  for (const [id, state] of [[object.entityId,'off'], [c.connectivityEntityId,'off'], [c.remoteStartEntityId,'off'], [c.localControlEntityId,'on'], [c.statusEntityId,'run'], [c.statusEntityId,'error'], [c.statusEntityId,'unknown'], [c.activeProgramEntityId,'unavailable']]) {
    const data = states(); data[id] = s(state);
    assert.equal(coffeeState(object, data, true, now).canStart, false, `${id}: ${state}`);
  }
  const data = states(); data[c.statusEntityId] = s('run');
  assert.equal(coffeeState(object, data, true, now).canStop, true, 'Never-pressed button state unknown is valid');
  const offline = coffeeState(object, data, false, now);
  assert.equal(offline.canStop, false); assert.equal(offline.running, false); assert.equal(offline.program, ''); assert.equal(offline.remaining, '');
});
test('invalid and stale times or progress never show invented countdowns', () => {
  const data = states(); data[c.statusEntityId] = s('run', {}, 'not a date');
  data[c.remainingEntityId] = s('2020-01-01T00:00:00Z', { device_class: 'timestamp' }); data[c.progressEntityId] = s('unavailable');
  const value = coffeeState(object, data, true, now);
  assert.equal(value.remaining, ''); assert.equal(value.elapsed, ''); assert.equal(value.progress, null);
  assert.equal(coffeeProgram('consumer_products_coffee_maker_program_beverage_hot_water'), 'Heißwasser');
});
test('coffee companion entities survive binding backup and model reimport', () => {
  const manifest = { version: 1, source: 'coffee.blend', coordinateSystem: 'babylon-lh-meters', objects: [object] };
  const config = applyFloorplanMappings({ lights: [] }, validateManifest(manifest));
  const restored = importFloorplanBindings(config, JSON.parse(exportFloorplanBindings(config)));
  assert.deepEqual(restored.floorplanBindings[0].coffee, c);
  const plain = structuredClone(manifest); delete plain.objects[0].coffee;
  assert.deepEqual(mergeFloorplan(restored, plain).model.floorplan.objects[0].coffee, c);
  const bad = structuredClone(manifest); bad.objects[0].coffee.stopEntityId = 'switch.wrong';
  assert.throws(() => validateManifest(bad));
});
