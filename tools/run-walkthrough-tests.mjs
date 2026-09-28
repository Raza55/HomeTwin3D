import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
await build({ entryPoints: [fileURLToPath(new URL('./walkthrough-camera.test.ts', import.meta.url))], bundle: true, platform: 'node', format: 'esm', packages: 'external', outfile: fileURLToPath(new URL('../.qa/walkthrough-camera.test.mjs', import.meta.url)) });
await import('../.qa/walkthrough-camera.test.mjs');
