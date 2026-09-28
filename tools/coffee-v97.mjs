import fs from 'node:fs';
import assert from 'node:assert/strict';
import { readGlb, writeGlb } from './optimize-glb.mjs';
const { json, bin } = readGlb(fs.readFileSync('../blender/Wohnung_v96_3Dash_DysonBalkon.glb'));
const tags = JSON.parse(fs.readFileSync('.qa/coffee-v97-tags.json', 'utf8'));
const scene = json.scenes[json.scene ?? 0], manifest = JSON.parse(scene.extras['3dash_manifest']);
for (const object of tags.objects) {
  const i = manifest.objects.findIndex(o => o.id === object.id);
  assert(i >= 0);
  manifest.objects[i] = object;
}
manifest.source = 'Wohnung_v97_3Dash_Kaffee.blend';
scene.extras['3dash_manifest'] = JSON.stringify(manifest);
const output = writeGlb(json, bin);
assert(readGlb(output).bin.equals(bin));
fs.writeFileSync('../blender/Wohnung_v97_3Dash_Kaffee.glb', output);
fs.writeFileSync('.qa/coffee-v97.glb', output);
console.log(tags.objects);
