import fs from 'node:fs';
import assert from 'node:assert/strict';
import {Matrix,Quaternion,Vector3} from '@babylonjs/core';
import {readGlb,writeGlb,accessorBytes} from './optimize-glb.mjs';
const {json:d,bin}=readGlb(fs.readFileSync('../blender/Wohnung_v99_3Dash_PC_RGB.glb'));
const parents=new Map();d.nodes.forEach((n,i)=>(n.children??[]).forEach(c=>parents.set(c,i)));
const matrices=new Map();
function matrix(i){if(matrices.has(i))return matrices.get(i);const n=d.nodes[i];let m=n.matrix?Matrix.FromArray(n.matrix):Matrix.Compose(Vector3.FromArray(n.scale??[1,1,1]),Quaternion.FromArray(n.rotation??[0,0,0,1]),Vector3.FromArray(n.translation??[0,0,0]));if(parents.has(i))m=m.multiply(matrix(parents.get(i)));matrices.set(i,m);return m;}
const chunks=[bin];let length=bin.length,removed=0;const changes=[];
function inside(p){return p.x>=9.3998&&p.x<=9.4362&&p.y>=-.6352&&p.y<=.6352&&p.z>=5.4513&&p.z<=5.4655;}
for(let ni=0;ni<d.nodes.length;ni++){
 const n=d.nodes[ni];if(n.mesh===undefined)continue;
 const mesh=structuredClone(d.meshes[n.mesh]);let count=0;
 mesh.primitives=mesh.primitives.flatMap(p=>{
  if(p.indices===undefined||(p.mode??4)!==4)return [p];
  const pos=accessorBytes(d,bin,p.attributes.POSITION),indices=accessorBytes(d,bin,p.indices),m=matrix(ni);
  const corners=[];for(const x of [pos.accessor.min[0],pos.accessor.max[0]])for(const y of [pos.accessor.min[1],pos.accessor.max[1]])for(const z of [pos.accessor.min[2],pos.accessor.max[2]])corners.push(Vector3.TransformCoordinates(new Vector3(x,y,z),m));
  if(Math.max(...corners.map(p=>p.x))<9.3998||Math.min(...corners.map(p=>p.x))>9.4362||Math.max(...corners.map(p=>p.z))<5.4513||Math.min(...corners.map(p=>p.z))>5.4655)return[p];
  const flags=new Uint8Array(pos.accessor.count);for(let v=0;v<flags.length;v++)flags[v]=inside(Vector3.TransformCoordinates(new Vector3(pos.data.readFloatLE(v*12),pos.data.readFloatLE(v*12+4),pos.data.readFloatLE(v*12+8)),m));
  const read=i=>indices.width===2?indices.data.readUInt16LE(i*2):indices.width===4?indices.data.readUInt32LE(i*4):indices.data[i];
  const kept=[];let dropped=0;for(let i=0;i<indices.accessor.count;i+=3){if(flags[read(i)]&&flags[read(i+1)]&&flags[read(i+2)])dropped++;else kept.push(indices.data.subarray(i*indices.width,(i+3)*indices.width));}
  if(!dropped)return[p];count+=dropped;if(!kept.length)return[];
  const data=Buffer.concat(kept),view=d.bufferViews.length;d.bufferViews.push({buffer:0,byteOffset:length,byteLength:data.length,target:34963});chunks.push(data);length+=data.length;const padding=(4-length%4)%4;if(padding){chunks.push(Buffer.alloc(padding));length+=padding;}
  const accessor=d.accessors.length;d.accessors.push({bufferView:view,componentType:indices.accessor.componentType,type:'SCALAR',count:data.length/indices.width});return[{...p,indices:accessor}];
 });
 if(count){changes.push({node:n.name,triangles:count});removed+=count;if(mesh.primitives.length){n.mesh=d.meshes.length;d.meshes.push(mesh);}else delete n.mesh;}
}
assert(removed>0&&removed<10000);d.buffers[0].byteLength=length;
const manifest=JSON.parse(d.scenes[d.scene??0].extras['3dash_manifest']);manifest.source='Wohnung_v100_3Dash_Ohne_Stab.blend';d.scenes[d.scene??0].extras['3dash_manifest']=JSON.stringify(manifest);
const bytes=writeGlb(d,Buffer.concat(chunks));fs.writeFileSync('../blender/Wohnung_v100_3Dash_Ohne_Stab.glb',bytes);fs.writeFileSync('.qa/rod-v100.glb',bytes);
console.log({removed,changes,objects:manifest.objects.length});
