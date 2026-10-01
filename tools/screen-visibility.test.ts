import test from 'node:test';
import assert from 'node:assert/strict';
import { VisibleScreenUpdates } from '../src/babylon/VisibleScreenUpdates';
import { Mesh, NullEngine, Scene, StandardMaterial } from '@babylonjs/core';
import type { DisplayMeshEntry } from '../src/babylon/DisplayMeshFactory';

function environment(t: test.TestContext) {
  const doc = new EventTarget() as EventTarget & { hidden: boolean };
  doc.hidden = false;
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const cleanups: Array<() => void> = [];
  Object.defineProperty(globalThis, 'document', { configurable: true, value: doc });
  t.after(() => {
    for (const cleanup of cleanups) cleanup();
    if (descriptor) Object.defineProperty(globalThis, 'document', descriptor);
    else Reflect.deleteProperty(globalThis, 'document');
  });
  const timers = new Map<number, () => void>();
  let id = 0;
  t.mock.method(globalThis, 'setInterval', (callback: () => void, delay: number) => {
    assert.equal(delay, 1000);
    timers.set(++id, callback);
    return id;
  });
  t.mock.method(globalThis, 'clearInterval', (timer: number) => { timers.delete(timer); });
  return {
    timers,
    cleanup(callback: () => void) { cleanups.push(callback); },
    visibility(hidden: boolean) { doc.hidden = hidden; doc.dispatchEvent(new Event('visibilitychange')); },
  };
}

test('hidden screens stop timers and downloads; resuming refreshes the latest state immediately', t => {
  const env = environment(t);
  let current = 'playing', drawn = '', refreshes = 0, pauses = 0;
  const updates = new VisibleScreenUpdates(() => {
    refreshes++; drawn = current;
    updates.setTicking(current === 'playing');
  }, () => { pauses++; });
  env.cleanup(() => updates.dispose());
  updates.setTicking(true); updates.setTicking(true);
  assert.equal(env.timers.size, 1);
  const queuedTick = [...env.timers.values()][0];
  queuedTick();
  assert.equal(drawn, 'playing');
  env.visibility(true);
  assert.equal(env.timers.size, 0); assert.equal(pauses, 1);
  current = 'off';
  queuedTick(); updates.setTicking(true);
  assert.equal(refreshes, 1); assert.equal(env.timers.size, 0);
  env.visibility(false);
  assert.equal(refreshes, 2); assert.equal(drawn, 'off'); assert.equal(env.timers.size, 0);
  current = 'playing'; updates.setTicking(true);
  env.visibility(true); env.visibility(false);
  assert.equal(drawn, 'playing'); assert.equal(env.timers.size, 1);
});

test('a screen created in a hidden tab starts no timer and refreshes upon first visibility', t => {
  const env = environment(t);
  env.visibility(true);
  let refreshes = 0;
  const updates = new VisibleScreenUpdates(() => { refreshes++; updates.setTicking(true); }, () => {});
  env.cleanup(() => updates.dispose());
  updates.setTicking(true);
  assert.equal(updates.visible, false); assert.equal(env.timers.size, 0);
  env.visibility(false);
  assert.equal(refreshes, 1); assert.equal(env.timers.size, 1);
});

test('disposing removes timer and visibility callbacks, including a queued tick', t => {
  const env = environment(t);
  let refreshes = 0, pauses = 0;
  const updates = new VisibleScreenUpdates(() => { refreshes++; }, () => { pauses++; });
  updates.setTicking(true);
  const queuedTick = [...env.timers.values()][0];
  updates.dispose(); updates.dispose();
  queuedTick(); env.visibility(true); env.visibility(false); updates.setTicking(true);
  assert.equal(env.timers.size, 0); assert.equal(refreshes, 0); assert.equal(pauses, 0);
});

