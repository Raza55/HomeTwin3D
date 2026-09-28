import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { quickLightCluster, lightMappingTargets } from '../src/services/lightClusters.ts';
import { readFloorplanManifest,mergeFloorplan } from '../src/services/floorplanImport.ts';
import { HAConnection } from '../src/services/haWebSocket.ts';
const spot=(i,x=i*.13)=>({entityId:`light.s${i}`,label:`Hue Kuechenspot ${i} Diffusor`,position:{x,y:2.3,z:0}});
test('nearby matching spots group numerically without unrelated or distant lamps',()=>{
 const lights=[spot(4),spot(2),spot(1),spot(3),spot(5,4),{...spot(6),label:'Hue Quadratspot 1 Diffusor'}];
 assert.deepEqual(quickLightCluster(lights,'light.s2').map(l=>l.entityId),['light.s1','light.s2','light.s3','light.s4']);
 assert.equal(quickLightCluster(lights,'light.s5').length,1);
});
test('explicit user group and ordinary single lights remain respected',()=>{
 const lights=[{...spot(1),group:'a'},{...spot(2,10),group:'a'},{...spot(3),label:'Stehlampe'}];
 assert.equal(quickLightCluster(lights,'light.s1').length,2);
 assert.equal(quickLightCluster(lights,'light.s3').length,1);
});
test('removed HA entity becomes unavailable instead of crashing live controls',()=>{
 const oldWindow=globalThis.window, oldSocket=globalThis.WebSocket, received=[];
 let socket;
 globalThis.window={location:{protocol:'http:'}};
 globalThis.WebSocket=class { static OPEN=1; readyState=1; constructor(){socket=this;} close(){} send(){} };
 try {
   const connection=new HAConnection({url:'test.invalid',port:8123,token:'test-only'},{onStateChanged:(id,state)=>received.push({id,state})});
   connection.connect();
   socket.onmessage({data:JSON.stringify({type:'event',event:{event_type:'state_changed',data:{entity_id:'light.removed',new_state:null}}})});
   assert.deepEqual(received,[{id:'light.removed',state:{entity_id:'light.removed',state:'unavailable',attributes:{}}}]);
   connection.dispose();
 } finally {globalThis.window=oldWindow;globalThis.WebSocket=oldSocket;}
});
if(process.env.FLOORPLAN_GLB) test('actual v75 kitchen spots form one control from each of the four fixtures',async()=>{
 const m=await readFloorplanManifest(new Blob([readFileSync(process.env.FLOORPLAN_GLB)]));
 const cfg=mergeFloorplan({lights:[],location:{latitude:0,longitude:0}},m);
 const ids=['light.hue_color_spot_1','light.kuchenspot_2','light.kuchenspot_1','light.kuchenspot_3'];
 for(const id of ids) assert.deepEqual(quickLightCluster(cfg.lights,id).map(l=>l.entityId),ids);
});

test('Ensis upper and lower channels share a fixture control but remain separate entities', () => {
  const lights = [
    {entityId:'light.lower',label:'Hue Pendel Down Diffusor',position:{x:1,y:1.8,z:2}},
    {entityId:'light.upper',label:'Hue Pendel Up Diffusor',position:{x:1,y:1.9,z:2}},
    {entityId:'light.distant',label:'Hue Pendel Up Diffusor',position:{x:8,y:1.9,z:2}},
  ];
  for(const id of ['light.lower','light.upper']) assert.deepEqual(quickLightCluster(lights,id).map(l=>l.entityId),['light.lower','light.upper']);
});

test('editing a partially mapped Ensis includes its unassigned channel only',()=>{
 const down={id:'down',domain:'light',label:'Hue Pendel Down Diffusor',entityId:'light.down',room:'Essbereich',position:{x:1,y:1.8,z:2}};
 const up={...down,id:'up',label:'Hue Pendel Up Diffusor',entityId:'',position:{x:1,y:1.9,z:2}};
 const objects=[down,up,{...up,id:'other-room',room:'Schlafzimmer'},{...up,id:'distant',position:{x:8,y:1.9,z:2}},{...up,id:'other-light',label:'Stehlampe'}];
 assert.deepEqual(lightMappingTargets(objects,[{entityId:'light.down',floorplanIds:['down']}]),['down','up']);
 assert.deepEqual(lightMappingTargets(objects,[{entityId:'light.manual'}]),[]);
});
test('group mapping keeps all imported objects without duplicate IDs',()=>{
 const objects=[{id:'one',domain:'light',entityId:'light.a',label:'Spot 1'},{id:'two',domain:'light',entityId:'light.b',label:'Spot 2'},{id:'three',domain:'light',entityId:'light.a',label:'Spot 3'}];
 assert.deepEqual(lightMappingTargets(objects,[{entityId:'light.a',floorplanIds:['one']},{entityId:'light.b'}]),['one','two','three']);
});
