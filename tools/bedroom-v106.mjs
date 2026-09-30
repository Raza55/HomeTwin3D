// v106 bedroom: applies the ops of bedroom-v106.py (.qa/bedroom-v106.json) to the optimized v105 GLB.
// Static geometry: a triangle belongs to an op when its material is one of the object's materials and all
// three vertices lie inside the object's old bounds (+3 mm); its vertices get the op's function (Blender
// coordinates). A moved vertex must not be shared with a triangle outside, and no triangle may match two
// different ops. HA objects (ha_id) move as whole nodes; their manifest entry follows.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {Matrix,Quaternion,Vector3} from '@babylonjs/core';
import {readGlb,writeGlb,accessorBytes,optimizeGlb} from './optimize-glb.mjs';
const [input='../blender/Wohnung_v105_3Dash_Tuerteile.glb',output='../blender/Wohnung_v106_3Dash_Schlafzimmer.glb']=process.argv.slice(2);
const spec=JSON.parse(fs.readFileSync('.qa/bedroom-v106.json','utf8'));
const {json:d,bin}=readGlb(fs.readFileSync(input));
const parents=new Map();d.nodes.forEach((n,i)=>(n.children??[]).forEach(c=>parents.set(c,i)));
const local=i=>{const n=d.nodes[i];return n.matrix?Matrix.FromArray(n.matrix):Matrix.Compose(Vector3.FromArray(n.scale??[1,1,1]),Quaternion.FromArray(n.rotation??[0,0,0,1]),Vector3.FromArray(n.translation??[0,0,0]));};
const world=i=>parents.has(i)?local(i).multiply(world(parents.get(i))):local(i);
const toG=([x,y,z])=>new Vector3(x,z,-y),toB=v=>[v.x,-v.z,v.y];
// Op functions in Blender coordinates.
const fn={
 translate:(o,b)=>b.map((v,k)=>v+o.d[k]),
 lift_above:(o,b)=>b[2]>o.z?b.map((v,k)=>v+o.d[k]):b,
 squeeze_y:(o,b)=>[b[0]+o.shift[0],b[1]+(b[1]<o.c?o.d:-o.d)+o.shift[1],b[2]+o.shift[2]],
};
const E=.003,ops=spec.ops.filter(o=>!o.ha_id).map((o,i)=>{const a=toG(o.lo),b=toG(o.hi);return {...o,i,min:Vector3.Minimize(a,b).subtractFromFloats(E,E,E),max:Vector3.Maximize(a,b).addInPlaceFromFloats(E,E,E),tris:0};});
const chunks=[bin];let length=bin.length;
function append(data,target){const pad=(4-length%4)%4;if(pad){chunks.push(Buffer.alloc(pad));length+=pad;}const view=d.bufferViews.push({buffer:0,byteOffset:length,byteLength:data.length,target})-1;chunks.push(data);length+=data.length;return view;}
const meshUsers=new Map();d.nodes.forEach(n=>n.mesh!==undefined&&meshUsers.set(n.mesh,(meshUsers.get(n.mesh)??0)+1));
const posUsers=new Map();d.meshes.forEach(m=>m.primitives.forEach(p=>posUsers.set(p.attributes.POSITION,(posUsers.get(p.attributes.POSITION)??0)+1)));
for(const [ni,node] of d.nodes.entries()){
 const x=node.extras??{};
 if(node.mesh===undefined||x.ha_id||x.ha_door||x.ha_room_door||x.ha_appliance)continue;
 const m=world(ni),inv=m.clone().invert();let changed=false;
 const primitives=d.meshes[node.mesh].primitives.map(pr=>{
  const mat=d.materials[pr.material]?.name,cands=ops.filter(o=>o.materials.includes(mat));
  if(!cands.length||pr.indices===undefined||(pr.mode??4)!==4)return pr;
  const pos=accessorBytes(d,bin,pr.attributes.POSITION),idx=accessorBytes(d,bin,pr.indices);
  const read=i=>idx.width===2?idx.data.readUInt16LE(i*2):idx.width===4?idx.data.readUInt32LE(i*4):idx.data[i];
  const W=[];for(let i=0;i<pos.accessor.count;i++)W.push(Vector3.TransformCoordinates(new Vector3(pos.data.readFloatLE(i*12),pos.data.readFloatLE(i*12+4),pos.data.readFloatLE(i*12+8)),m));
  const inside=(v,o)=>v.x>=o.min.x&&v.x<=o.max.x&&v.y>=o.min.y&&v.y<=o.max.y&&v.z>=o.min.z&&v.z<=o.max.z;
  const opOf=new Int32Array(W.length).fill(-1),outside=new Uint8Array(W.length);
  for(let t=0;t<idx.accessor.count;t+=3){
   const k=[read(t),read(t+1),read(t+2)],hit=cands.filter(o=>k.every(i=>inside(W[i],o)));
   if(!hit.length){k.forEach(i=>outside[i]=1);continue;}
   // Overlapping boxes are fine when they apply the same function (same group).
   const f=JSON.stringify([hit[0].op,hit[0].d,hit[0].z,hit[0].c,hit[0].shift]);
   assert(hit.every(o=>JSON.stringify([o.op,o.d,o.z,o.c,o.shift])===f),`${node.name}/${mat}: triangle in conflicting ops ${hit.map(o=>o.name)}`);
   hit.forEach(o=>o.tris++);for(const i of k){assert(opOf[i]===-1||JSON.stringify(ops[opOf[i]].d)===JSON.stringify(hit[0].d)&&ops[opOf[i]].op===hit[0].op,'vertex in two ops');opOf[i]=hit[0].i;}
  }
  let moved=0;
  const out=Buffer.from(pos.data.subarray(0,pos.accessor.count*12)),mn=[Infinity,Infinity,Infinity],mx=[-Infinity,-Infinity,-Infinity];
  for(let i=0;i<W.length;i++){
   let v=W[i];
   if(opOf[i]>=0){
    const o=ops.find(q=>q.i===opOf[i]),b=fn[o.op](o,toB(v));
    const nv=toG(b);
    if(nv.subtract(v).length()>1e-7){assert(!outside[i],`${o.name}: moved vertex shared with outside triangle in ${node.name}`);moved++;}
    v=Vector3.TransformCoordinates(nv,inv);out.writeFloatLE(v.x,i*12);out.writeFloatLE(v.y,i*12+4);out.writeFloatLE(v.z,i*12+8);
   }
   for(let k=0;k<3;k++){const c=out.readFloatLE(i*12+k*4);mn[k]=Math.min(mn[k],c);mx[k]=Math.max(mx[k],c);}
  }
  if(!moved)return pr;
  assert.equal(posUsers.get(pr.attributes.POSITION),1,`${node.name}: shared POSITION accessor`);
  const {byteStride,...rest}=pos.accessor;changed=true;
  return {...pr,attributes:{...pr.attributes,POSITION:d.accessors.push({...rest,bufferView:append(out,34962),byteOffset:0,min:mn,max:mx})-1}};
 });
 if(!changed)continue;
 if(meshUsers.get(node.mesh)>1)node.mesh=d.meshes.push({...structuredClone(d.meshes[node.mesh]),primitives})-1;else d.meshes[node.mesh].primitives=primitives;
}
for(const o of ops)assert(o.tris>0,`${o.name}: not found in GLB`);
// HA objects: translate their nodes once per ha_id, then the manifest entry (app coords = (-Bx, Bz, -By)).
const scene=d.scenes[d.scene??0],manifest=JSON.parse(scene.extras['3dash_manifest']),haMoves=new Map();
for(const o of spec.ops.filter(o=>o.ha_id)){assert.equal(o.op,'translate');const prev=haMoves.get(o.ha_id);if(prev)assert.deepEqual(prev,o.d);haMoves.set(o.ha_id,o.d);}
for(const [id,dv] of haMoves){
 const nodes=d.nodes.map((n,i)=>[n,i]).filter(([n])=>n.extras?.ha_id===id);assert(nodes.length,id);
 for(const [n,i] of nodes){assert(!parents.has(i));const t=toG(dv);n.matrix=local(i).multiply(Matrix.Translation(t.x,t.y,t.z)).asArray().slice();delete n.translation;delete n.rotation;delete n.scale;}
 const e=manifest.objects.find(o=>o.id===id);assert(e,id);const a={x:-dv[0],y:dv[2],z:-dv[1]};
 for(const p of [e.position,...(e.emitters??[]).map(x=>x.position)]){p.x+=a.x;p.y+=a.y;p.z+=a.z;}
}
manifest.source='Wohnung_v106_3Dash_Schlafzimmer.blend';scene.extras['3dash_manifest']=JSON.stringify(manifest);
d.buffers[0].byteLength=length;
const bytes=optimizeGlb(writeGlb(d,Buffer.concat(chunks))).bytes;
fs.writeFileSync(output,bytes,{flag:'wx'});fs.writeFileSync('.qa/bedroom-v106.glb',bytes);
console.log(JSON.stringify({ops:ops.map(o=>`${o.name}:${o.tris}`),haNodesMoved:[...haMoves.keys()],bytes:bytes.length}));
