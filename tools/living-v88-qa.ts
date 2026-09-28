import { Vector3 } from '@babylonjs/core';
import { createScene } from '../src/babylon/SceneManager';
import { loadModel } from '../src/babylon/ModelLoader';
import { readFloorplanManifest, mergeFloorplan } from '../src/services/floorplanImport';
import { getConfig, uploadModel } from '../src/services/configApi';
const status=document.querySelector('#status')!,report=document.querySelector('#report')!;
try{
 const blob=await(await fetch('../.qa/v88.glb')).blob(),manifest=(await readFloorplanManifest(blob))!;
 const ctx=createScene(document.querySelector('canvas')!,{preserveDrawingBuffer:true});
 await loadModel(ctx.scene,blob,undefined,{showTextures:true,edgeRendering:false});
 ctx.scene.fogEnabled=false;ctx.hemiLight.intensity=.85;ctx.sunLight.intensity=1.1;
 ctx.camera.lowerRadiusLimit=.3;
 const view=(target:number[],alpha:number,beta:number,radius:number)=>{ctx.camera.setTarget(Vector3.FromArray(target));ctx.camera.alpha=alpha;ctx.camera.beta=beta;ctx.camera.radius=radius;};
 document.querySelector<HTMLButtonElement>('#living')!.onclick=()=>view([-9.1,.65,7.4],-.55,.55,7.6);
 document.querySelector<HTMLButtonElement>('#lamp')!.onclick=()=>view([-10.43,.78,7.38],.5,1.13,2.6);
 document.querySelector<HTMLButtonElement>('#bed')!.onclick=()=>view([-8,.05,1.8],2.1,.35,7);
 document.querySelector<HTMLButtonElement>('#child')!.onclick=()=>view([-4,.05,8],2.1,.3,7);
 document.querySelector<HTMLButtonElement>('#living')!.click();
 ctx.engine.runRenderLoop(()=>ctx.scene.render());window.addEventListener('resize',()=>ctx.engine.resize());
 status.textContent='v88 geladen · Sofa, Essgruppe, Stehlampe und Holzböden';
 report.textContent=`${manifest.objects.length} zuordenbare Objekte · ${ctx.scene.animationGroups.length} Animationen`;
 const button=document.querySelector<HTMLButtonElement>('#import')!;button.disabled=false;
 button.onclick=async()=>{button.disabled=true;try{
  const before=getConfig(),bindings=before.model?.floorplan?.objects??[];
  const proposed=mergeFloorplan(before,manifest).model!.floorplan!.objects;
  if(bindings.some(o=>!proposed.some(n=>n.id===o.id&&n.entityId===o.entityId)))throw Error('Zuordnungen würden verändert');
  await uploadModel(blob);
  const after=getConfig();
  if(bindings.some(o=>!after.model!.floorplan!.objects.some(n=>n.id===o.id&&n.entityId===o.entityId)))throw Error('Zuordnung nach Import abweichend');
  status.textContent='v88 erfolgreich importiert';report.textContent=`${bindings.length} bisherige Objektzuordnungen erhalten.\n${bindings.filter(o=>o.entityId).length} belegte Entities unverändert.\nStehlampe steht zur Zuordnung bereit.`;button.textContent='Import erfolgreich';
 }catch(e){status.textContent=String(e);button.disabled=false;}};
}catch(e){status.textContent='Fehler: '+String(e);}
