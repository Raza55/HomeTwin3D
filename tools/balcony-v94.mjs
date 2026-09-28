import fs from 'node:fs';
import assert from 'node:assert/strict';
import { readGlb, writeGlb } from './optimize-glb.mjs';
const source = fs.readFileSync('../blender/Wohnung_v93_3Dash_HuePlay_beide.glb');
const { json, bin } = readGlb(source);
const tags = JSON.parse(fs.readFileSync('.qa/balcony-v94-tags.json', 'utf8'));
const scene = json.scenes[json.scene ?? 0];
const manifest = JSON.parse(scene.extras['3dash_manifest']);
for (const node of json.nodes) {
  const id = tags.nodes[node.name];
  if (id) node.extras = { ...node.extras, ha_id: id };
}
for (const object of tags.objects) {
  // Older optimized exports batch these objects by material. The app adds invisible
  // picking volumes from their measured bounds; the existing geometry stays intact.
  assert(!manifest.objects.some(o => o.id === object.id), 'Already present');
  manifest.objects.push(object);
}
manifest.source = 'Wohnung_v94_3Dash_Balkon.blend';
scene.extras['3dash_manifest'] = JSON.stringify(manifest);
const output = writeGlb(json, bin);
assert(readGlb(output).bin.equals(bin), 'Geometry buffer changed');
fs.writeFileSync('../blender/Wohnung_v94_3Dash_Balkon.glb', output);
fs.writeFileSync('.qa/balcony-v94.glb', output);
console.log({ bytes: output.length, objects: tags.objects.map(o => ({ id: o.id, label: o.label, entityId: o.entityId })) });
