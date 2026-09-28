import {Vector3,MeshBuilder,StandardMaterial,Color3} from '@babylonjs/core';
import {createScene} from '../src/babylon/SceneManager';
import {loadModel} from '../src/babylon/ModelLoader';
import {getConfig,uploadModel} from '../src/services/configApi';
import {readFloorplanManifest,mergeFloorplan} from '../src/services/floorplanImport';
const status=document.querySelector('#status')!,report=document.querySelector('#report')!,button=document.querySelector<HTMLButtonElement>('#import')!;
try{
 const blob=await(await fetch('../.qa/hueplay-v92.glb')).blob(),manifest=(await readFloorplanManifest(blob))!;
 const ctx=createScene(document.querySelector('canvas')!,{preserveDrawingBuffer:true});
 await loadModel(ctx.scene,blob,undefined,{showTextures:true,edgeRendering:false});
 ctx.scene.fogEnabled=false;ctx.hemiLight.intensity=.9;ctx.sunLight.intensity=.8;
 ctx.camera.lowerRadiusLimit=.2;ctx.camera.setTarget(new Vector3(-10.83,1.95,6.9));ctx.camera.alpha=.1;ctx.camera.beta=.85;ctx.camera.radius=2.5;
 const lamp=manifest.objects.find(o=>o.id==='b249ce50-4a17-5b05-8d78-0710b43fa1be')!;
 const mark=MeshBuilder.CreateSphere('Positionsmarkierung',{diameter:.065},ctx.scene);mark.position.set(lamp.position.x,lamp.position.y+.13,lamp.position.z);
 const mat=new StandardMaterial('Positionsmarkierung',ctx.scene);mat.emissiveColor=new Color3(.2,.9,.7);mark.material=mat;
 ctx.engine.runRenderLoop(()=>ctx.scene.render());window.addEventListener('resize',()=>ctx.engine.resize());
 status.textContent='Hue Play oben hinter der Schrankdeko';report.textContent='Grüner Punkt: korrigierte Lichtposition';button.disabled=false;
 button.onclick=async()=>{button.disabled=true;try{
  const before=getConfig(),old=before.model?.floorplan?.objects??[],next=mergeFloorplan(before,manifest);
  if(old.filter(o=>o.id!=='7bd84ba8-5d43-546c-a9db-9382b4490098').some(o=>!next.model!.floorplan!.objects.some(n=>n.id===o.id&&n.entityId===o.entityId)))throw Error('Andere Zuordnungen würden verändert');
  localStorage.setItem('config:before-hueplay-v92',JSON.stringify(before));
  await uploadModel(blob);
  const lights=getConfig().lights.filter(o=>o.entityId==='light.hue_tv_right_top');
  if(lights.length!==1||lights[0].floorplanIds?.length!==1||Math.abs(lights[0].position.z-6.9)>.001)throw Error('Lichtposition nach Import abweichend');
  status.textContent='Erfolgreich in 3Dash importiert';report.textContent='Hue Play: eine Leuchte hinter der Deko\nAlle übrigen Entity-Zuordnungen erhalten';button.textContent='Import erfolgreich';
 }catch(e){status.textContent=String(e);button.disabled=false;}};
}catch(e){status.textContent=String(e);}
