import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NullEngine, Scene, MeshBuilder, StandardMaterial, Color3, Ray, Vector3 } from '@babylonjs/core';
import { createFloorplanLightRig, applyFloorplanLightState, configureFloorplanLightInfluence, floorplanLightState } from '../src/babylon/FloorplanLighting';
import type { LightConfig } from '../src/types';
import { bindFloorplanMeshes } from '../src/babylon/FloorplanBindings';
import { createSmartDeviceMesh } from '../src/babylon/SmartDeviceMeshFactory';
const config = (i=0): LightConfig => ({entityId:`light.test_${i}`,type:'rgbw',position:{x:i,y:2,z:0},emitters:[{kind:'point',position:{x:i,y:2,z:0},lumens:1000,range:8}]});

test('batched fan geometry gets a scaled invisible click target; unassigned fans open matching', () => {
  const engine = new NullEngine(), scene = new Scene(engine);
  try {
    const fan = { id: 'balcony-fan', domain: 'fan' as const, entityId: 'fan.balcony', label: 'Fan', position: { x: -7, y: .6, z: 11 }, size: { width: .3, height: 1.2, depth: .3 }, rotationY: 0 };
    const config = { location: { latitude: 0, longitude: 0 }, lights: [], smartDevices: [{ id: 'control', entityId: fan.entityId, label: 'Fan', type: 'fan' as const, group: 'other' as const, action: 'toggle' as const, position: fan.position }], model: { scale: 2, floorplan: { version: 1 as const, source: 'test', coordinateSystem: 'babylon-lh-meters' as const, objects: [fan] } } };
    bindFloorplanMeshes(scene, [], config, {});
    const proxy = scene.getMeshByName('fan-pick:balcony-fan')!;
    assert.equal(proxy.visibility, 0);
    assert.equal(proxy.metadata.smartDeviceId, 'control');
    proxy.computeWorldMatrix(true);
    const pick = scene.pickWithRay(new Ray(new Vector3(-14, 1.2, 18), new Vector3(0, 0, 1)));
    assert.equal(pick?.pickedMesh, proxy);
    proxy.dispose(); fan.entityId = '';
    bindFloorplanMeshes(scene, [], config, {});
    assert.equal(scene.getMeshByName('fan-pick:balcony-fan')!.metadata.unassignedFloorplanId, fan.id);
  } finally { scene.dispose(); engine.dispose(); }
});

test('emissive bindings avoid idle writes while preserving state and sketch changes', () => {
  const engine = new NullEngine(), scene = new Scene(engine);
  try {
    const mesh = MeshBuilder.CreateBox('fixture', {}, scene);
    mesh.material = new StandardMaterial('original', scene);
    mesh.metadata = { gltf: { extras: { ha_id: 'fixture' } } };
    const source = new StandardMaterial('source', scene); source.emissiveColor.set(.2, .4, .6);
    const lights = { 'light.test': { mat: source } } as any;
    bindFloorplanMeshes(scene, [mesh], { location: { latitude: 0, longitude: 0 }, lights: [], model: { floorplan: {
      version: 1, source: 'test', coordinateSystem: 'babylon-lh-meters', objects: [{ id: 'fixture', label: 'Fixture', domain: 'light', entityId: 'light.test', position: { x: 0, y: 0, z: 0 }, size: { width: 1, height: 1, depth: 1 }, rotationY: 0 }],
    } } }, lights);
    const material = mesh.metadata.originalMaterial as StandardMaterial;
    let writes = 0; const copy = material.emissiveColor.copyFrom.bind(material.emissiveColor);
    material.emissiveColor.copyFrom = color => { writes++; return copy(color); };
    scene.onBeforeRenderObservable.notifyObservers(scene);
    assert.ok(material.emissiveColor.equals(source.emissiveColor)); assert.equal(writes, 1);
    for (let i = 0; i < 120; i++) scene.onBeforeRenderObservable.notifyObservers(scene);
    assert.equal(writes, 1, 'no repeated emission writes in an unchanged scene');
    source.emissiveColor.set(.8, .1, .3); scene.onBeforeRenderObservable.notifyObservers(scene); assert.equal(writes, 2);
    const sketch = new StandardMaterial('sketch', scene); sketch.diffuseColor.set(.4, .3, .2); mesh.material = sketch;
    scene.onBeforeRenderObservable.notifyObservers(scene);
    assert.ok((mesh.material as StandardMaterial).diffuseColor.equals(sketch.diffuseColor));
    assert.ok((mesh.material as StandardMaterial).emissiveColor.equals(source.emissiveColor));
    delete lights['light.test']; scene.onBeforeRenderObservable.notifyObservers(scene);
    assert.ok(material.emissiveColor.equals(Color3.Black()));
    assert.ok((mesh.material as StandardMaterial).emissiveColor.equals(Color3.Black()));
  } finally { scene.dispose(); engine.dispose(); }
});

