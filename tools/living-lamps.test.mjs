import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {readFloorplanManifest,mergeFloorplan} from '../src/services/floorplanImport.ts';
const read=async path=>readFloorplanManifest(new Blob([readFileSync(path)]));
const previous=await read('../blender/Wohnung_v77_3Dash_Schlafzimmer.glb');
const next=await read('../blender/Wohnung_v78_3Dash_Wohnzimmer.glb');
const go=next.objects.find(o=>o.label==='Hue Go neben Sofa');
const play=next.objects.find(o=>o.label==='Hue Play Fenstervitrine oben');
test('replacement fixtures retain all 47 model identifiers',()=>{
 assert.equal(next.objects.length,47);
 assert.deepEqual(next.objects.map(o=>o.id).sort(),previous.objects.map(o=>o.id).sort());
 assert.equal(previous.objects.find(o=>o.id===go.id).label,'Hue Quadratspot 1 Diffusor');
 assert.equal(previous.objects.find(o=>o.id===play.id).label,'Hue Quadratspot 2 Diffusor');
});
test('Go is floor-mounted clear of sofa and plant; Play sits behind cabinet decoration',()=>{
 assert.ok(go.position.y<.12 && go.position.y>.03);
 assert.ok(Math.abs(go.position.x+10.55)<.01 && Math.abs(go.position.z-6.37)<.01);
 assert.equal(go.emitters[0].kind,'point');
 assert.ok(play.position.y>2.04 && play.position.y<2.1 && play.position.x < -10.98);
 assert.ok(play.size.depth>.23 && play.emitters[0].direction.x<-.7 && play.emitters[0].direction.y>.7);
});
test('replacement import preserves assignments and deliberate empty mapping',()=>{
 const edited=structuredClone(previous);
 edited.objects.find(o=>o.id===go.id).entityId='light.saved_go';
 edited.objects.find(o=>o.id===play.id).entityId='';
 const config=mergeFloorplan({lights:[],location:{latitude:0,longitude:0}},edited);
 const result=mergeFloorplan(config,next);
 for(const o of edited.objects)assert.equal(result.model.floorplan.objects.find(n=>n.id===o.id).entityId,o.entityId);
 const lamp=result.lights.find(o=>o.entityId==='light.saved_go');
 assert.equal(lamp.label,'Hue Go neben Sofa');
 assert.ok(lamp.position.y<.12);
});
