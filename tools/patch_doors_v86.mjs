import fs from 'node:fs';
import assert from 'node:assert/strict';
const root = '../blender/';
function read(path) {
  const b = fs.readFileSync(path), n = b.readUInt32LE(12);
  return { doc: JSON.parse(b.subarray(20, 20 + n)), bin: b.subarray(28 + n) };
}
const { doc, bin } = read(root + 'Wohnung_v84_3Dash_Waesche.glb');
const part = read('.qa/v86-door-geometry.glb');
assert.equal(part.doc.images?.length ?? 0, 0);
assert.equal(part.doc.nodes.length, 8);
const base = doc.nodes.find(n => n.name === 'Bestand_Grundriss_Fenster_weitere_Raeume.001');
const replacement = part.doc.nodes.find(n => n.name === base.name);
for (const key of ['translation', 'rotation', 'scale', 'matrix']) assert.deepEqual(replacement[key], base[key]);
const materials = part.doc.materials.map(m => {
  const index = doc.materials.findIndex(old => old.name === m.name.replace('v86placeholder_', ''));
  assert.ok(index >= 0, m.name);return index;
});
const vo = doc.bufferViews.length, ao = doc.accessors.length, mo = doc.meshes.length;
doc.bufferViews.push(...part.doc.bufferViews.map(v => ({ ...v, buffer: 0, byteOffset: (v.byteOffset ?? 0) + bin.length })));
doc.accessors.push(...part.doc.accessors.map(a => { assert.equal(a.sparse, undefined);return { ...a, bufferView: a.bufferView + vo }; }));
doc.meshes.push(...part.doc.meshes.map(m => ({ ...m, primitives: m.primitives.map(p => ({ ...p,
  indices: p.indices + ao, material: materials[p.material],
  attributes: Object.fromEntries(Object.entries(p.attributes).map(([key, value]) => [key, value + ao])),
})) })));
base.mesh = replacement.mesh + mo;
const scene = doc.scenes[doc.scene ?? 0];
for (const node of part.doc.nodes.filter(n => n !== replacement)) {
  assert.equal(node.children, undefined);
  scene.nodes.push(doc.nodes.length);doc.nodes.push({ ...node, mesh: node.mesh + mo });
}
const manifest = JSON.parse(scene.extras['3dash_manifest']);
const doors = JSON.parse(fs.readFileSync('.qa/v86-doors.json', 'utf8'));
assert.equal(doors.length, 4);
assert.ok(doors.find(o => o.door.kind === 'single').size.width < 1);
assert.equal(doc.nodes.filter(n => n.extras?.ha_door).length, 4);
for (const door of doors) assert.ok(doc.nodes.some(n => n.extras?.ha_id === door.id));
manifest.objects.push(...doors);manifest.source = 'Wohnung_v86_3Dash_Tuerkontakte.blend';
scene.extras['3dash_manifest'] = JSON.stringify(manifest);
const merged = Buffer.concat([bin, part.bin]);doc.buffers[0].byteLength = merged.length;
let json = Buffer.from(JSON.stringify(doc));json = Buffer.concat([json, Buffer.alloc((4 - json.length % 4) % 4, 32)]);
const header = Buffer.alloc(20);header.write('glTF');header.writeUInt32LE(2, 4);header.writeUInt32LE(28 + json.length + merged.length, 8);header.writeUInt32LE(json.length, 12);header.write('JSON', 16);
const bh = Buffer.alloc(8);bh.writeUInt32LE(merged.length);bh.write('BIN\0', 4);
const output = Buffer.concat([header, json, bh, merged]);
fs.writeFileSync(root + 'Wohnung_v86_3Dash_Tuerkontakte.glb', output);fs.writeFileSync('.qa/v86.glb', output);
console.log(`${doors.length} contacts; ${manifest.objects.length} total objects. Existing materials, textures, bindings and appliance animations preserved.`);