test('imported television has no second glowing speaker; manual devices still render', () => {
  const engine=new NullEngine(),scene=new Scene(engine);
  const cfg={id:'tv',entityId:'media_player.tv',label:'TV',group:'other' as const,type:'speaker' as const,action:'toggle' as const,position:{x:0,y:1,z:0}};
  const imported=createSmartDeviceMesh(scene,{...cfg,floorplanIds:['tv-uuid']});
  assert.equal(imported.meshes.length,0);assert.equal(imported.root.visibility,0);
  const manual=createSmartDeviceMesh(scene,{...cfg,id:'manual'});
  assert.equal(manual.meshes.length,2);
  const tv=MeshBuilder.CreateBox('real-tv',{},scene);tv.metadata={gltf:{extras:{ha_id:'tv-uuid'}}};
  bindFloorplanMeshes(scene,[tv],{location:{latitude:0,longitude:0},lights:[],smartDevices:[imported.config],model:{floorplan:{version:1,source:'test',coordinateSystem:'babylon-lh-meters',objects:[{id:'tv-uuid',label:'TV',domain:'media_player',entityId:'media_player.tv',position:cfg.position,size:{width:1,height:1,depth:.1},rotationY:0}]}}},{});
  assert.equal(tv.metadata.smartDeviceId,'tv');assert.equal(tv.isPickable,true);
  scene.dispose();engine.dispose();
});

test('unassigned lamp geometry remains pickable for assignment without a fake HA entity', () => {
  const engine=new NullEngine(),scene=new Scene(engine),mesh=MeshBuilder.CreateSphere('unassigned',{},scene);
  mesh.metadata={gltf:{extras:{ha_id:'lamp-uuid'}}};mesh.isPickable=false;
  bindFloorplanMeshes(scene,[mesh],{location:{latitude:0,longitude:0},lights:[],model:{floorplan:{version:1,source:'qa',coordinateSystem:'babylon-lh-meters',objects:[{
    id:'lamp-uuid',label:'Lamp',domain:'light',entityId:'',position:{x:0,y:1,z:0},size:{width:1,height:1,depth:1},rotationY:0,
  }]}}},{});
  assert.equal(mesh.isPickable,true);assert.equal(mesh.metadata.unassignedFloorplanId,'lamp-uuid');assert.equal(mesh.metadata.entityId,undefined);
  scene.dispose();engine.dispose();
});
test('physical flux follows full brightness range and unavailable states', () => {
  const engine = new NullEngine(), scene = new Scene(engine), cfg = config();
  const rig = createFloorplanLightRig(scene,cfg,[],1,0);
  for(const brightness of [0,1,128,255]) {
    applyFloorplanLightState(rig,cfg,{entity_id:cfg.entityId,state:'on',attributes:{brightness,rgb_color:[255,0,0]}});
    assert.ok(Math.abs(rig.lights[0].intensity-1000*brightness/255)<1e-7);
    assert.equal(rig.lights[0].diffuse.r,1); assert.equal(rig.lights[0].diffuse.b,0);
  }
  for(const state of ['off','unknown','unavailable']) {
    applyFloorplanLightState(rig,cfg,{entity_id:cfg.entityId,state,attributes:{brightness:255}});
    assert.equal(rig.lights[0].intensity,0); assert.equal(rig.lights[0].isEnabled(),false);
  }
  scene.dispose(); engine.dispose();
});
test('color temperature mode overrides stale RGB data', () => {
  const value = floorplanLightState({entity_id:'light.a',state:'on',attributes:{color_mode:'color_temp',color_temp_kelvin:2700,rgb_color:[0,0,255]}});
  assert.ok(value.color.r > value.color.b); assert.equal(value.factor,1);
});
test('every contributing source stays shadowed beyond six active fixtures', () => {
  const engine = new NullEngine(), scene = new Scene(engine);
  engine.getCaps().maxFragmentUniformVectors=1024;
  const floor = MeshBuilder.CreateBox('floor',{width:20,depth:20,height:.1},scene);
  floor.material = new StandardMaterial('floor-material',scene);
  const configs = Array.from({length:28},(_,i)=>config(i*.1));
  const rigs = configs.map(c=>createFloorplanLightRig(scene,c,[floor],1,0));
  configureFloorplanLightInfluence(scene,rigs,[floor]);
  configs.forEach((c,i)=>applyFloorplanLightState(rigs[i],c,{entity_id:c.entityId,state:'on',attributes:{}}));
  scene.onBeforeRenderObservable.notifyObservers(scene);
  assert.equal(rigs.filter(r=>r.lights[0].canAffectMesh(floor)).length,6);
  assert.equal(rigs.filter(r=>r.lights[0].shadowEnabled).length,6);
  for (const rig of rigs) {
    const light=rig.lights[0];
    if(light.canAffectMesh(floor)) {
      assert.equal(light.shadowEnabled,true);
      assert.ok(light.getShadowGenerator(), 'even lowest quality retains wall occlusion');
    }
  }
  configs.forEach((c,i)=>applyFloorplanLightState(rigs[i],c,{entity_id:c.entityId,state:i===9?'on':'off',attributes:{}}));
  scene.onBeforeRenderObservable.notifyObservers(scene);
  assert.equal(rigs[9].lights[0].canAffectMesh(floor),true);
  assert.equal(rigs.filter(r=>r.lights[0].canAffectMesh(floor)).length,1);
  scene.dispose(); engine.dispose();
});

