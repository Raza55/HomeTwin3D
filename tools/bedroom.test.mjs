import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readFloorplanManifest, mergeFloorplan } from '../src/services/floorplanImport.ts';
const previous=await readFloorplanManifest(new Blob([readFileSync('../blender/Wohnung_v76_3Dash_TV.glb')]));
const next=await readFloorplanManifest(new Blob([readFileSync('../blender/Wohnung_v77_3Dash_Schlafzimmer.glb')]));
const added=next.objects.filter(o=>!previous.objects.some(p=>p.id===o.id));
test('bedroom export retains all 45 previous IDs and adds two independent circuits',()=>{
 assert.equal(next.objects.length,47);assert.equal(added.length,2);
 assert.ok(previous.objects.every(o=>next.objects.some(n=>n.id===o.id)));
 assert.ok(added.every(o=>o.domain==='light'&&o.room==='Schlafzimmer'&&o.lightType==='rgbw'&&o.entityId===''));
});
test('headboard and nightstand emitters run along their real rear upper edges',()=>{
 const head=added.find(o=>o.label.includes('Kopfteil')),night=added.find(o=>o.label.includes('Nachttisch'));
 assert.equal(head.emitters.length,6);assert.equal(night.emitters.length,3);
 assert.ok(Math.abs(head.position.x+5.183)<.001 && Math.abs(head.position.y-1.094)<.001);
 assert.ok(head.size.depth>1.77 && head.emitters.every(e=>e.direction.x>.3&&e.direction.y>.9));
 assert.ok(Math.abs(night.position.z-.362)<.001 && Math.abs(night.position.y-1.078)<.001);
 assert.ok(night.size.width>.78 && night.emitters.every(e=>e.direction.z<-.49&&e.direction.y>.8));
 assert.ok(Math.abs(head.emitters.reduce((s,e)=>s+e.lumens,0)-1000)<.001);
 assert.ok(Math.abs(night.emitters.reduce((s,e)=>s+e.lumens,0)-500)<.001);
});
test('reimport preserves user mappings, deliberate unassignment, and calibration',()=>{
 const edited=structuredClone(previous);edited.objects[0].entityId='';
 const light=edited.objects.find(o=>o.domain==='light'&&o.id!==edited.objects[0].id);
 light.entityId='light.user_saved';light.lightCalibration={lumens:650,range:4};
 const current=mergeFloorplan({location:{latitude:0,longitude:0},lights:[]},edited);
 const result=mergeFloorplan(current,next).model.floorplan;
 for(const old of edited.objects)assert.equal(result.objects.find(o=>o.id===old.id).entityId,old.entityId);
 assert.deepEqual(result.objects.find(o=>o.id===light.id).lightCalibration,light.lightCalibration);
 assert.ok(added.every(a=>result.objects.find(o=>o.id===a.id).entityId===''));
});
