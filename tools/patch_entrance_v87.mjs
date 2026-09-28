import fs from 'node:fs';
import assert from 'node:assert/strict';
import {Matrix,Quaternion,Vector3} from '@babylonjs/core';
const root='../blender/';
function read(path){const b=fs.readFileSync(path),n=b.readUInt32LE(12);return {doc:JSON.parse(b.subarray(20,20+n)),bin:b.subarray(28+n)};}
const base=read(root+'Wohnung_v86_3Dash_Tuerkontakte.glb'),part=read('.qa/v87-entrance-geometry.glb');
const {doc,bin}=base;
function matrix(n){return n.matrix?Matrix.FromArray(n.matrix):Matrix.Compose(Vector3.FromArray(n.scale??[1,1,1]),Quaternion.FromArray(n.rotation??[0,0,0,1]),Vector3.FromArray(n.translation??[0,0,0]));}
function values(file,id){const a=file.doc.accessors[id],v=file.doc.bufferViews[a.bufferView];const count=a.type==='VEC3'?3:1;const size={5126:4,5125:4,5123:2,5121:1}[a.componentType];assert.ok(size);const fn={5126:'readFloatLE',5125:'readUInt32LE',5123:'readUInt16LE',5121:'readUInt8'}[a.componentType];return Array.from({length:a.count},(_,i)=>Array.from({length:count},(_,j)=>file.bin[fn]((v.byteOffset??0)+(a.byteOffset??0)+i*(v.byteStride??size*count)+j*size)));}
function positions(f,n,p){const m=matrix(n);return values(f,p.attributes.POSITION).map(v=>Vector3.TransformCoordinates(Vector3.FromArray(v),m));}
const pointSets=new Map();let expected=0;
for(const n of part.doc.nodes){assert.equal(n.children,undefined);for(const p of part.doc.meshes[n.mesh].primitives){const name=part.doc.materials[p.material].name.replace('v87placeholder_','');const points=pointSets.get(name)??[];points.push(...positions(part,n,p));pointSets.set(name,points);expected+=values(part,p.indices).length/3;}}
// Match moving-part vertices in the existing static batches. Material + world position
// prevents removing nearby walls/frames. Require exact triangle count before writing.
let removed=0;const appended=[];let offset=bin.length;
function append(buffer){const pad=Buffer.alloc((4-buffer.length%4)%4);const view=doc.bufferViews.length;doc.bufferViews.push({buffer:0,byteOffset:offset,byteLength:buffer.length});appended.push(buffer,pad);offset+=buffer.length+pad.length;return view;}
for(const n of doc.nodes){if(n.mesh===undefined)continue;for(const p of doc.meshes[n.mesh].primitives){const points=pointSets.get(doc.materials[p.material]?.name);if(!points)continue;const pos=positions(base,n,p);const selected=pos.map(v=>points.some(q=>Vector3.DistanceSquared(v,q)<1e-9));const indices=values(base,p.indices).flat(),keep=[];for(let i=0;i<indices.length;i+=3){if(indices.slice(i,i+3).every(j=>selected[j]))removed++;else keep.push(...indices.slice(i,i+3));}if(keep.length===indices.length)continue;assert.ok(keep.length>0);const bytes=Buffer.alloc(keep.length*4);keep.forEach((v,i)=>bytes.writeUInt32LE(v,i*4));const view=append(bytes);p.indices=doc.accessors.length;doc.accessors.push({bufferView:view,componentType:5125,count:keep.length,type:'SCALAR',min:[Math.min(...keep)],max:[Math.max(...keep)]});}}
assert.equal(removed,expected,'All and only entrance triangles must be removed');
const po=offset,vo=doc.bufferViews.length,ao=doc.accessors.length,mo=doc.meshes.length;
const materials=part.doc.materials.map(m=>{const i=doc.materials.findIndex(x=>x.name===m.name.replace('v87placeholder_',''));assert.ok(i>=0);return i;});
doc.bufferViews.push(...part.doc.bufferViews.map(v=>({...v,buffer:0,byteOffset:po+(v.byteOffset??0)})));
doc.accessors.push(...part.doc.accessors.map(a=>({...a,bufferView:a.bufferView+vo})));
doc.meshes.push(...part.doc.meshes.map(m=>({...m,primitives:m.primitives.map(p=>({...p,indices:p.indices+ao,material:materials[p.material],attributes:Object.fromEntries(Object.entries(p.attributes).map(([k,v])=>[k,v+ao]))}))})));
const scene=doc.scenes[doc.scene??0];
// One shared identity parent carries the rig, so marker bounds cover the full door.
const children=[];let extras;
for(const n of part.doc.nodes){extras=n.extras;children.push(doc.nodes.length);doc.nodes.push({...n,extras:{ha_id:n.extras.ha_id},mesh:n.mesh+mo});}
scene.nodes.push(doc.nodes.length);doc.nodes.push({name:'Haustuer_Rechts',children,extras});
const manifest=JSON.parse(scene.extras['3dash_manifest']),add=JSON.parse(fs.readFileSync('.qa/v87-entrance.json'));
assert.equal(add.length,2);manifest.objects.push(...add);manifest.source='Wohnung_v87_3Dash_Haustuer.blend';scene.extras['3dash_manifest']=JSON.stringify(manifest);
const merged=Buffer.concat([bin,...appended,part.bin]);doc.buffers[0].byteLength=merged.length;
let json=Buffer.from(JSON.stringify(doc));json=Buffer.concat([json,Buffer.alloc((4-json.length%4)%4,32)]);
const header=Buffer.alloc(20);header.write('glTF');header.writeUInt32LE(2,4);header.writeUInt32LE(28+json.length+merged.length,8);header.writeUInt32LE(json.length,12);header.write('JSON',16);const bh=Buffer.alloc(8);bh.writeUInt32LE(merged.length);bh.write('BIN\0',4);
const output=Buffer.concat([header,json,bh,merged]);fs.writeFileSync(root+'Wohnung_v87_3Dash_Haustuer.glb',output);fs.writeFileSync('.qa/v87.glb',output);
console.log({removed,expected,objects:manifest.objects.length,animations:doc.animations?.length});
