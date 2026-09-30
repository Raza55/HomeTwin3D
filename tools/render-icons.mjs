// Renders the app icon (branding/*.svg from tools/app-icon.py) into every size
// the app and the Home Assistant add-on use. Needs Edge or Chrome (headless,
// for the SVG glow and gradients) and ImageMagick (`magick`) for resizing.
//
//   python tools/app-icon.py && node tools/render-icons.mjs
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const browsers = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/usr/bin/chromium', '/usr/bin/google-chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
];
const browser = browsers.find(existsSync);
if (!browser) { console.error('No Edge/Chrome found for rendering the SVG icons.'); process.exit(1); }

const work = mkdtempSync(join(tmpdir(), 'hometwin-icons-'));
const render = name => {
  const out = join(work, `${name}.png`);
  execFileSync(browser, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--default-background-color=00000000',
    '--window-size=1024,1024', `--screenshot=${out}`, pathToFileURL(resolve('branding', `${name}.svg`)).href], { stdio: 'ignore' });
  return out;
};
const master = { icon: render('icon'), maskable: render('icon-maskable'), small: render('icon-small') };
const resize = (source, size, target) => execFileSync('magick', [source, '-filter', 'Lanczos', '-resize', `${size}x${size}`, '-strip', target]);

for (const scheme of ['dark', 'light']) {
  const dir = join('public', 'favicon', scheme);
  mkdirSync(dir, { recursive: true });
  copyFileSync(join('branding', 'icon-small.svg'), join(dir, 'favicon.svg'));
  resize(master.icon, 96, join(dir, 'favicon-96x96.png'));
  // iOS rounds the corners itself: full-bleed artwork.
  resize(master.maskable, 180, join(dir, 'apple-touch-icon.png'));
  resize(master.icon, 192, join(dir, 'web-app-manifest-192x192.png'));
  resize(master.icon, 512, join(dir, 'web-app-manifest-512x512.png'));
  resize(master.maskable, 192, join(dir, 'web-app-manifest-maskable-192x192.png'));
  resize(master.maskable, 512, join(dir, 'web-app-manifest-maskable-512x512.png'));
  execFileSync('magick', [master.small, '-filter', 'Lanczos', '-define', 'icon:auto-resize=48,32,16', join(dir, 'favicon.ico')]);
}
resize(master.icon, 128, join('3dash-addon', 'icon.png'));
resize(master.icon, 256, join('3dash-addon', 'logo.png'));
rmSync(work, { recursive: true, force: true });
console.log('Icons written to public/favicon/{dark,light} and 3dash-addon/{icon,logo}.png');
