import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getConfig, updateConfig } from '../src/services/configApi';
import { mergeFloorplan } from '../src/services/floorplanImport';
import type { AppConfig, FloorplanManifest } from '../src/types';

test('legacy saved mappings migrate and survive persisted model replacement', () => {
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  } });
  const plan: FloorplanManifest = { version: 1, source: 'legacy.blend', coordinateSystem: 'babylon-lh-meters', objects: [
    { id: 'stable-rollo', domain: 'cover', label: 'Rollo', entityId: 'cover.saved', position: { x: 0, y: 1, z: 0 }, size: { width: 1, height: 2, depth: .1 }, rotationY: 0 },
  ] };
  const legacy: AppConfig = { location: { latitude: 0, longitude: 0 }, lights: [], model: { floorplan: plan } };
  values.set('config', JSON.stringify(legacy));
  updateConfig({ model: { scale: 1 } });
  const disk = JSON.parse(values.get('config')!);
  assert.equal(disk.model.floorplan, undefined);
  assert.equal(disk.floorplanBindings[0].entityId, 'cover.saved');
  const reimport = structuredClone(plan); reimport.objects[0].entityId = ''; reimport.objects[0].position.x = 4;
  updateConfig(mergeFloorplan(getConfig(), reimport));
  assert.equal(getConfig().blinds![0].entityId, 'cover.saved');
  assert.equal(getConfig().blinds![0].position.x, 4);
  const before = values.get('config');
  localStorage.setItem = () => { throw new Error('Quota exceeded'); };
  assert.throws(() => updateConfig({ model: undefined }), /Quota exceeded/);
  assert.equal(values.get('config'), before);
});
