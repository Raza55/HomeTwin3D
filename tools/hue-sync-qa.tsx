import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Engine, Scene, ArcRotateCamera, Vector3, MeshBuilder } from '@babylonjs/core';
import LightClusterMarkers from '../src/components/LightClusterMarkers';
import LightQuickControls from '../src/components/LightQuickControls';
import { HUE_SYNC_SWITCH, HUE_SYNC_AREA, isHueSyncLocked } from '../src/services/hueSync';
import type { AppConfig, HAState } from '../src/types';
import type { MeshMap } from '../src/babylon/LightMeshFactory';

const id = 'light.hue_tv_gradient';
const config = { lights: [{ entityId:id, label:'TV Gradient', position:{x:0,y:0,z:0} }] } as AppConfig;
function Preview() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [ctx,setCtx] = useState<{scene:Scene;meshes:MeshMap}|null>(null);
  const [sync,setSync] = useState(true), [open,setOpen] = useState(true), [calls,setCalls] = useState(0);
  const states:Record<string,HAState> = {
    [HUE_SYNC_SWITCH]:{entity_id:HUE_SYNC_SWITCH,state:sync?'on':'off',attributes:{}},
    [HUE_SYNC_AREA]:{entity_id:HUE_SYNC_AREA,state:'TV-Bereich 2',attributes:{}},
    [id]:{entity_id:id,state:'off',attributes:{mode:'streaming',supported_color_modes:['rgb','color_temp']}},
  };
  useEffect(()=>{
    const engine = new Engine(canvas.current!,true), scene = new Scene(engine);
    new ArcRotateCamera('camera',0,1,6,Vector3.Zero(),scene);
    const bulb = MeshBuilder.CreateSphere('bulb',{diameter:.01},scene);
    const icon = MeshBuilder.CreatePlane('icon',{size:.1},scene);
    setCtx({scene,meshes:{[id]:{bulb,touchIconMesh:icon}} as MeshMap});
    engine.runRenderLoop(()=>scene.render());
    return ()=>engine.dispose();
  },[]);
  return <main style={{fontFamily:'system-ui',background:'#17202e',color:'white',minHeight:'100vh',padding:24}}>
    <h1>Hue Sync · Vorschau</h1><p>Testdaten · keine Gerätebefehle</p>
    <button onClick={()=>setSync(s=>!s)}>Sync {sync?'ausschalten':'einschalten'}</button><p>{calls} Befehle</p>
    <canvas ref={canvas} width={400} height={250}/>
    {ctx&&<LightClusterMarkers {...ctx} config={config} states={states} onOpen={()=>setOpen(true)} onLeave={()=>{}}/>}
    {open&&<LightQuickControls label="TV Gradient" state={states[id]} connected syncLocked={isHueSyncLocked(id,states)} anchor={{x:440,y:210,pinned:false}} onClose={()=>setOpen(false)} onPin={()=>{}} onEnter={()=>{}} onLeave={()=>{}} onMore={()=>{}} onCommand={async()=>{setCalls(c=>c+1);}}/>}
  </main>;
}
createRoot(document.getElementById('root')!).render(<Preview/>);
