// Prepares the shared installation for the Home Assistant add-on: the LAN
// store (.private/shared: configuration, model, imported objects) plus the
// installation values (.private/installation.json: entity mapping, location)
// that public builds such as the add-on do not contain. Output:
// .private/addon-export/shared, to copy once into the add-on's config folder
// (Samba share "addon_configs", folder of the HomeTwin3D add-on) before the
// add-on starts or while it is stopped. Nothing leaves this machine otherwise.
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const source = '.private/shared';
const target = '.private/addon-export/shared';
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

rmSync(target, { recursive: true, force: true });
mkdirSync(join(target, 'objects'), { recursive: true });
writeFileSync(join(target, 'state.json'), JSON.stringify(state));
if (existsSync(join(source, 'model.glb'))) cpSync(join(source, 'model.glb'), join(target, 'model.glb'));
let objects = 0;
for (const object of state.objects ?? []) {
  const file = `objects/${object.id}.${String(object.format).toLowerCase().replace(/[^a-z0-9]/g, '')}`;
  if (existsSync(join(source, file))) { cpSync(join(source, file), join(target, file)); objects++; }
}
console.log(`Add-on data ready in ${target}: revision ${state.revision}, model ${existsSync(join(target, 'model.glb')) ? 'yes' : 'no'}, ${objects} object(s), installation values ${state.installation ? 'yes' : 'no'}.`);
console.log('Copy the folder "shared" into the HomeTwin3D add-on folder of the Samba share "addon_configs" (replace), then (re)start the add-on.');
