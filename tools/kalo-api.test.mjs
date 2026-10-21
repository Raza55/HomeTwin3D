import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createKaloHandler } from '../3dash-addon/kalo-api.mjs';

const residentId = 'ff525b63-f058-49b9-bcf2-c73edf3a56d9';
const occupancyId = '495b8001-4819-4a9f-beca-4306196386b6';
const billingUnit = '731826';
const residentialUnit = '8';
const json = value => new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } });

const DETAILS = {
  currentConsumptions: {
    HEAT: { currentConsumption: { period: '2026-09', value: 6, estimated: false, referenceValue: 113.98 },
      previousConsumption: { period: '2025-09', value: 0, estimated: false, referenceValue: 113.98 },
      unit: 'KWH', percentageFromPrevious: 0, percentageFromReference: -95 },
    WARM_WATER: { currentConsumption: { period: '2026-09', value: 224.86, estimated: false, referenceValue: 101.75 },
      previousConsumption: { period: '2025-09', value: 119.61, estimated: false, referenceValue: 101.75 },
      unit: 'KWH', percentageFromPrevious: 88, percentageFromReference: 121 },
  },
};
const REPORT = {
  consumptions: {
    '2026-09': [{ consumptionType: 'HEAT', value: 6, unit: 'KWH', referenceValue: 113.98, estimated: false },
      { consumptionType: 'WARM_WATER', value: 224.86, unit: 'KWH', referenceValue: 101.75, estimated: false }],
    '2026-08': [{ consumptionType: 'HEAT', value: 5, unit: 'KWH', referenceValue: 49.39, estimated: true },
      { consumptionType: 'WARM_WATER', value: 155.02, unit: 'KWH', referenceValue: 101.75, estimated: false }],
  },
};

function memoryStore(seedSaved = null) {
  let saved = seedSaved;
  return { saves: () => saved, store: {
    async load(seed) { return saved ?? seed; },
    async save(token) { saved = token; },
  } };
}

async function fixture(t, options = {}) {
  const calls = [];
  let nextRefresh = 'rotated-refresh-token';
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    if (url === 'https://token.test/') return json({ access_token: 'access-xyz', expires_in: 300, refresh_token: nextRefresh, scope: 'openid offline_access' });
    if (url.endsWith('/consumption-details')) return json(DETAILS);
    if (url.endsWith('/consumptions-report')) return json(REPORT);
    throw Error('unexpected ' + url);
  };
  const mem = memoryStore(options.seedSaved ?? null);
  const handler = createKaloHandler({
    refreshToken: 'seed-refresh-token', residentId, billingUnit, occupancyId, residentialUnit,
    tokenUrl: 'https://token.test/', apiBase: 'https://api.test',
    fetchImpl, authenticate: async auth => auth === 'Bearer viewer', store: mem.store,
    ...options.handler,
  });
  const server = http.createServer(handler);
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const request = (route, init = {}) => fetch(`http://127.0.0.1:${server.address().port}/api/kalo/${route}`, { headers: { Authorization: 'Bearer viewer' }, ...init });
  return { calls, request, mem, setNextRefresh: v => { nextRefresh = v; } };
}

test('requires a valid Home Assistant bearer before any upstream call', async t => {
  const { calls, request } = await fixture(t);
  assert.equal((await request('consumption', { headers: {} })).status, 401);
  assert.equal((await request('consumption', { headers: { Authorization: 'Bearer wrong' } })).status, 401);
  assert.equal(calls.length, 0);
});

test('answers not_configured when identifiers are missing', async t => {
  const { request, calls } = await fixture(t, { handler: { occupancyId: '' } });
  const res = await request('consumption');
  assert.equal(res.status, 503);
  assert.deepEqual(await res.json(), { error: 'not_configured' });
  assert.equal(calls.length, 0);
});

test('refreshes the token, fetches both endpoints and returns a compact payload', async t => {
  const { request, calls } = await fixture(t);
  const res = await request('consumption');
  assert.equal(res.status, 200);
  assert.match(res.headers.get('cache-control'), /no-store/);
  const data = await res.json();
  assert.equal(data.heat.value, 6);
  assert.equal(data.heat.pctReference, -95);
  assert.equal(data.warmWater.previousValue, 119.61);
  assert.equal(data.months.length, 2);
  assert.deepEqual(data.months.map(m => m.period), ['2026-08', '2026-09']); // sorted ascending
  assert.equal(data.months[0].estimated, true);
  assert.equal(data.months[1].heatReference, 113.98);
  // token request carries the refresh grant; data requests carry the bearer and never the browser's token
  const token = calls.find(c => c.url === 'https://token.test/');
  assert.match(token.init.body.toString(), /grant_type=refresh_token/);
  assert.ok(calls.filter(c => c.url.startsWith('https://api.test')).every(c => c.init.headers.Authorization === 'Bearer access-xyz' && c.init.redirect === 'error'));
  // nothing in the response leaks the token
  assert.ok(!JSON.stringify(data).includes('access-xyz'));
});

test('persists a rotated refresh token and reuses it next time', async t => {
  const { request, mem } = await fixture(t);
  await request('consumption');
  assert.equal(mem.saves(), 'rotated-refresh-token');
});

test('caches consumption so a second call does not hit the token or data endpoints again', async t => {
  const { request, calls } = await fixture(t);
  await request('consumption');
  const count = calls.length;
  await request('consumption');
  assert.equal(calls.length, count);
});

test('maps upstream failure to a sanitized 502', async t => {
  const { request } = await fixture(t, { handler: { apiBase: 'https://api.test', fetchImpl: async (url) => {
    if (url === 'https://token.test/') return new Response(JSON.stringify({ access_token: 'a', expires_in: 300 }), { headers: { 'content-type': 'application/json' } });
    return new Response('nope', { status: 500 });
  } } });
  const res = await request('consumption');
  assert.equal(res.status, 502);
  assert.deepEqual(await res.json(), { error: 'unavailable' });
});
