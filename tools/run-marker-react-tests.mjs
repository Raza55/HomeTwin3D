import { build } from 'esbuild';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Use the machine's bounded Chromium launcher; never launch Playwright directly.
const require = createRequire(import.meta.url);
const { withBrowser } = require(process.env.SAFE_BROWSER_MODULE || resolve(process.env.USERPROFILE || process.env.HOME, '.claude/tools/safe-browser.cjs'));
const output = new URL('../.qa/marker-react-tests.js', import.meta.url);
await mkdir(new URL('../.qa/', import.meta.url), { recursive: true });
await build({ entryPoints: [fileURLToPath(new URL('./marker-react.test.tsx', import.meta.url))], outfile: fileURLToPath(output),
  bundle: true, format: 'iife', globalName: 'markerTests', jsx: 'automatic', loader: { '.css': 'empty' },
  define: { 'import.meta.env': '{"DEV":false,"MODE":"qa","BASE_URL":"./"}', 'process.env.NODE_ENV': '"development"' } });
const script = await readFile(output);
const server = createServer((req, res) => {
  res.setHeader('Content-Type', req.url === '/test.js' ? 'text/javascript' : 'text/html');
  res.end(req.url === '/test.js' ? script : '<!doctype html><script src="/test.js"></script>');
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
try {
  await withBrowser(async browser => {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    try {
      await page.addInitScript(() => localStorage.setItem('hometwin:installation', JSON.stringify({ entities: {
        'automation.tv_dial_hdmi1': 'automation.test_tv_control',
        'media_player.living_room_receiver': 'media_player.test_receiver',
        'media_player.living_room_tv': 'media_player.test_tv',
      } })));
      await page.goto(`http://127.0.0.1:${server.address().port}/?markers=dom`);
      console.log(await page.evaluate(() => markerTests.runMarkerTests()));
      if (errors.length) throw new Error(errors.join('\n'));
    } finally { await page.close(); }
  }, { gpu: false, timeoutMs: 120000 });
} finally { await new Promise(resolve => server.close(resolve)); }
