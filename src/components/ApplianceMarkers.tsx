import { setMarkerStyle } from '../babylon/MarkerProjection';
import { useMapMarkers, useMarkerPlacement } from './useMapMarkers';
import {useEffect,useRef,useState} from 'react';
import {WashingMachine,Pencil,X} from 'lucide-react';
import {Vector3,type Scene} from '@babylonjs/core';
import type {AppConfig,HAState} from '../types';
import {applianceRunning,applianceRemaining} from '../babylon/ApplianceAnimation';
import {floorplanId} from '../babylon/FloorplanBindings';
import './ApplianceMarkers.css';
import { useEntityStatesVersion } from '../services/entityStateSignal';

export function applianceDetail(state?:HAState):string {
 if(!state||['unknown','unavailable'].includes(state.state))return '';
 const unit=String(state.attributes.unit_of_measurement??'');
 return `${state.state.replace(/_/g,' ')}${unit?' '+unit:''}`;
}
export default function ApplianceMarkers({scene,config,states,connected,onAssign}:{scene:Scene;config:AppConfig;states:Record<string,HAState>;connected:boolean;onAssign:(id:string)=>void}){
  useEntityStatesVersion(); // re-render on state changes (see entityStateSignal)
 const refs=useRef<Record<string,HTMLButtonElement|null>>({});
 const popup=useRef<HTMLElement|null>(null);
 const [open,setOpen]=useState<string|null>(null);
 const objects=config.model?.floorplan?.objects.filter(o=>o.appliance)??[];
 useEffect(()=>{
  const outside=(e:PointerEvent)=>{if(!popup.current?.contains(e.target as Node)&&!Object.values(refs.current).some(el=>el?.contains(e.target as Node)))setOpen(null);};
  const escape=(e:KeyboardEvent)=>{if(e.key==='Escape')setOpen(null);};
  document.addEventListener('pointerdown',outside);document.addEventListener('keydown',escape);
  return()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',escape);};
 },[]);
 // Washer and dryer remain accessible through walls and furniture.
 const markers=useMapMarkers(scene,()=>objects.map(o=>{
  const mesh=scene.meshes.find(m=>floorplanId(m)===o.id&&m.getTotalVertices()>0);
  const fallback=new Vector3(o.position.x,o.position.y,o.position.z).scale(config.model?.scale??1);
  return {id:o.id,element:()=>refs.current[o.id],display:'flex',stack:{group:'appliance',width:32,height:32},
   anchor:(out:Vector3)=>out.copyFrom(mesh?.getBoundingInfo().boundingBox.centerWorld??fallback)};
 }),[config]);
 useMarkerPlacement(scene,markers,open,({x,y})=>{
  const panel=popup.current;if(!panel)return;
  setMarkerStyle(panel,'left',`${Math.max(8,Math.min(window.innerWidth-panel.offsetWidth-8,x+24))}px`);
  setMarkerStyle(panel,'top',`${Math.max(8,Math.min(window.innerHeight-panel.offsetHeight-8,y-panel.offsetHeight/2))}px`);
 });
 return <>{objects.map(o=>{
  const a=o.appliance!,running=connected&&applianceRunning(a,states[o.entityId]);
  const rest=connected?applianceRemaining(states[a.remainingEntityId??'']):'';
  const program=connected?applianceDetail(states[a.programEntityId??'']):'';
  const ready=connected&&states[o.entityId]?.state==='off';
  const status=!o.entityId?'Noch nicht zugeordnet':!connected?'Nicht verbunden':running?'Läuft':ready?'Bereit / aus':'Kein Betriebssignal';
  return <div key={o.id}>
   <button className={`appliance-marker ${running?'is-running':ready?'is-ready':'is-unknown'} ${open===o.id?'is-open':''}`} ref={el=>{refs.current[o.id]=el;}} onClick={()=>setOpen(open===o.id?null:o.id)} aria-label={`${o.label} anzeigen`} aria-expanded={open===o.id} aria-haspopup="dialog" title={`${o.label} · ${status}`}>
    <WashingMachine size={18}/>{!o.entityId&&<span className="appliance-plus">+</span>}
   </button>
   {open===o.id&&<section className="appliance-popup" ref={popup} role="dialog" aria-label={o.label}>
    <header><WashingMachine size={18}/><strong>{o.label}</strong><button aria-label="Zuordnung bearbeiten" title="Zuordnung bearbeiten" onClick={()=>{setOpen(null);onAssign(o.id);}}><Pencil size={15}/></button><button aria-label="Geräteinfo schließen" onClick={()=>setOpen(null)}><X size={17}/></button></header>
    <div className={`appliance-status ${running?'is-running':''}`}><span/>{status}</div>
    <dl><dt>Raum</dt><dd>{o.room||'–'}</dd>
     {a.remainingEntityId&&<><dt>Restzeit</dt><dd>{rest||'Nicht verfügbar'}</dd></>}
     {a.programEntityId&&<><dt>Waschprogramm</dt><dd>{program||'Nicht verfügbar'}</dd></>}
    </dl>
    {!o.entityId&&<button className="appliance-assign" onClick={()=>{setOpen(null);onAssign(o.id);}}>Betriebssensor zuordnen</button>}
    <details><summary>Entitäten</summary><p>{o.entityId||'Nicht zugeordnet'}</p>{a.remainingEntityId&&<p>{a.remainingEntityId}</p>}{a.programEntityId&&<p>{a.programEntityId}</p>}</details>
   </section>}
  </div>;
 })}</>;
}
