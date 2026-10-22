import { build } from 'esbuild';
import { createServer } from 'node:http';
import { mkdir, readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
const { withBrowser } = require(process.env.SAFE_BROWSER_MODULE || resolve(process.env.USERPROFILE || process.env.HOME, '.claude/tools/safe-browser.cjs'));
const output = new URL('../.qa/calendar-editor-tests.js', import.meta.url);
await mkdir(new URL('../.qa/', import.meta.url), { recursive: true });
await build({ entryPoints: [fileURLToPath(new URL('./calendar-editor.fixture.tsx', import.meta.url))], outfile: fileURLToPath(output),
  bundle: true, format: 'iife', globalName: 'editorTest', jsx: 'automatic', loader: { '.css': 'empty' },
  define: { 'import.meta.env': '{"DEV":false,"MODE":"qa","BASE_URL":"./"}', 'process.env.NODE_ENV': '"development"' } });
const script = await readFile(output);
const server = createServer((req, res) => {
  res.setHeader('Content-Type', req.url === '/test.js' ? 'text/javascript; charset=utf-8' : 'text/html; charset=utf-8');
  res.end(req.url === '/test.js' ? script : '<!doctype html><body><script src="/test.js"></script></body>');
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
try {
  await withBrowser(async browser => {
    const page = await browser.newPage({ timezoneId: 'Europe/Berlin' });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    try {
      await page.goto(`http://127.0.0.1:${server.address().port}/`);
      const mount = mode => page.evaluate(mode => editorTest.mount(mode), mode);
      const save = async () => {
        await page.getByRole('button', { name: 'Speichern', exact: true }).click();
        await page.waitForFunction(() => editorTest.result());
        return page.evaluate(() => { const d = editorTest.result(); return { ...d, hour: d.start.getHours(), minute: d.start.getMinutes(), length: (d.end - d.start) / 60000 }; });
      };
      const chooseUl = async () => {
        await mount('new');
        await page.getByRole('button', { name: 'ÜL', exact: true }).click();
        assert.ok((await page.getByRole('combobox').locator('option').allTextContents()).includes('Math'), await page.locator('form').innerText());
        await page.getByRole('combobox').selectOption('Math');
      };
      await chooseUl();
      assert.equal(await page.getByRole('button', { name: /· Math/ }).count(), 2, 'only same date, subject and student');
      let draft = await save();
      assert.equal(draft.allDay, true); assert.equal(draft.length, 1440);
      await chooseUl();
      await page.getByRole('button', { name: '10:00–10:45 · Math', exact: true }).click();
      draft = await save();
      assert.equal(draft.allDay, false); assert.equal(draft.hour, 10); assert.equal(draft.length, 45);
      assert.match(draft.description, /Für: Student/); assert.doesNotMatch(draft.description, /Art: Stundenplan/);
      await mount('all-day');
      await page.getByRole('button', { name: '08:00–08:45 · Math', exact: true }).click();
      draft = await save(); assert.equal(draft.allDay, false); assert.equal(draft.length, 45);
      await mount('timed');
      draft = await save(); assert.equal(draft.allDay, false); assert.equal(draft.hour, 8); assert.equal(draft.length, 45);
      await mount('timed');
      await page.getByRole('button', { name: '0', exact: true }).click();
      await page.waitForFunction(() => editorTest.result());
      draft = await page.evaluate(() => editorTest.result());
      assert.equal(draft.allDay, false); assert.match(draft.description, /Note: 0 Punkte/);
      await mount('timed');
      await page.getByRole('button', { name: 'Ganztägig', exact: true }).click();
      draft = await save(); assert.equal(draft.allDay, true); assert.equal(draft.length, 1440);
      await chooseUl();
      await page.locator('input[type=date]').first().fill('2026-11-04');
      assert.equal(await page.getByRole('button', { name: /· Math/ }).count(), 0);
      await page.getByRole('button', { name: 'Ganztägig', exact: true }).click();
      await page.locator('input[type=time]').fill('11:15');
      draft = await save(); assert.equal(draft.allDay, false); assert.equal(draft.hour, 11); assert.equal(draft.minute, 15);
      await page.evaluate(() => editorTest.mount('timed', true));
      assert.equal(await page.getByRole('button', { name: '10:00–10:45 · Math', exact: true }).isDisabled(), true);
      assert.deepEqual(errors, []);
      console.log('PASS: ÜL all-day/timed creation, lesson filtering, 45-minute slots, editing, grade preservation, conversions, manual time and read-only controls');
    } finally { await page.close(); }
  }, { gpu: false, timeoutMs: 120000 });
} finally { await new Promise(resolve => server.close(resolve)); }
