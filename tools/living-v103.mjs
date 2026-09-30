// v103: applies the Blender edits of living-v103.py to the optimized v102 GLB, so the
// v101 simplification and v102 threshold fix stay intact. Batched furniture (Couchtisch,
// POAENG, Sitzsack) is moved per vertex: only triangles entirely inside the old object
// bounds are moved, and no moved vertex may be shared with a triangle outside them.
// Lamp nodes are separate and receive the same world matrix change as in Blender.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {Matrix,Quaternion,Vector3} from '@babylonjs/core';
import {readGlb,writeGlb,accessorBytes,optimizeGlb} from './optimize-glb.mjs';
const [input='../blender/Wohnung_v102_3Dash_Schwelle.glb',output='../blender/Wohnung_v103_3Dash_Wohnzimmer.glb']=process.argv.slice(2);
const spec=JSON.parse(fs.readFileSync('.qa/living-v103.json','utf8'));
const {json:d,bin}=readGlb(fs.readFileSync(input));
const parents=new Map();d.nodes.forEach((n,i)=>(n.children??[]).forEach(c=>parents.set(c,i)));
const local=i=>{const n=d.nodes[i];return n.matrix?Matrix.FromArray(n.matrix):Matrix.Compose(Vector3.FromArray(n.scale??[1,1,1]),Quaternion.FromArray(n.rotation??[0,0,0,1]),Vector3.FromArray(n.translation??[0,0,0]));};
const world=i=>parents.has(i)?local(i).multiply(world(parents.get(i))):local(i);
// Blender Z-up -> glTF Y-up.
const g=([x,y,z])=>new Vector3(x,z,-y);
const chunks=[bin];let length=bin.length;
function append(data,target){const view=d.bufferViews.push({buffer:0,byteOffset:length,byteLength:data.length,target})-1;chunks.push(data);length+=data.length;const pad=(4-length%4)%4;if(pad){chunks.push(Buffer.alloc(pad));length+=pad;}return view;}
const meshUsers=new Map();d.nodes.forEach(n=>n.mesh!==undefined&&meshUsers.set(n.mesh,(meshUsers.get(n.mesh)??0)+1));
const positionUsers=new Map();d.meshes.forEach(m=>m.primitives.forEach(p=>positionUsers.set(p.attributes.POSITION,(positionUsers.get(p.attributes.POSITION)??0)+1)));
const lampNode=n=>n.name.startsWith('WZ_Bambus_Stehlampe_');
const report=[];
for(const group of spec.groups){
 const cur=Buffer.concat(chunks);
 const a=g(group.lo),b=g(group.hi),EPS=.002;
 const lo=Vector3.Minimize(a,b).subtractFromFloats(EPS,EPS,EPS),hi=Vector3.Maximize(a,b).addInPlaceFromFloats(EPS,EPS,EPS);
 const delta=g(group.delta);let moved=0,nodes=[];
 for(let ni=0;ni<d.nodes.length;ni++){
  const n=d.nodes[ni];if(n.mesh===undefined||n.extras?.ha_id||lampNode(n))continue;
  const m=world(ni),inv=m.clone().invert();
  const localDelta=Vector3.TransformNormal(delta,inv);
  let mesh=d.meshes[n.mesh],changed=false;
  const primitives=mesh.primitives.map(p=>{
   if(p.indices===undefined||(p.mode??4)!==4)return p;
   const pos=accessorBytes(d,cur,p.attributes.POSITION),idx=accessorBytes(d,cur,p.indices);
   const read=i=>idx.width===2?idx.data.readUInt16LE(i*2):idx.width===4?idx.data.readUInt32LE(i*4):idx.data[i];
   const v=i=>Vector3.TransformCoordinates(new Vector3(pos.data.readFloatLE(i*12),pos.data.readFloatLE(i*12+4),pos.data.readFloatLE(i*12+8)),m);
   // Quick reject by transformed accessor box.
   const c=[];for(const x of [pos.accessor.min[0],pos.accessor.max[0]])for(const y of [pos.accessor.min[1],pos.accessor.max[1]])for(const z of [pos.accessor.min[2],pos.accessor.max[2]])c.push(Vector3.TransformCoordinates(new Vector3(x,y,z),m));
   const cl=c.reduce((s,p)=>Vector3.Minimize(s,p)),ch=c.reduce((s,p)=>Vector3.Maximize(s,p));
   if(ch.x<lo.x||cl.x>hi.x||ch.y<lo.y||cl.y>hi.y||ch.z<lo.z||cl.z>hi.z)return p;
   const inside=new Uint8Array(pos.accessor.count);
   for(let i=0;i<inside.length;i++){const q=v(i);inside[i]=q.x>=lo.x&&q.x<=hi.x&&q.y>=lo.y&&q.y<=hi.y&&q.z>=lo.z&&q.z<=hi.z?1:0;}
   const move=new Uint8Array(inside.length),outsideUse=new Uint8Array(inside.length);
   for(let t=0;t<idx.accessor.count;t+=3){const k=[read(t),read(t+1),read(t+2)];if(k.every(i=>inside[i]))k.forEach(i=>move[i]=1);else k.forEach(i=>outsideUse[i]=1);}
   let count=0;for(let i=0;i<move.length;i++)if(move[i]){assert(!outsideUse[i],`${group.prefix}: shared vertex in ${n.name}`);count++;}
   if(!count)return p;
   assert.equal(positionUsers.get(p.attributes.POSITION),1,`${n.name}: POSITION accessor shared`);
   const out=Buffer.from(pos.data.subarray(0,pos.accessor.count*12));const mn=[Infinity,Infinity,Infinity],mx=[-Infinity,-Infinity,-Infinity];
   for(let i=0;i<pos.accessor.count;i++)for(let k=0;k<3;k++){let x=out.readFloatLE(i*12+k*4);if(move[i]){x+=localDelta.asArray()[k];out.writeFloatLE(x,i*12+k*4);x=out.readFloatLE(i*12+k*4);}mn[k]=Math.min(mn[k],x);mx[k]=Math.max(mx[k],x);}
   const {byteStride,...rest}={...pos.accessor};
   const accessor=d.accessors.push({...rest,bufferView:append(out,34962),byteOffset:0,min:mn,max:mx})-1;
   positionUsers.set(p.attributes.POSITION,0);positionUsers.set(accessor,1);moved+=count;changed=true;return {...p,attributes:{...p.attributes,POSITION:accessor}};
  });
  if(!changed)continue;
  if(meshUsers.get(n.mesh)>1){n.mesh=d.meshes.push({...structuredClone(mesh),primitives})-1;}else mesh.primitives=primitives;
  nodes.push(n.name);
 }
 assert(moved>0,group.prefix+': nothing moved');
 report.push({group:group.prefix,vertices:moved,nodes});
}
// Lamp: same matrices as in Blender, expressed in glTF space.
const {z0,scale}=spec.lamp;
const squash=Matrix.Translation(0,-z0,0).multiply(Matrix.Scaling(1,scale,1)).multiply(Matrix.Translation(0,z0,0));
let lampNodes=0;
for(let ni=0;ni<d.nodes.length;ni++){
 const n=d.nodes[ni];if(!lampNode(n))continue;assert(!parents.has(ni)&&!n.children?.length,n.name);
 lampNodes++;if(n.name.includes('_Fuss'))continue;
 const m=local(ni);let D=squash;
 if(n.name.includes('_Bambusring')||n.name.includes('_Bindung')){
  let ylo=Infinity,yhi=-Infinity;
  for(const p of d.meshes[n.mesh].primitives){const a=d.accessors[p.attributes.POSITION];for(const x of [a.min[0],a.max[0]])for(const y of [a.min[1],a.max[1]])for(const z of [a.min[2],a.max[2]]){const q=Vector3.TransformCoordinates(new Vector3(x,y,z),m);ylo=Math.min(ylo,q.y);yhi=Math.max(yhi,q.y);}}
  const yc=(ylo+yhi)/2;D=Matrix.Translation(0,z0+scale*(yc-z0)-yc,0);
 }
 n.matrix=m.multiply(D).asArray().slice();delete n.translation;delete n.rotation;delete n.scale;
}
assert.equal(lampNodes,spec.lamp.objects,'lamp node count');
// Manifest: lamp bounds and emitter height follow the same vertical mapping.
const scene=d.scenes[d.scene??0],manifest=JSON.parse(scene.extras['3dash_manifest']);
const lamp=manifest.objects.find(o=>o.label==='Bambus-Stehlampe am Essplatz');assert(lamp);
const mapY=y=>z0+scale*(y-z0);
lamp.position.y=mapY(lamp.position.y);lamp.size.height*=scale;for(const e of lamp.emitters??[])e.position.y=mapY(e.position.y);
manifest.source='Wohnung_v103_3Dash_Wohnzimmer.blend';scene.extras['3dash_manifest']=JSON.stringify(manifest);
d.buffers[0].byteLength=length;
const bytes=optimizeGlb(writeGlb(d,Buffer.concat(chunks))).bytes;
fs.writeFileSync(output,bytes,{flag:'wx'});fs.writeFileSync('.qa/living-v103.glb',bytes);
console.log(JSON.stringify({report,lampNodes,lampHeight:+lamp.size.height.toFixed(3),lampCenter:+lamp.position.y.toFixed(3),bytes:bytes.length},null,1));
