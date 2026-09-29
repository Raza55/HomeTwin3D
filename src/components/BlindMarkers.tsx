import { markerCenterToRef } from '../babylon/MarkerProjection';
import { useMapMarkers } from './useMapMarkers';
import {useRef} from 'react';
import {Blinds} from 'lucide-react';
import {Vector3,type Scene} from '@babylonjs/core';
import type {BlindMeshMap} from '../babylon/BlindMeshFactory';
import type {AppConfig,HAState} from '../types';
import {floorplanId} from '../babylon/FloorplanBindings';
import './LightClusterControls.css';
import './BlindQuickControls.css';
export default function BlindMarkers({scene,meshes,config,states,onAssign,onOpen}:{scene:Scene;meshes:BlindMeshMap;config:AppConfig;states:Record<string,HAState>;onAssign:(id:string)=>void;onOpen:(id:string,x?:number,y?:number)=>void}){
 const buttons=useRef<Record<string,HTMLButtonElement|null>>({});
 const free=(config.model?.floorplan?.objects??[]).filter(o=>o.domain==='cover'&&!o.entityId);
 useMapMarkers(scene,()=>[
  ...Object.entries(meshes).map(([id,entry])=>({id,element:()=>buttons.current[id],occlude:true,display:'grid',anchor:(out:Vector3)=>out.copyFrom(entry.frame.getAbsolutePosition())})),
  ...free.map(o=>{
   const parts=scene.meshes.filter(m=>floorplanId(m)===o.id&&m.getTotalVertices()>0),fallback=new Vector3(o.position.x,o.position.y,o.position.z).scale(config.model?.scale??1);
   return {id:o.id,element:()=>buttons.current[o.id],occlude:true,display:'grid',anchor:(out:Vector3)=>markerCenterToRef(parts,fallback,out)};
  }),
 ],[meshes,config]);
 return <>{Object.entries(meshes).map(([id,e])=>{const label=states[id]?.attributes.friendly_name||e.config.label;return <button key={id} ref={el=>{buttons.current[id]=el;}} className="cluster-map-marker blind-map-marker" aria-label={`Rollo ${label} steuern`} title={`Rollo · ${label}`} onClick={ev=>{ev.stopPropagation();const r=ev.currentTarget.getBoundingClientRect();onOpen(e.config.id,r.left+r.width/2,r.top+r.height/2);}}><Blinds size={18}/><span className="blind-marker-caption">{label}</span></button>;})}{free.map(o=><button key={o.id} ref={el=>{buttons.current[o.id]=el;}} className="cluster-map-marker blind-map-marker blind-marker-unassigned" aria-label={`Rollo ${o.label} zuordnen`} title={`Rollo · ${o.label} · noch nicht zugeordnet`} onClick={()=>onAssign(o.id)}><Blinds size={18}/><span className="blind-marker-plus" aria-hidden="true">+</span><span className="blind-marker-caption">{o.label} · zuordnen</span></button>)}</>;
}
