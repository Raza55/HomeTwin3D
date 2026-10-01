import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LIVING_ROOM_TV as route, resolveTVScreen, displayStateDependencies, mediaArtworkUrl, mediaTime } from '../src/services/tvMedia.ts';
const now=Date.parse('2026-09-27T19:00:10Z');
const state=(entity_id,value,attributes={})=>({entity_id,state:value,attributes});
const fixture=()=>({
  [route.television]:state(route.television,'on'),
  [route.receiver]:state(route.receiver,'on',{source:'SHIELD Media'}),
  [route.shield]:state(route.shield,'playing',{media_title:'Example episode',app_name:'Plex',media_duration:120,media_position:30,media_position_updated_at:'2026-09-27T19:00:00Z',entity_picture_local:'/api/media_player_proxy/media_player.streaming_player?token=fixture'}),
});
test('only selected SHIELD source exposes title/artwork and advances playback',()=>{
  const states=fixture(), content=resolveTVScreen(states,route,now);
  assert.equal(content.title,'Example episode');assert.equal(content.position,40);assert.ok(content.artwork);
  for(const source of ['PC','Playststion','PlayStation','TV Audio','']) {
    states[route.receiver].attributes.source=source;
    const next=resolveTVScreen(states,route,now);
    assert.notEqual(next.title,'Example episode');assert.equal(next.artwork,undefined);assert.equal(next.position,undefined);
    assert.equal(next.kind,source==='PC'?'pc':source.startsWith('Play')?'playstation':'other');
  }
});
test('paused, buffering and idle do not continue or retain stale progress/artwork',()=>{
  const states=fixture();
  for(const value of ['paused','buffering']) {states[route.shield].state=value;assert.equal(resolveTVScreen(states,route,now).position,30);}
  states[route.shield].state='idle';const idle=resolveTVScreen(states,route,now);
  assert.equal(idle.title,'SHIELD');assert.equal(idle.artwork,undefined);assert.equal(idle.position,undefined);
});
test('off, unknown and unavailable sources never reveal stale media',()=>{
  for(const id of [route.television,route.receiver]) {
    for(const value of ['off','unavailable','unknown']) {
      const states=fixture();states[id].state=value;const content=resolveTVScreen(states,route,now);
      assert.equal(content.kind,value==='off'?'off':'unavailable');assert.equal(content.artwork,undefined);
    }
  }
  assert.equal(resolveTVScreen({},route,now).kind,'unavailable');
});
test('progress clamps at duration, handles future/missing timestamps and invalid numbers',()=>{
  const states=fixture(), a=states[route.shield].attributes;
  assert.equal(resolveTVScreen(states,route,now+1e6).position,120);
  assert.equal(resolveTVScreen(states,route,now-1e6).position,30);
  a.media_position_updated_at='invalid';assert.equal(resolveTVScreen(states,route,now).ticking,false);
  a.media_position=NaN;assert.equal(resolveTVScreen(states,route,now).position,undefined);
  assert.equal(mediaTime(3723),'1:02:03');
});
test('TV subscribes to receiver, SHIELD and television; unrelated TVs retain own sources',()=>{
  const cfg={kind:'tv',sources:[{entityId:route.television}]};
  assert.deepEqual(new Set(displayStateDependencies(cfg)),new Set(Object.values(route)));
  assert.deepEqual(displayStateDependencies({kind:'tv',sources:[{entityId:'media_player.bedroom'}]}),['media_player.bedroom']);
});
test('artwork resolves only the HA media proxy, never Plex paths or another host',()=>{
  const base='http://ha.local:8123/api/websocket';
  assert.equal(mediaArtworkUrl('/api/media_player_proxy/media_player.streaming_player?token=test',base),'http://ha.local:8123/api/media_player_proxy/media_player.streaming_player?token=test');
  for(const value of ['/library/metadata/123/thumb','//other.invalid/api/media_player_proxy/x','javascript:alert(1)','data:image/png,abc'])assert.equal(mediaArtworkUrl(value,base),undefined);
});
test('Android TV Remote supplies the current app without reviving idle Cast metadata',()=>{
  const states=fixture();
  states[route.shield].state='idle';
  states[route.remote]=state(route.remote,'on',{app_id:'com.netflix.ninja'});
  const content=resolveTVScreen(states,route,now);
  assert.equal(content.subtitle,'Netflix');assert.equal(content.title,'SHIELD');
  assert.equal(content.artwork,undefined);assert.equal(content.position,undefined);
  delete states[route.shield];
  assert.equal(resolveTVScreen(states,route,now).subtitle,'Netflix');
});
test('ADB screenshot is the background during playback and menus, retaining metadata and source gating',()=>{
  const adbRoute={...route,screenshot:'media_player.shield_adb'};
  const states=fixture(), url='/api/media_player_proxy/media_player.shield_adb?token=fixture';
  states[adbRoute.screenshot]=state(adbRoute.screenshot,'on',{entity_picture:url});
  const playing=resolveTVScreen(states,adbRoute,now);
  assert.equal(playing.artworkKind,'screenshot');assert.equal(playing.artwork,url);
  assert.equal(playing.title,'Example episode');assert.equal(playing.position,40);
  states[route.shield].state='idle';
  assert.equal(resolveTVScreen(states,adbRoute,now).artwork,url);
  assert.equal(resolveTVScreen(states,adbRoute,now).artworkKind,'screenshot');
  for(const source of ['PC','Playststion','TV Audio']) {
    states[route.receiver].attributes.source=source;
    assert.equal(resolveTVScreen(states,adbRoute,now).artwork,undefined);
  }
  states[route.receiver].attributes.source='SHIELD Media';
  for(const value of ['off','standby','unknown','unavailable']) {
    states[adbRoute.screenshot].state=value;
    assert.equal(resolveTVScreen(states,adbRoute,now).artwork,undefined);
  }
  assert.ok(displayStateDependencies({kind:'tv',tvMedia:adbRoute,sources:[]}).includes(adbRoute.screenshot));
});
test('saved living-room routes inherit the added screenshot dependency',()=>{
  const oldRoute={receiver:route.receiver,shield:route.shield,television:route.television};
  assert.ok(displayStateDependencies({kind:'tv',tvMedia:oldRoute,sources:[]}).includes(route.screenshot));
});
test('PC input shows the desktop camera still as background, gated by input and camera availability',()=>{
  const states=fixture(), url='/api/camera_proxy/camera.desktop_main_bildschirm?token=fixture';
  states[route.receiver].attributes.source='PC';
  states[route.pcScreenshot]=state(route.pcScreenshot,'idle',{entity_picture:url});
  const pc=resolveTVScreen(states,route,now);
  assert.equal(pc.kind,'pc');assert.equal(pc.artwork,url);assert.equal(pc.artworkKind,'screenshot');
  assert.equal(pc.camera,route.pcScreenshot);assert.equal(pc.status,'Bildschirmvorschau');
  for(const value of ['off','standby','unknown','unavailable']) {
    states[route.pcScreenshot].state=value;
    const content=resolveTVScreen(states,route,now);
    assert.equal(content.artwork,undefined);assert.equal(content.camera,undefined);assert.equal(content.status,'Verbunden');
  }
  states[route.pcScreenshot].state='idle';
  for(const source of ['SHIELD Media','Playststion','TV Audio']) {
    states[route.receiver].attributes.source=source;
    assert.equal(resolveTVScreen(states,route,now).camera,undefined);
  }
  delete states[route.pcScreenshot];states[route.receiver].attributes.source='PC';
  assert.equal(resolveTVScreen(states,route,now).artwork,undefined);
  assert.ok(displayStateDependencies({kind:'tv',sources:[{entityId:route.television}]}).includes(route.pcScreenshot));
  const saved={receiver:route.receiver,shield:route.shield,television:route.television};
  assert.ok(displayStateDependencies({kind:'tv',tvMedia:saved,sources:[]}).includes(route.pcScreenshot));
});
test('apps without metadata or image (Netflix) surface the app as title and brand backdrop key',async()=>{
  const {appBrand}=await import('../src/services/tvMedia.ts');
  const states=fixture();
  states[route.shield]=state(route.shield,'playing',{app_name:'Netflix',media_position_updated_at:'2026-09-27T19:00:00Z'});
  states[route.remote]=state(route.remote,'on',{app_id:'com.netflix.ninja'});
  const playing=resolveTVScreen(states,route,now);
  assert.equal(playing.title,'Netflix');assert.equal(playing.subtitle,'SHIELD');assert.equal(playing.app,'Netflix');
  assert.equal(playing.artwork,undefined);assert.equal(playing.status,'Wiedergabe');
  assert.equal(appBrand(playing.app).label,'NETFLIX');
  states[route.shield].attributes.media_title='Some film';
  const titled=resolveTVScreen(states,route,now);
  assert.equal(titled.title,'Some film');assert.equal(titled.subtitle,'Netflix');assert.equal(titled.app,'Netflix');
  states[route.shield].state='idle';
  assert.equal(resolveTVScreen(states,route,now).app,'Netflix');
  delete states[route.remote];delete states[route.shield];
  assert.equal(resolveTVScreen(states,route,now).app,undefined);
  assert.equal(appBrand('Some Unknown App'),undefined);assert.equal(appBrand(undefined),undefined);
});
