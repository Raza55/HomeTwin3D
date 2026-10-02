import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STORY, CHAPTERS, WEATHER, SHOTS, DAY_LENGTH, DAY_REAL_SECONDS, clockToVirtual, virtualToClock, weatherAt, realSecondsUntil, paceAt, shotAt } from '../src/services/dayDemo/story.ts';
import { buildCast, roomRole } from '../src/services/dayDemo/cast.ts';
import { DayDemoEngine, hsToRgb } from '../src/services/dayDemo/engine.ts';
import { sanitizeInstallation } from '../src/services/installationConfig.ts';

const at = clock => clockToVirtual(clock);
const box = { position: { x: 0, y: 0, z: 0 }, size: { width: 1, height: 1, depth: 1 }, rotationY: 0 };
const light = (entityId, label, type = 'dimmeable') => ({ entityId, label, type, position: { x: 0, y: 1, z: 0 } });
const coffee = { statusEntityId: 'sensor.kaffee_operation_state', activeProgramEntityId: 'select.kaffee_program', remainingEntityId: 'sensor.kaffee_end', progressEntityId: 'sensor.kaffee_progress', remoteStartEntityId: 'binary_sensor.kaffee_remote', connectivityEntityId: 'binary_sensor.kaffee_connected', localControlEntityId: 'binary_sensor.kaffee_local', stopEntityId: 'button.kaffee_stop' };
const config = {
  location: { latitude: 50, longitude: 10 },
  lights: [
    light('light.schlafzimmer_decke', 'Schlafzimmer Decke', 'warmCold'),
    light('light.kueche', 'Küche'),
    light('light.bad', 'Bad', 'toggle'),
    light('light.wohnzimmer_hue_play', 'Hue Play Wohnzimmer', 'rgb'),
    light('light.wohnzimmer_stehlampe', 'Stehlampe', 'rgbw'),
    light('light.flur', 'Flur'),
    light('light.balkon', 'Balkon'),
    light('light.ir_strip', 'IR', 'remote'),
  ],
  blinds: [
    { id: 'b1', entityId: 'cover.schlafzimmer', label: 'Rollo Schlafzimmer', ...box },
    { id: 'b2', entityId: 'cover.wohnzimmer', label: 'Rollo Wohnzimmer', ...box },
  ],
  displays: [{ id: 'tv', label: 'TV', kind: 'tv', sources: [{ entityId: 'media_player.tv' }], position: { x: 0, y: 1, z: 0 }, normal: { x: 0, y: 0, z: 1 }, width: 1, height: .6 }],
  model: { floorplan: { version: 1, source: 'test', coordinateSystem: 'babylon-lh-meters', objects: [
    { id: 'pc', label: 'PC', domain: 'switch', entityId: 'switch.pc', ...box, room: 'Büro',
      it: { kind: 'pc', devices: [{ id: 'd', label: 'Desktop', kind: 'pc', statusEntityId: 'switch.pc', statusMode: 'power', screenshotEntityId: 'camera.pc',
        metrics: [{ key: 'cpu', label: 'CPU', entityId: 'sensor.pc_cpu' }, { key: 'gpu_temp', label: 'GPU Temperatur', entityId: 'sensor.pc_gpu_temp' }], actions: [{ id: 'p', label: 'Power', entityId: 'switch.pc', kind: 'toggle' }] }] } },
    { id: 'coffee', label: 'Kaffeemaschine', domain: 'switch', entityId: 'switch.kaffee', ...box, coffee },
    { id: 'echo', label: 'Echo Küche', domain: 'media_player', entityId: 'media_player.echo_kueche', ...box, echo: { kind: 'dot' } },
    { id: 'door', label: 'Haustür', domain: 'binary_sensor', entityId: 'binary_sensor.haustuer', ...box, door: { kind: 'entrance' } },
    { id: 'balcony', label: 'Balkontür', domain: 'binary_sensor', entityId: 'binary_sensor.balkontuer', ...box, door: { kind: 'double' } },
    { id: 'lock', label: 'Schloss', domain: 'lock', entityId: 'lock.haustuer', ...box, doorLock: { doorId: 'door' } },
    { id: 'washer', label: 'Waschmaschine', domain: 'sensor', entityId: 'sensor.waschmaschine_power', ...box, appliance: { kind: 'washer', powerThreshold: 5 } },
    { id: 'fan', label: 'Ventilator Schlafzimmer', domain: 'fan', entityId: 'fan.schlafzimmer', ...box },
  ] } },
  smartDevices: [{ id: 'v', entityId: 'vacuum.saugroboter', label: 'Saugroboter', group: 'cleaning', type: 'vacuum', action: 'start', position: { x: 0, y: 0, z: 0 } }],
};

