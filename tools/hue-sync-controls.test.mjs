import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HUE_SYNC_SWITCH, HUE_SYNC_AREA, HUE_SYNC_AREA_NAME, HUE_SYNC_MEMBERS, hueSyncScenes } from '../src/services/hueSync.ts';
import { commandHueSyncLights, setHueSync, activateHueSyncScene } from '../src/services/hueSyncControls.ts';
function fixture(sync = 'off') {
  const states = Object.fromEntries([HUE_SYNC_SWITCH, HUE_SYNC_AREA, ...HUE_SYNC_MEMBERS].map(id => [id, {entity_id:id,state:'off',attributes:{}}]));
  states[HUE_SYNC_SWITCH].state=sync; states[HUE_SYNC_AREA].state=HUE_SYNC_AREA_NAME;
  const calls=[];
  const ha={isConnected:true,callService:async(...args)=>{calls.push(args);}};
  return {states,calls,ha};
}
test('zone commands target only available members, never other room lamps', async()=>{
  const {states,calls,ha}=fixture();
  states['light.bathroom']={entity_id:'light.bathroom',state:'on',attributes:{}};
  states[HUE_SYNC_MEMBERS[0]].state='unavailable';
  delete states[HUE_SYNC_MEMBERS[1]];
  await commandHueSyncLights(ha,()=>states,'turn_on',{rgb_color:[1,2,3]});
  assert.deepEqual(calls.map(c=>c[2]),HUE_SYNC_MEMBERS.slice(2));
  assert.ok(calls.every(c=>c[0]==='light' && c[1]==='turn_on' && c[3].rgb_color[2]===3));
});
test('active or unknown sync blocks lights, a different known zone does not', async()=>{
  for(const sync of ['on','unknown','unavailable',undefined]) {
    const {states,calls,ha}=fixture(sync);
    if(!sync) delete states[HUE_SYNC_SWITCH];
    await assert.rejects(commandHueSyncLights(ha,()=>states,'turn_off'));
    assert.equal(calls.length,0);
  }
  const {states,calls,ha}=fixture('on');states[HUE_SYNC_AREA].state='Another area';
  await commandHueSyncLights(ha,()=>states,'turn_off');assert.equal(calls.length,HUE_SYNC_MEMBERS.length);
  delete states[HUE_SYNC_AREA];await assert.rejects(commandHueSyncLights(ha,()=>states,'turn_on'));
});
test('stop waits for HA state before allowing lights; start uses sync switch only', async()=>{
  const {states,calls,ha}=fixture('on');
  ha.callService=async(...args)=>{calls.push(args);setTimeout(()=>{states[HUE_SYNC_SWITCH].state=args[1]==='turn_on'?'on':'off';},20);};
  await setHueSync(ha,()=>states,false);
  assert.equal(states[HUE_SYNC_SWITCH].state,'off');
  await setHueSync(ha,()=>states,true);
  assert.deepEqual(calls,[['switch','turn_off',HUE_SYNC_SWITCH],['switch','turn_on',HUE_SYNC_SWITCH]]);
});
test('unreachable connection, wrong area and service failures are reported', async()=>{
  const {states,ha}=fixture();ha.isConnected=false;
  await assert.rejects(commandHueSyncLights(ha,()=>states,'turn_on'));
  await assert.rejects(setHueSync(ha,()=>states,true));
  ha.isConnected=true;states[HUE_SYNC_AREA].state='Another area';
  await assert.rejects(setHueSync(ha,()=>states,true));
  ha.callService=async()=>{throw Error('offline');};
  await assert.rejects(commandHueSyncLights(ha,()=>states,'turn_on'),/Lampen konnten nicht/);
});
test('HA scenes require explicit contained membership; other rooms cannot be changed',async()=>{
  const {states,calls,ha}=fixture();
  for (const [id,ids] of [['zone',[...HUE_SYNC_MEMBERS]],['mixed',[HUE_SYNC_MEMBERS[0],'light.bathroom']],['unknown',undefined]]) states[`scene.${id}`]={entity_id:`scene.${id}`,state:'scening',attributes:{entity_id:ids}};
  assert.deepEqual(hueSyncScenes(states).map(s=>s.entity_id),['scene.zone']);
  await activateHueSyncScene(ha,()=>states,'scene.zone');assert.deepEqual(calls,[['scene','turn_on','scene.zone']]);
  await assert.rejects(activateHueSyncScene(ha,()=>states,'scene.mixed'));
});
