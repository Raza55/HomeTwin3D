import fs from 'node:fs';
import assert from 'node:assert/strict';
const path='../blender/';
const buffer=fs.readFileSync(path+'Wohnung_v88_3Dash_Wohnen.glb'),size=buffer.readUInt32LE(12);
const doc=JSON.parse(buffer.subarray(20,20+size)),bin=buffer.subarray(28+size);
const audit=JSON.parse(fs.readFileSync('.qa/material-audit-v89.json'));
const fixed=[];
for(const row of audit){
 const mat=doc.materials.find(m=>m.name===row.name);
 if(!mat)continue;
 const pbr=mat.pbrMetallicRoughness??={};
 if(pbr.baseColorTexture)continue;
 const previous=pbr.baseColorFactor??[1,1,1,1];
 if(previous.some((v,i)=>Math.abs(v-row.color[i])>.001)){
  pbr.baseColorFactor=row.color;fixed.push({name:row.name,previous,color:row.color,users:row.users});
 }
}
assert.ok(fixed.some(m=>m.name==='KZ_Kiefer_Honig'));
const bath=JSON.parse(fs.readFileSync('.qa/v89-bath.json'));
for(const name of bath.materials){const material=doc.materials.find(m=>m.name===name);assert.ok(material);material.pbrMetallicRoughness.baseColorFactor=bath.color;material.pbrMetallicRoughness.roughnessFactor=.9683772;}
const scene=doc.scenes[doc.scene??0],manifest=JSON.parse(scene.extras['3dash_manifest']);
manifest.source='Wohnung_v89_3Dash_Materialfarben.blend';scene.extras['3dash_manifest']=JSON.stringify(manifest);
let json=Buffer.from(JSON.stringify(doc));json=Buffer.concat([json,Buffer.alloc((4-json.length%4)%4,32)]);
const header=Buffer.alloc(20);header.write('glTF');header.writeUInt32LE(2,4);header.writeUInt32LE(28+json.length+bin.length,8);header.writeUInt32LE(json.length,12);header.write('JSON',16);
const bh=Buffer.alloc(8);bh.writeUInt32LE(bin.length);bh.write('BIN\0',4);
const out=Buffer.concat([header,json,bh,bin]);fs.writeFileSync(path+'Wohnung_v89_3Dash_Materialfarben.glb',out);fs.writeFileSync('.qa/v89.glb',out);
fs.writeFileSync('.qa/v89-material-fixes.json',JSON.stringify(fixed,null,2));
assert.deepEqual(out.subarray(28+json.length),bin,'Geometry, textures and animations stay byte-identical');
console.log({correctedMaterials:fixed.length,names:fixed.map(m=>m.name),entities:manifest.objects.length});
