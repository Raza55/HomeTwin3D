import React,{useState,useEffect} from 'react';
import {createRoot} from 'react-dom/client';
import {ArcRotateCamera,Engine,HemisphericLight,Scene,Vector3} from '@babylonjs/core';
import {loadModel} from '../src/babylon/ModelLoader';
import {getConfig,getModelBlob} from '../src/services/configApi';
import {getSetting} from '../src/services/settingsStore';
import {HAConnection} from '../src/services/haWebSocket';
import ITVisuals from '../src/components/ITVisuals';
import type {HAState} from '../src/types';
const canvas=document.querySelector<HTMLCanvasElement>('#scene')!,engine=new Engine(canvas,true),scene=new Scene(engine);
const camera=new ArcRotateCamera('preview',-Math.PI/2,1.25,1.9,new Vector3(-10,1.2,3),scene);camera.attachControl(canvas,true);
new HemisphericLight('sun',new Vector3(0,1,0),scene).intensity=.8;
engine.runRenderLoop(()=>scene.render());window.addEventListener('resize',()=>engine.resize());
const config=getConfig();await loadModel(scene,(await getModelBlob())!,undefined,{showTextures:true});
const screen=scene.meshes.find(m=>m.material?.name==='SZ_monitor');
if(screen){screen.computeWorldMatrix(true);camera.setTarget(screen.getBoundingInfo().boundingBox.centerWorld);}
function QA(){
  const [states,setStates]=useState<Record<string,HAState>>({}),[connected,setConnected]=useState(false),[off,setOff]=useState(false);
  useEffect(()=>{const connection=new HAConnection(getSetting('connection').haSettings,{
    onInitialStates:all=>setStates(Object.fromEntries(all.map(s=>[s.entity_id,s]))),
    onStateChanged:(id,s)=>setStates(v=>({...v,[id]:s})),onStatusChanged:s=>setConnected(s==='connected'),
  });connection.connect();return()=>connection.dispose();},[]);
  const visible={...states};if(off&&visible['switch.desktop_main_power'])visible['switch.desktop_main_power']={...visible['switch.desktop_main_power'],state:'off'};
  return <><nav>DesktopMain · {off?'Aus simuliert':'Live-Bild'} · {connected?'HA verbunden':'Verbinde …'}<br/><button onClick={()=>setOff(v=>!v)}>An/Aus simulieren</button><small> Keine PC-Schaltbefehle</small></nav><ITVisuals scene={scene} config={config} states={visible} connected={connected}/></>;
}
createRoot(document.getElementById('root')!).render(<QA/>);
