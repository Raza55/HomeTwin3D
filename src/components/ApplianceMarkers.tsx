import { getMarkerProjection, setMarkerStyle } from '../babylon/MarkerProjection';
import {useEffect,useRef,useState} from 'react';
import {WashingMachine,Pencil,X} from 'lucide-react';
import {Vector3,type Scene} from '@babylonjs/core';
import type {AppConfig,HAState} from '../types';
import {applianceRunning,applianceRemaining} from '../babylon/ApplianceAnimation';
import {floorplanId} from '../babylon/FloorplanBindings';
import './ApplianceMarkers.css';

export function applianceDetail(state?:HAState):string {
 if(!state||['unknown','unavailable'].includes(state.state))return '';
 const unit=String(state.attributes.unit_of_measurement??'');
 return `${state.state.replace(/_/g,' ')}${unit?' '+unit:''}`;
}
export default function ApplianceMarkers({scene,config,states,connected,onAssign}:{scene:Scene;config:AppConfig;states:Record<string,HAState>;connected:boolean;onAssign:(id:string)=>void}){
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
 useEffect(()=>{
  const targets=objects.map(o=>({o,mesh:scene.meshes.find(m=>floorplanId(m)===o.id&&m.getTotalVertices()>0)}));
  const observer=scene.onAfterRenderObservable.add(()=>{
   const projection = getMarkerProjection(scene); if (!projection) return;
   const { rect, width: w, height: h } = projection;
   const placed: Array<{x:number;y:number;height:number}>=[];
   for(const {o,mesh} of targets){
    const el=refs.current[o.id];if(!el)continue;
    const center=mesh?.getBoundingInfo().boundingBox.centerWorld??new Vector3(o.position.x,o.position.y,o.position.z).scale(config.model?.scale??1);
    // Washer and dryer remain accessible through walls and furniture.
    const p=projection.project(center);
    setMarkerStyle(el, 'display', p.z<0||p.z>1||p.x<0||p.x>w||p.y<0||p.y>h?'none':'flex');
    const x=rect.left+p.x/w*rect.width,height=32;
    let y=rect.top+p.y/h*rect.height;
    for(const prior of placed)if(Math.abs(x-prior.x)<38&&Math.abs(y-prior.y)<(height+prior.height)/2+6)y=prior.y+(height+prior.height)/2+6;
    placed.push({x,y,height});
    setMarkerStyle(el, 'left', `${x}px`);setMarkerStyle(el, 'top', `${y}px`);
    if(o.id===open&&popup.current){
     const panel=popup.current;
     setMarkerStyle(panel, 'left', `${Math.max(8,Math.min(window.innerWidth-panel.offsetWidth-8,x+24))}px`);
     setMarkerStyle(panel, 'top', `${Math.max(8,Math.min(window.innerHeight-panel.offsetHeight-8,y-panel.offsetHeight/2))}px`);
    }
   }
  });return()=>{scene.onAfterRenderObservable.remove(observer);};
 },[scene,config,open]);
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
