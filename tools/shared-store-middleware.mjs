// Shared installation store for the Vite dev server (the add-on serves the same
// paths from nginx, see 3dash-addon/nginx.conf). Every browser reads the latest
// published configuration, model and imported objects; writing needs the PIN.
import { createReadStream, promises as fs } from 'node:fs';
import { timingSafeEqual } from 'node:crypto';
import path from 'node:path';

const FILE = /^(state\.json|model\.glb|objects\/[A-Za-z0-9_-]{1,80}\.[a-z0-9]{1,8})$/;
const TYPES = { json: 'application/json', glb: 'model/gltf-binary' };
const MAX_BYTES = 512 * 1024 * 1024;

function send(res, status) {
  res.statusCode = status;
  res.end();
}

function pinMatches(expected, given) {
  if (!expected || typeof given !== 'string') return false;
  const a = Buffer.from(expected), b = Buffer.from(given);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * @param {{ base: string, dir: string, pin?: string }} options
 * `base` is the app base path ("/HomeTwin3D/"); files live below `${base}shared/`.
 * Without a PIN the store is read-only.
 */
export function createSharedStoreMiddleware({ base, dir, pin }) {
  const prefix = `${base.replace(/\/?$/, '/')}shared/`;
  return async (req, res, next) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (!url.pathname.startsWith(prefix)) return next();
    const rel = decodeURIComponent(url.pathname.slice(prefix.length));
    res.setHeader('Cache-Control', 'no-cache');
    const authorized = pinMatches(pin, req.headers['x-hometwin-pin']);
    if (rel === 'check-pin') return send(res, authorized ? 204 : 403);
    if (!FILE.test(rel)) return send(res, 404);
    const file = path.join(dir, ...rel.split('/'));
    try {
      if (req.method === 'GET' || req.method === 'HEAD') {
        const stat = await fs.stat(file).catch(() => null);
        if (!stat?.isFile()) return send(res, 404);
        const etag = `"${stat.size.toString(16)}-${Math.floor(stat.mtimeMs).toString(16)}"`;
        res.setHeader('ETag', etag);
        if (req.headers['if-none-match'] === etag) return send(res, 304);
        res.setHeader('Content-Type', TYPES[rel.split('.').pop()] ?? 'application/octet-stream');
        res.setHeader('Content-Length', String(stat.size));
        if (req.method === 'HEAD') return res.end();
        createReadStream(file).pipe(res);
        return;
      }
      if (req.method !== 'PUT' && req.method !== 'DELETE') return send(res, 405);
      if (!authorized) return send(res, 403);
      if (req.method === 'DELETE') {
        await fs.rm(file, { force: true });
        return send(res, 204);
      }
      await fs.mkdir(path.dirname(file), { recursive: true });
      // Write beside the target and rename, so readers never see a partial file.
      const temp = `${file}.${process.pid}.${Date.now()}.tmp`;
      const handle = await fs.open(temp, 'w');
      let size = 0;
      try {
        for await (const chunk of req) {
          size += chunk.length;
          if (size > MAX_BYTES) throw Object.assign(new Error('too large'), { status: 413 });
          await handle.write(chunk);
        }
      } catch (error) {
        await handle.close();
        await fs.rm(temp, { force: true });
        return send(res, error.status ?? 500);
      }
      await handle.close();
      await fs.rename(temp, file);
      return send(res, 204);
    } catch {
      return send(res, 500);
    }
  };
}