import { applianceRunning } from '../src/babylon/ApplianceAnimation';
import { mergeFloorplan, exportFloorplanBindings, importFloorplanBindings } from '../src/services/floorplanImport';
test('appliance status, power and unavailable states are explicit',()=>{
 for(const state of ['off','unknown','unavailable','idle','paused','finished'])assert.equal(applianceRunning({kind:'washer'},{entity_id:'binary_sensor.washer',state,attributes:{}}),false);
 assert.equal(applianceRunning({kind:'washer'},{entity_id:'binary_sensor.washer',state:'on',attributes:{}}),true);
 assert.equal(applianceRunning({kind:'dryer',powerThreshold:10},{entity_id:'sensor.power',state:'0.02',attributes:{unit_of_measurement:'kW'}}),true);
 assert.equal(applianceRunning({kind:'dryer',powerThreshold:10},{entity_id:'sensor.power',state:'2',attributes:{unit_of_measurement:'W'}}),false);
});
test('appliance binary mapping and detail entities survive import and binding backup',()=>{
 const object={id:'washer',domain:'sensor' as const,label:'Washer',entityId:'binary_sensor.washer_running',position:{x:0,y:1,z:0},size:{width:.6,height:.8,depth:.6},rotationY:0,appliance:{kind:'washer' as const,runningStates:['on'],remainingEntityId:'sensor.time',programEntityId:'select.program'}};
 const manifest={version:1 as const,source:'v84',coordinateSystem:'babylon-lh-meters' as const,objects:[object]};
 const config=mergeFloorplan({location:{latitude:0,longitude:0},lights:[]},manifest);
 assert.equal(config.smartDevices![0].action,'none');assert.equal(config.displays!.length,0);
 const empty=structuredClone(manifest);empty.objects[0].entityId='';
 const imported=mergeFloorplan(config,empty);
 assert.deepEqual(JSON.parse(JSON.stringify(imported.model!.floorplan!.objects[0])),object);
 const restored=importFloorplanBindings(mergeFloorplan({location:{latitude:0,longitude:0},lights:[]},empty),JSON.parse(exportFloorplanBindings(config)));
 assert.equal(restored.smartDevices![0].entityId,'binary_sensor.washer_running');
 assert.equal(restored.smartDevices![0].appliance!.programEntityId,'select.program');
});
