import {test} from 'node:test';
import assert from 'node:assert/strict';
import {coverRoom,coverSupports,sleepingCovers,sleepingCoverAction} from '../src/services/coverControls.ts';
const object=(entityId,room,haAreaId)=>({domain:'cover',entityId,room,haAreaId});
test('sleep/wake follows reported states, ignores unavailable shutters and waits for movement',()=>{
 const state=(state)=>({state,attributes:{supported_features:15}});
 assert.deepEqual(sleepingCoverAction([state('closed'),state('closed'),state('unavailable'),undefined]),{action:'open_cover',moving:false});
 assert.deepEqual(sleepingCoverAction([state('closed'),state('open')]),{action:'close_cover',moving:false});
 for(const moving of ['opening','closing'])assert.equal(sleepingCoverAction([state('closed'),state(moving)]).moving,true);
 assert.deepEqual(sleepingCoverAction([undefined,state('unknown')]),{action:'close_cover',moving:false});
});
test('sleep action spans rooms, deduplicates shutters and never includes the balcony',()=>{
 const config={blinds:[{entityId:'cover.bedroom'},{entityId:'cover.living_room_balcony'}],model:{floorplan:{objects:[object('cover.a','Living'),object('cover.bedroom','Bedroom'),object('cover.living_room_balcony','Living'),object('','Living'),{domain:'light',entityId:'light.a'}]}}};
 assert.deepEqual(sleepingCovers(config,'cover.living_room_balcony'),['cover.bedroom','cover.a']);
 assert.deepEqual(sleepingCovers(config,'cover.unmapped'),[]);
});
test('room actions deduplicate mapped covers and exclude other rooms and empty assignments',()=>{
 const config={model:{floorplan:{objects:[object('cover.a','Wohnzimmer'),object('cover.b','Wohnzimmer'),object('cover.b','Wohnzimmer'),object('','Wohnzimmer'),object('cover.c','Schlafzimmer')]}}};
 assert.deepEqual(coverRoom(config,'cover.a').ids,['cover.a','cover.b']);
 assert.deepEqual(coverRoom(config,'cover.manual').ids,['cover.manual']);
});
test('confirmed HA room conflicts override matching exported room labels',()=>{
 const config={model:{floorplan:{objects:[object('cover.a','Raum','one'),object('cover.b','Raum','two')]}}};
 assert.deepEqual(coverRoom(config,'cover.a').ids,['cover.a']);
});
test('commands require availability and the advertised cover feature',()=>{
 assert.equal(coverSupports({state:'open',attributes:{supported_features:3}},'open_cover'),true);
 assert.equal(coverSupports({state:'open',attributes:{supported_features:3}},'stop_cover'),false);
 assert.equal(coverSupports({state:'unavailable',attributes:{supported_features:15}},'close_cover'),false);
 assert.equal(coverSupports(undefined,'close_cover'),false);
});
test('live HA rooms override legacy generic Blender room labels',()=>{
 const config={model:{floorplan:{objects:[object('cover.a','Wohnbereich'),object('cover.b','Wohnbereich'),object('cover.c','Andere')]}}};
 const inventory=[{entity_id:'cover.a',areaId:'kids',areaName:'Kinderzimmer'},{entity_id:'cover.b',areaId:'living'},{entity_id:'cover.c',areaId:'kids'}];
 assert.deepEqual(coverRoom(config,'cover.a',inventory),{name:'Kinderzimmer',ids:['cover.a','cover.c']});
});
