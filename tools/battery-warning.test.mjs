import { test } from 'node:test';
import assert from 'node:assert/strict';
import { batteryWarnings } from '../src/services/batteryWarning.ts';
const registry = [{entity_id:'binary_sensor.door',device_id:'door'}, {entity_id:'sensor.battery',device_id:'door'}, {entity_id:'binary_sensor.low',device_id:'door'}, {entity_id:'sensor.other',device_id:'other'}];
const state = (entity_id, value, unit='%') => ({entity_id,state:value,attributes:{device_class:'battery',unit_of_measurement:unit}});
test('only the mapped device warns, including the 20 percent boundary and zero', () => {
  for(const value of ['0','20']) assert.equal(batteryWarnings('binary_sensor.door',registry,{'sensor.battery':state('sensor.battery',value)},true).length,1);
  for(const value of ['21','unknown','unavailable','','-1']) assert.deepEqual(batteryWarnings('binary_sensor.door',registry,{'sensor.battery':state('sensor.battery',value)},true),[]);
  assert.deepEqual(batteryWarnings('binary_sensor.door',registry,{'sensor.other':state('sensor.other','0')},true),[]);
  assert.deepEqual(batteryWarnings('binary_sensor.door',registry,{'sensor.battery':state('sensor.battery','3','V')},true),[]);
});
test('binary warnings, connection loss, disabled entities and missing device identity', () => {
  const states={'binary_sensor.low':state('binary_sensor.low','on')};
  assert.equal(batteryWarnings('binary_sensor.door',registry,states,true).length,1);
  assert.deepEqual(batteryWarnings('binary_sensor.door',registry,states,false),[]);
  assert.deepEqual(batteryWarnings('binary_sensor.door',registry.map(e=>({...e,device_id:null})),states,true),[]);
  assert.deepEqual(batteryWarnings('binary_sensor.door',registry.map(e=>e.entity_id==='binary_sensor.low'?{...e,disabled_by:'user'}:e),states,true),[]);
  states['binary_sensor.low'].state='off';
  assert.deepEqual(batteryWarnings('binary_sensor.door',registry,states,true),[]);
});
