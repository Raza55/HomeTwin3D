import test from 'node:test';
import assert from 'node:assert/strict';
import {itStatus,itMetric,itCommand,validateIT} from '../src/services/itState.ts';
import {applyFloorplanMappings,mergeFloorplan,validateManifest} from '../src/services/floorplanImport.ts';
import {itCameraUrl} from '../src/services/itCamera.ts';
test('Camera proxy accepts only the assigned camera on the HA origin',()=>{
  const base='http://ha.local:8123',id='camera.desktop_main_bildschirm';
  assert.equal(itCameraUrl(`/api/camera_proxy/${id}?token=test`,id,base),`${base}/api/camera_proxy/${id}?token=test`);
  for(const path of ['https://elsewhere.test/api/camera_proxy/'+id,'/api/camera_proxy/camera.other','/api/states','javascript:alert(1)']) assert.equal(itCameraUrl(path,id,base),undefined);
  validateIT({kind:'pc',devices:[{...pc,screenshotEntityId:id}]});
  assert.throws(()=>validateIT({kind:'pc',devices:[{...pc,screenshotEntityId:'sensor.cpu'}]}));
});
const pc={id:'pc',label:'PC',kind:'pc',statusEntityId:'switch.desktop_main_power',statusMode:'power',metrics:[],actions:[]};
const state=(state,attributes={})=>({state,attributes});
test('Off/unknown/disconnected PCs cannot show stale metrics as live',()=>{
  assert.equal(itStatus(pc,{'switch.desktop_main_power':state('off')},true),'off');
  assert.equal(itStatus(pc,{'switch.desktop_main_power':state('on')},false),'unknown');
  assert.equal(itStatus({...pc,statusEntityId:''},{},true),'unassigned');
  assert.equal(itMetric({entityId:'sensor.cpu'},{'sensor.cpu':state('42')},false),'–');
  assert.equal(itMetric({entityId:'sensor.gpu',positiveOnly:true},{'sensor.gpu':state('0')},true),'–');
});
test('Dashboard switches support explicit on AND off, never internet-access switches',()=>{
  for(const entityId of ['switch.desktop_main_power','switch.desktop_secondary_power','switch.storage_server']){
    const a={id:'power',label:'Hauptschalter',entityId,kind:'toggle'};
    assert.deepEqual(itCommand(a,pc,{[entityId]:state('off')},true),{domain:'switch',service:'turn_on',entityId});
    assert.equal(itCommand(a,pc,{[entityId]:state('on')},true).service,'turn_off');
    assert.equal(itCommand(a,pc,{[entityId]:state('unavailable')},true),null);
    assert.equal(itCommand(a,pc,{[entityId]:state('on')},false),null);
  }
});
test('Never-pressed MQTT button is usable only while PC is on',()=>{
  const a={id:'sleep',label:'Schlafen',entityId:'button.sleep',kind:'button'};
  assert.equal(itCommand(a,pc,{'switch.desktop_main_power':state('on'),'button.sleep':state('unknown')},true).service,'press');
  assert.equal(itCommand(a,pc,{'switch.desktop_main_power':state('off'),'button.sleep':state('unknown')},true),null);
});
test('IT assignments survive a model reimport and cannot become generic sensor controls',()=>{
  const object={id:'test-it',domain:'sensor',entityId:'',label:'PC',position:{x:0,y:1,z:0},size:{width:.1,height:.1,depth:.1},rotationY:0,it:{kind:'pc',devices:[pc]}};
  const manifest=validateManifest({version:1,source:'test.blend',coordinateSystem:'babylon-lh-meters',objects:[object]});
  const config=applyFloorplanMappings({lights:[],location:{latitude:0,longitude:0}},manifest);
  config.model.floorplan.objects[0].it.devices[0].statusEntityId='switch.custom_pc';
  manifest.objects[0].it.devices[0].rgbMaterials=['new_model_leds'];
  const merged=mergeFloorplan(config,manifest);
  assert.equal(merged.model.floorplan.objects[0].it.devices[0].statusEntityId,'switch.custom_pc');
  assert.deepEqual(merged.model.floorplan.objects[0].it.devices[0].rgbMaterials,['new_model_leds']);
  assert.equal(merged.displays?.length??0,0);
  assert.throws(()=>validateIT({kind:'pc',devices:[{...pc,actions:[{id:'power',label:'Power',kind:'toggle',entityId:'script.anything'}]}]}));
});
