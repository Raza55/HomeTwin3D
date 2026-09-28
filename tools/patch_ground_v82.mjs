import fs from 'node:fs';
import assert from 'node:assert/strict';
const root='../blender/';
function read(path){const b=fs.readFileSync(path),n=b.readUInt32LE(12);return {doc:JSON.parse(b.subarray(20,20+n)),bin:b.subarray(28+n)};}
const {doc,bin}=read(root+'Wohnung_v81_3Dash_Aussenblick.glb'),part=read('.qa/v82-ground.glb');
const target=doc.nodes.find(n=>n.name==='Bestand_Grundriss_Fenster_weitere_Raeume.001'),source=part.doc.nodes.find(n=>n.mesh!==undefined);
for(const k of ['translation','rotation','scale','matrix'])assert.deepEqual(target[k],source[k]);
const material=doc.materials.findIndex(m=>m.name==='ground_1'),mesh=doc.meshes[target.mesh];
const index=mesh.primitives.findIndex(p=>p.material===material);assert.ok(index>=0);assert.equal(part.doc.meshes[source.mesh].primitives.length,1);
const vo=doc.bufferViews.length,ao=doc.accessors.length;
doc.bufferViews.push(...part.doc.bufferViews.map(v=>({...v,buffer:0,byteOffset:(v.byteOffset??0)+bin.length})));
doc.accessors.push(...part.doc.accessors.map(a=>{assert.equal(a.sparse,undefined);return {...a,bufferView:a.bufferView+vo};}));
const primitive=structuredClone(part.doc.meshes[source.mesh].primitives[0]);primitive.material=material;primitive.indices+=ao;
for(const k in primitive.attributes)primitive.attributes[k]+=ao;
mesh.primitives[index]=primitive;
for(const scene of doc.scenes){if(!scene.extras?.['3dash_manifest'])continue;scene.extras['3dash_manifest']=scene.extras['3dash_manifest'].replace('Wohnung_v81_3Dash_Aussenblick.blend','Wohnung_v82_3Dash_Fassadenkante.blend');}
const merged=Buffer.concat([bin,part.bin]);doc.buffers[0].byteLength=merged.length;
let json=Buffer.from(JSON.stringify(doc));json=Buffer.concat([json,Buffer.alloc((4-json.length%4)%4,32)]);
const h=Buffer.alloc(20);h.write('glTF');h.writeUInt32LE(2,4);h.writeUInt32LE(28+json.length+merged.length,8);h.writeUInt32LE(json.length,12);h.write('JSON',16);
const bh=Buffer.alloc(8);bh.writeUInt32LE(merged.length);bh.write('BIN\0',4);
fs.writeFileSync(root+'Wohnung_v82_3Dash_Fassadenkante.glb',Buffer.concat([h,json,bh,merged]));
fs.copyFileSync(root+'Wohnung_v82_3Dash_Fassadenkante.glb','.qa/v82.glb');
console.log('Replaced only ground_1 from Blender export; all other geometry and object IDs preserved.');
