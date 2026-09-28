import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ArcRotateCamera, Engine, HemisphericLight, Scene, Vector3 } from '@babylonjs/core';
import { loadModel } from '../src/babylon/ModelLoader';
import { bindFloorplanMeshes } from '../src/babylon/FloorplanBindings';
import { readFloorplanManifest, applyFloorplanMappings } from '../src/services/floorplanImport';
import CoffeeMarkers from '../src/components/CoffeeMarkers';
import VisualMatchingGuide from '../src/components/VisualMatchingGuide';
import type { AppConfig, HAState } from '../src/types';

const canvas = document.querySelector<HTMLCanvasElement>('#scene')!;
const engine = new Engine(canvas, true), scene = new Scene(engine);
const camera = new ArcRotateCamera('camera', Math.PI / 2, .8, 3.2, new Vector3(-6.4, 1, 3.65), scene);
camera.attachControl(canvas, true);
new HemisphericLight('sun', new Vector3(0, 1, 0), scene).intensity = 1.4;
engine.runRenderLoop(() => scene.render()); window.addEventListener('resize', () => engine.resize());
const blob = await (await fetch('../.qa/coffee-v97.glb')).blob();
const manifest = (await readFloorplanManifest(blob))!;
const initial = applyFloorplanMappings({ lights: [], location: { latitude: 0, longitude: 0 } }, manifest);
const model = await loadModel(scene, blob, undefined, { showTextures: true });
bindFloorplanMeshes(scene, model.meshes, initial, {});
const machine = manifest.objects.find(o => o.coffee)!;
const c = machine.coffee!;
const programs = ['espresso', 'coffee', 'cappuccino', 'latte_macchiato', 'hot_water'].map(p => 'consumer_products_coffee_maker_program_beverage_' + p);
const state = (entity_id: string, value: string, attributes: Record<string, unknown> = {}): HAState => ({entity_id,state:value,attributes,last_changed:new Date(Date.now()-30000).toISOString(),last_updated:new Date().toISOString()});
function QA() {
  const [config,setConfig] = useState<AppConfig>(initial);
  const [open,setOpen] = useState<string|null>(machine.id), [matching,setMatching] = useState<string|null>(null);
  const [connected,setConnected] = useState(true), [note,setNote] = useState('Simulation · keine echten HA-Befehle');
  const [states,setStates] = useState<Record<string,HAState>>({
    [machine.entityId]:state(machine.entityId,'on'),[c.statusEntityId]:state(c.statusEntityId,'ready'),
    [c.connectivityEntityId]:state(c.connectivityEntityId,'on'),[c.localControlEntityId]:state(c.localControlEntityId,'off'),
    [c.remoteStartEntityId]:state(c.remoteStartEntityId,'on'),[c.stopEntityId]:state(c.stopEntityId,'unknown'),
    [c.activeProgramEntityId]:state(c.activeProgramEntityId,'unknown',{options:programs}),
  });
  scene.onPointerPick = (_event,pick) => {
    if(pick.pickedMesh?.metadata?.smartDeviceId === 'blender:'+machine.id) setOpen(machine.id);
  };
  return <><nav style={{position:'fixed',top:12,left:12,padding:16,background:'#14212ef2',borderRadius:12,maxWidth:300}}>
    <strong>Kaffeemaschine · Prüfung</strong><p>{note}</p>
    <button onClick={()=>setConnected(v=>!v)}>Verbindung wechseln</button>
    <button onClick={()=>setStates(s=>({...s,[c.remoteStartEntityId]:state(c.remoteStartEntityId,s[c.remoteStartEntityId].state==='on'?'off':'on')}))}>Fernstart wechseln</button>
    <button onClick={()=>setMatching(machine.id)}>Kaffee-Wizard</button>
  </nav>
  {!matching && <CoffeeMarkers scene={scene} config={config} states={states} connected={connected} open={open} onOpen={setOpen} onAssign={setMatching} onCommand={async(domain,service,entityId,data)=>{
    setNote(`Simuliert: ${domain}.${service} · ${entityId}`);
    setStates(s=> {
      if(service==='select_option') return {...s,[c.activeProgramEntityId]:state(c.activeProgramEntityId,String(data?.option),{options:programs}),[c.statusEntityId]:state(c.statusEntityId,'run'),[c.remainingEntityId]:state(c.remainingEntityId,new Date(Date.now()+90000).toISOString(),{device_class:'timestamp'}),[c.progressEntityId]:state(c.progressEntityId,'25')};
      if(service==='press') return {...s,[c.statusEntityId]:state(c.statusEntityId,'ready')};
      return {...s,[machine.entityId]:state(machine.entityId,service==='turn_on'?'on':'off')};
    });
  }}/>}
  {matching && <VisualMatchingGuide scene={scene} initialConfig={config} objectId={matching} category="other" onClose={()=>setMatching(null)} onSave={setConfig} loadInventory={async()=>({entities:[{entity_id:machine.entityId,friendly_name:machine.label}],lightTypes:{},note:'Simulation; keine Einstellungen gespeichert.'})}/>}
  </>;
}
createRoot(document.getElementById('root')!).render(<QA/>);
