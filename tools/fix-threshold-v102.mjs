// v102: remove the old floorplan door frame's horizontal faces at the movable
// balcony door: its sill top lay exactly on the door's threshold (3.0 cm) and its
// sill bottom exactly on the floor (0 cm). Both coplanar pairs z-fought, showing
// flickering streaks and a flickering line at the threshold while moving.
// The movable door (v86) brings its own frame and threshold.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {Matrix,Quaternion,Vector3} from '@babylonjs/core';
import {readGlb,writeGlb,accessorBytes} from './optimize-glb.mjs';
const [input='../blender/Wohnung_v101_3Dash_Optimiert.glb', output='../blender/Wohnung_v102_3Dash_Schwelle.glb']=process.argv.slice(2);
const {json:d,bin}=readGlb(fs.readFileSync(input));
const parents=new Map();d.nodes.forEach((n,i)=>(n.children??[]).forEach(c=>parents.set(c,i)));
const matrices=new Map();
function matrix(i){if(matrices.has(i))return matrices.get(i);const n=d.nodes[i];let m=n.matrix?Matrix.FromArray(n.matrix):Matrix.Compose(Vector3.FromArray(n.scale??[1,1,1]),Quaternion.FromArray(n.rotation??[0,0,0,1]),Vector3.FromArray(n.translation??[0,0,0]));if(parents.has(i))m=m.multiply(matrix(parents.get(i)));matrices.set(i,m);return m;}
const material=name=>d.materials.findIndex(m=>m.name===name);
const primitiveOf=(nodeName,materialName)=>{const ni=d.nodes.findIndex(n=>n.name===nodeName);assert(ni>=0,nodeName);const pi=d.meshes[d.nodes[ni].mesh].primitives.findIndex(p=>p.material===material(materialName));assert(pi>=0,materialName);return {ni,pi,p:d.meshes[d.nodes[ni].mesh].primitives[pi]};};
const readIndex=a=>i=>a.width===2?a.data.readUInt16LE(i*2):a.width===4?a.data.readUInt32LE(i*4):a.data[i];
const worldPositions=(ni,p)=>{const pos=accessorBytes(d,bin,p.attributes.POSITION),m=matrix(ni);return i=>Vector3.TransformCoordinates(new Vector3(pos.data.readFloatLE(i*12),pos.data.readFloatLE(i*12+4),pos.data.readFloatLE(i*12+8)),m);};
// Threshold footprint and top height of the movable balcony door.
const th=primitiveOf('Balkontuer_Links.001','Threshold');
const thIdx=accessorBytes(d,bin,th.p.indices),thRead=readIndex(thIdx),thPos=worldPositions(th.ni,th.p);
const lo=new Vector3(Infinity,Infinity,Infinity),hi=new Vector3(-Infinity,-Infinity,-Infinity);
for(let i=0;i<thIdx.accessor.count;i++){const v=thPos(thRead(i));lo.minimizeInPlace(v);hi.maximizeInPlace(v);}
const top=hi.y;
// Old frame faces lying on that top, inside the footprint.
const fr=primitiveOf('Bestand_Grundriss_Fenster_weitere_Raeume.001','B38_Fenstertuerrahmen_Anthrazit_aufgehellt');
const frIdx=accessorBytes(d,bin,fr.p.indices),frRead=readIndex(frIdx),frPos=worldPositions(fr.ni,fr.p);
const kept=[];let removed=0;
for(let t=0;t<frIdx.accessor.count;t+=3){
 const a=frPos(frRead(t)),b=frPos(frRead(t+1)),c=frPos(frRead(t+2));
 // Sill faces on the threshold top or on the floor; vertical faces stay.
 const flat=[a,b,c].every(v=>Math.abs(v.y-top)<5e-4)||[a,b,c].every(v=>Math.abs(v.y-lo.y)<5e-4);
 const cx=(a.x+b.x+c.x)/3,cz=(a.z+b.z+c.z)/3;
 const inside=cx>=lo.x-1e-3&&cx<=hi.x+1e-3&&cz>=lo.z-1e-3&&cz<=hi.z+1e-3;
 if(flat&&inside){removed++;continue;}
 kept.push(frIdx.data.subarray(t*frIdx.width,(t+3)*frIdx.width));
}
assert(removed>0&&removed<=32,'unexpected triangle count '+removed);
const data=Buffer.concat(kept),chunks=[bin];let length=bin.length;
d.bufferViews.push({buffer:0,byteOffset:length,byteLength:data.length,target:34963});chunks.push(data);length+=data.length;const pad=(4-length%4)%4;if(pad){chunks.push(Buffer.alloc(pad));length+=pad;}
fr.p.indices=d.accessors.push({bufferView:d.bufferViews.length-1,componentType:frIdx.accessor.componentType,type:'SCALAR',count:data.length/frIdx.width})-1;
// The floorplan's base ground plane lies exactly on the room floors (0 cm) across the
// whole apartment; lower it by 3 mm so the floors always win the depth test.
const GROUND_DROP=0.003;
const ground=primitiveOf('Bestand_Grundriss_Fenster_weitere_Raeume.001','ground_1');
{
 const pos=accessorBytes(d,bin,ground.p.attributes.POSITION);
 const inverse=matrix(ground.ni).clone().invert();
 const local=Vector3.TransformNormal(new Vector3(0,-GROUND_DROP,0),inverse);
 const out=Buffer.from(pos.data);const mn=[Infinity,Infinity,Infinity],mx=[-Infinity,-Infinity,-Infinity];
 for(let v=0;v<pos.accessor.count;v++)for(let k=0;k<3;k++){const x=out.readFloatLE(v*12+k*4)+local.asArray()[k];out.writeFloatLE(x,v*12+k*4);mn[k]=Math.min(mn[k],x);mx[k]=Math.max(mx[k],x);}
 d.bufferViews.push({buffer:0,byteOffset:length,byteLength:out.length,target:34962});chunks.push(out);length+=out.length;const pad2=(4-length%4)%4;if(pad2){chunks.push(Buffer.alloc(pad2));length+=pad2;}
 ground.p.attributes.POSITION=d.accessors.push({...pos.accessor,bufferView:d.bufferViews.length-1,byteOffset:0,min:mn,max:mx})-1;
}
d.buffers[0].byteLength=length;
const {optimizeGlb}=await import('./optimize-glb.mjs');
const bytes=optimizeGlb(writeGlb(d,Buffer.concat(chunks))).bytes;
fs.writeFileSync(output,bytes,{flag:'wx'});
console.log({removedTriangles:removed,groundLoweredMm:GROUND_DROP*1000,thresholdTop:+top.toFixed(4),footprint:[lo.asArray().map(v=>+v.toFixed(3)),hi.asArray().map(v=>+v.toFixed(3))],bytes:bytes.length});
