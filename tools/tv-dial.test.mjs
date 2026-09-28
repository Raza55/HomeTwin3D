import test from 'node:test';
import assert from 'node:assert/strict';
import {TV_DIAL_CHOICES,tvDialRequest,tvDialSelected} from '../src/services/tvDial.ts';
import {LIVING_ROOM_TV} from '../src/services/tvMedia.ts';
test('TV buttons use the existing automation trigger ids, including shutdown',()=>{
  for(const id of ['shield','pc','playstation','retropie','aus'])assert.deepEqual(tvDialRequest(id),{type:'fire_event',event_type:'hometwin_tv_dial',event_data:{source:id}});
  assert.throws(()=>tvDialRequest('invalid'));
});
test('Selected source follows real receiver and power, not the last clicked button',()=>{
  for(const c of TV_DIAL_CHOICES){
    const states={[LIVING_ROOM_TV.television]:{state:'on',attributes:{}},[LIVING_ROOM_TV.receiver]:{state:'on',attributes:{source:c.source}}};
    assert.equal(tvDialSelected(states,true),c.id);assert.equal(tvDialSelected(states,false),undefined);
    states[LIVING_ROOM_TV.television].state='off';assert.equal(tvDialSelected(states,true),'aus');
    states[LIVING_ROOM_TV.television].state='unavailable';assert.equal(tvDialSelected(states,true),undefined);
  }
});
