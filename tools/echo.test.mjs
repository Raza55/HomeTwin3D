import { test } from 'node:test';
import assert from 'node:assert/strict';
import { echoState } from '../src/services/echoState.ts';
import { validateManifest, applyFloorplanMappings, mergeFloorplan, exportFloorplanBindings, importFloorplanBindings } from '../src/services/floorplanImport.ts';
const state = (value, attrs = {}) => ({ state: value, attributes: { supported_features: 318399, volume_level: .52, ...attrs } });
test('Echo states distinguish playback, paused, idle and missing/disconnected entities', () => {
  assert.equal(echoState(state('playing'), true).active, true);
  assert.equal(echoState(state('paused'), true).label, 'Pausiert');
  assert.equal(echoState(state('idle'), true).label, 'Bereit');
  for (const s of [undefined, state('unknown'), state('unavailable'), state('idle', { available: false })]) assert.equal(echoState(s, true).available, false);
  const disconnected = echoState(state('playing', { media_title: 'Old title' }), false);
  assert.equal(disconnected.active, false); assert.equal(disconnected.title, ''); assert.equal(disconnected.volume, null);
});
test('Echo commands follow HA supported features and volume scale', () => {
  const echo = echoState(state('idle'), true);
  assert.equal(echo.volume, 52); assert.equal(echo.supports('volume_set'), true); assert.equal(echo.supports('media_play'), true);
  assert.equal(echoState(state('idle', { supported_features: 0 }), true).supports('volume_set'), false);
  assert.equal(echoState(state('idle'), false).supports('media_play'), false);
  assert.equal(echoState(state('off', { media_title: 'Old title' }), true).title, '');
});
test('Echo assignments and kind survive reimport and backup without affecting other media devices', () => {
  const object = (id, echo) => ({ id, label: id, domain: 'media_player', entityId: `media_player.${id}`, position: { x: 1, y: 1, z: 1 }, size: { width: .2, height: .2, depth: .2 }, rotationY: 0, echo });
  const manifest = { version: 1, source: 'echo.blend', coordinateSystem: 'babylon-lh-meters', objects: [object('dot', { kind: 'dot' }), object('show', { kind: 'show' }), object('tv')] };
  const config = applyFloorplanMappings({ lights: [] }, validateManifest(manifest));
  config.model.floorplan.objects[0].entityId = '';
  const merged = mergeFloorplan(config, manifest);
  assert.equal(merged.model.floorplan.objects[0].entityId, '');
  const restored = importFloorplanBindings(merged, JSON.parse(exportFloorplanBindings(merged)));
  assert.equal(restored.floorplanBindings.find(o => o.id === 'show').echo.kind, 'show');
  assert.equal(restored.model.floorplan.objects[2].echo, undefined);
  assert.throws(() => validateManifest({ ...manifest, objects: [{ ...object('bad', { kind: 'dot' }), domain: 'light', entityId: 'light.bad' }] }));
});
