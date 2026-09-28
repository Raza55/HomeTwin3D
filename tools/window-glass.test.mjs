import {test} from 'node:test';
import assert from 'node:assert/strict';
import {NullEngine,Scene,MeshBuilder,PBRMaterial,Material,DirectionalLight,HemisphericLight,Vector3} from '@babylonjs/core';
import {prepareWindowGlass} from '../src/babylon/WindowGlass.ts';
import {updateSunPosition} from '../src/babylon/SunController.ts';
test('window panes stay transparent while opaque materials stay intact',()=>{
 const engine=new NullEngine(),scene=new Scene(engine);
 try{
  const window=MeshBuilder.CreatePlane('pane',{},scene);window.material=new PBRMaterial('Wohnzimmer_Fensterglas_klar',scene);
  assert.equal(prepareWindowGlass(window),true);assert.equal(window.material.alpha,.12);assert.equal(window.material.transparencyMode,Material.MATERIAL_ALPHABLEND);assert.equal(window.receiveShadows,false);
  const wall=MeshBuilder.CreateBox('wall',{},scene);wall.material=new PBRMaterial('wall',scene);assert.equal(prepareWindowGlass(wall),false);assert.equal(wall.material.alpha,1);
 }finally{scene.dispose();engine.dispose();}
});
test('solar lighting and sky transition from day to night for configured coordinates',()=>{
 const engine=new NullEngine(),scene=new Scene(engine);
 try{
  const sun=new DirectionalLight('sun',Vector3.Down(),scene),hemi=new HemisphericLight('hemi',Vector3.Up(),scene);
  updateSunPosition(sun,hemi,50,8,720,0,1);assert.ok(sun.intensity>0);assert.ok(scene.metadata.sunAltitudeDeg>0);
  updateSunPosition(sun,hemi,50,8,0,0,1);assert.equal(sun.intensity,0);assert.ok(scene.metadata.sunAltitudeDeg<0);
 }finally{scene.dispose();engine.dispose();}
});
