import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { icons } from 'lucide-react';
import { NullEngine, Scene, MeshBuilder, StandardMaterial } from '@babylonjs/core';
import { ExteriorMeshPool } from '../src/babylon/ExteriorMeshPool';
import { fetchHistory } from '../src/services/haHistoryApi';
import { setActiveHAConnection, type HALike } from '../src/services/haWebSocket';
import { computeGraphGeometry } from '../src/utils/graphGeometry';
import { iconLoaders } from '../src/services/iconLoaders.generated';
import { loadLucideIcon } from '../src/services/lucideIcons';

const connection = (request: HALike['request']): HALike => ({ request, isConnected: true, callService: async () => {}, forceReconnect() {}, dispose() {} });

test('concurrent identical histories share one request and preserve the cache TTL', async () => {
  let calls = 0, resolve!: (value: unknown) => void;
  const now = Date.now;
  let clock = now(); Date.now = () => clock;
  setActiveHAConnection(connection(async () => { calls++; return new Promise(r => { resolve = r; }); }));
  try {
    const first = fetchHistory('sensor.temperature', '24h');
    const second = fetchHistory('sensor.temperature', '24h');
    await Promise.resolve();
    assert.equal(calls, 1);
    resolve({ 'sensor.temperature': [{ s: '21.5', lu: 1000 }] });
    const [a, b] = await Promise.all([first, second]);
    assert.equal(a, b);
    assert.deepEqual(a, [{ state: '21.5', last_changed: new Date(1000000).toISOString() }]);
    clock += 59999;
    assert.equal(await fetchHistory('sensor.temperature', '24h'), a);
    assert.equal(calls, 1);
    clock++;
    const refreshed = fetchHistory('sensor.temperature', '24h');
    await Promise.resolve(); assert.equal(calls, 2);
    resolve({ 'sensor.temperature': [{ s: '22', lu: 1001 }] });
    assert.equal((await refreshed)[0].state, '22');
  } finally { Date.now = now; setActiveHAConnection(null); }
});

test('history failures can retry and connections, entities and periods stay isolated', async () => {
  let calls = 0;
  const old = connection(async message => {
    calls++; if (calls === 1) throw new Error('temporary failure');
    return { [(message.entity_ids as string[])[0]]: [{ s: 'old', lu: 1000 }] };
  });
  setActiveHAConnection(old);
  try {
    await assert.rejects(fetchHistory('sensor.a', '24h'), /temporary/);
    assert.equal((await fetchHistory('sensor.a', '24h'))[0].state, 'old');
    await Promise.all([fetchHistory('sensor.a', '1h'), fetchHistory('sensor.b', '24h')]);
    assert.equal(calls, 4);
    setActiveHAConnection(connection(async () => ({ 'sensor.a': [{ s: 'new', lu: 1002 }] })));
    assert.equal((await fetchHistory('sensor.a', '24h'))[0].state, 'new');
  } finally { setActiveHAConnection(null); }
});

test('graph geometry retains exact SVG coordinates, flat series and large histories', () => {
  const points = [{ state: '10', last_changed: '2026-01-01T00:00:00Z' }, { state: 'unavailable', last_changed: '2026-01-01T00:30:00Z' }, { state: '20', last_changed: '2026-01-01T01:00:00Z' }];
  assert.deepEqual(computeGraphGeometry(points), { count: 2, minVal: 10, maxVal: 20, polylinePoints: '40,100 300,20' });
  const flat = computeGraphGeometry([points[0], points[0]]);
  assert.equal(flat.polylinePoints, '40,100 40,100');
  const large = computeGraphGeometry(Array.from({ length: 200000 }, (_, i) => ({ state: String(i), last_changed: new Date(i * 1000).toISOString() })));
  assert.equal(large.count, 200000); assert.equal(large.polylinePoints.split(' ').length, 200000);
  assert.equal(large.maxVal, 199999);
});

test('all existing icon names survive and dynamically loaded icons produce the same SVG', async () => {
  assert.deepEqual(Object.keys(iconLoaders).sort(), Object.keys(icons).sort());
  for (const name of ['Thermometer', 'AlarmClock', 'Wifi', 'AArrowDown', 'CircleQuestionMark'] as const) {
    const first = loadLucideIcon(name);
    assert.equal(first, loadLucideIcon(name));
    const loaded = (await first)!;
    const props = { size: 32, color: '#38bdf8', strokeWidth: 2 };
    assert.equal(renderToStaticMarkup(createElement(loaded.default, props)), renderToStaticMarkup(createElement(icons[name], props)));
  }
  assert.equal(await loadLucideIcon('not-an-icon'), null);
  assert.equal(await loadLucideIcon('constructor'), null);
});

test('failed icon imports can retry without retaining a rejected promise', async () => {
  const original = iconLoaders.Accessibility;
  iconLoaders.Accessibility = () => Promise.reject(new Error('offline'));
  try { await assert.rejects(loadLucideIcon('Accessibility'), /offline/); }
  finally { iconLoaders.Accessibility = original; }
  assert.ok((await loadLucideIcon('Accessibility'))?.default);
});

test('exterior instances share geometry/material but keep independent transforms and disposal', () => {
  const engine = new NullEngine(), scene = new Scene(engine);
  try {
    const pool = new ExteriorMeshPool();
    const root = MeshBuilder.CreateBox('root', {}, scene);
    let builds = 0;
    const build = () => { builds++; return MeshBuilder.CreateSphere('tree', { diameter: 3, segments: 7 }, scene); };
    const source = pool.create('tree:green:3', 'tree', build);
    source.parent = root; source.material = new StandardMaterial('green', scene);
    source.position.set(2, 3, 4); source.scaling.set(1, 1.1, 1); source.rotation.y = .7;
    const instance = pool.create('tree:green:3', 'tree', build);
    assert.equal(builds, 1); assert.ok(instance.isAnInstance);
    assert.equal(instance.material, source.material);
    assert.deepEqual(instance.position.asArray(), [0, 0, 0]);
    assert.deepEqual(instance.scaling.asArray(), [1, 1, 1]);
    instance.parent = root; instance.position.x = 10;
    assert.equal(source.position.x, 2);
    assert.equal(instance.getTotalVertices(), source.getTotalVertices());
    pool.create('tree:red:3', 'tree-red', build);
    assert.equal(builds, 2);
    root.dispose(); assert.equal(instance.isDisposed(), true);
  } finally { scene.dispose(); engine.dispose(); }
});
