import { Vector3 } from '@babylonjs/core';
import { createScene } from '../src/babylon/SceneManager';
import { loadModel } from '../src/babylon/ModelLoader';
import { readFloorplanManifest, mergeFloorplan } from '../src/services/floorplanImport';
import { bindFloorplanMeshes, floorplanId } from '../src/babylon/FloorplanBindings';
import { createLightMesh, type MeshMap } from '../src/babylon/LightMeshFactory';
import { applyFloorplanLightState, configureFloorplanLightInfluence } from '../src/babylon/FloorplanLighting';
import { getConfig, uploadModel } from '../src/services/configApi';
const status=document.querySelector('#status')!,report=document.querySelector('#report')!;
try {
 const blob=await(await fetch('../.qa/v77.glb')).blob(), original=(await readFloorplanManifest(blob))!;
 const manifest=structuredClone(original);
 const added=manifest.objects.filter(o=>o.label.startsWith('Schlafzimmer Hue Lightstrip'));
 if(added.length!==2)throw Error('Es fehlen Schlafzimmer-Lichtbereiche.');
 const originalBindings=new Map(getConfig().model?.floorplan?.objects.map(o=>[o.id,o.entityId])??[]);
 const merged=mergeFloorplan(getConfig(),original);
 for(const o of merged.model!.floorplan!.objects)if(originalBindings.has(o.id)&&originalBindings.get(o.id)!==o.entityId)throw Error('Bestehende Zuordnung verändert');
 added.forEach((o,i)=>{o.entityId=`light.bedroom_preview_${i}`;});
 const config=mergeFloorplan({location:{latitude:0,longitude:0},lights:[]},manifest);
 const ctx=createScene(document.querySelector('canvas')!,{enableGlow:true,preserveDrawingBuffer:true});
 const model=await loadModel(ctx.scene,blob,undefined,{showTextures:true,edgeRendering:false});
 const meshes:MeshMap={};
 for(const o of added){if(!model.meshes.some(m=>floorplanId(m)===o.id))throw Error('Geometrie fehlt: '+o.label);}
 for(const l of config.lights.filter(l=>l.entityId.startsWith('light.bedroom_preview_'))){meshes[l.entityId]=createLightMesh(ctx.scene,l,l.entityId,{withPointLight:true,shadowCasters:model.shadowCasters,shadowResolution:256});}
 bindFloorplanMeshes(ctx.scene,model.meshes,config,meshes);
 for(const entry of Object.values(meshes)){entry.touchIconMesh?.setEnabled(false);entry.hitboxMesh?.setEnabled(false);}
 configureFloorplanLightInfluence(ctx.scene,Object.values(meshes).map(m=>m.floorplanRig!),model.meshes);
 const select=document.querySelector<HTMLSelectElement>('#select')!;
 for(const o of added)select.add(new Option(o.label,o.entityId));
 const update=()=>{for(const [i,o] of added.entries()){
  const l=config.lights.find(l=>l.entityId===o.entityId)!, entry=meshes[o.entityId];
  entry.mat.emissiveColor.copyFrom(applyFloorplanLightState(entry.floorplanRig!,l,{entity_id:l.entityId,state:select.value==='all'||select.value===l.entityId?'on':'off',attributes:{brightness:200,rgb_color:[255,190,110]}}));
 }};select.onchange=update;update();
 ctx.scene.fogEnabled=false;ctx.hemiLight.intensity=.15;ctx.sunLight.intensity=.05;
 ctx.camera.lowerRadiusLimit=.3;ctx.camera.fov=1;ctx.camera.setTarget(new Vector3(-6.4,1.05,1.25));ctx.camera.alpha=2.42;ctx.camera.beta=1.2;ctx.camera.radius=2.8;
 ctx.engine.runRenderLoop(()=>ctx.scene.render());window.addEventListener('resize',()=>ctx.engine.resize());
 status.textContent='Schlafzimmer v77 · Prüfung bestanden';report.textContent=added.map(o=>`${o.label}: ${o.emitters!.length} Quellen`).join('\n')+'\nBestehende Zuordnungen bleiben erhalten.';
 const button=document.querySelector<HTMLButtonElement>('#import')!;button.disabled=false;button.onclick=async()=>{
  button.disabled=true;
  try{
   const before=getConfig().model?.floorplan?.objects??[];
   const proposed=mergeFloorplan(getConfig(),original).model!.floorplan!.objects;
   if(before.some(o=>!proposed.some(n=>n.id===o.id&&n.entityId===o.entityId)))throw Error('Zuordnungen würden verändert');
   await uploadModel(blob);
   const saved=getConfig().model!.floorplan!;
   if(before.some(o=>!saved.objects.some(n=>n.id===o.id&&n.entityId===o.entityId)))throw Error('Zuordnung nach Import abweichend');
   status.textContent=`v77 importiert · ${saved.objects.length} Objekte`;
   report.textContent=`Alle ${before.length} bisherigen Objektzuordnungen unverändert.\n${before.filter(o=>o.entityId).length} belegte Entities erhalten.\nZwei neue Schlafzimmer-Strips frei zuordenbar.`;
   button.textContent='Import erfolgreich';
  }catch(e){status.textContent='Import fehlgeschlagen: '+String(e);button.disabled=false;}
 };
}catch(e){status.textContent='Prüfung fehlgeschlagen';report.textContent=String(e);console.error(e);}
