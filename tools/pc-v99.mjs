import fs from 'node:fs';
import assert from 'node:assert/strict';
import {readGlb,writeGlb} from './optimize-glb.mjs';
const base=readGlb(fs.readFileSync('../blender/Wohnung_v98_3Dash_IT.glb'));
const part=readGlb(fs.readFileSync('.qa/pc-v99-part.glb'));
const d=base.json,p=part.json,scene=d.scenes[d.scene??0];
assert(!p.textures?.length && !p.animations?.length);
const materials=p.materials.map(m=>{let i=d.materials.findIndex(x=>x.name===m.name);if(i<0){i=d.materials.length;d.materials.push(m);}else d.materials[i]=m;return i;});
const vo=d.bufferViews.length,ao=d.accessors.length,mo=d.meshes.length;
d.bufferViews.push(...p.bufferViews.map(v=>({...v,buffer:0,byteOffset:base.bin.length+(v.byteOffset??0)})));
d.accessors.push(...p.accessors.map(a=>({...a,bufferView:a.bufferView+vo})));
d.meshes.push(...p.meshes.map(m=>({...m,primitives:m.primitives.map(q=>({...q,indices:q.indices+ao,material:materials[q.material],attributes:Object.fromEntries(Object.entries(q.attributes).map(([k,v])=>[k,v+ao]))}))})));
for(const n of p.nodes){if(n.name.startsWith('material_carrier_'))continue;assert(n.children===undefined);scene.nodes.push(d.nodes.length);d.nodes.push({...n,mesh:n.mesh+mo});}
// The old LED material is shared by case strips, RAM and reservoir. Keep those
// meshes so the source and partial export use the same palette.
const manifest=JSON.parse(scene.extras['3dash_manifest']);
manifest.objects.find(o=>o.id==='fe9254e5-2172-503d-9305-264777737f06').it=JSON.parse(fs.readFileSync('.qa/pc-v99-config.json'));
manifest.source='Wohnung_v99_3Dash_PC_RGB.blend';scene.extras['3dash_manifest']=JSON.stringify(manifest);
d.extensionsUsed=[...new Set([...(d.extensionsUsed??[]),...(p.extensionsUsed??[])])];
const bin=Buffer.concat([base.bin,part.bin]);d.buffers[0].byteLength=bin.length;
const output=writeGlb(d,bin);assert(readGlb(output).bin.subarray(0,base.bin.length).equals(base.bin));
fs.writeFileSync('../blender/Wohnung_v99_3Dash_PC_RGB.glb',output);fs.writeFileSync('.qa/pc-v99.glb',output);
console.log({addedNodes:p.nodes.filter(n=>!n.name.startsWith('material_carrier_')).length,objects:manifest.objects.length,animations:d.animations?.length,bytesAdded:output.length-fs.statSync('../blender/Wohnung_v98_3Dash_IT.glb').size});
