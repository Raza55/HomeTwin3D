import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanNames, deviceKinds, energyInPeriod, energyShares, isSupplyName, lampConsumers, matchScore, periodStart, powerWatts, resolveConsumers } from '../src/services/energyFlow.ts';

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
  const today = await energyInPeriod(ha, ['sensor.plug_tv_energy', 'sensor.plug_coffee_energy'], 'day', new Date(2026, 9, 2, 15));
  assert.deepEqual(today, { 'sensor.plug_tv_energy': .65, 'sensor.plug_coffee_energy': 0 });
  assert.equal(message.type, 'recorder/statistics_during_period');
  assert.equal(new Date(message.start_time).getHours(), 0);
  assert.equal(message.period, 'day');
  // A year needs only monthly rows.
  await energyInPeriod(ha, ['sensor.plug_tv_energy'], 'year', new Date(2026, 9, 2, 15));
  assert.equal(message.period, 'month');
  assert.deepEqual(new Date(message.start_time), new Date(2026, 0, 1));
});

test('periods start at midnight, on Monday and on the first of the month', () => {
  const friday = new Date(2026, 9, 2, 15, 30);
  assert.deepEqual(periodStart('day', friday), new Date(2026, 9, 2));
  assert.deepEqual(periodStart('week', friday), new Date(2026, 8, 28));
  assert.deepEqual(periodStart('month', friday), new Date(2026, 9, 1));
  assert.deepEqual(periodStart('week', new Date(2026, 9, 4, 9)), new Date(2026, 8, 28));
  assert.deepEqual(periodStart('quarter', friday), new Date(2026, 9, 1));
  assert.deepEqual(periodStart('quarter', new Date(2026, 7, 20)), new Date(2026, 6, 1));
  assert.deepEqual(periodStart('half', friday), new Date(2026, 6, 1));
  assert.deepEqual(periodStart('half', new Date(2026, 2, 5)), new Date(2026, 0, 1));
  assert.deepEqual(periodStart('year', friday), new Date(2026, 0, 1));
});

test('device types and the supply are recognised by name', () => {
  assert.deepEqual([...deviceKinds('Fernsehr Wonzimmer2')], ['tv']);
  assert.deepEqual([...deviceKinds('PC')], ['pc']);
  assert.ok(deviceKinds('Kinderzimmer Kühlschrank').has('fridge'));
  assert.ok(deviceKinds('Waschmachine').has('washer'));
  assert.ok(deviceKinds('Qnap Extension').has('nas'));
  assert.equal(deviceKinds('Nachttisch').size, 0);
  assert.deepEqual([...deviceKinds('Schreibtisch')], ['desk']);
  assert.deepEqual([...deviceKinds('Kinderzimmer PCSchreibtisch')].sort(), ['desk', 'pc']);
  assert.ok(isSupplyName('Main Switch'));
  assert.ok(isSupplyName('Hauptzähler'));
  assert.ok(!isSupplyName('Schreibtisch'));
});

test('consumers fall into the layers devices, blinds and lights', () => {
  const prefs = { device_consumption: [{ stat_consumption: 'sensor.plug_tv_energy' }, { stat_consumption: 'sensor.blind_motor_energy' }, { stat_consumption: 'sensor.light_group_energy', name: 'Licht Küche' }] };
  const registry = {
    entities: [
      { entity_id: 'sensor.plug_tv_energy', device_id: 'tv' },
      { entity_id: 'sensor.blind_motor_energy', device_id: 'blind' }, { entity_id: 'cover.example_blind', device_id: 'blind' },
      { entity_id: 'sensor.light_group_energy', platform: 'powercalc' },
    ],
    devices: [{ id: 'tv', name: 'TV' }, { id: 'blind', name: 'Motor' }], areas: [],
  };
  assert.deepEqual(resolveConsumers(prefs, registry, {}).map(c => c.category), ['device', 'blind', 'light']);
});

test('single lamps are found by their estimated sensors on the lamp device', () => {
  const registry = {
    entities: [
      { entity_id: 'light.example_lamp', device_id: 'lamp', area_id: 'kitchen' },
      { entity_id: 'sensor.example_lamp_power', device_id: 'lamp', platform: 'powercalc' },
      { entity_id: 'sensor.example_lamp_energy', device_id: 'lamp', platform: 'powercalc' },
      { entity_id: 'light.example_strip', device_id: 'strip' },
    ],
    devices: [{ id: 'lamp', name: 'Lamp' }, { id: 'strip', name: 'Strip' }], areas: [],
  };
  const states = { 'sensor.example_lamp_power': state(4.2, 'W', { device_class: 'power' }), 'sensor.example_lamp_energy': state(.1, 'kWh', { device_class: 'energy' }) };
  const lamps = lampConsumers(registry, states, [{ entityId: 'light.example_lamp', label: 'Lampe' }, { entityId: 'light.example_strip', label: 'Strip' }]);
  assert.equal(lamps.length, 1);
  assert.deepEqual({ ...lamps[0] }, { id: 'sensor.example_lamp_energy', category: 'light', lamp: 'light.example_lamp', name: 'Lampe', powerEntityId: 'sensor.example_lamp_power', deviceId: 'lamp', areaId: 'kitchen' });
});
