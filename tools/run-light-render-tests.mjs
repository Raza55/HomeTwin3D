import { build } from 'esbuild';
import { createServer } from 'node:http';
import { mkdir, readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { withBrowser } = require(process.env.SAFE_BROWSER_MODULE || resolve(process.env.USERPROFILE || process.env.HOME, '.claude/tools/safe-browser.cjs'));
const output = new URL('../.qa/light-render-tests.js', import.meta.url);
await mkdir(new URL('../.qa/', import.meta.url), { recursive: true });
await build({ entryPoints: [fileURLToPath(new URL('./light-render.fixture.ts', import.meta.url))], outfile: fileURLToPath(output),
  bundle: true, format: 'iife', globalName: 'lightTest', define: { 'import.meta.env': '{"DEV":false,"MODE":"qa","BASE_URL":"./"}' } });
const script = await readFile(output);
const server = createServer((req, res) => {
  res.setHeader('Content-Type', req.url === '/test.js' ? 'text/javascript; charset=utf-8' : 'text/html; charset=utf-8');
  res.end(req.url === '/test.js' ? script : '<!doctype html><body><script src="/test.js"></script></body>');
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
try {
  await withBrowser(async browser => {
    const page = await browser.newPage();
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    try {
      await page.goto(`http://127.0.0.1:${server.address().port}/`);
      console.log('WebGL lighting comparison:', await page.evaluate(() => lightTest.compareLighting()));
      if (errors.length) throw new Error(errors.join('\n'));
    } finally { await page.close(); }
  }, { gpu: false, timeoutMs: 120000 });
} finally { await new Promise(resolve => server.close(resolve)); }
