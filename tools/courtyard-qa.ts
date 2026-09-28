import {Vector3,Camera} from '@babylonjs/core';
import {createScene} from '../src/babylon/SceneManager';
import {loadModel} from '../src/babylon/ModelLoader';
import {readFloorplanManifest} from '../src/services/floorplanImport';
import {createParkEnvironment} from '../src/babylon/ParkEnvironment';
import {findFrontFacade} from '../src/babylon/SiteLayout';
const status=document.querySelector('#status')!;
try{
 const blob=await(await fetch('../.qa/v84.glb')).blob();
 const manifest=(await readFloorplanManifest(blob))!;
 const ctx=createScene(document.querySelector('canvas')!,{preserveDrawingBuffer:true});
 const model=await loadModel(ctx.scene,blob,undefined,{showTextures:true,edgeRendering:false});
 const covers=manifest.objects.filter(o=>o.domain==='cover');
 createParkEnvironment(ctx.scene,model.center,model.size,Math.min(...covers.map(o=>o.position.x))-.12,findFrontFacade(covers));
 ctx.scene.metadata.sunAltitudeDeg=40;ctx.scene.fogEnabled=false;
 ctx.sunLight.direction=new Vector3(.4,-1,.4);ctx.sunLight.intensity=.7;ctx.hemiLight.intensity=.55;
 ctx.camera.lowerRadiusLimit=.1;ctx.camera.upperRadiusLimit=500;ctx.camera.lowerBetaLimit=.01;ctx.camera.maxZ=600;ctx.camera.fov=.9;
 const details=ctx.scene.metadata.courtyard;
 const view=(target:Vector3,alpha:number,beta:number,radius:number)=>{ctx.camera.mode=Camera.PERSPECTIVE_CAMERA;ctx.camera.setTarget(target);ctx.camera.alpha=alpha;ctx.camera.beta=beta;ctx.camera.radius=radius;};
 document.querySelector<HTMLButtonElement>('#grove')!.onclick=()=>view(details.benchCenter.add(new Vector3(-4,0,0)),0,.55,20);
 document.querySelector<HTMLButtonElement>('#play')!.onclick=()=>view(details.playCenter.add(new Vector3(0,1,0)),.25,1.3,23);
 document.querySelector<HTMLButtonElement>('#play-benches')!.onclick=()=>view(details.playBenchCenter.add(new Vector3(0,.5,0)),-.5,.45,15);
 document.querySelector<HTMLButtonElement>('#top')!.onclick=()=>view(details.treeCenter.add(new Vector3(4,0,12)),.6,.3,65);
 const ref=ctx.scene.metadata.siteReference,n=ref.north,s=ref.south;
 document.querySelector<HTMLButtonElement>('#north-plan')!.onclick=()=>{
  view(new Vector3(model.center.x+(n[0]+s[0])/2,details.treeCenter.y,model.center.z+(n[1]+s[1])/2),Math.atan2(s[1]-n[1],s[0]-n[0]),.01,250);
  const half=Math.hypot(s[0]-n[0],s[1]-n[1])*.56,aspect=ctx.engine.getRenderWidth()/ctx.engine.getRenderHeight();
  ctx.camera.mode=Camera.ORTHOGRAPHIC_CAMERA;ctx.camera.orthoTop=half;ctx.camera.orthoBottom=-half;ctx.camera.orthoLeft=-half*aspect;ctx.camera.orthoRight=half*aspect;
 };
 document.querySelector<HTMLButtonElement>('#grove')!.click();
 status.textContent=`${details.planeTreeCount} Platanen · ${details.ventBenchCount} Lüftungsbänke · Sandspielplatz · Strauchgruppen`;
 ctx.engine.runRenderLoop(()=>ctx.scene.render());window.addEventListener('resize',()=>ctx.engine.resize());
}catch(e){status.textContent=String(e);console.error(e);}
