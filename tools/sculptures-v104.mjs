// v104: replaces the three bedroom stick figures in the optimized v103 GLB with the new
// sculptures from sculptures-v104.py (.qa/sculptures-v104-part.glb). Old geometry is removed
// per triangle: SZ_Bronze primitives, all three vertices inside one of the old object bounds.
// Everything else (v101 simplification, v102 threshold fix, v103 moves) stays unchanged.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {Matrix,Quaternion,Vector3} from '@babylonjs/core';
import {readGlb,writeGlb,accessorBytes,optimizeGlb} from './optimize-glb.mjs';
const [input='../blender/Wohnung_v103_3Dash_Wohnzimmer.glb',output='../blender/Wohnung_v104_3Dash_Skulpturen.glb']=process.argv.slice(2);
const spec=JSON.parse(fs.readFileSync('.qa/sculptures-v104.json','utf8'));
const base=readGlb(fs.readFileSync(input)),part=readGlb(fs.readFileSync('.qa/sculptures-v104-part.glb'));
const d=base.json,p=part.json,bin=base.bin,scene=d.scenes[d.scene??0];
const parents=new Map();d.nodes.forEach((n,i)=>(n.children??[]).forEach(c=>parents.set(c,i)));
const local=i=>{const n=d.nodes[i];return n.matrix?Matrix.FromArray(n.matrix):Matrix.Compose(Vector3.FromArray(n.scale??[1,1,1]),Quaternion.FromArray(n.rotation??[0,0,0,1]),Vector3.FromArray(n.translation??[0,0,0]));};
const world=i=>parents.has(i)?local(i).multiply(world(parents.get(i))):local(i);
const g=([x,y,z])=>new Vector3(x,z,-y); // Blender Z-up -> glTF Y-up
const boxes=spec.old.map(o=>{const a=g(o.lo),b=g(o.hi),E=.003;return {prefix:o.prefix,lo:Vector3.Minimize(a,b).subtractFromFloats(E,E,E),hi:Vector3.Maximize(a,b).addInPlaceFromFloats(E,E,E),removed:0};});
const inBox=(q,b)=>q.x>=b.lo.x&&q.x<=b.hi.x&&q.y>=b.lo.y&&q.y<=b.hi.y&&q.z>=b.lo.z&&q.z<=b.hi.z;
const oldMaterial=d.materials.findIndex(m=>m.name==='SZ_Bronze');assert(oldMaterial>=0);
const chunks=[bin];let length=bin.length;
function append(data,target){const view=d.bufferViews.push({buffer:0,byteOffset:length,byteLength:data.length,...(target?{target}:{})})-1;chunks.push(data);length+=data.length;const pad=(4-length%4)%4;if(pad){chunks.push(Buffer.alloc(pad));length+=pad;}return view;}
const meshUsers=new Map();d.nodes.forEach(n=>n.mesh!==undefined&&meshUsers.set(n.mesh,(meshUsers.get(n.mesh)??0)+1));
for(let ni=0;ni<d.nodes.length;ni++){
 const n=d.nodes[ni];if(n.mesh===undefined)continue;
 const mesh=d.meshes[n.mesh];if(!mesh.primitives.some(q=>q.material===oldMaterial))continue;
 const m=world(ni);let changed=false;
 const primitives=mesh.primitives.flatMap(q=>{
  if(q.material!==oldMaterial||q.indices===undefined||(q.mode??4)!==4)return [q];
  const pos=accessorBytes(d,bin,q.attributes.POSITION),idx=accessorBytes(d,bin,q.indices);
  const read=i=>idx.width===2?idx.data.readUInt16LE(i*2):idx.width===4?idx.data.readUInt32LE(i*4):idx.data[i];
  const where=new Int8Array(pos.accessor.count).fill(-1);
  for(let i=0;i<where.length;i++){const v=Vector3.TransformCoordinates(new Vector3(pos.data.readFloatLE(i*12),pos.data.readFloatLE(i*12+4),pos.data.readFloatLE(i*12+8)),m);where[i]=boxes.findIndex(b=>inBox(v,b));}
  const kept=[];let dropped=0;
  for(let t=0;t<idx.accessor.count;t+=3){const k=[read(t),read(t+1),read(t+2)],b=where[k[0]];if(b>=0&&where[k[1]]===b&&where[k[2]]===b){boxes[b].removed++;dropped++;}else kept.push(idx.data.subarray(t*idx.width,(t+3)*idx.width));}
  if(!dropped)return [q];changed=true;if(!kept.length)return [];
  const data=Buffer.concat(kept);
  return [{...q,indices:d.accessors.push({bufferView:append(data,34963),componentType:idx.accessor.componentType,type:'SCALAR',count:data.length/idx.width})-1}];
 });
 if(!changed)continue;
 if(meshUsers.get(n.mesh)>1)n.mesh=d.meshes.push({...structuredClone(mesh),primitives})-1;else mesh.primitives=primitives;
 if(!primitives.length)delete n.mesh;
}
for(const b of boxes)assert(b.removed>0,b.prefix+': old figure not found');
// Append the part GLB: its buffer goes behind ours, materials are merged by name.
assert(!p.textures?.length&&!p.animations?.length&&!p.skins?.length);
const offset=length,mats=p.materials.map(m=>{let i=d.materials.findIndex(x=>x.name===m.name);if(i<0)i=d.materials.push(m)-1;return i;});
const vo=d.bufferViews.length,ao=d.accessors.length,mo=d.meshes.length;
d.bufferViews.push(...p.bufferViews.map(v=>({...v,buffer:0,byteOffset:offset+(v.byteOffset??0)})));
d.accessors.push(...p.accessors.map(a=>({...a,bufferView:a.bufferView+vo})));
d.meshes.push(...p.meshes.map(m=>({...m,primitives:m.primitives.map(q=>({...q,indices:q.indices+ao,material:mats[q.material],attributes:Object.fromEntries(Object.entries(q.attributes).map(([k,v])=>[k,v+ao]))}))})));
const added=[];
for(const n of p.nodes){assert(!n.children?.length);scene.nodes.push(d.nodes.push({...n,mesh:n.mesh+mo})-1);added.push(n.name);}
assert.deepEqual(added.map(a=>a.replace(/\.\d+$/,'')).sort(),['SZ_Skulptur_Schulterstand','SZ_Skulptur_Sprinter','SZ_Skulptur_Vorbeuge']);
chunks.push(part.bin);length+=part.bin.length;d.buffers[0].byteLength=length;
const manifest=JSON.parse(scene.extras['3dash_manifest']);manifest.source='Wohnung_v104_3Dash_Skulpturen.blend';scene.extras['3dash_manifest']=JSON.stringify(manifest);
const bytes=optimizeGlb(writeGlb(d,Buffer.concat(chunks))).bytes;
fs.writeFileSync(output,bytes,{flag:'wx'});fs.writeFileSync('.qa/sculptures-v104.glb',bytes);
console.log(JSON.stringify({removedTriangles:boxes.map(b=>({[b.prefix]:b.removed})),added,addedTriangles:spec.new.map(o=>o.triangles),bytes:bytes.length}));