test('TV updates retain completed artwork during refresh, pause hidden work and resume with latest playback', async t => {
  const env = environment(t);
  const storage = new Map<string, string>();
  const browser = Object.assign(new EventTarget(), { location: { protocol: 'http:' } });
  const descriptors = new Map<string, PropertyDescriptor | undefined>();
  const global = (name: string, value: unknown) => {
    descriptors.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    Object.defineProperty(globalThis, name, { configurable: true, value });
  };
  const images: ImageStub[] = [];
  class ImageStub {
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    loaded = false;
    naturalWidth = 16; naturalHeight = 16;
    private value = '';
    get src() { return this.value; }
    set src(value: string) { this.value = value; this.loaded = false; if (value) images.push(this); }
    load() { this.loaded = true; this.onload?.(); }
  }
  global('window', browser);
  global('localStorage', { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value), removeItem: (key: string) => storage.delete(key) });
  global('Image', ImageStub);
  env.cleanup(() => {
    for (const [name, descriptor] of descriptors) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else Reflect.deleteProperty(globalThis, name);
    }
  });
  const { updateDisplayTexture } = await import('../src/babylon/DisplayMeshFactory');
  const { updateSettings } = await import('../src/services/settingsStore');
  updateSettings('connection', { mode: 'demo', haSettings: { url: 'http://qa.invalid', port: 8123, token: '' } });
  let now = Date.parse('2026-10-01T12:00:10Z'), uploads = 0;
  t.mock.method(Date, 'now', () => now);
  const drawn: ImageStub[] = [];
  const context = new Proxy({
    measureText: (text: string) => ({ width: text.length * 8 }),
    createLinearGradient: () => ({ addColorStop() {} }),
    drawImage: (image: ImageStub) => { assert.ok(image.loaded, 'completed artwork must remain usable during refresh'); drawn.push(image); },
  }, { get: (target, key) => Reflect.get(target, key) ?? (() => {}) });
  const engine = new NullEngine(), scene = new Scene(engine), plane = new Mesh('screen', scene);
  const route = { television: 'media_player.qa_tv', receiver: 'media_player.qa_receiver', shield: 'media_player.qa_stream', screenshot: 'media_player.qa_snapshot' };
  const state = (entity_id: string, value: string, attributes = {}) => ({ entity_id, state: value, attributes });
  let states = {
    [route.television]: state(route.television, 'on'),
    [route.receiver]: state(route.receiver, 'on', { source: 'SHIELD Media' }),
    [route.shield]: state(route.shield, 'playing', { media_title: 'Example episode', media_duration: 120, media_position: 30, media_position_updated_at: '2026-10-01T12:00:00Z' }),
    [route.screenshot]: state(route.screenshot, 'on', { entity_picture: '/api/media_player_proxy/media_player.qa_snapshot?token=fixture' }),
  };
  const entry = {
    plane, material: new StandardMaterial('screen', scene), lastText: '',
    texture: { getContext: () => context, update: () => { uploads++; } },
    config: { id: 'qa', kind: 'tv', sources: [{ entityId: route.television }], tvMedia: route },
  } as unknown as DisplayMeshEntry;
  try {
    updateDisplayTexture(entry, states); images[0].load();
    assert.equal(env.timers.size, 1); assert.equal(JSON.parse(entry.lastText).position, 40);
    now += 10000;
    [...env.timers.values()][0]();
    assert.equal(images.length, 2); assert.equal(drawn.at(-1), images[0]);
    const lateLoad = images[1].onload;
    env.visibility(true);
    assert.equal(images[1].src, ''); assert.equal(env.timers.size, 0);
    const pausedUploads = uploads;
    now += 25000;
    states = { ...states, [route.shield]: state(route.shield, 'playing', { ...states[route.shield].attributes, media_title: 'Latest title' }) };
    updateDisplayTexture(entry, states); lateLoad?.();
    assert.equal(uploads, pausedUploads); assert.equal(images.length, 2);
    env.visibility(false);
    assert.equal(JSON.parse(entry.lastText).title, 'Latest title'); assert.equal(JSON.parse(entry.lastText).position, 75);
    assert.equal(images.length, 3); assert.equal(drawn.at(-1), images[0]);
    images[2].load();
    env.visibility(true);
    states = { ...states, [route.television]: state(route.television, 'off') };
    updateDisplayTexture(entry, states); env.visibility(false);
    assert.equal(JSON.parse(entry.lastText).kind, 'off'); assert.equal(env.timers.size, 0);
    plane.dispose();
    const disposedUploads = uploads;
    env.visibility(true); env.visibility(false);
    assert.equal(uploads, disposedUploads); assert.equal(env.timers.size, 0);
  } finally { plane.dispose(); const owner = scene; owner.dispose(); engine.dispose(); }
});