function harness(cast, options = {}) {
  const states = new Map();
  const writes = [];
  let now = 1_000_000;
  const screens = [];
  const hooks = {
    setState: (id, state, attributes = {}) => { states.set(id, { state, attributes }); writes.push({ id, state, attributes, now }); },
    getState: id => states.get(id),
    screen: (kind, frame) => { screens.push({ kind, frame }); return `data:image/jpeg;base64,${kind}${frame.frame}`; },
    now: () => now,
    random: () => .5,
    control: options.control,
  };
  const engine = new DayDemoEngine(cast, hooks, options.language ?? 'de-DE');
  return { engine, states, writes, screens, tick: ms => { now += ms; engine.advance(ms); }, get now() { return now; } };
}

test('story is ordered, bilingual and spans one day', () => {
  for (let i = 1; i < STORY.length; i++) assert.ok(STORY[i].at >= STORY[i - 1].at);
  assert.ok(STORY.every(b => b.at >= 0 && b.at <= DAY_LENGTH));
  assert.ok(CHAPTERS.length >= 15);
  // The robot vacuum can't be seen driving in the model: it is not part of the story.
  assert.ok(!STORY.some(b => b.actions.some(a => a.type === 'vacuum')));
  for (const { chapter } of CHAPTERS) assert.ok(chapter.title.de && chapter.title.en && chapter.text.de && chapter.text.en);
  assert.equal(new Set(CHAPTERS.map(c => c.chapter.id)).size, CHAPTERS.length);
  assert.equal(virtualToClock(0), 5 * 60 + 30);
  assert.equal(at('05:30'), 0);
  assert.equal(at('02:30'), 21 * 60);
});

test('weather runs through fog, sun, thunderstorm, drizzle and snow', () => {
  assert.equal(weatherAt(at('05:00')).weather_code, 45, 'fog before dawn');
  assert.ok(weatherAt(at('06:00')).wind_gusts_10m >= 35, 'morning wind bends the trees');
  assert.ok(weatherAt(at('11:00')).cloud_cover < 15);
  const storm = weatherAt(at('15:20'));
  assert.equal(storm.weather_code, 95); assert.ok(storm.rain > 5); assert.ok(storm.thunder);
  assert.ok(weatherAt(at('23:40')).rain > 0);
  assert.ok(weatherAt(at('03:15')).snowfall > 0);
  assert.ok(weatherAt(at('03:15')).temperature_2m <= 0);
  assert.ok(!weatherAt(at('12:00')).thunder);
  assert.ok(storm.wind_gusts_10m > 60, 'storm gusts bend the trees');

  // Precipitation fades in instead of switching on at full strength.
  assert.ok(weatherAt(at('15:01')).rain < weatherAt(at('15:20')).rain);
  assert.equal(WEATHER[0].clock, '05:30');
});

test('pacing fits the whole day into the configured real time', () => {
  assert.ok(Math.abs(realSecondsUntil(DAY_LENGTH) - DAY_REAL_SECONDS) < 1e-6);
  assert.ok(paceAt(at('03:00')) < paceAt(at('00:30')), 'busy night beats run slower than empty night hours');
});

