import { build } from 'esbuild';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const here = p => fileURLToPath(new URL(p, import.meta.url));
await mkdir(here('../.qa/'), { recursive: true });
// IndexedDB is replaced by an in-memory store; the base URL points at the test server.
const memoryStorage = { name: 'memory-storage', setup(b) { b.onResolve({ filter: /\/storageApi$/ }, () => ({ path: here('./mocks/storage-memory.ts') })); } };
await build({ entryPoints: [here('./shared-sync.test.ts')], bundle: true, platform: 'node', format: 'esm', packages: 'external',
  define: { 'import.meta.env.BASE_URL': 'globalThis.__BASE', 'import.meta.env.DEV': 'false' }, plugins: [memoryStorage], outfile: here('../.qa/shared-sync.test.mjs') });
await import('./shared-store.test.mjs');
await import('../.qa/shared-sync.test.mjs');
