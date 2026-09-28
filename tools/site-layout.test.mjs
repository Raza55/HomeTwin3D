import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mapToModel,hostBuildingLayout,SITE_FACADE_ANGLE} from '../src/babylon/SiteLayout.ts';
test('marked map facade becomes parallel to the apartment window wall',()=>{
 const a=mapToModel(0,0),b=mapToModel(Math.tan(SITE_FACADE_ANGLE)*10,10);
 assert.ok(Math.abs(b[0]-a[0])<1e-9);assert.ok(b[1]>a[1]);
});
test('host building wings attach to apartment bounds without covering the interior',()=>{
 const {footprint,wings,entrance}=hostBuildingLayout(12,14);
 assert.equal(wings.length,3);
 for(const poly of wings){
  const x=poly.reduce((s,p)=>s+p[0],0)/poly.length,z=poly.reduce((s,p)=>s+p[1],0)/poly.length;
  assert.ok(x>=6||z>=7||z<=-7);
  assert.ok(poly.some(([x,z])=>Math.abs(x-6)<1e-9||Math.abs(z-7)<1e-9||Math.abs(z+7)<1e-9));
 }
 assert.ok(footprint.some(([x])=>x===-6));
 assert.ok(footprint[0][1]<-7-14);
 assert.ok(entrance[1]<-7); // Access is above the apartment, outside its facade span.
 assert.ok(Math.abs((Math.max(...footprint.map(p=>p[1]))-Math.min(...footprint.map(p=>p[1])))/14-537/147)<1e-9);
});
