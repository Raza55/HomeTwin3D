import { test } from 'node:test';
import assert from 'node:assert/strict';
import { affectsHomeStatus, summarizeHomeStatus } from '../src/services/homeStatus.ts';

const state = (entity_id, value, attributes = {}) => ({ entity_id, state: value, attributes });
const summary = (...states) => summarizeHomeStatus(Object.fromEntries(states.map(s => [s.entity_id, s])));

test('presence uses people or the home zone, never ordinary powered devices', () => {
  assert.equal(summary(state('person.example', 'home')), 'home');
  assert.equal(summary(state('person.example', 'not_home')), 'away');
  assert.equal(summary(state('person.example', 'work')), 'away');
  assert.equal(summary(state('zone.home', '2')), 'home');
  assert.equal(summary(state('zone.home', '0')), 'away');
  assert.equal(summary(state('person.example', 'unavailable')), 'unknown');
  assert.equal(summary(state('zone.home', ''), state('switch.example', 'on')), 'unknown');
  assert.equal(summary(state('person.example', 'home'), state('person.other', 'unknown')), 'home');
});

test('active warnings override presence and clearing them restores presence', () => {
  const home = state('person.example', 'home');
  for (const device_class of ['problem', 'smoke', 'gas', 'moisture', 'carbon_monoxide', 'battery', 'safety', 'tamper']) {
    const warning = state('binary_sensor.example', 'on', { device_class });
    assert.equal(affectsHomeStatus(warning), true);
    assert.equal(summary(home, warning), 'warning');
    assert.equal(summary(home, { ...warning, state: 'off' }), 'home');
  }
  for (const warning of [state('alert.example', 'on'), state('alarm_control_panel.example', 'triggered'), state('vacuum.example', 'error'), state('sensor.example', 'warning')]) {
    assert.equal(summary(home, warning), 'warning');
  }
  for (const device_class of ['door', 'window', 'motion', 'connectivity']) {
    assert.equal(summary(home, state('binary_sensor.example', 'on', { device_class })), 'home');
  }
  assert.equal(summary(home, state('alert.example', 'idle')), 'home');
});

test('battery percentage validates values and includes the existing 20 percent threshold', () => {
  for (const value of ['0', '20']) assert.equal(summary(state('sensor.example', value, { device_class: 'battery', unit_of_measurement: '%' })), 'warning');
  for (const value of ['', 'unknown', 'unavailable', '-1', '21']) assert.equal(summary(state('sensor.example', value, { device_class: 'battery', unit_of_measurement: '%' })), 'unknown');
  assert.equal(summary(state('sensor.example', '3', { device_class: 'battery', unit_of_measurement: 'V' })), 'unknown');
});
