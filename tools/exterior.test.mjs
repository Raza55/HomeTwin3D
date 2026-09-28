import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {readFloorplanManifest,mergeFloorplan} from '../src/services/floorplanImport.ts';
const old=readFileSync('../blender/Wohnung_v80_3Dash_Fenster.glb'),next=readFileSync('../blender/Wohnung_v81_3Dash_Aussenblick.glb');
const doc=b=>JSON.parse(b.subarray(20,20+b.readUInt32LE(12)).toString());
test('legacy window photograph is no longer referenced by any rendered mesh',()=>{
 const a=doc(old),b=doc(next);assert.equal(b.meshes.length,a.meshes.length-1);
 assert.ok(!b.meshes.some(m=>m.primitives.some(p=>b.materials[p.material]?.name==='SZ_aussen')));
 assert.ok(b.meshes.some(m=>m.primitives.some(p=>b.materials[p.material]?.name==='SZ_Neues_Fensterglas')));
 assert.ok(b.nodes.every(n=>n.mesh===undefined||n.mesh<b.meshes.length));
});
test('all 46 object identities and assignments survive the photo removal',async()=>{
 const a=await readFloorplanManifest(new Blob([old])),b=await readFloorplanManifest(new Blob([next]));
 assert.deepEqual(a.objects,b.objects);assert.equal(b.objects.length,46);
 const current=mergeFloorplan({location:{latitude:0,longitude:0},lights:[]},a);
 const result=mergeFloorplan(current,b);assert.deepEqual(result.model.floorplan.objects.map(o=>[o.id,o.entityId]),a.objects.map(o=>[o.id,o.entityId]));
});
