import fs from 'node:fs';
import assert from 'node:assert/strict';
import {Matrix,Quaternion,Vector3} from '@babylonjs/core';
const root='../blender/';
function read(path){const b=fs.readFileSync(path),n=b.readUInt32LE(12);return {doc:JSON.parse(b.subarray(20,20+n)),bin:b.subarray(28+n)};}
const base=read(root+'Wohnung_v95_3Dash_Echos.glb'),old=read('.qa/v96-old.glb'),part=read('.qa/v96-new.glb');
const {doc,bin}=base;
function matrix(n){return n.matrix?Matrix.FromArray(n.matrix):Matrix.Compose(Vector3.FromArray(n.scale??[1,1,1]),Quaternion.FromArray(n.rotation??[0,0,0,1]),Vector3.FromArray(n.translation??[0,0,0]));}
function values(file,id){const a=file.doc.accessors[id],v=file.doc.bufferViews[a.bufferView];const count={VEC3:3,VEC2:2,SCALAR:1}[a.type];const size={5126:4,5125:4,5123:2,5121:1}[a.componentType];const fn={5126:'readFloatLE',5125:'readUInt32LE',5123:'readUInt16LE',5121:'readUInt8'}[a.componentType];return Array.from({length:a.count},(_,i)=>Array.from({length:count},(_,j)=>file.bin[fn]((v.byteOffset??0)+(a.byteOffset??0)+i*(v.byteStride??size*count)+j*size)));}
function positions(f,n,p){const m=matrix(n);return values(f,p.attributes.POSITION).map(v=>Vector3.TransformCoordinates(Vector3.FromArray(v),m));}
// Spatial hashing keeps matching local, including small floating-point export changes.
const key=v=>[v.x,v.y,v.z].map(x=>Math.floor(x/.0001));
const sets=new Map();let expected=0;
for(const n of old.doc.nodes){if(n.mesh===undefined)continue;assert.equal(n.children,undefined);for(const p of old.doc.meshes[n.mesh].primitives){const name=old.doc.materials[p.material].name.replace('v96placeholder_','');const buckets=sets.get(name)??new Map();for(const v of positions(old,n,p)){const k=key(v).join(',');const a=buckets.get(k)??[];a.push(v);buckets.set(k,a);}sets.set(name,buckets);expected+=values(old,p.indices).length/3;}}
function matches(buckets,v){const [x,y,z]=key(v);for(let i=-1;i<=1;i++)for(let j=-1;j<=1;j++)for(let k=-1;k<=1;k++)if(buckets.get([x+i,y+j,z+k].join(','))?.some(q=>Vector3.DistanceSquared(v,q)<1e-9))return true;return false;}
let removed=0;const appended=[];let offset=bin.length;
function append(buffer){const pad=Buffer.alloc((4-buffer.length%4)%4);const view=doc.bufferViews.length;doc.bufferViews.push({buffer:0,byteOffset:offset,byteLength:buffer.length});appended.push(buffer,pad);offset+=buffer.length+pad.length;return view;}
for(const n of doc.nodes){if(n.mesh===undefined)continue;const primitives=[];for(const p of doc.meshes[n.mesh].primitives){const buckets=sets.get(doc.materials[p.material]?.name);if(!buckets){primitives.push(p);continue;}const pos=positions(base,n,p),selected=pos.map(v=>matches(buckets,v));const indices=values(base,p.indices).flat(),keep=[];for(let i=0;i<indices.length;i+=3){if(indices.slice(i,i+3).every(j=>selected[j]))removed++;else keep.push(...indices.slice(i,i+3));}if(!keep.length)continue;if(keep.length!==indices.length){const bytes=Buffer.alloc(keep.length*4);keep.forEach((v,i)=>bytes.writeUInt32LE(v,i*4));const view=append(bytes);p.indices=doc.accessors.length;doc.accessors.push({bufferView:view,componentType:5125,count:keep.length,type:'SCALAR',min:[keep.reduce((a,b)=>Math.min(a,b))],max:[keep.reduce((a,b)=>Math.max(a,b))]});}primitives.push(p);}doc.meshes[n.mesh].primitives=primitives;if(!primitives.length)delete n.mesh;}
assert.equal(removed,expected,'Exact changed geometry count');
const po=offset,vo=doc.bufferViews.length,ao=doc.accessors.length,mo=doc.meshes.length;
assert.ok(!part.doc.textures?.length,'New lamp uses geometry/materials; existing images reused');
const materials=part.doc.materials.map(m=>{if(m.name.startsWith('v96placeholder_')){const i=doc.materials.findIndex(x=>x.name===m.name.replace('v96placeholder_',''));assert.ok(i>=0,m.name);return i;}const i=doc.materials.length;doc.materials.push(m);return i;});
doc.bufferViews.push(...part.doc.bufferViews.map(v=>({...v,buffer:0,byteOffset:po+(v.byteOffset??0)})));
doc.accessors.push(...part.doc.accessors.map(a=>({...a,bufferView:a.bufferView+vo})));
doc.meshes.push(...part.doc.meshes.map(m=>({...m,primitives:m.primitives.map(p=>({...p,indices:p.indices+ao,material:materials[p.material],attributes:Object.fromEntries(Object.entries(p.attributes).map(([k,v])=>[k,v+ao]))}))})));
const scene=doc.scenes[doc.scene??0];
for(const n of part.doc.nodes){assert.equal(n.children,undefined);scene.nodes.push(doc.nodes.length);doc.nodes.push({...n,mesh:n.mesh+mo});}
const manifest=JSON.parse(scene.extras['3dash_manifest']),updates=JSON.parse(fs.readFileSync('.qa/v96-manifest.json'));
for(const obj of updates){const i=manifest.objects.findIndex(o=>o.id===obj.id);if(i<0)manifest.objects.push(obj);else {const previous=manifest.objects[i];manifest.objects[i]={...previous,...obj};}}
manifest.source='Wohnung_v96_3Dash_DysonBalkon.blend';scene.extras['3dash_manifest']=JSON.stringify(manifest);
const meshMap=new Map();doc.meshes=doc.meshes.filter((m,i)=>{if(!m.primitives.length)return false;meshMap.set(i,meshMap.size);return true;});
for(const n of doc.nodes)if(n.mesh!==undefined)n.mesh=meshMap.get(n.mesh);
doc.extensionsUsed=[...new Set([...(doc.extensionsUsed??[]),...(part.doc.extensionsUsed??[])])];
const merged=Buffer.concat([bin,...appended,part.bin]);doc.buffers[0].byteLength=merged.length;
let json=Buffer.from(JSON.stringify(doc));json=Buffer.concat([json,Buffer.alloc((4-json.length%4)%4,32)]);
const header=Buffer.alloc(20);header.write('glTF');header.writeUInt32LE(2,4);header.writeUInt32LE(28+json.length+merged.length,8);header.writeUInt32LE(json.length,12);header.write('JSON',16);const bh=Buffer.alloc(8);bh.writeUInt32LE(merged.length);bh.write('BIN\0',4);
const output=Buffer.concat([header,json,bh,merged]);fs.writeFileSync(root+'Wohnung_v96_3Dash_DysonBalkon.glb',output);fs.writeFileSync('.qa/v96.glb',output);
console.log({removed,expected,objects:manifest.objects.length,animations:doc.animations?.length,updated:updates.map(o=>o.label)});
