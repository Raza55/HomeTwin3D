// v105: moves door-mounted parts that v91 left in the static batches (bath robe lining, hanger,
// jacket sleeves, inner handle, …) into room-door nodes, so they swing with their door.
// Input: .qa/door-attach-v105.json from door-attach-v105.py (object bounds + materials per door).
// A static triangle moves when its material belongs to the object and all three vertices lie inside
// that object's evaluated bounds (+3 mm). Vertex data is copied unchanged.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {Matrix,Quaternion,Vector3} from '@babylonjs/core';
import {readGlb,writeGlb,accessorBytes,optimizeGlb} from './optimize-glb.mjs';
const [input='../blender/Wohnung_v104_3Dash_Skulpturen.glb',output='../blender/Wohnung_v105_3Dash_Tuerteile.glb']=process.argv.slice(2);
// Items that merely stand near a door are not mounted on it.
const parts=JSON.parse(fs.readFileSync('.qa/door-attach-v105.json','utf8')).filter(p=>!/Rucksack/.test(p.name));
const {json:d,bin}=readGlb(fs.readFileSync(input));
const parents=new Map();d.nodes.forEach((n,i)=>(n.children??[]).forEach(c=>parents.set(c,i)));
const local=i=>{const n=d.nodes[i];return n.matrix?Matrix.FromArray(n.matrix):Matrix.Compose(Vector3.FromArray(n.scale??[1,1,1]),Quaternion.FromArray(n.rotation??[0,0,0,1]),Vector3.FromArray(n.translation??[0,0,0]));};
const world=i=>parents.has(i)?local(i).multiply(world(parents.get(i))):local(i);
const g=([x,y,z])=>new Vector3(x,z,-y),E=.003;
const boxes=parts.map(p=>{const a=g(p.lo),b=g(p.hi);return {...p,min:Vector3.Minimize(a,b).subtractFromFloats(E,E,E),max:Vector3.Maximize(a,b).addInPlaceFromFloats(E,E,E),moved:0};});
const specs=new Map();d.nodes.forEach(n=>{const s=n.extras?.ha_room_door;if(s&&!specs.has(s.id))specs.set(s.id,s);});
for(const b of boxes)assert(specs.has(b.door),'unknown door '+b.door);
const chunks=[bin];let length=bin.length;
function append(data,target){const pad=(4-length%4)%4;if(pad){chunks.push(Buffer.alloc(pad));length+=pad;}const view=d.bufferViews.push({buffer:0,byteOffset:length,byteLength:data.length,...(target?{target}:{})})-1;chunks.push(data);length+=data.length;return view;}
function indexAccessor(values){const data=Buffer.alloc(values.length*4);values.forEach((v,i)=>data.writeUInt32LE(v,i*4));return d.accessors.push({bufferView:append(data,34963),componentType:5125,count:values.length,type:'SCALAR'})-1;}
function compact(primitive,selected){
 const unique=[...new Set(selected)],remap=new Map(unique.map((v,i)=>[v,i])),attributes={};
 for(const [name,index] of Object.entries(primitive.attributes)){
  const a=accessorBytes(d,bin,index),data=Buffer.concat(unique.map(i=>a.data.subarray(i*a.width,(i+1)*a.width)));
  const {min,max,byteOffset,...rest}=a.accessor,accessor={...rest,bufferView:append(data,34962),count:unique.length};
  if(name==='POSITION'){accessor.min=[Infinity,Infinity,Infinity];accessor.max=[-Infinity,-Infinity,-Infinity];for(let i=0;i<unique.length;i++)for(let k=0;k<3;k++){const v=data.readFloatLE(i*12+k*4);accessor.min[k]=Math.min(accessor.min[k],v);accessor.max[k]=Math.max(accessor.max[k],v);}}
  attributes[name]=d.accessors.push(accessor)-1;
 }
 return {...primitive,attributes,indices:indexAccessor(selected.map(i=>remap.get(i)))};
}
const newNodes=[];
for(const [ni,node] of [...d.nodes.entries()]){
 const x=node.extras??{};
 if(node.mesh===undefined||x.ha_room_door||x.ha_door||x.ha_id||x.ha_appliance||node.children?.length)continue;
 const mesh=d.meshes[node.mesh],m=world(ni);
 const perDoor=new Map();let changed=false;
 const kept=mesh.primitives.flatMap(pr=>{
  const mat=d.materials[pr.material]?.name,cands=boxes.filter(b=>b.materials.includes(mat));
  if(!cands.length||pr.indices===undefined||(pr.mode??4)!==4)return [pr];
  const pos=accessorBytes(d,bin,pr.attributes.POSITION),idx=accessorBytes(d,bin,pr.indices);
  const read=i=>idx.width===2?idx.data.readUInt16LE(i*2):idx.width===4?idx.data.readUInt32LE(i*4):idx.data[i];
  const V=i=>Vector3.TransformCoordinates(new Vector3(pos.data.readFloatLE(i*12),pos.data.readFloatLE(i*12+4),pos.data.readFloatLE(i*12+8)),m);
  const inside=(v,b)=>v.x>=b.min.x&&v.x<=b.max.x&&v.y>=b.min.y&&v.y<=b.max.y&&v.z>=b.min.z&&v.z<=b.max.z;
  const cache=new Map(),vert=i=>{let v=cache.get(i);if(!v)cache.set(i,v=V(i));return v;};
  const stay=[],moved=new Map();
  for(let t=0;t<idx.accessor.count;t+=3){
   const k=[read(t),read(t+1),read(t+2)],b=cands.find(b=>k.every(i=>inside(vert(i),b)));
   if(b){b.moved++;const list=moved.get(b.door)??[];list.push(...k);moved.set(b.door,list);}else stay.push(...k);
  }
  if(!moved.size)return [pr];changed=true;
  for(const [door,list] of moved){const arr=perDoor.get(door)??[];arr.push(compact(pr,list));perDoor.set(door,arr);}
  return stay.length?[{...pr,indices:indexAccessor(stay)}]:[];
 });
 if(!changed)continue;
 const {mesh:_,name,extras,children,...transform}=node;
 for(const [door,primitives] of perDoor){
  const mi=d.meshes.push({name:`room-door:${door}:attach`,primitives})-1;
  newNodes.push({...transform,name:`room-door:${door}:attach:${newNodes.length}`,mesh:mi,extras:{ha_room_door:specs.get(door),ha_walkthrough_passable:true}});
 }
 // Static batches are never instanced; keep the reduced primitive list in place.
 if(kept.length)mesh.primitives=kept;else delete node.mesh;
}
const byDoor={};for(const b of boxes)byDoor[b.door]=(byDoor[b.door]??0)+b.moved;
// The regression was in these two doors; the jacket door was already complete.
assert(byDoor.Bad>0&&byDoor.Abstellraum>0,'expected loose parts: '+JSON.stringify(byDoor));
const scene=d.scenes[d.scene??0];for(const n of newNodes)scene.nodes.push(d.nodes.push(n)-1);
const manifest=JSON.parse(scene.extras['3dash_manifest']);manifest.source='Wohnung_v105_3Dash_Tuerteile.blend';scene.extras['3dash_manifest']=JSON.stringify(manifest);
d.buffers[0].byteLength=length;
const bytes=optimizeGlb(writeGlb(d,Buffer.concat(chunks))).bytes;
fs.writeFileSync(output,bytes,{flag:'wx'});fs.writeFileSync('.qa/door-attach-v105.glb',bytes);
console.log(JSON.stringify({trianglesByDoor:byDoor,nodes:newNodes.map(n=>n.name),parts:boxes.filter(b=>b.moved).map(b=>`${b.name}:${b.moved}`),bytes:bytes.length},null,1));
