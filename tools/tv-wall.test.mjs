import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readFloorplanManifest, mergeFloorplan } from '../src/services/floorplanImport.ts';
const original=await readFloorplanManifest(new Blob([readFileSync('../blender/Wohnung_v75_3Dash_final.glb')]));
const next=await readFloorplanManifest(new Blob([readFileSync('../blender/Wohnung_v76_3Dash_TV.glb')]));
const oldIds=new Set(original.objects.map(o=>o.id));
const added=next.objects.filter(o=>!oldIds.has(o.id));
test('v76 preserves every previous object ID and adds six independent TV fixtures',()=>{
 assert.equal(next.objects.length,original.objects.length+6);
 assert.ok(original.objects.every(o=>next.objects.some(n=>n.id===o.id)));
 assert.equal(new Set(added.map(o=>o.id)).size,6);
 assert.ok(added.every(o=>o.domain==='light' && o.entityId==='' && o.lightType==='rgbw'));
});
test('Play bars sit on cabinet tops; strips sample the TV, both speakers and board',()=>{
 const bars=added.filter(o=>o.label.startsWith('Hue Play oben'));
 assert.equal(bars.length,2);assert.ok(bars.every(o=>o.position.y>2.07 && o.position.y<2.2));
 assert.ok(bars.every(o=>o.emitters.every(e=>e.direction.y>.7 && e.direction.z<-.7)));
 const strips=added.filter(o=>o.label.includes('Lightstrip'));
 assert.equal(strips.length,4);assert.ok(strips.every(o=>o.emitters.length>=4 && o.emitters.every(e=>e.direction.z===-1)));
 assert.ok(strips.every(o=>o.emitters.every(e=>e.angle===170)));
 assert.ok(strips.find(o=>o.label.includes('Rückseite')).emitters.length>=8);
 const speakers=strips.filter(o=>o.label.includes('Lautsprecher'));assert.equal(speakers.length,2);assert.ok(speakers.every(o=>o.size.height>.9));
 assert.ok(strips.find(o=>o.label.includes('Lowboard')).size.width>=1.99);
 for(const o of added){const expected=o.label.includes('Rückseite')?1400:o.label.includes('Lowboard')?1000:500;assert.ok(Math.abs(o.emitters.reduce((s,e)=>s+e.lumens,0)-expected)<.001);}
});
test('v76 reimport retains edited and explicitly cleared HA relationships',()=>{
 const edited=structuredClone(original);edited.objects[0].entityId='';
 const firstLight=edited.objects.find(o=>o.domain==='light' && o.id!==edited.objects[0].id);firstLight.entityId='light.user_assignment';
 const config=mergeFloorplan({location:{latitude:0,longitude:0},lights:[]},edited);
 const reimported=mergeFloorplan(config,next);
 assert.equal(reimported.model.floorplan.objects.find(o=>o.id===firstLight.id).entityId,'light.user_assignment');
 assert.equal(reimported.model.floorplan.objects.find(o=>o.id===edited.objects[0].id).entityId,'');
 assert.ok(added.every(o=>reimported.model.floorplan.objects.find(n=>n.id===o.id).entityId===''));
});
