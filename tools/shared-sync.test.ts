import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
// @ts-expect-error plain JS module
import { createSharedStoreMiddleware } from './shared-store-middleware.mjs';

type Browser = { values: Map<string, string>; assets: Map<string, Blob> };
const browser = (): Browser => ({ values: new Map(), assets: new Map() });
function use(b: Browser) {
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: (key: string) => b.values.get(key) ?? null,
    setItem: (key: string, value: string) => { b.values.set(key, String(value)); },
    removeItem: (key: string) => { b.values.delete(key); },
  } });
  (globalThis as { __hometwinAssets?: Map<string, Blob> }).__hometwinAssets = b.assets;
}

test('a published installation reaches other browsers; conflicts never overwrite local edits', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'hometwin-sync-'));
  const middleware = createSharedStoreMiddleware({ base: '/HomeTwin3D/', dir, pin: 'pin1' });
  const server = createServer((req, res) => middleware(req, res, () => { res.statusCode = 404; res.end(); }));
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  (globalThis as { __BASE?: string }).__BASE = `http://127.0.0.1:${(server.address() as { port: number }).port}/HomeTwin3D/`;
  use(browser()); // settings migrate on import and read localStorage
  try {
    const shared = await import('../src/services/sharedStore');
    const configApi = await import('../src/services/configApi');
    // Browser A: set up, owns the PIN, publishes the first version.
    const a = browser(); use(a);
    a.values.set('config', JSON.stringify({ location: { latitude: 0, longitude: 0 }, lights: [], rooms: [{ id: 'bath', label: 'Bad' }], onboarding: { completed: true } }));
    a.assets.set('model', new Blob(['MODEL-A']));
    assert.equal(await shared.checkSharedPin('wrong'), false);
    assert.equal(await shared.checkSharedPin('pin1'), true);
    shared.setSharedPin('pin1');
    assert.deepEqual(await shared.publishShared(true), { kind: 'published', revision: 1 });

    // Browser B: empty; takes config and model, keeps its own onboarding.
    const b = browser(); use(b);
    assert.deepEqual(await shared.syncFromShared(), { kind: 'updated', revision: 1 });
    const received = configApi.getConfig();
    assert.deepEqual(received.rooms, [{ id: 'bath', label: 'Bad' }]);
    assert.equal(received.onboarding?.completed, false, 'onboarding stays per browser');
    assert.equal(await b.assets.get('model')!.text(), 'MODEL-A');
    assert.equal(shared.joinedSharedInstallation(), true);
    // Without PIN B only reads: its edits are not queued for publishing.
    configApi.updateConfig({ rooms: [] });
    assert.equal(shared.hasPendingSharedChanges(), false);
    assert.deepEqual(await shared.publishShared(), { kind: 'readonly' });

    // A changes a mapping: published automatically after the debounce.
    use(a);
    configApi.updateConfig({ rooms: [{ id: 'bath', label: 'Badezimmer' }] });
    assert.equal(shared.hasPendingSharedChanges(), true);
    await new Promise(resolve => setTimeout(resolve, 2200));
    assert.equal(shared.hasPendingSharedChanges(), false);
    assert.equal(shared.getSharedRevision(), 2);

    // B follows; its local read-only edit is replaced by the published version.
    use(b);
    assert.deepEqual(await shared.syncFromShared(), { kind: 'updated', revision: 2 });
    assert.equal(configApi.getConfig().rooms?.[0]?.label, 'Badezimmer');
    assert.equal(await b.assets.get('model')!.text(), 'MODEL-A', 'unchanged model is not downloaded again');

    // Conflict: B (now with PIN) edits while A publishes. Nothing is overwritten.
    shared.setSharedPin('pin1');
    configApi.updateConfig({ rooms: [{ id: 'bath', label: 'Von B' }] });
    use(a);
    configApi.updateConfig({ rooms: [{ id: 'bath', label: 'Von A' }] });
    assert.deepEqual(await shared.publishShared(), { kind: 'published', revision: 3 });
    use(b);
    assert.deepEqual(await shared.syncFromShared(), { kind: 'conflict', revision: 3 });
    assert.equal(configApi.getConfig().rooms?.[0]?.label, 'Von B', 'local edit kept');
    assert.deepEqual(await shared.publishShared(), { kind: 'conflict', revision: 3 });
    // Explicit decision: B's version wins.
    assert.deepEqual(await shared.publishShared(true), { kind: 'published', revision: 4 });
    use(a);
    assert.deepEqual(await shared.loadLatestShared(), { kind: 'updated', revision: 4 });
    assert.equal(configApi.getConfig().rooms?.[0]?.label, 'Von B');
    assert.equal(configApi.getConfig().onboarding?.completed, true, 'A stays set up');
  } finally {
    await new Promise(resolve => setTimeout(resolve, 1700)); // let a pending debounce finish before closing
    server.closeAllConnections();
    server.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test('installation values travel with the shared version; only well-formed values are kept', async () => {
  const { writeFile, readFile } = await import('node:fs/promises');
  const dir = await mkdtemp(path.join(tmpdir(), 'hometwin-installation-'));
  const middleware = createSharedStoreMiddleware({ base: '/HomeTwin3D/', dir, pin: 'pin2' });
  const server = createServer((req, res) => middleware(req, res, () => { res.statusCode = 404; res.end(); }));
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  (globalThis as { __BASE?: string }).__BASE = `http://127.0.0.1:${(server.address() as { port: number }).port}/HomeTwin3D/`;
  const reader = browser(); use(reader);
  try {
    const shared = await import('../src/services/sharedStore');
    const installation = await import('../src/services/installationConfig');
    // As written by `npm run addon:export`: a mapping, one malformed entry, a location.
    await writeFile(path.join(dir, 'state.json'), JSON.stringify({
      format: 1, revision: 7, updatedAt: new Date().toISOString(),
      config: { location: { latitude: 0, longitude: 0 }, lights: [], rooms: [] }, model: null, objects: [],
      installation: { entities: { 'automation.tv_dial_hdmi1': 'media_player.living_room_tv', 'media_player.living_room_receiver': 'kein Entity' }, location: { label: 'Beispiel', latitude: 0.5, longitude: 0.5 } },
    }));
    shared.setSharedEnabled(true);
    assert.equal((await shared.syncFromShared()).kind, 'updated');
    assert.deepEqual(JSON.parse(reader.values.get('hometwin:installation')!), {
      entities: { 'automation.tv_dial_hdmi1': 'media_player.living_room_tv' },
      location: { label: 'Beispiel', latitude: 0.5, longitude: 0.5 },
    });
    assert.equal(installation.installationEntity('automation.tv_dial_hdmi1'), 'media_player.living_room_tv');
    // A browser of a public build publishes without values of its own: the shared ones stay.
    shared.setSharedPin('pin2');
    assert.equal((await shared.publishShared(true)).kind, 'published');
    const published = JSON.parse(await readFile(path.join(dir, 'state.json'), 'utf8'));
    assert.equal(published.installation.entities['automation.tv_dial_hdmi1'], 'media_player.living_room_tv');
  } finally {
    await new Promise(resolve => server.close(resolve));
    await rm(dir, { recursive: true, force: true });
  }
});
