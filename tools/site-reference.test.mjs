import {test} from 'node:test';
import assert from 'node:assert/strict';
import {referenceBuildings,referenceTransform,triangulateFootprint} from '../src/babylon/SiteReference.ts';
const area=p=>Math.abs(p.reduce((s,a,i)=>{const b=p[(i+1)%p.length];return s+a[0]*b[1]-a[1]*b[0];},0)/2);
test('concave roof triangles cover exactly the footprint, in both winding directions',()=>{
 for(const block of referenceBuildings)for(const points of [block.points,[...block.points].reverse()]){
  const indices=triangulateFootprint(points);assert.equal(indices.length,(points.length-2)*3);
  let sum=0;for(let i=0;i<indices.length;i+=3)sum+=area(indices.slice(i,i+3).map(j=>points[j]));
  assert.ok(Math.abs(sum-area(points))<1e-7,`roof ${block.id}`);
 }
});
test('map transform preserves distances uniformly and the established grove position',()=>{
 const transform=referenceTransform({footprint:[[-8,-40],[-8,10]]},[-30,-10]);
 const g=transform([285,521]);assert.ok(Math.hypot(g[0]+30,g[1]+10)<1e-8);
 const origin=transform([0,0]),x=transform([100,0]),y=transform([0,100]);
 const u=x.map((v,i)=>v-origin[i]),v=y.map((n,i)=>n-origin[i]);
 assert.ok(Math.abs(Math.hypot(...u)-Math.hypot(...v))<1e-8);
 assert.ok(Math.abs(u[0]*v[0]+u[1]*v[1])<1e-8);
});
