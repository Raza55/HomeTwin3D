import fs from 'node:fs';
import assert from 'node:assert/strict';
import {Matrix,Quaternion,Vector3} from '@babylonjs/core';
import {readGlb,writeGlb,accessorBytes} from './optimize-glb.mjs';
const {json:doc,bin}=readGlb(fs.readFileSync('../blender/Wohnung_v91_3Dash_Zimmertueren.glb'));
const before=structuredClone(doc);
const parts=JSON.parse(fs.readFileSync('.qa/hueplay-v92-removed.json'));
let removed=0,length=bin.length;const chunks=[bin];
for(const node of doc.nodes){
 if(node.mesh===undefined)continue;
 const matrix=node.matrix?Matrix.FromArray(node.matrix):Matrix.Compose(Vector3.FromArray(node.scale??[1,1,1]),Quaternion.FromArray(node.rotation??[0,0,0,1]),Vector3.FromArray(node.translation??[0,0,0]));
 const primitives=[];
 for(const p of doc.meshes[node.mesh].primitives){
  const candidates=parts.filter(part=>part.materials.includes(doc.materials[p.material]?.name));
  if(!candidates.length){primitives.push(p);continue;}
  const positions=accessorBytes(doc,bin,p.attributes.POSITION),indices=accessorBytes(doc,bin,p.indices);
  const matched=Array.from({length:positions.accessor.count},(_,i)=>{
   const v=Vector3.TransformCoordinates(new Vector3(...[0,4,8].map(j=>positions.data.readFloatLE(i*positions.width+j))),matrix);
   return candidates.some(part=>part.vertices.some(q=>Math.hypot(v.x-q[0],v.y-q[1],v.z-q[2])<.00003));
  });
  const read=indices.accessor.componentType===5125?'readUInt32LE':indices.accessor.componentType===5123?'readUInt16LE':'readUInt8';
  const ids=Array.from({length:indices.accessor.count},(_,i)=>indices.data[read](i*indices.width)),keep=[];
  for(let i=0;i<ids.length;i+=3){if(ids.slice(i,i+3).every(v=>matched[v]))removed++;else keep.push(...ids.slice(i,i+3));}
  if(keep.length===ids.length){primitives.push(p);continue;}
  if(!keep.length)continue;
  const data=Buffer.alloc(keep.length*4);keep.forEach((v,i)=>data.writeUInt32LE(v,i*4));
  const view=doc.bufferViews.length;doc.bufferViews.push({buffer:0,byteOffset:length,byteLength:data.length});chunks.push(data);length+=data.length;
  const index=doc.accessors.length;doc.accessors.push({bufferView:view,componentType:5125,count:keep.length,type:'SCALAR'});primitives.push({...p,indices:index});
 }
 if(primitives.length)doc.meshes[node.mesh]={...doc.meshes[node.mesh],primitives};else delete node.mesh;
}
assert.equal(removed,parts.reduce((n,p)=>n+p.triangles,0));
const scene=doc.scenes[doc.scene??0],manifest=JSON.parse(scene.extras['3dash_manifest']);
const removedId='7bd84ba8-5d43-546c-a9db-9382b4490098';
assert.equal(manifest.objects.filter(o=>o.id===removedId).length,1);
manifest.objects=manifest.objects.filter(o=>o.id!==removedId);
const fixture=manifest.objects.find(o=>o.id==='b249ce50-4a17-5b05-8d78-0710b43fa1be');
fixture.label='Hue Play hinter Schrankdeko';fixture.room='Wohnzimmer';fixture.entityId='light.hue_tv_right_top';
manifest.source='Wohnung_v92_3Dash_HuePlay.blend';scene.extras['3dash_manifest']=JSON.stringify(manifest);
doc.buffers[0].byteLength=length;
assert.deepEqual(doc.animations,before.animations);assert.deepEqual(doc.materials,before.materials);assert.deepEqual(doc.images,before.images);
const output=writeGlb(doc,Buffer.concat(chunks));
fs.writeFileSync('../blender/Wohnung_v92_3Dash_HuePlay.glb',output);fs.writeFileSync('.qa/hueplay-v92.glb',output);
console.log({removedTriangles:removed,objects:manifest.objects.length,position:fixture.position,animations:doc.animations?.length});
