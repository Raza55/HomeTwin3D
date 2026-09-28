import { Vector3, Matrix } from '@babylonjs/core';
import { createScene } from '../src/babylon/SceneManager';
import { loadModel } from '../src/babylon/ModelLoader';
import { readFloorplanManifest, mergeFloorplan } from '../src/services/floorplanImport';
import { bindFloorplanMeshes, floorplanId } from '../src/babylon/FloorplanBindings';
import { createLightMesh, type MeshMap } from '../src/babylon/LightMeshFactory';
import { applyFloorplanLightState, configureFloorplanLightInfluence } from '../src/babylon/FloorplanLighting';
import { getConfig, uploadModel } from '../src/services/configApi';
const status=document.querySelector('#status')!,report=document.querySelector('#report')!;
try {
 const blob=await(await fetch('../.qa/v78.glb')).blob(), original=(await readFloorplanManifest(blob))!;
 const manifest=structuredClone(original);
 const added=manifest.objects.filter(o=>['Hue Go neben Sofa','Hue Play Fenstervitrine oben'].includes(o.label));
 if(added.length!==2)throw Error('Es fehlen die beiden korrigierten Lampen.');
 const originalBindings=new Map(getConfig().model?.floorplan?.objects.map(o=>[o.id,o.entityId])??[]);
 const merged=mergeFloorplan(getConfig(),original);
 for(const o of merged.model!.floorplan!.objects)if(originalBindings.has(o.id)&&originalBindings.get(o.id)!==o.entityId)throw Error('Bestehende Zuordnung verändert');
 added.forEach((o,i)=>{o.entityId=`light.living_preview_${i}`;});
 const config=mergeFloorplan({location:{latitude:0,longitude:0},lights:[]},manifest);
 const ctx=createScene(document.querySelector('canvas')!,{enableGlow:true,preserveDrawingBuffer:true});
 const model=await loadModel(ctx.scene,blob,undefined,{showTextures:true,edgeRendering:false});
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
 ctx.scene.fogEnabled=false;ctx.hemiLight.intensity=.15;ctx.sunLight.intensity=.05;
 ctx.camera.lowerRadiusLimit=.3;ctx.camera.fov=1;ctx.camera.setTarget(new Vector3(-10.55,1.1,6.8));ctx.camera.alpha=-.65;ctx.camera.beta=1.0;ctx.camera.radius=3.0;
 const labels=added.map(o=>{const e=document.createElement('div');e.textContent=o.label;e.style.cssText='position:fixed;pointer-events:none;padding:5px 9px;border:1px solid #9bd5f2;border-radius:8px;background:#102130e0;color:white;font:12px system-ui;transform:translate(-50%,-130%);white-space:nowrap';document.body.append(e);return {e,o};});
 ctx.scene.onAfterRenderObservable.add(()=>{for(const {e,o} of labels){const p=Vector3.Project(new Vector3(o.position.x,o.position.y,o.position.z),Matrix.Identity(),ctx.scene.getTransformMatrix(),ctx.camera.viewport.toGlobal(ctx.engine.getRenderWidth(),ctx.engine.getRenderHeight()));const r=ctx.engine.getRenderingCanvas()!.getBoundingClientRect();e.style.left=(r.left+p.x/ctx.engine.getRenderWidth()*r.width)+'px';e.style.top=(r.top+p.y/ctx.engine.getRenderHeight()*r.height)+'px';}});
 ctx.engine.runRenderLoop(()=>ctx.scene.render());window.addEventListener('resize',()=>ctx.engine.resize());
 status.textContent='Wohnzimmer v78 · Prüfung bestanden';report.textContent=added.map(o=>`${o.label}: ${o.emitters!.length} Quellen`).join('\n')+'\nBestehende Zuordnungen bleiben erhalten.';
 const button=document.querySelector<HTMLButtonElement>('#import')!;button.disabled=false;button.onclick=async()=>{
  button.disabled=true;
  try{
   const before=getConfig().model?.floorplan?.objects??[];
   const proposed=mergeFloorplan(getConfig(),original).model!.floorplan!.objects;
   if(before.some(o=>!proposed.some(n=>n.id===o.id&&n.entityId===o.entityId)))throw Error('Zuordnungen würden verändert');
   await uploadModel(blob);
   const saved=getConfig().model!.floorplan!;
   if(before.some(o=>!saved.objects.some(n=>n.id===o.id&&n.entityId===o.entityId)))throw Error('Zuordnung nach Import abweichend');
   status.textContent=`v78 importiert · ${saved.objects.length} Objekte`;
   report.textContent=`Alle ${before.length} bisherigen Objektzuordnungen unverändert.\n${before.filter(o=>o.entityId).length} belegte Entities erhalten.\nHue Go am Boden und Hue Play hinter der Schrankdeko aktualisiert.`;
   button.textContent='Import erfolgreich';
  }catch(e){status.textContent='Import fehlgeschlagen: '+String(e);button.disabled=false;}
 };
}catch(e){status.textContent='Prüfung fehlgeschlagen';report.textContent=String(e);console.error(e);}
