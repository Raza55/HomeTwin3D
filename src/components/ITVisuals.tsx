import { createITMaterialUpdater } from '../babylon/ITMaterialUpdates';
import { useEffect, useRef } from 'react';
import { PBRMaterial, StandardMaterial, type Scene } from '@babylonjs/core';
import type { AppConfig, HAState } from '../types';
import { itStatus } from '../services/itState';
import { attachITCamera } from '../babylon/ITCameraScreen';
import { useEntityStatesVersion } from '../services/entityStateSignal';

const RGB_STEP_MS=750;

/** Clone only dedicated screen/LED materials, preserving shared furniture. */
export default function ITVisuals({scene,config,states,connected}: {scene:Scene;config:AppConfig;states:Record<string,HAState>;connected:boolean}) {
  useEntityStatesVersion(); // re-render on state changes (see entityStateSignal)
  const live=useRef({states,connected});live.current={states,connected};
  useEffect(()=>{
    const targets=(config.model?.floorplan?.objects??[]).flatMap(o=>(o.it?.devices??[]).flatMap(device=>scene.meshes.flatMap(mesh=>{
      const original=mesh.metadata?.originalMaterial??mesh.material;
      if(!(original instanceof PBRMaterial||original instanceof StandardMaterial))return [];
      const rgb=device.rgbMaterials?.includes(original.name),screen=device.screenMaterials?.includes(original.name);
      if(!rgb&&!screen)return [];
      const material=original.clone(`${original.name}:it:${mesh.uniqueId}`)!;
      const before=mesh.material,oldId=mesh.metadata?.itFloorplanId;
      mesh.metadata={...mesh.metadata,originalMaterial:material,itFloorplanId:o.id};
      if(mesh.material===original)mesh.material=material;
      const wasPickable=mesh.isPickable;mesh.isPickable=true;
      const color=(original instanceof PBRMaterial?original.albedoColor:original.diffuseColor).clone();
      if(screen && material instanceof PBRMaterial){material.emissiveTexture=material.albedoTexture;material.emissiveIntensity=.65;}
      if(screen && material instanceof StandardMaterial)material.emissiveTexture=material.diffuseTexture;
      const camera=screen&&device.screenshotEntityId?attachITCamera(scene,mesh,material,device,()=>live.current):undefined;
      const zone=original.name.includes('Kuehlmittel')?40:original.name.includes('RAM_Tuerkis')?-20:0;
      const update=createITMaterialUpdater(material,!!rgb,color,zone);
      return [{mesh,original,before,material,device,oldId,wasPickable,camera,update}];
    })));
    const start=performance.now();
    const devices=[...new Set(targets.map(t=>t.device))];
    const status=new Map<(typeof targets)[number]['device'],{state:string|undefined;connected:boolean;on:boolean}>();
    const observer=scene.onBeforeRenderObservable.add(()=>{
      const current=live.current;
      // Dashboard replaces individual entities in the same states object.
      for(const device of devices){
        const state=current.states[device.statusEntityId??'']?.state,previous=status.get(device);
        if(!previous || previous.state!==state || previous.connected!==current.connected)
          status.set(device,{state,connected:current.connected,on:itStatus(device,current.states,current.connected)==='on'});
      }
      // The RGB cycle is slow (80 s per turn). Advancing it in 3.4° steps instead of every
      // frame leaves identical frames in between, so the idle dashboard can skip them.
      const elapsed=Math.floor((performance.now()-start)/RGB_STEP_MS)*RGB_STEP_MS;
      for(const t of targets){
        if(t.mesh.isDisposed())continue;
        const on=status.get(t.device)?.on??false;
        t.update(on,elapsed,t.camera?on&&t.camera.ready():undefined);
      }
    });
    return()=>{scene.onBeforeRenderObservable.remove(observer);for(const t of targets){
      if(!t.mesh.isDisposed()){
        if(t.mesh.material===t.material)t.mesh.material=t.before;
        t.mesh.metadata.originalMaterial=t.original;t.mesh.metadata.itFloorplanId=t.oldId;t.mesh.isPickable=t.wasPickable;
      }t.camera?.dispose();t.material.dispose(false,false);
    }};
  },[scene,config]);
  return null;
}
