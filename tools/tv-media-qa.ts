import { Vector3 } from '@babylonjs/core';
import { createScene } from '../src/babylon/SceneManager';
import { loadModel } from '../src/babylon/ModelLoader';
import { createLivingRoomTVDisplay } from '../src/babylon/LivingRoomTVDisplay';
import { updateDisplayTexture } from '../src/babylon/DisplayMeshFactory';
import { drawTVMediaScreen } from '../src/babylon/TVMediaScreen';
import { LIVING_ROOM_TV as route, resolveTVScreen } from '../src/services/tvMedia';
import type { HAState } from '../src/types';

const states:Record<string,HAState>={
  [route.television]:{entity_id:route.television,state:'on',attributes:{}},
  [route.receiver]:{entity_id:route.receiver,state:'on',attributes:{source:'SHIELD Media'}},
  [route.shield]:{entity_id:route.shield,state:'playing',attributes:{media_title:'Bist du glücklich in deinem Leben?',app_name:'Plex',media_position:316,media_duration:2775,media_position_updated_at:new Date().toISOString()}},
};
const poster=new Image();
poster.src='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="600" height="900"><defs><linearGradient id="g" x2="1" y2="1"><stop stop-color="#266363"/><stop offset="1" stop-color="#091321"/></linearGradient></defs><rect width="600" height="900" fill="url(#g)"/><circle cx="390" cy="250" r="155" fill="#d4b88d"/><path d="M0 650L200 380L550 900H0M240 900L480 500L600 650V900" fill="#182638"/><text x="60" y="800" fill="#eee" font-family="sans-serif" font-size="30">VORSCHAU · TESTCOVER</text></svg>');
await poster.decode();
let entry:ReturnType<typeof createLivingRoomTVDisplay>;
function redraw(){
  const content=resolveTVScreen(states,route);
  drawTVMediaScreen(document.querySelector<HTMLCanvasElement>('#screen')!.getContext('2d')!,content,content.kind==='shield'?poster:undefined);
  document.querySelector('#status')!.textContent=`${content.kind} · ${content.title} · ${content.status}`;
  if(entry)updateDisplayTexture(entry,states);
}
for(const [label,source] of [['SHIELD','SHIELD Media'],['PC','PC'],['PlayStation','Playststion'],['Andere Quelle','TV Audio'],['TV aus','off'],['Pausiert','paused'],['Offline','unavailable']]){
  const button=document.createElement('button');button.textContent=label;
  button.onclick=()=>{states[route.television].state=source==='off'?'off':source==='unavailable'?'unavailable':'on';states[route.receiver].attributes.source=source==='paused'?'SHIELD Media':source;states[route.shield].state=source==='paused'?'paused':'playing';redraw();};
  document.querySelector('#buttons')!.append(button);
}
redraw();
if(new URLSearchParams(location.search).has('model')) {
  const ctx=createScene(document.querySelector<HTMLCanvasElement>('#model')!,{enableGlow:false,preserveDrawingBuffer:true});
  const blob=await(await fetch('../.qa/hueplay-v93.glb')).blob();
  const model=await loadModel(ctx.scene,blob,undefined,{showTextures:true,edgeRendering:false});
  entry=createLivingRoomTVDisplay(ctx.scene,model.meshes);
  if(!entry)throw Error('TV screen not found');
  Object.assign(window,{tvQA:{entry,states,scene:ctx.scene}});
  ctx.scene.fogEnabled=false;ctx.hemiLight.intensity=.8;
  ctx.camera.lowerRadiusLimit=.3;ctx.camera.setTarget(new Vector3(-9.35,1.19,3.452));ctx.camera.alpha=Math.PI/2;ctx.camera.beta=Math.PI/2;ctx.camera.radius=2.5;
  ctx.engine.runRenderLoop(()=>ctx.scene.render());redraw();
} else document.querySelector('#model')!.remove();