test('cast assigns rooms and device roles from labels and plan objects', () => {
  assert.equal(roomRole('Schlafzimmer Decke'), 'bedroom');
  assert.equal(roomRole('light.kueche_insel'), 'kitchen');
  assert.equal(roomRole('Badezimmer Spiegel'), 'bath');
  assert.equal(roomRole('Balkon Lichterkette'), 'outdoor');
  assert.equal(roomRole('Hue Play links'), 'living');
  assert.equal(roomRole('Lampe 3'), 'other');
  const cast = buildCast(config);
  assert.equal(cast.lights.length, 7, 'IR remote lights are skipped');
  assert.deepEqual(cast.lights.filter(l => l.color).map(l => l.room), ['living', 'living']);
  assert.equal(cast.blinds.length, 2);
  assert.deepEqual(cast.tvPlayers, ['media_player.tv']);
  assert.equal(cast.pcs.length, 1); assert.equal(cast.pcs[0].room, 'office');
  assert.equal(cast.coffee.length, 1); assert.equal(cast.echos[0].room, 'kitchen');
  assert.deepEqual(cast.doors.map(d => d.kind), ['entrance', 'balcony']);
  assert.deepEqual(cast.locks, ['lock.haustuer']);
  assert.deepEqual(cast.vacuums, ['vacuum.saugroboter']);
  assert.equal(cast.appliances[0].power, true);
  assert.equal(cast.fans[0].room, 'bedroom');
});

test('a full day plays through and ends with the home asleep', () => {
  const h = harness(buildCast(config));
  h.engine.start();
  h.engine.setSpeed(2);
  const seen = new Set();
  for (let i = 0; i < 40000 && !h.engine.isFinished; i++) {
    h.tick(16);
    const t = virtualToClock(h.engine.time);
    if (Math.abs(t - (6 * 60 + 25)) < 2) seen.add('wake:' + h.states.get('light.schlafzimmer_decke').state);
    if (Math.abs(t - (6 * 60 + 48)) < 1) seen.add('coffee:' + h.states.get('sensor.kaffee_operation_state').state);
    if (Math.abs(t - (21 * 60)) < 2) seen.add('tv:' + h.states.get('media_player.tv').state);
    if (Math.abs(t - (15 * 60 + 30)) < 2) seen.add('storm-lights:' + h.states.get('light.wohnzimmer_hue_play').state);
  }
  assert.ok(h.engine.isFinished, 'the day reaches its end');
  assert.ok(seen.has('wake:on'));
  assert.ok(seen.has('coffee:run'));
  assert.ok(seen.has('tv:playing'));
  assert.ok(seen.has('storm-lights:on'));
  for (const l of buildCast(config).lights) assert.equal(h.states.get(l.entityId).state, 'off', l.entityId);
  assert.equal(h.states.get('cover.wohnzimmer').attributes.current_position, 0);
  assert.equal(h.states.get('lock.haustuer').state, 'locked');
  assert.equal(h.states.get('switch.pc').state, 'off');
  assert.equal(h.states.get('vacuum.saugroboter').state, 'docked');
  assert.equal(h.states.get('sensor.waschmaschine_power').state, '0.4');
  assert.ok(h.screens.some(s => s.kind === 'game'), 'evening gaming screen');
  const stats = h.engine.getSnapshot().stats;
  assert.ok(stats.automations > 30, `automations (${stats.automations})`);
  assert.ok(stats.lightHours > 1 && stats.rainMinutes > 30);
  assert.ok(stats.minTemp <= 0 && stats.maxTemp >= 20 && stats.maxGust >= 60);
  const log = h.engine.getSnapshot().log;
  assert.ok(log.length > 0 && log.every(e => e.text.de && e.text.en));
});

test('the sunrise alarm fades brightness and colour temperature smoothly', () => {
  const h = harness(buildCast(config));
  h.engine.seek(at('06:09'));
  h.engine.play();
  const samples = [];
  while (virtualToClock(h.engine.time) < 6 * 60 + 33) {
    h.tick(50);
    const s = h.states.get('light.schlafzimmer_decke');
    if (s.state === 'on') samples.push([s.attributes.brightness, s.attributes.color_temp_kelvin]);
  }
  assert.ok(samples.length > 10, 'many intermediate steps');
  for (let i = 1; i < samples.length; i++) {
    assert.ok(samples[i][0] >= samples[i - 1][0]);
    assert.ok(samples[i][1] >= samples[i - 1][1]);
  }
  assert.ok(samples[0][0] <= 10 && samples.at(-1)[0] >= 210);
});

