// v107 hallway cabinet: applies the ops of entrance-cabinet-v107.py (.qa/entrance-cabinet-v107.json) to the optimized v106 GLB.
// Static geometry: a triangle belongs to an op when its material is one of the object's materials and all three
// vertices lie inside the object's old bounds (+3 mm). When several boxes match, the smallest box wins (tower
// window on the hall wall, side panel inside the crown); a vertex shared by triangles of different ops must end
// up at the same place, and a moved vertex must not belong to a triangle outside every box.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {Matrix,Quaternion,Vector3} from '@babylonjs/core';
import {readGlb,writeGlb,accessorBytes,optimizeGlb} from './optimize-glb.mjs';
const [input='../blender/Wohnung_v106_3Dash_Schlafzimmer.glb',output='../blender/Wohnung_v107_3Dash_Flurschrank.glb']=process.argv.slice(2);
const spec=JSON.parse(fs.readFileSync('.qa/entrance-cabinet-v107.json','utf8'));
const {json:d,bin}=readGlb(fs.readFileSync(input));
const parents=new Map();d.nodes.forEach((n,i)=>(n.children??[]).forEach(c=>parents.set(c,i)));
const local=i=>{const n=d.nodes[i];return n.matrix?Matrix.FromArray(n.matrix):Matrix.Compose(Vector3.FromArray(n.scale??[1,1,1]),Quaternion.FromArray(n.rotation??[0,0,0,1]),Vector3.FromArray(n.translation??[0,0,0]));};
const world=i=>parents.has(i)?local(i).multiply(world(parents.get(i))):local(i);
const toG=([x,y,z])=>new Vector3(x,z,-y),toB=v=>[v.x,-v.z,v.y];
// Op functions in Blender coordinates; same maths as the Blender script.
const [ax,ay]=spec.axis,S=b=>b[0]*ax+b[1]*ay,along=(b,s1)=>[b[0]+ax*(s1-S(b)),b[1]+ay*(s1-S(b)),b[2]];
const m=s=>s+spec.shift+spec.intervals.reduce((t,[a,b])=>t+spec.half*Math.min(Math.max((b-s)/(b-a),0),1),0);
const castle=s=>spec.castle.mc0+(s-spec.castle.c0)*spec.castle.k;
const fn={
 translate:(o,b)=>b.map((v,k)=>v+o.d[k]),
 map_axis:(o,b)=>along(b,m(S(b))),
 scale_axis:(o,b)=>along(b,castle(S(b))),
};
const E=.003,ops=spec.ops.map((o,i)=>{const a=toG(o.lo),b=toG(o.hi);const min=Vector3.Minimize(a,b).subtractFromFloats(E,E,E),max=Vector3.Maximize(a,b).addInPlaceFromFloats(E,E,E);const s=max.subtract(min);return {...o,i,min,max,volume:s.x*s.y*s.z,tris:0};});
const chunks=[bin];let length=bin.length;
function append(data,target){const pad=(4-length%4)%4;if(pad){chunks.push(Buffer.alloc(pad));length+=pad;}const view=d.bufferViews.push({buffer:0,byteOffset:length,byteLength:data.length,target})-1;chunks.push(data);length+=data.length;return view;}
const meshUsers=new Map();d.nodes.forEach(n=>n.mesh!==undefined&&meshUsers.set(n.mesh,(meshUsers.get(n.mesh)??0)+1));
const posUsers=new Map();d.meshes.forEach(m=>m.primitives.forEach(p=>posUsers.set(p.attributes.POSITION,(posUsers.get(p.attributes.POSITION)??0)+1)));
let movedTotal=0;
for(const [ni,node] of d.nodes.entries()){
 const x=node.extras??{};
 if(node.mesh===undefined||x.ha_id||x.ha_door||x.ha_room_door||x.ha_appliance)continue;
 const mw=world(ni),inv=mw.clone().invert();let changed=false;
 const primitives=d.meshes[node.mesh].primitives.map(pr=>{
  const mat=d.materials[pr.material]?.name,cands=ops.filter(o=>o.materials.includes(mat));
  if(!cands.length||pr.indices===undefined||(pr.mode??4)!==4)return pr;
  const pos=accessorBytes(d,bin,pr.attributes.POSITION),idx=accessorBytes(d,bin,pr.indices);
  const read=i=>idx.width===2?idx.data.readUInt16LE(i*2):idx.width===4?idx.data.readUInt32LE(i*4):idx.data[i];
  const W=[];for(let i=0;i<pos.accessor.count;i++)W.push(Vector3.TransformCoordinates(new Vector3(pos.data.readFloatLE(i*12),pos.data.readFloatLE(i*12+4),pos.data.readFloatLE(i*12+8)),mw));
  const inside=(v,o)=>v.x>=o.min.x&&v.x<=o.max.x&&v.y>=o.min.y&&v.y<=o.max.y&&v.z>=o.min.z&&v.z<=o.max.z;
  const target=new Array(W.length),outside=new Uint8Array(W.length);
  for(let t=0;t<idx.accessor.count;t+=3){
   const k=[read(t),read(t+1),read(t+2)],hit=cands.filter(o=>k.every(i=>inside(W[i],o)));
   if(!hit.length){k.forEach(i=>outside[i]=1);continue;}
   const o=hit.reduce((a,b)=>b.volume<a.volume?b:a);o.tris++;
   for(const i of k){
    const nv=toG(fn[o.op](o,toB(W[i])));
    if(target[i])assert(target[i].subtract(nv).length()<2e-5,`${node.name}/${mat}: vertex moved differently by ${o.name}`);
    target[i]=nv;
   }
  }
  let moved=0;
  const out=Buffer.from(pos.data.subarray(0,pos.accessor.count*12)),mn=[Infinity,Infinity,Infinity],mx=[-Infinity,-Infinity,-Infinity];
  for(let i=0;i<W.length;i++){
   if(target[i]&&target[i].subtract(W[i]).length()>1e-7){
    assert(!outside[i],`moved vertex shared with outside triangle in ${node.name}/${mat}`);moved++;
    const v=Vector3.TransformCoordinates(target[i],inv);out.writeFloatLE(v.x,i*12);out.writeFloatLE(v.y,i*12+4);out.writeFloatLE(v.z,i*12+8);
   }
   for(let k=0;k<3;k++){const c=out.readFloatLE(i*12+k*4);mn[k]=Math.min(mn[k],c);mx[k]=Math.max(mx[k],c);}
  }
  if(!moved)return pr;
  movedTotal+=moved;
  assert.equal(posUsers.get(pr.attributes.POSITION),1,`${node.name}: shared POSITION accessor`);
  const {byteStride,...rest}=pos.accessor;changed=true;
  return {...pr,attributes:{...pr.attributes,POSITION:d.accessors.push({...rest,bufferView:append(out,34962),byteOffset:0,min:mn,max:mx})-1}};
 });
 if(!changed)continue;
 if(meshUsers.get(node.mesh)>1)node.mesh=d.meshes.push({...structuredClone(d.meshes[node.mesh]),primitives})-1;else d.meshes[node.mesh].primitives=primitives;
}
for(const o of ops)assert(o.tris>0,`${o.name}: not found in GLB`);
// Entrance door: the swing limit follows the free angle computed in Blender.
const doors=d.nodes.filter(n=>n.extras?.ha_door&&n.extras.ha_door.hinge.every((v,k)=>Math.abs(v-spec.doorGeometry.hinge[k])<1e-6));
assert.equal(doors.length,1);doors[0].extras.ha_door.swingDegrees=spec.swingDegrees;
const scene=d.scenes[d.scene??0],manifest=JSON.parse(scene.extras['3dash_manifest']);
manifest.source='Wohnung_v107_3Dash_Flurschrank.blend';scene.extras['3dash_manifest']=JSON.stringify(manifest);
d.buffers[0].byteLength=length;
const bytes=optimizeGlb(writeGlb(d,Buffer.concat(chunks))).bytes;
fs.writeFileSync(output,bytes,{flag:'wx'});fs.writeFileSync('.qa/entrance-cabinet-v107.glb',bytes);
console.log(JSON.stringify({ops:ops.length,tris:ops.reduce((a,o)=>a+o.tris,0),movedVertices:movedTotal,swingDegrees:spec.swingDegrees,bytes:bytes.length,
 few:ops.filter(o=>o.tris<4).map(o=>`${o.name}:${o.tris}`)}));
