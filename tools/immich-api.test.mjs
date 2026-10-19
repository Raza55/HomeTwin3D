import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createImmichHandler, authenticateHA } from '../3dash-addon/immich-api.mjs';
const albumId = '11111111-1111-4111-8111-111111111111';
const first = '22222222-2222-4222-8222-222222222222';
const second = '33333333-3333-4333-8333-333333333333';
const json = value => new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } });
async function fixture(t, options = {}) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    if (url.endsWith('/albums/' + albumId)) return json({ albumName: 'Calendar album', assetCount: 2, owner: { email: 'hidden@example.com' } });
    if (url.endsWith('/search/random')) return json([{ id: first, type: 'IMAGE' }, { id: second, type: 'IMAGE' }]);
    return new Response(Buffer.from('image-preview'), { headers: { 'content-type': 'image/webp' } });
  };
  const server = http.createServer(createImmichHandler({ url: 'https://photos.example.com', key: 'test-only-key', albumId,
    fetchImpl, authenticate: async auth => auth === 'Bearer test-viewer', ...options }));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const request = (route, init = {}) => fetch(`http://127.0.0.1:${server.address().port}/api/immich/${route}`, { headers: { Authorization: 'Bearer test-viewer' }, ...init });
  return { calls, request };
}
test('requires viewer authentication before reading Immich or revealing configuration', async t => {
  const { calls, request } = await fixture(t);
  assert.equal((await request('status', { headers: {} })).status, 401);
  assert.equal((await request('image', { headers: { Authorization: 'Bearer invalid' } })).status, 401);
  assert.equal(calls.length, 0);
});
test('returns only approved album name/count, never credentials or owner metadata', async t => {
  const { request } = await fixture(t);
  const response = await request('status');
  assert.equal(response.status, 200);
  assert.match(response.headers.get('cache-control'), /no-store/);
  assert.deepEqual(await response.json(), { albumName: 'Calendar album', assetCount: 2 });
});
test('fixed album filter, no immediately repeated image, only preview bytes', async t => {
  const { request, calls } = await fixture(t);
  const response = await request(`image?previous=${first}&albumId=other&url=https://other.example.com`);
  assert.equal(response.headers.get('x-photo-id'), second);
  assert.equal(await response.text(), 'image-preview');
  assert.deepEqual(JSON.parse(calls[0].init.body), { albumIds: [albumId], type: 'IMAGE', size: 2, withExif: false });
  assert.equal(calls[1].url, `https://photos.example.com/api/assets/${second}/thumbnail?size=preview`);
  assert.ok(calls.every(c => c.init.redirect === 'error' && c.init.headers['x-api-key'] === 'test-only-key'));
});
test('no arbitrary asset proxy or write routes', async t => {
  const { request, calls } = await fixture(t);
  assert.equal((await request('image/' + first)).status, 404);
  assert.equal((await request('status', { method: 'POST' })).status, 405);
  assert.equal(calls.length, 0);
});
test('missing or invalid configuration stays disabled', async t => {
  for (const options of [{ key: '' }, { albumId: '../other' }, { url: 'file:///tmp/photos' }, { url: 'https://user:password@photos.example.com' }]) {
    const { request, calls } = await fixture(t, options);
    assert.equal((await request('status')).status, 503);
    assert.equal(calls.length, 0);
  }
});
test('deleted, hidden, offline assets and videos cannot become slideshow images', async t => {
  const { request } = await fixture(t, { fetchImpl: async () => json([
    { id: first, type: 'VIDEO' }, { id: first, type: 'IMAGE', isTrashed: true },
    { id: first, type: 'IMAGE', visibility: 'LOCKED' }, { id: first, type: 'IMAGE', visibility: 'HIDDEN' },
    { id: first, type: 'IMAGE', isOffline: true }, { id: '../other', type: 'IMAGE' },
  ]) });
  const response = await request('image');
  assert.equal(response.status, 404); assert.deepEqual(await response.json(), { error: 'empty_album' });
});
test('upstream failures are redacted and non-image responses rejected', async t => {
  const { request } = await fixture(t, { fetchImpl: async () => { throw Error('private upstream detail'); } });
  assert.deepEqual(await (await request('image')).json(), { error: 'unavailable' });
  const bad = await fixture(t, { fetchImpl: async url => url.endsWith('/search/random') ? json([{ id: first, type: 'IMAGE' }]) : new Response('<script>bad</script>', { headers: { 'content-type': 'text/html' } }) });
  assert.equal((await bad.request('image')).status, 502);
});
test('oversized previews are rejected', async t => {
  const { request } = await fixture(t, { fetchImpl: async url => url.endsWith('/search/random') ? json([{ id: first, type: 'IMAGE' }]) : new Response('small body', { headers: { 'content-type': 'image/jpeg', 'content-length': String(13 * 1024 * 1024) } }) });
  assert.equal((await request('image')).status, 502);
});


test('HA authentication distinguishes rejected credentials from unavailable validation', async () => {
  for (const [status, expected] of [[200, true], [401, false], [403, false], [404, null], [500, null]]) {
    const messages = [];
    const result = await authenticateHA('Bearer test-only', async (url, init) => {
      assert.equal(url, 'http://homeassistant:8123/api/');
      assert.equal(init.headers.Authorization, 'Bearer test-only');
      assert.equal(init.redirect, 'error');
      return new Response('', { status });
    }, message => messages.push(message));
    assert.equal(result, expected);
    assert.deepEqual(messages, status === 200 ? [] : ['HTTP ' + status]);
  }
  const messages = [];
  assert.equal(await authenticateHA('Bearer test-only', async () => { throw Error('private credential and host'); }, m => messages.push(m)), null);
  assert.deepEqual(messages, ['connection_failed']);
});

test('unavailable HA validation fails closed without reading Immich', async t => {
  const { calls, request } = await fixture(t, { authenticate: async () => null });
  const response = await request('status');
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: 'unavailable', reason: 'ha_unavailable' });
  assert.equal(calls.length, 0);
});


test('dedicated viewer header works when a reverse proxy consumes Authorization', async t => {
  const { request, calls } = await fixture(t);
  assert.equal((await request('status', { headers: { 'X-HomeTwin-HA-Authorization': 'Bearer test-viewer' } })).status, 200);
  const count = calls.length;
  assert.equal((await request('status', { headers: { 'X-HomeTwin-HA-Authorization': 'Bearer invalid', Authorization: 'Bearer test-viewer' } })).status, 401);
  assert.equal(calls.length, count);
});
