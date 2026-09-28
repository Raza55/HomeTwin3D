import { Vector3, Matrix } from '@babylonjs/core';
import { createParkEnvironment } from '../src/babylon/ParkEnvironment';
import { findFrontFacade } from '../src/babylon/SiteLayout';
import { createWeatherEffects } from '../src/babylon/WeatherEffects';
import { updateSunPosition } from '../src/babylon/SunController';
import { createBlindMesh, updateBlindPosition } from '../src/babylon/BlindMeshFactory';
import { createScene, setupSunShadows } from '../src/babylon/SceneManager';
import { loadModel } from '../src/babylon/ModelLoader';
import { readFloorplanManifest, mergeFloorplan } from '../src/services/floorplanImport';
import { bindFloorplanMeshes, floorplanId } from '../src/babylon/FloorplanBindings';
import { createLightMesh, type MeshMap } from '../src/babylon/LightMeshFactory';
import { applyFloorplanLightState, configureFloorplanLightInfluence } from '../src/babylon/FloorplanLighting';
import { getConfig, uploadModel } from '../src/services/configApi';
const status=document.querySelector('#status')!,report=document.querySelector('#report')!;
try {
 const blob=await(await fetch('../.qa/v83.glb')).blob(), original=(await readFloorplanManifest(blob))!;
 const manifest=structuredClone(original);
 const added=manifest.objects.filter(o=>['Hue Go neben Sofa','Hue Play Fenstervitrine oben'].includes(o.label));
 if(added.length!==2)throw Error('Es fehlen die beiden korrigierten Lampen.');
 const originalBindings=new Map(getConfig().model?.floorplan?.objects.map(o=>[o.id,o.entityId])??[]);
 const merged=mergeFloorplan(getConfig(),original);
 for(const o of merged.model!.floorplan!.objects)if(originalBindings.has(o.id)&&originalBindings.get(o.id)!==o.entityId)throw Error('Bestehende Zuordnung verändert');
 added.forEach((o,i)=>{o.entityId=`light.living_preview_${i}`;});
 manifest.objects.filter(o=>o.domain==='cover').forEach((o,i)=>o.entityId=`cover.preview_${i}`);
 const config=mergeFloorplan({location:{latitude:0,longitude:0},lights:[]},manifest);
 const ctx=createScene(document.querySelector('canvas')!,{enableGlow:true,preserveDrawingBuffer:true});
 const model=await loadModel(ctx.scene,blob,undefined,{showTextures:true,edgeRendering:false});
 const glass=model.meshes.filter(m=>m.metadata?.windowGlass);
 if(glass.length<3||glass.some(m=>model.shadowCasters.includes(m)))throw Error('Fensterglas wirft Vollschatten');
 report.textContent=JSON.stringify({center:model.center.asArray(),size:model.size.asArray()});
 const park=createParkEnvironment(ctx.scene,model.center,model.size,Math.min(...manifest.objects.filter(o=>o.domain==='cover').map(o=>o.position.x))-.12,findFrontFacade(manifest.objects.filter(o=>o.domain==='cover')));ctx.camera.maxZ=250;
 const covers=(config.blinds??[]).map(c=>createBlindMesh(ctx.scene,c,100));
 const sunShadows=setupSunShadows(ctx,[...model.shadowCasters,...covers.map(c=>c.panel)],model.diagonal,1024);
 ctx.scene.fogEnabled=false;
 const weather=createWeatherEffects(ctx.scene,sunShadows??undefined);
 const weatherSelect=document.querySelector<HTMLSelectElement>('#weather')!;
 weatherSelect.onchange=()=>{const preset=({clear:[0,0,0,0],cloudy:[3,100,0,0],rain:[63,100,4,0],snow:[73,95,0,2],fog:[45,100,0,0]} as Record<string,number[]>)[weatherSelect.value];const factor=weather.updateWeather({weather_code:preset[0],cloud_cover:preset[1],rain:preset[2],snowfall:preset[3]});updateSunPosition(ctx.sunLight,ctx.hemiLight,getConfig().location.latitude,getConfig().location.longitude,Number(document.querySelector<HTMLSelectElement>('#time')!.value),Number(document.querySelector<HTMLSelectElement>('#north')!.value),factor);};
 const daylight=()=>updateSunPosition(ctx.sunLight,ctx.hemiLight,getConfig().location.latitude,getConfig().location.longitude,Number(document.querySelector<HTMLSelectElement>('#time')!.value),Number(document.querySelector<HTMLSelectElement>('#north')!.value),1);
 document.querySelector<HTMLSelectElement>('#time')!.onchange=daylight;
 document.querySelector<HTMLSelectElement>('#north')!.onchange=daylight;
 document.querySelector<HTMLButtonElement>('#sun-test')!.onclick=()=>{ctx.sunLight.direction=new Vector3(1,-.35,0).normalize();ctx.sunLight.position=model.center.subtract(ctx.sunLight.direction.scale(50));ctx.sunLight.intensity=2;ctx.hemiLight.intensity=.15;sunShadows?.getShadowMap()?.resetRefreshCounter();};
 document.querySelector<HTMLButtonElement>('#overview')!.onclick=()=>{ctx.camera.setTarget(model.center);ctx.camera.alpha=2.5;ctx.camera.beta=1.05;ctx.camera.radius=65;};
 document.querySelector<HTMLSelectElement>('#covers')!.onchange=e=>{for(const c of covers)updateBlindPosition(c,Number((e.target as HTMLSelectElement).value));sunShadows?.getShadowMap()?.resetRefreshCounter();};
 document.querySelector<HTMLButtonElement>('#site-top')!.onclick=()=>{ctx.camera.setTarget(model.center);ctx.camera.alpha=Math.PI/2;ctx.camera.beta=.03;ctx.camera.radius=95;};
 document.querySelector<HTMLButtonElement>('#bedroom')!.onclick=()=>{ctx.camera.setTarget(new Vector3(-10.8,1.2,1.65));ctx.camera.alpha=3.14;ctx.camera.beta=1.25;ctx.camera.radius=4;};
 document.querySelector<HTMLButtonElement>('#rear')!.onclick=()=>{ctx.camera.setTarget(new Vector3(-5.5,.7,6.5));ctx.camera.alpha=.1;ctx.camera.beta=.65;ctx.camera.radius=22;};
 const meshes:MeshMap={};
 for(const o of added){if(!model.meshes.some(m=>floorplanId(m)===o.id))throw Error('Geometrie fehlt: '+o.label);}
 for(const l of config.lights.filter(l=>l.entityId.startsWith('light.living_preview_'))){meshes[l.entityId]=createLightMesh(ctx.scene,l,l.entityId,{withPointLight:true,shadowCasters:model.shadowCasters,shadowResolution:256});}
 bindFloorplanMeshes(ctx.scene,model.meshes,config,meshes);
 for(const entry of Object.values(meshes)){entry.touchIconMesh?.setEnabled(false);entry.hitboxMesh?.setEnabled(false);}
 configureFloorplanLightInfluence(ctx.scene,Object.values(meshes).map(m=>m.floorplanRig!),model.meshes);
 const select=document.querySelector<HTMLSelectElement>('#select')!;
 for(const o of added)select.add(new Option(o.label,o.entityId));
 const update=()=>{for(const [i,o] of added.entries()){
  const l=config.lights.find(l=>l.entityId===o.entityId)!, entry=meshes[o.entityId];
  entry.mat.emissiveColor.copyFrom(applyFloorplanLightState(entry.floorplanRig!,l,{entity_id:l.entityId,state:select.value==='all'||select.value===l.entityId?'on':'off',attributes:{brightness:110,rgb_color:[255,190,110]}}));
 }};select.onchange=update;update();
 ctx.scene.fogEnabled=false;daylight();
 ctx.camera.lowerRadiusLimit=.3;ctx.camera.fov=1;ctx.camera.setTarget(new Vector3(-10.55,1.1,6.8));ctx.camera.alpha=-.65;ctx.camera.beta=1.0;ctx.camera.radius=3.0;
 const labels=added.map(o=>{const e=document.createElement('div');e.textContent=o.label;e.style.cssText='position:fixed;pointer-events:none;padding:5px 9px;border:1px solid #9bd5f2;border-radius:8px;background:#102130e0;color:white;font:12px system-ui;transform:translate(-50%,-130%);white-space:nowrap';document.body.append(e);return {e,o};});
 ctx.scene.onAfterRenderObservable.add(()=>{for(const {e,o} of labels){const p=Vector3.Project(new Vector3(o.position.x,o.position.y,o.position.z),Matrix.Identity(),ctx.scene.getTransformMatrix(),ctx.camera.viewport.toGlobal(ctx.engine.getRenderWidth(),ctx.engine.getRenderHeight()));const r=ctx.engine.getRenderingCanvas()!.getBoundingClientRect();e.style.left=(r.left+p.x/ctx.engine.getRenderWidth()*r.width)+'px';e.style.top=(r.top+p.y/ctx.engine.getRenderHeight()*r.height)+'px';}});
 ctx.engine.runRenderLoop(()=>ctx.scene.render());window.addEventListener('resize',()=>ctx.engine.resize());
 status.textContent=`Fensterglas v83 · ${glass.length} transparente Teilflächen · ${covers.length} Rollos geprüft`;report.textContent=added.map(o=>`${o.label}: ${o.emitters!.length} Quellen`).join('\n')+'\nBestehende Zuordnungen bleiben erhalten.';
 const button=document.querySelector<HTMLButtonElement>('#import')!;button.disabled=false;button.onclick=async()=>{
  button.disabled=true;
  try{
   const before=(getConfig().model?.floorplan?.objects??[]).filter(o=>o.id!=='4b5356c8-c8c5-5839-8d1d-fc87d5ce0bc1');
   const proposed=mergeFloorplan(getConfig(),original).model!.floorplan!.objects;
   if(before.some(o=>!proposed.some(n=>n.id===o.id&&n.entityId===o.entityId)))throw Error('Zuordnungen würden verändert');
   await uploadModel(blob);
   const saved=getConfig().model!.floorplan!;
   if(saved.objects.some(o=>o.id==='4b5356c8-c8c5-5839-8d1d-fc87d5ce0bc1')||getConfig().lights.some(l=>l.floorplanIds?.includes('4b5356c8-c8c5-5839-8d1d-fc87d5ce0bc1')))throw Error('Duplikat noch aktiv');
   if(before.some(o=>!saved.objects.some(n=>n.id===o.id&&n.entityId===o.entityId)))throw Error('Zuordnung nach Import abweichend');
   status.textContent=`v83 importiert · ${saved.objects.length} Objekte`;
   report.textContent=`Alle ${before.length} bisherigen Objektzuordnungen unverändert.\n${before.filter(o=>o.entityId).length} belegte Entities erhalten.\nGrauer Bodenüberstand entfernt. Alle Zuordnungen unverändert.`;
   button.textContent='Import erfolgreich';
  }catch(e){status.textContent='Import fehlgeschlagen: '+String(e);button.disabled=false;}
 };
}catch(e){status.textContent='Prüfung fehlgeschlagen';report.textContent=String(e);console.error(e);}
