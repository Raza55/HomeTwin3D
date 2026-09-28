import fs from 'node:fs';
import assert from 'node:assert/strict';
import { readGlb, writeGlb } from './optimize-glb.mjs';
const { json, bin } = readGlb(fs.readFileSync('../blender/Wohnung_v94_3Dash_Balkon.glb'));
const tags = JSON.parse(fs.readFileSync('.qa/echo-v95-tags.json', 'utf8'));
const scene = json.scenes[json.scene ?? 0], manifest = JSON.parse(scene.extras['3dash_manifest']);
for (const object of tags.objects) {
  assert(!manifest.objects.some(o => o.id === object.id));
  manifest.objects.push(object);
}
manifest.source = 'Wohnung_v95_3Dash_Echos.blend';
scene.extras['3dash_manifest'] = JSON.stringify(manifest);
const output = writeGlb(json, bin);
assert(readGlb(output).bin.equals(bin));
fs.writeFileSync('../blender/Wohnung_v95_3Dash_Echos.glb', output);
fs.writeFileSync('.qa/echo-v95.glb', output);
console.log(tags.objects);
