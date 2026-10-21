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

async function fixture(t, options = {}) {
  const calls = [];
  let logins = 0;
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    if (url.endsWith('/consumption-details')) return json(DETAILS);
    if (url.endsWith('/consumptions-report')) return json(REPORT);
    throw Error('unexpected ' + url);
  };
  const login = async ({ username, password }) => {
    logins++;
    if (username !== 'tester' || password !== 'secret') throw Error('invalid_credentials');
    return { access_token: 'access-xyz', expires_in: 300 };
  };
  const handler = createKaloHandler({
    username: 'tester', password: 'secret', residentId, billingUnit, occupancyId, residentialUnit,
    apiBase: 'https://api.test',
    fetchImpl, authenticate: async auth => auth === 'Bearer viewer', login,
    ...options.handler,
  });
  const server = http.createServer(handler);
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const request = (route, init = {}) => fetch(`http://127.0.0.1:${server.address().port}/api/kalo/${route}`, { headers: { Authorization: 'Bearer viewer' }, ...init });
  return { calls, request, logins: () => logins };
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

test('logs in, fetches both endpoints and returns a compact payload', async t => {
  const { request, calls, logins } = await fixture(t);
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
  // one login, both data requests carry the resulting bearer, and the token never leaks
  assert.equal(logins(), 1);
  assert.ok(calls.every(c => c.url.startsWith('https://api.test') && c.init.headers.Authorization === 'Bearer access-xyz' && c.init.redirect === 'error'));
  assert.ok(!JSON.stringify(data).includes('access-xyz'));
});

test('caches consumption and the access token so a second call does not log in or refetch', async t => {
  const { request, calls, logins } = await fixture(t);
  await request('consumption');
  const count = calls.length;
  await request('consumption');
  assert.equal(calls.length, count);
  assert.equal(logins(), 1);
});

test('maps upstream failure to a sanitized 502', async t => {
  const { request } = await fixture(t, { handler: {
    login: async () => ({ access_token: 'a', expires_in: 300 }),
    fetchImpl: async () => new Response('nope', { status: 500 }),
  } });
  const res = await request('consumption');
  assert.equal(res.status, 502);
  assert.deepEqual(await res.json(), { error: 'unavailable' });
});
