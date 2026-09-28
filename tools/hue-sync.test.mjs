import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HUE_SYNC_SWITCH, HUE_SYNC_AREA, HUE_SYNC_BRIGHTNESS, HUE_SYNC_MEMBERS, isHueSyncLocked, hueSyncDisplayState } from '../src/services/hueSync.ts';
const state = (entity_id, value, attributes = {}) => ({ entity_id, state: value, attributes });
const fixture = () => Object.fromEntries([
  state(HUE_SYNC_SWITCH, 'on'), state(HUE_SYNC_AREA, 'TV-Bereich 2'), state(HUE_SYNC_BRIGHTNESS, '53'),
  ...HUE_SYNC_MEMBERS.map(id => state(id, 'off', { mode: 'streaming' })),
].map(s => [s.entity_id, s]));

test('sync overrides off light states without mutating HA data; only confirmed members lock', () => {
  const states = fixture(), original = structuredClone(states);
  for (const id of HUE_SYNC_MEMBERS) {
    assert.equal(isHueSyncLocked(id, states), true);
    assert.equal(hueSyncDisplayState(states[id], states).state, 'on');
    assert.deepEqual(hueSyncDisplayState(states[id], states).attributes.rgb_color, [246, 184, 213]);
    assert.equal(hueSyncDisplayState(states[id], states).attributes.brightness, 135);
  }
  assert.equal(isHueSyncLocked('light.subwoofer', states), false);
  assert.deepEqual(states, original);
});
test('sync off, unavailable, missing or different area restores the real state despite streaming', () => {
  for (const value of ['off', 'unavailable', 'unknown', undefined]) {
    const states = fixture(), id = HUE_SYNC_MEMBERS[0];
    if(value) states[HUE_SYNC_SWITCH].state = value; else delete states[HUE_SYNC_SWITCH];
    assert.equal(isHueSyncLocked(id, states), false);
    assert.equal(hueSyncDisplayState(states[id], states), states[id]);
  }
  const states = fixture(); states[HUE_SYNC_AREA].state = 'TV-Bereich Kind';
  assert.equal(isHueSyncLocked(HUE_SYNC_MEMBERS[0], states), false);
});
test('unavailable or missing lamps are never displayed as active', () => {
  const states = fixture(), id = HUE_SYNC_MEMBERS[0];
  states[id].state = 'unavailable'; assert.equal(isHueSyncLocked(id, states), false);
  delete states[id]; assert.equal(isHueSyncLocked(id, states), false);
});
