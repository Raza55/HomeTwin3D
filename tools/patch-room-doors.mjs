import fs from 'node:fs';
import assert from 'node:assert/strict';
import { Matrix, Quaternion, Vector3 } from '@babylonjs/core';
import { readGlb, writeGlb, accessorBytes } from './optimize-glb.mjs';

const source = process.argv[2] ?? '../blender/Wohnung_v90_3Dash_Verlustfrei.glb';
const output = process.argv[3] ?? '../blender/Wohnung_v91_3Dash_Zimmertueren.glb';
const { json: doc, bin } = readGlb(fs.readFileSync(source));
const doors = JSON.parse(fs.readFileSync('.qa/room-door-source.json'));
// v90 contains an earlier, denser robe mesh than the editable Blender source.
// Its dedicated material batch contains only the robes attached to the bath door.
const bath=doors.find(d=>d.id==='Bad');
bath.parts=bath.parts.filter(p=>!p.name.startsWith('BAD_Bademantel') && p.name!=='BAD_Holzbuegel');
bath.parts.push({name:'v90 bath robes',materials:['BAD_Bademantel_Graublau'],vertices:[],triangles:45096});
const grids = new Map();
for (const [di, door] of doors.entries()) for (const part of door.parts) for (const material of part.materials) {
  const grid = grids.get(material) ?? new Map(); grids.set(material, grid);
  for (const v of part.vertices) {
    const key = v.map(x => Math.floor(x * 1000)).join(',');
    const bucket = grid.get(key) ?? []; bucket.push({ v, di }); grid.set(key, bucket);
  }
}
function match(grid, point) {
  const base = point.asArray().map(x => Math.floor(x * 1000));
  for (let x=-1;x<=1;x++) for(let y=-1;y<=1;y++) for(let z=-1;z<=1;z++) {
    for(const p of grid.get([base[0]+x,base[1]+y,base[2]+z].join(',')) ?? [])
      if (Math.hypot(p.v[0]-point.x,p.v[1]-point.y,p.v[2]-point.z)<.0001) return p.di;
  }
  return -1;
}
let length=bin.length; const chunks=[bin];
function compactPrimitive(primitive, selected) {
  const unique=[...new Set(selected)], remap=new Map(unique.map((v,i)=>[v,i])), attributes={};
  for(const [name,index] of Object.entries(primitive.attributes)) {
    const a=accessorBytes(doc,bin,index),data=Buffer.concat(unique.map(i=>a.data.subarray(i*a.width,(i+1)*a.width)));
    const padding=(4-length%4)%4;if(padding){chunks.push(Buffer.alloc(padding));length+=padding;}
    const view=doc.bufferViews.length;doc.bufferViews.push({buffer:0,byteOffset:length,byteLength:data.length,target:34962});
    chunks.push(data);length+=data.length;
    const {min,max,byteOffset,...original}=a.accessor;
    const accessor={...original,bufferView:view,count:unique.length};
    if(name==='POSITION') {
      accessor.min=[Infinity,Infinity,Infinity];accessor.max=[-Infinity,-Infinity,-Infinity];
      for(let i=0;i<unique.length;i++)for(let k=0;k<3;k++){const v=data.readFloatLE(i*12+k*4);accessor.min[k]=Math.min(accessor.min[k],v);accessor.max[k]=Math.max(accessor.max[k],v);}
    }
    attributes[name]=doc.accessors.length;doc.accessors.push(accessor);
  }
  return {...primitive,attributes,indices:indices(selected.map(i=>remap.get(i)))};
}
function indices(values) {
  const padding=(4-length%4)%4;if(padding){chunks.push(Buffer.alloc(padding));length+=padding;}
  const data=Buffer.alloc(values.length*4); values.forEach((v,i)=>data.writeUInt32LE(v,i*4));
  const view=doc.bufferViews.length; doc.bufferViews.push({buffer:0,byteOffset:length,byteLength:data.length,target:34963});
  chunks.push(data); length+=data.length;
  const index=doc.accessors.length; doc.accessors.push({bufferView:view,componentType:5125,count:values.length,type:'SCALAR'}); return index;
}
const counts=doors.map(()=>0), newNodes=[];
for (const node of [...doc.nodes]) {
  if(node.mesh===undefined) continue;
  const matrix=node.matrix ? Matrix.FromArray(node.matrix) : Matrix.Compose(Vector3.FromArray(node.scale??[1,1,1]),Quaternion.FromArray(node.rotation??[0,0,0,1]),Vector3.FromArray(node.translation??[0,0,0]));
  for (const primitive of doc.meshes[node.mesh].primitives) {
    const grid=grids.get(doc.materials[primitive.material]?.name); if(!grid) continue;
    // Only unbatch static objects: existing HA rigs must retain their geometry.
    if(!node.name?.startsWith('Static_')) continue;
    assert.ok(!doc.nodes.some(n=>n.children?.includes(doc.nodes.indexOf(node))), 'expected root-level static batch');
    const p=accessorBytes(doc,bin,primitive.attributes.POSITION), ix=accessorBytes(doc,bin,primitive.indices);
    const groups=Array.from({length:doors.length+1},()=>[]), matches=[];
    for(let i=0;i<p.accessor.count;i++) matches.push(node.name==='Static_0310' && doc.materials[primitive.material].name==='BAD_Bademantel_Graublau' ? doors.indexOf(bath) : match(grid,Vector3.TransformCoordinates(new Vector3(p.data.readFloatLE(i*12),p.data.readFloatLE(i*12+4),p.data.readFloatLE(i*12+8)),matrix)));
    const read=i=>ix.accessor.componentType===5125?ix.data.readUInt32LE(i*4):ix.data.readUInt16LE(i*2);
    for(let i=0;i<ix.accessor.count;i+=3){const triangle=[read(i),read(i+1),read(i+2)], d=matches[triangle[0]];
      groups[d>=0&&triangle.every(v=>matches[v]===d)?d+1:0].push(...triangle);}
    if(groups[0].length===ix.accessor.count)continue;
    assert.equal(groups.reduce((n,g)=>n+g.length,0),ix.accessor.count);
    for(let d=0;d<doors.length;d++) if(groups[d+1].length) {
      const mesh=doc.meshes.length;doc.meshes.push({name:`room-door:${doors[d].id}`,primitives:[compactPrimitive(primitive,groups[d+1])]});
      const {parts,...spec}=doors[d];
      newNodes.push({...node,name:`room-door:${spec.id}:${newNodes.length}`,mesh,extras:{ha_room_door:spec,ha_walkthrough_passable:true}});
      counts[d]+=groups[d+1].length/3;
    }
    if(groups[0].length) primitive.indices=indices(groups[0]);
    else { assert.equal(doc.meshes[node.mesh].primitives.length,1); delete node.mesh; }
  }
}
for(let i=0;i<doors.length;i++) assert.equal(counts[i],doors[i].parts.reduce((n,p)=>n+p.triangles,0),`all door parts extracted: ${doors[i].id}`);
for(const n of newNodes){doc.scenes[doc.scene??0].nodes.push(doc.nodes.length);doc.nodes.push(n);}
doc.buffers[0].byteLength=length;
fs.writeFileSync(output,writeGlb(doc,Buffer.concat(chunks)));
console.log({output,doors:doors.map((d,i)=>({id:d.id,triangles:counts[i]})),parts:newNodes.length});
