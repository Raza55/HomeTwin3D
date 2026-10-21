import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveApplianceControls, applianceControlOffline, programOptions, rankPrograms, programStartsFromHistory, countProgramStarts, programLabel } from '../src/services/applianceControls.ts';

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

test('program usage comes from recorder starts, ignoring short power gaps mid-cycle',()=>{
  const p=(state,last_changed)=>({state,last_changed});
  const programs=[p('unavailable','2026-10-10T21:54:04Z'),p('Drum Clean Pr Machineclean','2026-10-11T14:55:40Z'),p('Synthetic Pr Synthetics','2026-10-17T10:24:43Z'),p('Express Pr Absolutewash49Min','2026-10-17T10:24:43.6Z'),
    p('Cotton Pr Eco40-60','2026-10-17T16:45:49Z'),p('Synthetic Pr Synthetics','2026-10-17T16:45:57Z')];
  const runs=[p('on','2026-10-11T14:55:15Z'),p('off','2026-10-11T16:29:11Z'),p('on','2026-10-17T10:24:51Z'),p('off','2026-10-17T11:23:49Z'),p('on','2026-10-17T11:23:56Z'),p('off','2026-10-17T11:31:10Z'),
    p('on','2026-10-17T16:46:09Z'),p('off','2026-10-17T19:04:02Z'),p('on','2026-10-17T19:04:22Z'),p('unknown','2026-10-17T19:42:05Z')];
  const starts=programStartsFromHistory(programs,runs,s=>s==='on');
  assert.deepEqual(Object.values(starts),['Drum Clean Pr Machineclean','Express Pr Absolutewash49Min','Synthetic Pr Synthetics']);
  assert.deepEqual(countProgramStarts({...starts,'2026-10-18T19:16:52.000Z':'Synthetic Pr Synthetics'}),{'Drum Clean Pr Machineclean':1,'Express Pr Absolutewash49Min':1,'Synthetic Pr Synthetics':2});
  assert.equal(programLabel('Cotton Pr Eco40-60'),'Eco 40-60'); assert.equal(programLabel('Synthetic Pr Synthetics'),'Pflegeleicht'); assert.equal(programLabel('Neu Pr Mystery'),'Mystery'); assert.equal(programLabel('Plain'),'Plain');
});
