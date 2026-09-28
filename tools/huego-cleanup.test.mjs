import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {readFloorplanManifest,mergeFloorplan} from '../src/services/floorplanImport.ts';
const read=async path=>readFloorplanManifest(new Blob([readFileSync(path)]));
const previous=await read('../blender/Wohnung_v78_3Dash_Wohnzimmer.glb');
const next=await read('../blender/Wohnung_v79_3Dash_HueGo.glb');
const removed='4b5356c8-c8c5-5839-8d1d-fc87d5ce0bc1',kept='0623c78f-dfda-5e63-8a72-5b0841f5d983';
test('only the obsolete cable-box fixture is removed from the exported manifest',()=>{
 assert.equal(next.objects.length,46);
 assert.deepEqual(next.objects.map(o=>o.id).sort(),previous.objects.filter(o=>o.id!==removed).map(o=>o.id).sort());
 assert.deepEqual(next.objects.find(o=>o.id===kept),previous.objects.find(o=>o.id===kept));
});
test('shared entity survives reimport with only one light source and no stale parts',()=>{
 const edited=structuredClone(previous);
 for(const o of edited.objects)if([kept,removed].includes(o.id))o.entityId='light.hue_tv_back_right';
 const current=mergeFloorplan({lights:[],location:{latitude:0,longitude:0}},edited);
 const result=mergeFloorplan(current,next);
 const light=result.lights.find(l=>l.entityId==='light.hue_tv_back_right');
 assert.deepEqual(light.floorplanIds,[kept]);
 assert.equal(light.emitters.length,1);
 assert.ok(!light.parts||light.parts.length<=1);
 for(const o of edited.objects.filter(o=>o.id!==removed))assert.equal(result.model.floorplan.objects.find(n=>n.id===o.id).entityId,o.entityId);
});
