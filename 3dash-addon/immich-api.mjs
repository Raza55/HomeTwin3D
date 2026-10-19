// Private, read-only photo bridge. Credentials and album scope are server configuration only.
import http from 'node:http';
import { pathToFileURL } from 'node:url';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_IMAGE = 12 * 1024 * 1024;
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
export function createImmichHandler({ url = '', key = '', albumId = '', fetchImpl = fetch, authenticate }) {
  let base;
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.search || parsed.hash) throw Error('url');
    base = parsed.href.replace(/\/$/, '').replace(/\/api$/, '') + '/api';
  } catch { base = ''; }
  const configured = !!base && !!key && UUID.test(albumId);
  const upstream = async (route, body) => {
    const response = await fetchImpl(base + route, {
      method: body ? 'POST' : 'GET', redirect: 'error', signal: AbortSignal.timeout(15000),
      headers: { 'x-api-key': key, ...(body ? { 'content-type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (!response.ok) { await response.body?.cancel(); throw Error('upstream'); }
    return response;
  };
  const json = async (route, body) => JSON.parse((await bounded(await upstream(route, body), 8 * 1024 * 1024)).toString());
  let active = 0;
  return async (req, res) => {
    const headers = { 'cache-control': 'no-store, private', 'x-content-type-options': 'nosniff' };
    const reply = (status, body) => { res.writeHead(status, { ...headers, 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
    if (req.method !== 'GET') return reply(405, { error: 'method' });
    const request = new URL(req.url, 'http://localhost');
    if (!['/api/immich/status', '/api/immich/image'].includes(request.pathname)) return reply(404, { error: 'not_found' });
    if (active >= 4) return reply(429, { error: 'busy' });
    active++;
    try {
      const authorization = req.headers.authorization;
      if (!authorization?.startsWith('Bearer ') || !authorization.slice(7).trim()) return reply(401, { error: 'authentication', reason: 'missing_authorization' });
      const authenticated = await authenticate(authorization);
      if (authenticated === null) return reply(503, { error: 'unavailable', reason: 'ha_unavailable' });
      if (!authenticated) return reply(401, { error: 'authentication', reason: 'token_rejected' });
      if (!configured) return reply(503, { error: 'not_configured' });
      if (request.pathname.endsWith('/status')) {
        const album = await json('/albums/' + albumId);
        return reply(200, { albumName: String(album.albumName ?? '').slice(0, 150), assetCount: album.assetCount });
      }
      // The caller cannot supply an upstream URL, album or asset ID.
      const assets = await json('/search/random', { albumIds: [albumId], type: 'IMAGE', size: 2, withExif: false });
      if (!Array.isArray(assets)) throw Error('response');
      const images = assets.filter(a => UUID.test(a.id) && a.type === 'IMAGE' && !a.isTrashed && !a.isOffline && a.visibility !== 'LOCKED' && a.visibility !== 'HIDDEN');
      const asset = images.find(a => a.id !== request.searchParams.get('previous')) ?? images[0];
      if (!asset) return reply(404, { error: 'empty_album' });
      const response = await upstream('/assets/' + asset.id + '/thumbnail?size=preview');
      const type = response.headers.get('content-type')?.split(';')[0];
      if (!['image/jpeg', 'image/png', 'image/webp', 'image/avif'].includes(type)) { await response.body?.cancel(); throw Error('image'); }
      const data = await bounded(response, MAX_IMAGE);
      res.writeHead(200, { ...headers, 'content-type': type, 'content-length': data.length, 'x-photo-id': asset.id });
      res.end(data);
    } catch {
      // Never return remote error bodies, URLs, keys, EXIF or original filenames.
      if (!res.headersSent) reply(502, { error: 'unavailable' });
      else res.end();
    } finally { active--; }
  };
}
let lastAuthDiagnostic = 0;
function authDiagnostic(reason) {
  if (Date.now() - lastAuthDiagnostic < 60000) return;
  lastAuthDiagnostic = Date.now();
  console.warn('[immich-api] HA authentication check: ' + reason);
}
export async function authenticateHA(authorization, fetchImpl = fetch, report = authDiagnostic) {
  try {
    const response = await fetchImpl('http://homeassistant:8123/api/', {
      headers: { Authorization: authorization }, redirect: 'error', signal: AbortSignal.timeout(5000),
    });
    await response.body?.cancel();
    if (response.ok) return true;
    report('HTTP ' + response.status);
    return [401, 403].includes(response.status) ? false : null;
  } catch (error) {
    const code = error?.cause?.code ?? error?.code ?? error?.name;
    report(['ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN', 'ETIMEDOUT', 'TimeoutError'].includes(code) ? code : 'connection_failed');
    return null;
  }
}
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  http.createServer(createImmichHandler({
    url: process.env.IMMICH_URL, key: process.env.IMMICH_API_KEY,
    albumId: process.env.IMMICH_ALBUM_ID, authenticate: authenticateHA,
  })).listen(8101, '127.0.0.1');
}
