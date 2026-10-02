import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanNames, energyShares, energyToday, matchScore, powerWatts, resolveConsumers } from '../src/services/energyFlow.ts';

const state = (value, unit = 'W', extra = {}) => ({ entity_id: 'x', state: String(value), attributes: { unit_of_measurement: unit, ...extra } });

test('consumers come from the energy dashboard with name, area and live power sensor', () => {
  const prefs = { device_consumption: [
    { stat_consumption: 'sensor.plug_tv_energy' },
    { stat_consumption: 'sensor.plug_coffee_energy', stat_rate: 'sensor.plug_coffee_power' },
    { stat_consumption: 'sensor.blind_motor_energy', name: 'Rollo Motor' },
  ] };
  const registry = {
    entities: [
      { entity_id: 'sensor.plug_tv_energy', device_id: 'tv' }, { entity_id: 'sensor.plug_tv_watt', device_id: 'tv' },
      { entity_id: 'sensor.plug_coffee_energy', device_id: 'coffee', area_id: 'kitchen' },
      { entity_id: 'sensor.blind_motor_energy', device_id: 'blind' }, { entity_id: 'cover.example_blind', device_id: 'blind' },
    ],
    devices: [{ id: 'tv', name: 'SmartPlug TV Wohnzimmer', area_id: 'living' }, { id: 'coffee', name: 'SmartPlug Kaffeemaschine', area_id: 'other' }, { id: 'blind', name: 'Motor', area_id: 'living' }],
    areas: [],
  };
  const states = { 'sensor.plug_tv_watt': state(80, 'W', { device_class: 'power' }) };
  const consumers = resolveConsumers(prefs, registry, states);
  assert.deepEqual(consumers.map(c => c.powerEntityId), ['sensor.plug_tv_watt', 'sensor.plug_coffee_power', undefined]);
  // The entity's own area wins over its device's.
  assert.deepEqual(consumers.map(c => c.areaId), ['living', 'kitchen', 'living']);
  assert.equal(consumers[2].name, 'Rollo Motor');
});

test('names lose the plug brand and units, glued words are split', () => {
  assert.deepEqual(cleanNames(['mPowerPlug Toaster', 'mPowerPlug Kaffeemachine Telefon', 'mPowerPlug Waschmachine', 'mPowerPlug PC', 'WohnzimmerRolloLinks Energy']),
    ['Toaster', 'Kaffeemachine Telefon', 'Waschmachine', 'PC', 'Wohnzimmer Rollo Links']);
  // Too few names to tell a brand from a word: kept.
  assert.deepEqual(cleanNames(['Plug Toaster', 'Plug PC']), ['Plug Toaster', 'Plug PC']);
});

test('power readings: kW converted, unknown and negative values count as 0', () => {
  assert.equal(powerWatts(state(1.2, 'kW')), 1200);
  assert.equal(powerWatts(state('unavailable')), 0);
  assert.equal(powerWatts(state(-3)), 0);
  assert.equal(powerWatts(undefined), 0);
});

test('shares of the measured total, largest first, without counting sub-meters twice', () => {
  const consumers = [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }, { id: 'c', name: 'C', includedIn: 'a' }];
  const { total, items } = energyShares(consumers, c => ({ a: 300, b: 100, c: 50 })[c.id]);
  assert.equal(total, 400);
  assert.deepEqual(items.map(i => [i.consumer.id, i.share]), [['a', .75], ['b', .25], ['c', .125]]);
  assert.equal(energyShares([{ id: 'a', name: 'A' }], () => 0).items[0].share, 0);
});

test('labels match device names despite spelling and compound words', () => {
  assert.ok(matchScore('Kaffeemachine Telefon', 'Kaffeemaschine') >= 5);
  assert.ok(matchScore('Fernsehr Wohnzimmer', 'Fernseher') >= 5);
  assert.ok(matchScore('Toaster', 'Toaster_Gehaeuse') >= 5);
  assert.ok(matchScore('Kühlschrank', 'Kuehlschrank Tuer') >= 5);
  assert.equal(matchScore('PC', 'Pflanze'), 0);
  assert.equal(matchScore('Nachttisch', 'Esstisch'), 0);
});

test("today's energy sums the day's statistics per consumer", async () => {
  let message;
  const ha = { request: async m => { message = m; return { 'sensor.plug_tv_energy': [{ change: .4 }, { change: .25 }] }; } };
  const today = await energyToday(ha, ['sensor.plug_tv_energy', 'sensor.plug_coffee_energy'], new Date(2026, 9, 2, 15));
  assert.deepEqual(today, { 'sensor.plug_tv_energy': .65, 'sensor.plug_coffee_energy': 0 });
  assert.equal(message.type, 'recorder/statistics_during_period');
  assert.equal(new Date(message.start_time).getHours(), 0);
});
