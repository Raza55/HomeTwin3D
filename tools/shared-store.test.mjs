import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createSharedStoreMiddleware } from './shared-store-middleware.mjs';

async function withStore(pin, run) {
  const dir = await mkdtemp(path.join(tmpdir(), 'hometwin-shared-'));
  const middleware = createSharedStoreMiddleware({ base: '/HomeTwin3D/', dir, pin });
  const server = createServer((req, res) => middleware(req, res, () => { res.statusCode = 418; res.end(); }));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}/HomeTwin3D/shared/`;
  try { await run(url, dir); } finally { server.close(); await rm(dir, { recursive: true, force: true }); }
}

test('everyone reads, only the PIN writes, and unknown paths never reach the disk', async () => {
  await withStore('1234', async (url, dir) => {
    assert.equal((await fetch(`${url}state.json`)).status, 404);
    assert.equal((await fetch(`${url}state.json`, { method: 'PUT', body: '{}' })).status, 403);
    assert.equal((await fetch(`${url}state.json`, { method: 'PUT', body: '{}', headers: { 'X-HomeTwin-Pin': '9999' } })).status, 403);
    const put = await fetch(`${url}state.json`, { method: 'PUT', body: '{"format":1,"revision":1}', headers: { 'X-HomeTwin-Pin': '1234' } });
    assert.equal(put.status, 204);
    const get = await fetch(`${url}state.json`);
    assert.equal(get.status, 200);
    assert.deepEqual(await get.json(), { format: 1, revision: 1 });
    // Revalidation lets polling browsers skip unchanged state.
    assert.equal((await fetch(`${url}state.json`, { headers: { 'If-None-Match': get.headers.get('etag') } })).status, 304);
    assert.equal((await fetch(`${url}objects/lamp-1.glb`, { method: 'PUT', body: 'glb', headers: { 'X-HomeTwin-Pin': '1234' } })).status, 204);
    assert.equal(await (await fetch(`${url}objects/lamp-1.glb`)).text(), 'glb');
    assert.equal((await fetch(`${url}objects/lamp-1.glb`, { method: 'DELETE', headers: { 'X-HomeTwin-Pin': '1234' } })).status, 204);
    assert.equal((await fetch(`${url}objects/lamp-1.glb`)).status, 404);
    for (const bad of ['..%2F..%2Fsecret.json', 'config.json', 'objects/..%2Fstate.json', 'objects/a b.glb']) {
      assert.equal((await fetch(`${url}${bad}`, { method: 'PUT', body: 'x', headers: { 'X-HomeTwin-Pin': '1234' } })).status, 404, bad);
    }
    assert.deepEqual((await readdir(dir)).sort(), ['objects', 'state.json'], 'no temp files left behind');
    assert.equal((await fetch(`${url}check-pin`, { method: 'POST', headers: { 'X-HomeTwin-Pin': '1234' } })).status, 204);
    assert.equal((await fetch(`${url}check-pin`, { method: 'POST', headers: { 'X-HomeTwin-Pin': 'nope' } })).status, 403);
  });
});

test('without a configured PIN the store is read-only', async () => {
  await withStore(undefined, async url => {
    assert.equal((await fetch(`${url}state.json`, { method: 'PUT', body: '{}', headers: { 'X-HomeTwin-Pin': '' } })).status, 403);
    assert.equal((await fetch(`${url}check-pin`, { method: 'POST' })).status, 403);
  });
});

test('requests outside the shared prefix pass through', async () => {
  await withStore('1234', async url => {
    assert.equal((await fetch(url.replace('shared/', 'index.html'))).status, 418);
  });
});
