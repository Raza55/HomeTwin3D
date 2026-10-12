import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveApplianceControls, applianceControlOffline, programOptions, rankPrograms } from '../src/services/applianceControls.ts';

const registry = [
  {entity_id:'sensor.washer',device_id:'washer'},
  {entity_id:'select.washer_program',device_id:'washer',original_name:'Program uid'},
  {entity_id:'button.washer_start',device_id:'washer',original_name:'START'},
  {entity_id:'button.washer_stop',device_id:'washer',original_name:'STOPRESET'},
  {entity_id:'sensor.washer_connection',device_id:'washer',original_name:'Connectivity state'},
  {entity_id:'button.dryer_start',device_id:'dryer',original_name:'START'},
];
test('discover only unambiguous enabled controls of the mapped appliance device',()=>{
  const c=resolveApplianceControls({kind:'washer',remainingEntityId:'sensor.washer'},'binary_sensor.running',registry);
  assert.equal(c.program,'select.washer_program'); assert.equal(c.start,'button.washer_start'); assert.equal(c.stop,'button.washer_stop');
  assert.equal(resolveApplianceControls({kind:'washer'},'binary_sensor.running',registry).start,undefined);
  assert.equal(resolveApplianceControls({kind:'washer'},'sensor.washer',registry.map(e=>e.entity_id==='button.washer_start'?{...e,disabled_by:'user'}:e)).start,undefined);
  assert.equal(resolveApplianceControls({kind:'washer'},'sensor.washer',[...registry,{entity_id:'button.duplicate',device_id:'washer',original_name:'START'}]).start,undefined);
});
test('explicit mappings win and offline device overrides connected HA',()=>{
  const c=resolveApplianceControls({kind:'washer',startEntityId:'button.custom_start'},'sensor.washer',registry);
  assert.equal(c.start,'button.custom_start');
  assert.equal(applianceControlOffline(c,{'sensor.washer_connection':{state:'Disconnected'}},true),true);
  assert.equal(applianceControlOffline(c,{'sensor.washer_connection':{state:'Connected'}},true),false);
  assert.equal(applianceControlOffline(c,{},true),true);
  assert.equal(applianceControlOffline({}, {}, false),true);
});
test('program ranking keeps exact service options and ignores invalid usage',()=>{
  const options=programOptions({attributes:{options:['Wool','Cotton','Eco',null,3]}});
  assert.deepEqual(rankPrograms(options,{Wool:2,Eco:5,Cotton:-1}),['Eco','Wool','Cotton']);
  assert.deepEqual(rankPrograms(options,{Wool:'bad',Eco:Infinity}),['Cotton','Eco','Wool']);
  assert.deepEqual(options,['Wool','Cotton','Eco']);
});
