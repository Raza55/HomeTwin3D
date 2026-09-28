import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {findFrontFacade,hostBuildingLayout} from '../src/babylon/SiteLayout.ts';
const read=p=>{const b=fs.readFileSync(p),n=b.readUInt32LE(12);return {j:JSON.parse(b.subarray(20,20+n)),bin:b.subarray(28+n)};};
const a=read('.qa/v82.glb'),b=read('.qa/v83.glb');
const manifest=j=>JSON.parse(j.scenes[0].extras['3dash_manifest']);
test('Blender floor trim preserves all entities and every other mesh primitive',()=>{
 assert.deepEqual(manifest(a.j).objects,manifest(b.j).objects);
 assert.deepEqual(a.j.nodes,b.j.nodes);
 assert.deepEqual(b.bin.subarray(0,a.bin.length),a.bin);
 let changed=0;
 a.j.meshes.forEach((m,i)=>m.primitives.forEach((p,k)=>{
  const next=b.j.meshes[i].primitives[k];
  if(JSON.stringify(p)!==JSON.stringify(next)){changed++;assert.equal(a.j.materials[p.material].name,'ground_1');}
 }));assert.equal(changed,1);
});
test('building front follows outer dining facade, not recessed windows or model bounds',()=>{
 const front=findFrontFacade(manifest(b.j).objects.filter(o=>o.domain==='cover'));
 assert.ok(front.slope>.6&&front.slope<.7);
 const width=11.27,depth=13.34,cx=-5.615,cz=6.67;
 const local={slope:front.slope,intercept:front.intercept+front.slope*cx-cz};
 const host=hostBuildingLayout(width,depth,local);
 for(const p of host.footprint.slice(1,3))assert.ok(Math.abs(p[1]-local.slope*p[0]-local.intercept)<1e-9);
});
