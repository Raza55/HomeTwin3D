import test from 'node:test';
import assert from 'node:assert/strict';
import {coverLongPressService} from '../src/services/coverLongPress.ts';

const cover=(state,attributes={})=>({entity_id:'cover.example_blind',state,attributes,last_changed:'',last_updated:''});

test('Long press opens a closed blind',()=>{
  assert.equal(coverLongPressService(cover('closed')),'open_cover');
  assert.equal(coverLongPressService(cover('closed',{current_position:0})),'open_cover');
  // Some covers report "open" while their position is fully down.
  assert.equal(coverLongPressService(cover('open',{current_position:0})),'open_cover');
});

test('Long press closes an open or partly open blind',()=>{
  assert.equal(coverLongPressService(cover('open')),'close_cover');
  assert.equal(coverLongPressService(cover('open',{current_position:100})),'close_cover');
  assert.equal(coverLongPressService(cover('open',{current_position:35})),'close_cover');
});

test('Long press stops a moving blind and ignores unusable ones',()=>{
  assert.equal(coverLongPressService(cover('opening',{current_position:40})),'stop_cover');
  assert.equal(coverLongPressService(cover('closing',{current_position:40})),'stop_cover');
  assert.equal(coverLongPressService(cover('unavailable')),null);
  assert.equal(coverLongPressService(undefined),null);
});