test('seeking replays the story state without transitions', () => {
  const h = harness(buildCast(config));
  h.engine.seek(at('21:00'));
  assert.equal(h.engine.isPlaying, false);
  assert.equal(h.states.get('media_player.tv').state, 'playing');
  const ambilight = h.states.get('light.wohnzimmer_hue_play');
  assert.equal(ambilight.state, 'on'); assert.equal(ambilight.attributes.color_mode, 'hs');
  assert.equal(h.states.get('cover.schlafzimmer').attributes.current_position, 0);
  assert.equal(h.states.get('light.kueche').state, 'off');
  assert.equal(h.engine.getSnapshot().chapter.id, 'cinema');
  h.engine.seek(at('14:00'));
  assert.equal(h.states.get('media_player.tv').state, 'off');
  assert.equal(h.states.get('switch.pc').state, 'off', 'nobody works from home: the PC appears in the evening');
  assert.equal(h.states.get('cover.wohnzimmer').attributes.current_position, 30);
  h.engine.seek(at('22:40'));
  assert.equal(h.states.get('switch.pc').state, 'on');
  assert.equal(h.states.get('camera.pc').attributes.entity_picture.startsWith('data:image/'), true);
});

test('a home without matching rooms still gets a lively day from fallbacks', () => {
  const plain = { location: { latitude: 50, longitude: 10 }, lights: [light('light.a', 'Lampe 1', 'rgb'), light('light.b', 'Lampe 2'), light('light.c', 'Lampe 3')] };
  const h = harness(buildCast(plain));
  h.engine.seek(at('06:30'));
  assert.ok(['light.a', 'light.b', 'light.c'].some(id => h.states.get(id).state === 'on'));
  h.engine.seek(at('21:00'));
  assert.equal(h.states.get('light.a').attributes.color_mode, 'hs');
});

test('a routed TV shows generated frames and a moving progress bar', () => {
  const route = { receiver: 'media_player.avr', shield: 'media_player.player', television: 'media_player.fernseher', screenshot: 'media_player.player_screenshot' };
  const routed = { ...config, displays: [{ ...config.displays[0], tvMedia: route, sources: [{ entityId: route.television }] }] };
  const cast = buildCast(routed);
  assert.equal(cast.tvRoutes.length, 1);
  const h = harness(cast);
  h.engine.seek(at('20:14'));
  h.engine.play();
  for (let i = 0; i < 80; i++) h.tick(50);
  assert.equal(h.states.get(route.receiver).attributes.source, 'SHIELD Media');
  assert.equal(h.states.get(route.shield).state, 'playing');
  assert.ok(h.states.get(route.shield).attributes.media_position > 0);
  assert.ok(h.screens.some(s => s.kind === 'movie'));
  assert.match(h.states.get(route.screenshot).attributes.entity_picture, /^data:image\/jpeg/);
});

test('the coffee popup opens while the machine brews and closes afterwards', () => {
  const h = harness(buildCast(config));
  const popups = [];
  h.engine.hooks.popup = (target, open) => popups.push(`${target}:${open}`);
  h.engine.seek(at('06:40'));
  popups.length = 0;
  h.engine.play();
  while (virtualToClock(h.engine.time) < 6 * 60 + 56) h.tick(50);
  assert.deepEqual(popups, ['coffee:true', 'coffee:false']);
});

test('camera shots stay inside the day and their chapters', () => {
  for (const s of SHOTS) {
    assert.ok(s.from < s.to && s.to <= DAY_LENGTH);
    assert.equal(s.keys[0].t, 0); assert.equal(s.keys.at(-1).t, 1);
    for (let i = 1; i < s.keys.length; i++) assert.ok(s.keys[i].t > s.keys[i - 1].t);
    assert.equal(shotAt((s.from + s.to) / 2), s);
    // Each moment is long enough to take in (real seconds at normal speed).
    assert.ok(realSecondsUntil(s.to) - realSecondsUntil(s.from) >= 5, s.id);
  }
  assert.equal(shotAt(at('12:00')), undefined);
  assert.deepEqual(SHOTS.map(s => s.id), ['opening', 'breakfast-news', 'laundry', 'dryer', 'storm-bedroom', 'cooking', 'cinema', 'gaming']);
  // The opening ends on the coffee machine just before it starts brewing.
  const opening = SHOTS[0];
  assert.equal(opening.keys.at(-1).look.kind, 'coffee');
  assert.ok(opening.to <= at('06:46'));
});

