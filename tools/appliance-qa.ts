import {Vector3} from '@babylonjs/core';
import {createScene} from '../src/babylon/SceneManager';
import {loadModel} from '../src/babylon/ModelLoader';
import {createSmartDeviceMesh,updateSmartDeviceState} from '../src/babylon/SmartDeviceMeshFactory';
import {bindFloorplanMeshes} from '../src/babylon/FloorplanBindings';
import {readFloorplanManifest,mergeFloorplan} from '../src/services/floorplanImport';
import {getConfig,uploadModel} from '../src/services/configApi';
const status=document.querySelector('#status')!,report=document.querySelector('#report')!;
try {
 const blob=await(await fetch('../.qa/v84.glb')).blob(),original=(await readFloorplanManifest(blob))!;
 const manifest=structuredClone(original);
 manifest.objects.filter(o=>o.appliance).forEach(o=>o.entityId=`sensor.preview_${o.appliance!.kind}`);
 const config=mergeFloorplan({location:{latitude:0,longitude:0},lights:[]},manifest);
 const ctx=createScene(document.querySelector('canvas')!,{enableGlow:true,preserveDrawingBuffer:true});
 const model=await loadModel(ctx.scene,blob,undefined,{showTextures:true,edgeRendering:false});
 const entries=config.smartDevices!.filter(o=>o.appliance).map(o=>createSmartDeviceMesh(ctx.scene,o));
 bindFloorplanMeshes(ctx.scene,model.meshes,config,{});
 if(entries.length!==2||entries.some(e=>e.animations?.length!==1))throw Error('Zwei getrennte Animationen erwartet');
 for(const kind of ['washer','dryer'])document.querySelector<HTMLButtonElement>('#'+kind)!.onclick=()=>{
  const e=entries.find(e=>e.config.appliance!.kind===kind)!;
  updateSmartDeviceState(e,{entity_id:e.config.entityId,state:e.running?'off':'on',attributes:{}});
 };
 document.querySelector<HTMLButtonElement>('#stop')!.onclick=()=>entries.forEach(e=>updateSmartDeviceState(e,null));
 ctx.scene.onAfterRenderObservable.add(()=>{report.textContent=entries.map(e=>`${e.config.label}: ${e.running?'läuft':'steht'} · Frame ${Math.round(e.animations![0].getCurrentFrame())}`).join('\n');});
 ctx.scene.fogEnabled=false;ctx.hemiLight.intensity=.9;ctx.sunLight.intensity=.3;
 ctx.camera.lowerRadiusLimit=.2;ctx.camera.setTarget(new Vector3(-4.729,1.15,1.07));ctx.camera.alpha=Math.PI/2;ctx.camera.beta=1.15;ctx.camera.radius=2.6;
 ctx.engine.runRenderLoop(()=>ctx.scene.render());window.addEventListener('resize',()=>ctx.engine.resize());
 status.textContent='v84 · Waschmaschine und Trockner bereit';
 const button=document.querySelector<HTMLButtonElement>('#import')!;button.disabled=false;
 button.onclick=async()=>{
  button.disabled=true;
  try {
   const before=getConfig().model?.floorplan?.objects??[];
   const proposed=mergeFloorplan(getConfig(),original).model!.floorplan!.objects;
   if(before.some(o=>!proposed.some(n=>n.id===o.id&&n.entityId===o.entityId)))throw Error('Zuordnungen würden verändert');
   await uploadModel(blob);
   const saved=getConfig().model!.floorplan!;
   if(before.some(o=>!saved.objects.some(n=>n.id===o.id&&n.entityId===o.entityId)))throw Error('Zuordnung nach Import abweichend');
   status.textContent=`v84 importiert · ${saved.objects.length} Objekte · ${before.filter(o=>o.entityId).length} belegte Zuordnungen erhalten`;
   button.textContent='Import erfolgreich';
  }catch(e){status.textContent=String(e);button.disabled=false;}
 };
}catch(e){status.textContent='Prüfung fehlgeschlagen';report.textContent=String(e);console.error(e);}
