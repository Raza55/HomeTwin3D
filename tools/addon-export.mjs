// Prepares the shared installation for the Home Assistant add-on: the LAN
// store (.private/shared: configuration, model, imported objects) plus the
// installation values (.private/installation.json: entity mapping, location)
// that public builds such as the add-on do not contain.
//
//   npm run addon:export   -> .private/addon-export/shared (copy it yourself)
//   npm run addon:sync     -> the same, then copied into the add-on's folder
//                             in the Samba share "addon_configs"; the target is
//                             HOMETWIN_ADDON_SHARE in .env.local, e.g.
//                             \\<ha-host>\addon_configs\<slug>
//
// Sync keeps the add-on usable while it runs: files first, state.json last
// (browsers switch only once it points at the new files). Its revision is set
// above the add-on's, so every browser takes it; the model counts as new only
// when its content changed, so tablets do not download it again for nothing.
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const source = '.private/shared';
const exportDir = '.private/addon-export/shared';
const sync = process.argv.includes('--sync');

const statePath = join(source, 'state.json');
if (!existsSync(statePath)) {
  console.error('No shared installation in .private/shared yet: publish it from the dashboard first (Settings -> System -> shared version).');
  process.exit(1);
}
const state = JSON.parse(readFileSync(statePath, 'utf8'));
const local = existsSync('.private/installation.json') ? JSON.parse(readFileSync('.private/installation.json', 'utf8')) : {};
// The media proxy target is a LAN address and stays local; the add-on proxies to HA itself.
const installation = {
  ...(local.entities && Object.keys(local.entities).length ? { entities: local.entities } : {}),
  ...(local.location ? { location: local.location } : {}),
};
if (Object.keys(installation).length) state.installation = installation;

const objectFile = object => `objects/${object.id}.${String(object.format).toLowerCase().replace(/[^a-z0-9]/g, '')}`;
const digest = file => createHash('sha256').update(readFileSync(file)).digest('hex');

/** HOMETWIN_ADDON_SHARE from the environment or .env.local (never committed). */
function addonShare() {
  if (process.env.HOMETWIN_ADDON_SHARE) return process.env.HOMETWIN_ADDON_SHARE;
  if (!existsSync('.env.local')) return '';
  const line = readFileSync('.env.local', 'utf8').split(/\r?\n/).find(l => l.startsWith('HOMETWIN_ADDON_SHARE='));
  return line ? line.slice('HOMETWIN_ADDON_SHARE='.length).trim().replace(/^["']|["']$/g, '') : '';
}

let target = exportDir;
if (sync) {
  const share = addonShare();
  if (!share) { console.error('Set HOMETWIN_ADDON_SHARE in .env.local (\\\\<ha-host>\\addon_configs\\<slug>).'); process.exit(1); }
  if (!existsSync(share)) { console.error('The add-on folder is not reachable (Samba share addon_configs; start the add-on once so it exists).'); process.exit(1); }
  target = join(share, 'shared');
  const existing = existsSync(join(target, 'state.json')) ? JSON.parse(readFileSync(join(target, 'state.json'), 'utf8')) : null;
  const revision = Math.max(state.revision ?? 0, existing?.revision ?? 0) + 1;
  const modelSource = join(source, 'model.glb'), modelTarget = join(target, 'model.glb');
  const modelChanged = existsSync(modelSource) && (!existsSync(modelTarget) || digest(modelSource) !== digest(modelTarget));
  state.revision = revision;
  if (state.model) state.model = { ...state.model, revision: modelChanged || !existing?.model ? revision : existing.model.revision };
  for (const object of state.objects ?? []) object.revision = revision;
  state.updatedAt = new Date().toISOString();
  mkdirSync(join(target, 'objects'), { recursive: true });
  for (const object of state.objects ?? []) if (existsSync(join(source, objectFile(object)))) cpSync(join(source, objectFile(object)), join(target, objectFile(object)));
  if (modelChanged) cpSync(modelSource, modelTarget);
  writeFileSync(join(target, 'state.json'), JSON.stringify(state));
  console.log(`Synced to the add-on: revision ${revision}, model ${modelChanged ? 'updated' : 'unchanged'}, ${state.objects?.length ?? 0} object(s), installation values ${state.installation ? 'yes' : 'no'}.`);
  console.log('Open browsers take the new version within a minute (after 20 s without input).');
} else {
  rmSync(exportDir, { recursive: true, force: true });
  mkdirSync(join(exportDir, 'objects'), { recursive: true });
  writeFileSync(join(exportDir, 'state.json'), JSON.stringify(state));
  if (existsSync(join(source, 'model.glb'))) cpSync(join(source, 'model.glb'), join(exportDir, 'model.glb'));
  for (const object of state.objects ?? []) if (existsSync(join(source, objectFile(object)))) cpSync(join(source, objectFile(object)), join(exportDir, objectFile(object)));
  console.log(`Add-on data ready in ${exportDir}: revision ${state.revision}, model ${existsSync(join(exportDir, 'model.glb')) ? 'yes' : 'no'}, ${state.objects?.length ?? 0} object(s), installation values ${state.installation ? 'yes' : 'no'}.`);
  console.log('Copy the folder "shared" into the HomeTwin3D add-on folder of the Samba share "addon_configs" (or run npm run addon:sync).');
}