test('evening colour scenes change gently', () => {
  for (const action of STORY.flatMap(b => b.actions).filter(a => a.type === 'colorloop' && a.on)) {
    assert.ok(action.period >= 15, 'slow hue steps');
    assert.ok(action.saturation <= 75, 'pastel rather than vivid');
    const spread = Math.max(...action.hues) - Math.min(...action.hues);
    assert.ok(spread <= 60, `narrow hue range (${spread})`);
  }
});

test('HS colours convert like Home Assistant', () => {
  assert.deepEqual(hsToRgb(0, 100), [255, 0, 0]);
  assert.deepEqual(hsToRgb(120, 100), [0, 255, 0]);
  assert.deepEqual(hsToRgb(240, 0), [255, 255, 255]);
});

test('at dusk the board is operated by hand: all living-room blinds, then a lamp colour', () => {
  const cast = buildCast(config);
  // After a jump the result is simply there.
  const jumped = harness(cast);
  jumped.engine.seek(at('20:05'));
  assert.equal(jumped.states.get('cover.wohnzimmer').attributes.current_position, 0);
  assert.ok(['light.wohnzimmer_hue_play', 'light.wohnzimmer_stehlampe'].some(id => jumped.states.get(id)?.state === 'on' && jumped.states.get(id).attributes.hs_color));
  // Playing with the dashboard attached: the finger gets the lamp and the blind to tap, nothing is set behind its back.
  const requests = [];
  const live = harness(cast, { control: request => requests.push(request) });
  live.engine.seek(at('19:40'));
  live.engine.play();
  while (live.engine.getSnapshot().virtual < at('20:04')) live.tick(100);
  assert.deepEqual(requests.map(r => r.kind), ['blinds', 'light']);
  assert.equal(requests[0].entityId, 'cover.wohnzimmer');
  assert.equal(requests[0].position, 0);
  assert.ok(['light.wohnzimmer_hue_play', 'light.wohnzimmer_stehlampe'].includes(requests[1].entityId));
  assert.equal(requests[1].swatch, 'Violett');
  // Blinds the popup did not reach (another HA area) follow a moment later.
  assert.equal(live.states.get('cover.wohnzimmer').attributes.current_position, 0);
  // The other rooms still close on their own.
  assert.equal(live.states.get('cover.schlafzimmer').attributes.current_position, 0);
});

test('blinds report their commands, and stay down from sunset until the morning', () => {
  const h = harness(buildCast(config));
  h.engine.seek(at('19:50'));
  // The board's blind popup only enables buttons the blind says it supports.
  assert.equal(h.states.get('cover.wohnzimmer').attributes.supported_features & 15, 15);
  // No beat and no camera shot opens a blind between the evening close and sunrise.
  const evening = at('19:45'), sunrise = at('06:36') + DAY_LENGTH;
  const opens = STORY.filter(b => (b.at > evening || b.at + DAY_LENGTH < sunrise) && b.actions.some(a => (a.type === 'blind' || (a.type === 'control' && a.kind === 'blinds')) && a.position > 0));
  assert.deepEqual(opens, []);
  assert.deepEqual(SHOTS.filter(s => s.from > evening && s.blind !== undefined).map(s => s.id), []);
});

test('the intro names its author only from the installation values', () => {
  assert.equal(sanitizeInstallation({ author: '  Example Author  ' }).author, 'Example Author');
  assert.equal(sanitizeInstallation({ author: 42 }).author, undefined);
  assert.equal(sanitizeInstallation({ author: 'x'.repeat(200) }).author.length, 80);
});
