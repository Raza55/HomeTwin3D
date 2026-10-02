// v111 bedroom desk: applies desk-v111.py (.qa/desk-v111.json) to the optimized v110 GLB and appends the
// new microphone (.qa/desk-v111-part.glb). Monitor, stand, headphones and the old microphone share one
// material and their boxes overlap, so a triangle belongs to an object only when all three corners are
// vertices of that object (Blender world positions, 0.3 mm tolerance). Curve objects (stand legs, headband)
// were tessellated differently on export: they take the remaining triangles inside their bounds (+3 mm),
// a triangle in two such boxes goes to the one it lies deeper in. Ops: translate (vertices move;
// none may be shared with a triangle outside), keep (the stand: only guards against mix-ups) and remove
// (triangles leave the index buffer). The PC marker in the manifest rises with the monitor.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {Matrix,Quaternion,Vector3} from '@babylonjs/core';
import {readGlb,writeGlb,accessorBytes,optimizeGlb} from './optimize-glb.mjs';
const [input='../blender/Wohnung_v110_3Dash_Haustuer75.glb',output='../blender/Wohnung_v111_3Dash_Schreibtisch.glb']=process.argv.slice(2);
assert(input.endsWith('Wohnung_v110_3Dash_Haustuer75.glb'),'v110 GLB expected');
const spec=JSON.parse(fs.readFileSync('.qa/desk-v111.json','utf8'));
const base=readGlb(fs.readFileSync(input)),part=readGlb(fs.readFileSync('.qa/desk-v111-part.glb'));
const d=base.json,p=part.json,bin=base.bin,scene=d.scenes[d.scene??0];
const parents=new Map();d.nodes.forEach((n,i)=>(n.children??[]).forEach(c=>parents.set(c,i)));
const local=i=>{const n=d.nodes[i];return n.matrix?Matrix.FromArray(n.matrix):Matrix.Compose(Vector3.FromArray(n.scale??[1,1,1]),Quaternion.FromArray(n.rotation??[0,0,0,1]),Vector3.FromArray(n.translation??[0,0,0]));};
const world=i=>parents.has(i)?local(i).multiply(world(parents.get(i))):local(i);
const toG=([x,y,z])=>new Vector3(x,z,-y),toB=v=>[v.x,-v.z,v.y];
// Vertex lookup per op: a grid of 0.3 mm cells, neighbours included.
const CELL=3e-4,key=(a,b,c)=>`${a},${b},${c}`;
const ops=spec.ops.map((o,i)=>{
 const cells=new Set();for(const v of o.verts)cells.add(key(...v.map(c=>Math.round(c/CELL))));
 return {...o,i,cells,tris:0};
});
const E=.003;
for(const o of ops){o.min=o.lo.map(v=>v-E);o.max=o.hi.map(v=>v+E);}
const inBox=(o,b)=>b.every((c,k)=>c>=o.min[k]&&c<=o.max[k]);
// How far inside the box a point lies, relative to the box size (0 at the faces).
const depth=(o,b)=>Math.min(...b.map((c,k)=>Math.min(c-o.min[k],o.max[k]-c)/Math.max(1e-6,o.max[k]-o.min[k])));
const has=(o,b)=>{const c=b.map(x=>Math.round(x/CELL));for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++)for(let dz=-1;dz<=1;dz++)if(o.cells.has(key(c[0]+dx,c[1]+dy,c[2]+dz)))return true;return false;};
const chunks=[bin];let length=bin.length;
function append(data,target){const pad=(4-length%4)%4;if(pad){chunks.push(Buffer.alloc(pad));length+=pad;}const view=d.bufferViews.push({buffer:0,byteOffset:length,byteLength:data.length,target})-1;chunks.push(data);length+=data.length;return view;}
const meshUsers=new Map();d.nodes.forEach(n=>n.mesh!==undefined&&meshUsers.set(n.mesh,(meshUsers.get(n.mesh)??0)+1));
const posUsers=new Map();d.meshes.forEach(m=>m.primitives.forEach(q=>posUsers.set(q.attributes.POSITION,(posUsers.get(q.attributes.POSITION)??0)+1)));
const materialNames=new Set(ops.flatMap(o=>o.materials));
// Pre-pass: objects without a single exactly matching triangle are curves (box mode).
{const exact=new Map(ops.map(o=>[o,0]));
 for(const [ni,node] of d.nodes.entries()){
  const x=node.extras??{};if(node.mesh===undefined||x.ha_id||x.ha_door||x.ha_room_door||x.ha_appliance)continue;const m=world(ni);
  for(const pr of d.meshes[node.mesh].primitives){
   const mat=d.materials[pr.material]?.name;if(!materialNames.has(mat)||pr.indices===undefined)continue;
   const pos=accessorBytes(d,bin,pr.attributes.POSITION),idx=accessorBytes(d,bin,pr.indices);
   const read=i=>idx.width===2?idx.data.readUInt16LE(i*2):idx.width===4?idx.data.readUInt32LE(i*4):idx.data[i];
   const B=[];for(let i=0;i<pos.accessor.count;i++)B.push(toB(Vector3.TransformCoordinates(new Vector3(pos.data.readFloatLE(i*12),pos.data.readFloatLE(i*12+4),pos.data.readFloatLE(i*12+8)),m)));
   for(let t=0;t<idx.accessor.count;t+=3){const k=[read(t),read(t+1),read(t+2)];for(const o of ops)if(o.materials.includes(mat)&&k.every(i=>has(o,B[i])))exact.set(o,exact.get(o)+1);}
  }
 }
 for(const o of ops)o.curve=exact.get(o)===0;
 console.log('box mode:',ops.filter(o=>o.curve).map(o=>o.name).join(', '));
}
for(const [ni,node] of d.nodes.entries()){
 const x=node.extras??{};
 if(node.mesh===undefined||x.ha_id||x.ha_door||x.ha_room_door||x.ha_appliance)continue;
 const m=world(ni),inv=m.clone().invert();let changed=false;
 const primitives=d.meshes[node.mesh].primitives.flatMap(pr=>{
  const mat=d.materials[pr.material]?.name;
  if(!materialNames.has(mat)||pr.indices===undefined||(pr.mode??4)!==4)return [pr];
  const cands=ops.filter(o=>o.materials.includes(mat));
  const pos=accessorBytes(d,bin,pr.attributes.POSITION),idx=accessorBytes(d,bin,pr.indices);
  const read=i=>idx.width===2?idx.data.readUInt16LE(i*2):idx.width===4?idx.data.readUInt32LE(i*4):idx.data[i];
  const W=[],B=[];for(let i=0;i<pos.accessor.count;i++){const v=Vector3.TransformCoordinates(new Vector3(pos.data.readFloatLE(i*12),pos.data.readFloatLE(i*12+4),pos.data.readFloatLE(i*12+8)),m);W.push(v);B.push(toB(v));}
  const opOf=new Int32Array(W.length).fill(-1),outside=new Uint8Array(W.length),kept=[];let removed=0;
  for(let t=0;t<idx.accessor.count;t+=3){
   const k=[read(t),read(t+1),read(t+2)];
   let hit=cands.filter(o=>!o.curve&&k.every(i=>has(o,B[i])));
   if(!hit.length){
    hit=cands.filter(o=>o.curve&&k.every(i=>inBox(o,B[i])));
    if(hit.length>1){const c=[0,1,2].map(a=>(B[k[0]][a]+B[k[1]][a]+B[k[2]][a])/3);hit=[hit.reduce((x,y)=>depth(y,c)>depth(x,c)?y:x)];}
   }
   if(hit.length>1){const f=JSON.stringify([hit[0].op,hit[0].d]);assert(hit.every(o=>JSON.stringify([o.op,o.d])===f),`${node.name}/${mat}: triangle matches ${hit.map(o=>o.name)}`);}
   const o=hit[0];
   if(!o){k.forEach(i=>outside[i]=1);kept.push(idx.data.subarray(t*idx.width,(t+3)*idx.width));continue;}
   hit.forEach(h=>h.tris++);
   if(o.op==='remove'){removed++;continue;}
   kept.push(idx.data.subarray(t*idx.width,(t+3)*idx.width));
   if(o.op==='keep'){k.forEach(i=>outside[i]=1);continue;}
   for(const i of k){assert(opOf[i]===-1||JSON.stringify(ops[opOf[i]].d)===JSON.stringify(o.d),'vertex in two moves');opOf[i]=o.i;}
  }
  let moved=0,q={...pr};
  if(opOf.some(v=>v>=0)){
   const out=Buffer.from(pos.data.subarray(0,pos.accessor.count*12)),mn=[Infinity,Infinity,Infinity],mx=[-Infinity,-Infinity,-Infinity];
   for(let i=0;i<W.length;i++){
    if(opOf[i]>=0){
     const o=ops[opOf[i]];assert(!outside[i],`${o.name}: moved vertex shared with a triangle outside in ${node.name}`);
     const v=Vector3.TransformCoordinates(toG(B[i].map((c,k)=>c+o.d[k])),inv);out.writeFloatLE(v.x,i*12);out.writeFloatLE(v.y,i*12+4);out.writeFloatLE(v.z,i*12+8);moved++;
    }
    for(let k=0;k<3;k++){const c=out.readFloatLE(i*12+k*4);mn[k]=Math.min(mn[k],c);mx[k]=Math.max(mx[k],c);}
   }
   assert.equal(posUsers.get(pr.attributes.POSITION),1,`${node.name}: shared POSITION accessor`);
   const {byteStride,...rest}=pos.accessor;
   q.attributes={...pr.attributes,POSITION:d.accessors.push({...rest,bufferView:append(out,34962),byteOffset:0,min:mn,max:mx})-1};
  }
  if(removed){const data=Buffer.concat(kept);q.indices=d.accessors.push({bufferView:append(data,34963),componentType:idx.accessor.componentType,type:'SCALAR',count:data.length/idx.width})-1;}
  if(!moved&&!removed)return [pr];
  changed=true;return kept.length?[q]:[];
 });
 if(!changed)continue;
 if(meshUsers.get(node.mesh)>1)node.mesh=d.meshes.push({...structuredClone(d.meshes[node.mesh]),primitives})-1;else d.meshes[node.mesh].primitives=primitives;
 if(!primitives.length)delete node.mesh;
}
for(const o of ops)assert(o.tris>0,`${o.name}: not found in GLB`);
// Append the new microphone: buffer behind ours, materials merged by name.
assert(!p.textures?.length&&!p.animations?.length&&!p.skins?.length);
{const pad=(4-length%4)%4;if(pad){chunks.push(Buffer.alloc(pad));length+=pad;}}
const offset=length,mats=p.materials.map(m=>{let i=d.materials.findIndex(x=>x.name===m.name);if(i<0)i=d.materials.push(m)-1;return i;});
const vo=d.bufferViews.length,ao=d.accessors.length,mo=d.meshes.length;
d.bufferViews.push(...p.bufferViews.map(v=>({...v,buffer:0,byteOffset:offset+(v.byteOffset??0)})));
d.accessors.push(...p.accessors.map(a=>({...a,bufferView:a.bufferView+vo})));
d.meshes.push(...p.meshes.map(m=>({...m,primitives:m.primitives.map(q=>({...q,indices:q.indices+ao,material:mats[q.material],attributes:Object.fromEntries(Object.entries(q.attributes).map(([k,v])=>[k,v+ao]))}))})));
const added=[];
for(const n of p.nodes){assert(!n.children?.length);scene.nodes.push(d.nodes.push({...n,mesh:n.mesh+mo})-1);added.push(n.name);}
assert.deepEqual(added.map(a=>a.replace(/\.\d+$/,'')).sort(),spec.new.map(o=>o.name).sort());
chunks.push(part.bin);length+=part.bin.length;d.buffers[0].byteLength=length;
// Manifest: the PC marker sits at the monitor top (app coords: y = Blender z).
const manifest=JSON.parse(scene.extras['3dash_manifest']);
const monitor=spec.ops.find(o=>o.name==='SZ_monitor'),top={x:-(monitor.lo[0]+monitor.hi[0])/2,y:monitor.hi[2],z:-monitor.lo[1]};
const markers=manifest.objects.filter(o=>o.position&&Math.abs(o.position.x-top.x)<.1&&Math.abs(o.position.y-top.y)<.03&&Math.abs(o.position.z-top.z)<.05);
assert.equal(markers.length,1,'one PC marker at the monitor');
for(const o of markers)o.position.y+=spec.monitorDz;
manifest.source='Wohnung_v111_3Dash_Schreibtisch.blend';scene.extras['3dash_manifest']=JSON.stringify(manifest);
const bytes=optimizeGlb(writeGlb(d,Buffer.concat(chunks))).bytes;
fs.writeFileSync(output,bytes,{flag:'wx'});fs.writeFileSync('.qa/desk-v111.glb',bytes);
console.log(JSON.stringify({ops:ops.map(o=>`${o.name}:${o.op}:${o.tris}`),added,addedTriangles:spec.new.map(o=>o.triangles),marker:markers.map(o=>o.label),bytes:bytes.length}));
