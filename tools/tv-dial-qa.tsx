import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {ArcRotateCamera,Engine,HemisphericLight,Scene,Vector3} from '@babylonjs/core';
import {loadModel} from '../src/babylon/ModelLoader';
import {getModelBlob} from '../src/services/configApi';
import TVDialControl from '../src/components/TVDialControl';
import {TV_DIAL_AUTOMATION,TV_DIAL_CHOICES} from '../src/services/tvDial';
import {LIVING_ROOM_TV} from '../src/services/tvMedia';
import type {HAState} from '../src/types';
const canvas=document.querySelector<HTMLCanvasElement>('#scene')!,engine=new Engine(canvas,true),scene=new Scene(engine);
const camera=new ArcRotateCamera('preview',Math.PI/2,1.1,3,new Vector3(-7,1.3,7),scene);camera.attachControl(canvas,true);
new HemisphericLight('sun',new Vector3(0,1,0),scene).intensity=.8;
engine.runRenderLoop(()=>scene.render());window.addEventListener('resize',()=>engine.resize());
await loadModel(scene,(await getModelBlob())!,undefined,{showTextures:true});
const screen=scene.meshes.find(m=>/Fernseher_Bildschirm/.test(m.name)&&m.getTotalVertices()>0);
if(screen){screen.computeWorldMatrix(true);camera.setTarget(screen.getBoundingInfo().boundingBox.centerWorld);}
const state=(entity_id:string,value:string,attributes={}):HAState=>({entity_id,state:value,attributes,last_changed:'',last_updated:''});
function QA(){
  const [connected,setConnected]=useState(true),[fail,setFail]=useState(false),[requests,setRequests]=useState<string[]>([]);
  const [states,setStates]=useState({[TV_DIAL_AUTOMATION]:state(TV_DIAL_AUTOMATION,'on'),[LIVING_ROOM_TV.television]:state(LIVING_ROOM_TV.television,'on'),[LIVING_ROOM_TV.receiver]:state(LIVING_ROOM_TV.receiver,'on',{source:'SHIELD Media'})});
  return <><nav>Simulation · keine Geräte werden geschaltet<br/><button onClick={()=>setConnected(v=>!v)}>Verbindung wechseln</button><button onClick={()=>setFail(v=>!v)}>Fehler {fail?'An':'Aus'}</button><p role="log">{requests.join(' → ')||'Noch kein Befehl'}</p></nav><TVDialControl scene={scene} states={states} connected={connected} onCommand={async request=>{if(fail)throw Error('Simulierter Verbindungsfehler');const choice=request.event_data.source;setRequests(v=>[...v,choice]);setStates(v=>({...v,[LIVING_ROOM_TV.television]:state(LIVING_ROOM_TV.television,choice==='aus'?'off':'on'),[LIVING_ROOM_TV.receiver]:state(LIVING_ROOM_TV.receiver,choice==='aus'?'off':'on',{source:TV_DIAL_CHOICES.find(c=>c.id===choice)?.source})}));}}/></>;
}
createRoot(document.getElementById('root')!).render(<QA/>);
