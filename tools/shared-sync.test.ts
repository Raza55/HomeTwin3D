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

const fixtureConfig = (label: string) => ({ location: { latitude: 0, longitude: 0 }, lights: [], rooms: [{ id: 'room', label }], onboarding: { completed: true } });

test('overlapping publishes are serialized and edits during upload remain pending', async () => {
  const shared = await import('../src/services/sharedStore');
  const configApi = await import('../src/services/configApi');
  const writer = browser(); use(writer);
  writer.values.set('config', JSON.stringify(fixtureConfig('Before')));
  writer.values.set('shared:pin', JSON.stringify('test-pin'));
  writer.values.set('shared:revision', '1');
  writer.values.set('shared:pending', JSON.stringify({ config: true }));
  const originalFetch = globalThis.fetch;
  let state = { format: 1, revision: 1, updatedAt: 'test', config: fixtureConfig('Before'), model: null, objects: [] };
  let release!: () => void, started!: () => void, puts = 0, active = 0, maxActive = 0;
  const firstStarted = new Promise<void>(resolve => { started = resolve; });
  const hold = new Promise<void>(resolve => { release = resolve; });
  globalThis.fetch = async (_url, init) => {
    if (init?.method === 'PUT') {
      active++; maxActive = Math.max(maxActive, active);
      if (++puts === 1) { started(); await hold; }
      else assert.equal(shared.hasPendingSharedChanges(), true, 'newer edit is still pending when the next upload begins');
      state = JSON.parse(init.body as string);
      active--;
      return new Response(null, { status: 204 });
    }
    return Response.json(state);
  };
  try {
    const first = shared.publishShared();
    await firstStarted;
    configApi.updateConfig({ rooms: [{ id: 'room', label: 'During upload' }] });
    const second = shared.publishShared();
    await Promise.resolve();
    assert.equal(puts, 1, 'a second upload must wait');
    release();
    assert.deepEqual(await first, { kind: 'published', revision: 2 });
    assert.deepEqual(await second, { kind: 'published', revision: 3 });
    assert.equal(maxActive, 1);
    assert.equal(state.config.rooms[0].label, 'During upload');
    assert.equal(shared.hasPendingSharedChanges(), false);
    await new Promise(resolve => setTimeout(resolve, 1600));
    assert.equal(puts, 2, 'a stale debounce must not publish another identical revision');
  } finally { release(); globalThis.fetch = originalFetch; }
});

test('a failed object download never replaces the working model or configuration', async () => {
  const shared = await import('../src/services/sharedStore');
  const reader = browser(); use(reader);
  reader.values.set('config', JSON.stringify(fixtureConfig('Before')));
  reader.values.set('shared:revision', '1');
  reader.values.set('shared:modelRevision', '1');
  reader.values.set('shared:objectRevisions', JSON.stringify({ old: 1 }));
  reader.assets.set('model', new Blob(['OLD-MODEL']));
  reader.assets.set('object:old', new Blob(['OLD-OBJECT']));
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async url => {
    if (String(url).endsWith('state.json')) return Response.json({ format: 1, revision: 2, updatedAt: 'test', config: fixtureConfig('After'), model: { revision: 2, size: 9 }, objects: [{ id: 'new', format: 'glb', revision: 2 }] });
    if (String(url).endsWith('model.glb')) return new Response('NEW-MODEL');
    return new Response(null, { status: 503 });
  };
  try {
    assert.equal((await shared.syncFromShared()).kind, 'error');
    assert.equal(await reader.assets.get('model')!.text(), 'OLD-MODEL');
    assert.equal(await reader.assets.get('object:old')!.text(), 'OLD-OBJECT');
    assert.equal(JSON.parse(reader.values.get('config')!).rooms[0].label, 'Before');
    assert.equal(reader.values.get('shared:modelRevision'), '1');
    assert.equal(shared.getSharedRevision(), 1);
  } finally { globalThis.fetch = originalFetch; }
});

test('manifest changes during download are rejected before touching local assets', async () => {
  const shared = await import('../src/services/sharedStore');
  const reader = browser(); use(reader);
  reader.values.set('config', JSON.stringify(fixtureConfig('Before')));
  reader.values.set('shared:revision', '1');
  reader.assets.set('model', new Blob(['OLD-MODEL']));
  const originalFetch = globalThis.fetch;
  let manifests = 0;
  globalThis.fetch = async url => String(url).endsWith('state.json')
    ? Response.json({ format: 1, revision: ++manifests === 1 ? 2 : 3, updatedAt: 'test', config: fixtureConfig('After'), model: { revision: 2, size: 9 }, objects: [] })
    : new Response('NEW-MODEL');
  try {
    assert.deepEqual(await shared.syncFromShared(), { kind: 'conflict', revision: 3 });
    assert.equal(await reader.assets.get('model')!.text(), 'OLD-MODEL');
    assert.equal(shared.getSharedRevision(), 1);
  } finally { globalThis.fetch = originalFetch; }
});

test('a truncated model is rejected and localStorage failure rolls back assets', async () => {
  const shared = await import('../src/services/sharedStore');
  const installation = await import('../src/services/installationConfig');
  const reader = browser(); use(reader);
  installation.storeInstallation({ location: { label: 'Before', latitude: 0, longitude: 0 } });
  reader.values.set('config', JSON.stringify(fixtureConfig('Before')));
  reader.values.set('shared:revision', '1');
  reader.assets.set('model', new Blob(['OLD-MODEL']));
  const originalFetch = globalThis.fetch;
  let body = 'SHORT';
  globalThis.fetch = async url => String(url).endsWith('state.json')
    ? Response.json({ format: 1, revision: 2, updatedAt: 'test', config: fixtureConfig('After'), model: { revision: 2, size: 9 }, objects: [], installation: { location: { label: 'After', latitude: 0, longitude: 0 } } })
    : new Response(body);
  try {
    assert.equal((await shared.syncFromShared()).kind, 'error');
    assert.equal(await reader.assets.get('model')!.text(), 'OLD-MODEL');
    body = 'NEW-MODEL';
    const setItem = localStorage.setItem;
    let fail = true;
    localStorage.setItem = (key, value) => {
      if (key === 'config' && fail) { fail = false; throw new Error('Quota exceeded'); }
      setItem(key, value);
    };
    assert.equal((await shared.syncFromShared()).kind, 'error');
    assert.equal(await reader.assets.get('model')!.text(), 'OLD-MODEL');
    assert.equal(JSON.parse(reader.values.get('config')!).rooms[0].label, 'Before');
    assert.equal(shared.getSharedRevision(), 1);
    assert.equal(reader.values.has('shared:modelRevision'), false);
    assert.equal(installation.installation.location?.label, 'Before', 'the live installation must also roll back');
    assert.equal((await shared.syncFromShared()).kind, 'updated', 'the complete transfer can retry');
    assert.equal(await reader.assets.get('model')!.text(), 'NEW-MODEL');
  } finally { globalThis.fetch = originalFetch; }
});
