import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {ArcRotateCamera,Engine,HemisphericLight,Scene,Vector3} from '@babylonjs/core';
import {loadModel} from '../src/babylon/ModelLoader';
import {readFloorplanManifest,applyFloorplanMappings} from '../src/services/floorplanImport';
import ITMarkers from '../src/components/ITMarkers';
import ITVisuals from '../src/components/ITVisuals';
import type {HAState} from '../src/types';
const canvas=document.querySelector<HTMLCanvasElement>('#scene')!,engine=new Engine(canvas,true),scene=new Scene(engine);
const camera=new ArcRotateCamera('camera',-.45,.85,4,new Vector3(-10,1,3),scene);camera.attachControl(canvas,true);
new HemisphericLight('sun',new Vector3(0,1,0),scene).intensity=1.3;
engine.runRenderLoop(()=>scene.render());window.addEventListener('resize',()=>engine.resize());
const blob=await(await fetch('../.qa/it-v98.glb')).blob(),manifest=(await readFloorplanManifest(blob))!;
const initial=applyFloorplanMappings({lights:[],location:{latitude:0,longitude:0}},manifest);
await loadModel(scene,blob,undefined,{showTextures:true});
const objects=manifest.objects.filter(o=>o.it),desktop_main=objects.find(o=>o.label==='DesktopMain PC')!;
const s=(entity_id:string,state:string,unit=''):HAState=>({entity_id,state,attributes:{unit_of_measurement:unit},last_changed:new Date().toISOString(),last_updated:new Date().toISOString()});
const starting:Record<string,HAState>={};
for(const o of objects)for(const d of o.it!.devices){
  if(d.statusEntityId)starting[d.statusEntityId]=s(d.statusEntityId,d.id==='desktop_secondary'?'off':d.kind==='host'?'home':'on');
  for(const m of d.metrics)if(m.entityId)starting[m.entityId]=s(m.entityId,m.format==='uptime'?'2026-09-26T12:00:00Z':m.key==='status'?'warning':m.key==='ram'?'37.5':'24',m.format==='uptime'||m.key==='status'?'':m.label.includes('Temperatur')?'°C':'%');
  for(const a of d.actions)if(a.entityId&&!starting[a.entityId])starting[a.entityId]=s(a.entityId,a.kind==='button'?'unknown':'on');
}
function QA(){
  const [config,setConfig]=useState(initial),[states,setStates]=useState(starting),[open,setOpen]=useState<string|null>(null),[connected,setConnected]=useState(true),[note,setNote]=useState('Simulation · keine echten HA-Befehle');
  return <><nav style={{position:'fixed',top:8,left:8,padding:10,background:'#102331ed',maxWidth:330}}><p>{note}</p>
    {objects.map(o=><button key={o.id} onClick={()=>setOpen(o.id)}>{o.label}</button>)}
    <button onClick={()=>setConnected(v=>!v)}>Verbindung wechseln</button><button onClick={()=>setStates(v=>({...v,'switch.desktop_main_power':s('switch.desktop_main_power',v['switch.desktop_main_power'].state==='on'?'off':'on')}))}>DesktopMain-Status wechseln</button><button onClick={()=>{camera.setTarget(new Vector3(-10.1,.45,3));camera.alpha=-1.2;camera.beta=1.4;camera.radius=2.5;setOpen(null);}}>PC-Detail</button>
  </nav><ITVisuals scene={scene} config={config} states={states} connected={connected}/><ITMarkers scene={scene} config={config} states={states} connected={connected} open={open} onOpen={setOpen} onSave={(id,it)=>{setConfig(v=>{const c=structuredClone(v);c.model!.floorplan!.objects.find(o=>o.id===id)!.it=it;return c;});setNote('Zuordnung in Simulation gespeichert');}} onCommand={async(domain,service,id)=>{setNote(`Simuliert: ${domain}.${service} · ${id}`);if(domain==='switch')setStates(v=>({...v,[id]:s(id,service==='turn_on'?'on':'off')}));}}/></>;
}
createRoot(document.getElementById('root')!).render(<QA/>);
