import {DynamicTexture,Frustum,PBRMaterial,StandardMaterial,type AbstractMesh,type Scene} from '@babylonjs/core';
import type {HAState,ITDevice} from '../types';
import {itStatus,knownITState} from '../services/itState';
import {itCameraUrl} from '../services/itCamera';
import {getSetting} from '../services/settingsStore';
import {buildWsUrl} from '../services/haWebSocket';
import {isLocalScreenImage} from './DisplayMeshFactory';

/** One reusable GPU texture per screen; no render-frame network requests. */
export function attachITCamera(scene:Scene,mesh:AbstractMesh,material:PBRMaterial|StandardMaterial,device:ITDevice,
  live:()=>{states:Record<string,HAState>;connected:boolean}) {
  const texture=new DynamicTexture(`pc-camera:${mesh.uniqueId}`,{width:1920,height:1080},scene,false);
  const ctx=texture.getContext();
  let disposed=false,loaded=false,request:HTMLImageElement|undefined,next=0,source='';
  let timeout:ReturnType<typeof setTimeout>|undefined;
  const clear=()=>{loaded=false;ctx.fillStyle='#000';ctx.fillRect(0,0,1920,1080);texture.update(false);};
  clear();
  if(material instanceof PBRMaterial){material.albedoTexture=texture;material.emissiveIntensity=.65;}
  else material.diffuseTexture=texture;
  material.emissiveTexture=texture;
  const cancel=()=>{clearTimeout(timeout);if(request){request.onload=null;request.onerror=null;request.src='';request=undefined;}};
  const allowed=()=>{
    const {states,connected}=live(),camera=states[device.screenshotEntityId!];
    return itStatus(device,states,connected)==='on'&&knownITState(camera);
  };
  const tick=()=>{
    if(disposed||mesh.isDisposed())return;
    if(!allowed()){cancel();if(loaded)clear();next=0;source='';return;}
    if(document.hidden||!mesh.isEnabled()||!mesh.isVisible||!scene.activeCamera||!mesh.isInFrustum(Frustum.GetPlanes(scene.getTransformMatrix()))){cancel();return;}
    const camera=live().states[device.screenshotEntityId!];
    const settings=getSetting('connection').haSettings;
    const base=settings.url?buildWsUrl(settings.url,settings.port).replace(/^ws/,'http'):'';
    // Day demo frames are generated in the page; they replace each other without a black flash.
    const local=isLocalScreenImage(camera?.attributes.entity_picture)?camera!.attributes.entity_picture as string:undefined;
    let url=local??itCameraUrl(camera?.attributes.entity_picture,device.screenshotEntityId!,base);
    if(!url){cancel();if(loaded)clear();return;}
    if(source!==url){cancel();if(!local)clear();source=url;next=0;}
    if(request||Date.now()<next)return;
    next=Date.now()+10000;  // matches the PC helper cadence (10 s)
    if(!local&&(import.meta.env.DEV||import.meta.env.MODE==='addon')){
      const upstream=new URL(url),prefix=import.meta.env.DEV?`${import.meta.env.BASE_URL}ha-camera/`:'/ha-camera/';
      url=new URL(`${prefix}${device.screenshotEntityId}${upstream.search}`,location.origin).href;
    }
    const refresh=new URL(url);if(!local)refresh.searchParams.set('_preview',String(Date.now()));
    const image=new Image();request=image;image.crossOrigin='anonymous';image.referrerPolicy='no-referrer';
    image.onload=()=>{
      if(disposed||request!==image)return;
      clearTimeout(timeout);request=undefined;
      if(!allowed())return;
      // Preserve the ultrawide image ratio in the underlying texture.
      const factor=Math.min(1,1920/image.naturalWidth,1080/image.naturalHeight);
      const width=Math.round(image.naturalWidth*factor),height=Math.round(image.naturalHeight*factor);
      const size=texture.getSize();if(size.width!==width||size.height!==height)texture.scaleTo(width,height);
      const context=texture.getContext();context.drawImage(image,0,0,width,height);
      texture.update(false);loaded=true;
    };
    image.onerror=()=>{if(request!==image)return;cancel();clear();};
    timeout=setTimeout(()=>{if(request===image){cancel();clear();}},12000);
    image.src=refresh.href;
  };
  const timer=setInterval(tick,1000);tick();
  return {ready:()=>loaded&&allowed(),dispose:()=>{disposed=true;clearInterval(timer);cancel();texture.dispose();}};
}
