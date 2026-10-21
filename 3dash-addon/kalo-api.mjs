// KALO consumption bridge: reads monthly heating and hot-water values from the
// KALO resident portal (api.kalo.de) and serves them as compact JSON to the board.
// Credentials (username and password) and the apartment identifiers are server
// configuration only; they never reach the browser, and upstream errors are never
// forwarded. For each (cached) fetch the add-on performs the portal's own browser
// login over HTTP to obtain a short-lived access token. Access is gated by a valid
// Home Assistant bearer token, like immich-api.
import http from 'node:http';
import { pathToFileURL } from 'node:url';
import { authenticateHA } from './immich-api.mjs';
import { login as kaloLogin } from './kalo-login-flow.mjs';

const API_BASE = 'https://api.kalo.de/resident/v2';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ID = /^[0-9]{1,15}$/;              // billing/residential unit ids are numeric
const MAX_BODY = 2 * 1024 * 1024;
const CACHE_MS = 6 * 60 * 60 * 1000;     // KALO updates once a month; 6 h is plenty
const TYPES = { HEAT: 'heat', WARM_WATER: 'warmWater' };

async function bounded(response, max) {
  if (Number(response.headers.get('content-length')) > max) { await response.body?.cancel(); throw Error('size'); }
  const chunks = []; let size = 0;
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > max) throw Error('size');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

function compact(details, report) {
  const current = details?.currentConsumptions ?? {};
  const tiles = {};
  for (const [raw, key] of Object.entries(TYPES)) {
    const c = current[raw];
    if (!c) continue;
    tiles[key] = {
      unit: String(c.unit ?? ''),
      period: String(c.currentConsumption?.period ?? ''),
      value: Number(c.currentConsumption?.value ?? 0),
      estimated: !!c.currentConsumption?.estimated,
      referenceValue: Number(c.currentConsumption?.referenceValue ?? 0),
      previousPeriod: String(c.previousConsumption?.period ?? ''),
      previousValue: Number(c.previousConsumption?.value ?? 0),
      pctPrevious: Number(c.percentageFromPrevious ?? 0),
      pctReference: Number(c.percentageFromReference ?? 0),
    };
  }
  const months = Object.entries(report?.consumptions ?? {})
    .map(([period, entries]) => {
      const row = { period: String(period), estimated: false };
      for (const entry of Array.isArray(entries) ? entries : []) {
        const key = TYPES[entry?.consumptionType];
        if (!key) continue;
        row[key] = Number(entry.value ?? 0);
        row[key + 'Reference'] = Number(entry.referenceValue ?? 0);
        if (entry.estimated) row.estimated = true;
      }
      return row;
    })
    .sort((a, b) => a.period.localeCompare(b.period));
  return { updated: new Date().toISOString(), heat: tiles.heat ?? null, warmWater: tiles.warmWater ?? null, months };
}

export function createKaloHandler({
  username = '', password = '', residentId = '', billingUnit = '', occupancyId = '', residentialUnit = '8',
  apiBase = API_BASE, fetchImpl = fetch, authenticate, login = kaloLogin, now = Date.now,
}) {
  const configured = UUID.test(residentId) && ID.test(String(billingUnit)) && UUID.test(occupancyId)
    && ID.test(String(residentialUnit)) && !!username && !!password;
  const state = { accessToken: '', accessExpiry: 0, authing: null, data: null, dataAt: 0, loading: null };

  async function accessToken() {
    if (state.accessToken && state.accessExpiry - now() > 30000) return state.accessToken;
    if (state.authing) return state.authing;           // coalesce concurrent logins
    state.authing = (async () => {
      const token = await login({ username, password });
      if (!token?.access_token) throw Error('login');
      state.accessToken = token.access_token;
      state.accessExpiry = now() + (Number(token.expires_in) || 300) * 1000;
      return state.accessToken;
    })();
    try { return await state.authing; } finally { state.authing = null; }
  }

  async function upstream(route) {
    const response = await fetchImpl(apiBase + route, {
      redirect: 'error', signal: AbortSignal.timeout(15000),
      headers: { Authorization: 'Bearer ' + await accessToken(), accept: 'application/json' },
    });
    if (!response.ok) { await response.body?.cancel(); throw Error('upstream'); }
    return JSON.parse((await bounded(response, MAX_BODY)).toString());
  }

  async function consumption() {
    if (state.data && now() - state.dataAt < CACHE_MS) return state.data;
    if (state.loading) return state.loading;
    const base = `/residents/${residentId}/billing-units/${billingUnit}`;
    state.loading = (async () => {
      const [details, report] = await Promise.all([
        upstream(`${base}/occupancies/${occupancyId}/consumption-details`),
        upstream(`${base}/residential-units/${residentialUnit}/occupancies/${occupancyId}/consumptions-report`),
      ]);
      state.data = compact(details, report);
      state.dataAt = now();
      return state.data;
    })();
    try { return await state.loading; } finally { state.loading = null; }
  }

  let active = 0;
  return async (req, res) => {
    const headers = { 'cache-control': 'no-store, private', 'x-content-type-options': 'nosniff' };
    const reply = (status, body) => { res.writeHead(status, { ...headers, 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
    if (req.method !== 'GET') return reply(405, { error: 'method' });
    const request = new URL(req.url, 'http://localhost');
    if (!['/api/kalo/consumption', '/api/kalo/status'].includes(request.pathname)) return reply(404, { error: 'not_found' });
    if (active >= 4) return reply(429, { error: 'busy' });
    active++;
    try {
      // Reverse proxies may consume Authorization for their own access control.
      const authorization = req.headers['x-hometwin-ha-authorization'] ?? req.headers.authorization;
      if (!authorization?.startsWith('Bearer ') || !authorization.slice(7).trim()) return reply(401, { error: 'authentication', reason: 'missing_authorization' });
      const authenticated = await authenticate(authorization);
      if (authenticated === null) return reply(503, { error: 'unavailable', reason: 'ha_unavailable' });
      if (!authenticated) return reply(401, { error: 'authentication', reason: 'token_rejected' });
      if (!configured) return reply(503, { error: 'not_configured' });
      if (request.pathname.endsWith('/status')) return reply(200, { configured: true });
      return reply(200, await consumption());
    } catch {
      // Never forward remote error bodies, URLs, credentials or apartment identifiers.
      if (!res.headersSent) reply(502, { error: 'unavailable' });
      else res.end();
    } finally { active--; }
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  http.createServer(createKaloHandler({
    username: process.env.KALO_USERNAME,
    password: process.env.KALO_PASSWORD,
    residentId: process.env.KALO_RESIDENT_ID,
    billingUnit: process.env.KALO_BILLING_UNIT,
    occupancyId: process.env.KALO_OCCUPANCY_ID,
    residentialUnit: process.env.KALO_RESIDENTIAL_UNIT || '8',
    authenticate: authenticateHA,
  })).listen(8102, '127.0.0.1');
}
