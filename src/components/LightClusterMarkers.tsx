import { getMarkerProjection, setMarkerStyle } from '../babylon/MarkerProjection';
import { useEffect, useRef } from 'react';
import { Lightbulb, LockKeyhole } from 'lucide-react';
import { Vector3, type Scene } from '@babylonjs/core';
import type { AppConfig, HAState, LightConfig } from '../types';
import type { MeshMap } from '../babylon/LightMeshFactory';
import { floorplanId } from '../babylon/FloorplanBindings';
import { quickLightCluster, isEnsis } from '../services/lightClusters';
import './LightClusterControls.css';
import { HUE_SYNC_COLOR, isHueSyncLocked } from '../services/hueSync';

export default function LightClusterMarkers({scene,config,meshes,states,onOpen,onLeave,onAssign}:{
  scene:Scene;config:AppConfig;meshes:MeshMap;states:Record<string,HAState>;
  onAssign?:(objectId:string)=>void;
  onOpen:(entityId:string,x:number,y:number,pinned:boolean)=>void;onLeave:()=>void;
}){
  const buttons=useRef<Record<string,HTMLButtonElement|null>>({});
  const touchGesture=useRef<{x:number;y:number;moved:boolean}|null>(null);
  const groups:LightConfig[][]=[],seen=new Set<string>();
  for(const l of config.lights){if(seen.has(l.entityId))continue;const group=quickLightCluster(config.lights,l.entityId);if(group.length===1 && !meshes[l.entityId]?.touchIconMesh)continue;group.forEach(m=>seen.add(m.entityId));groups.push(group);}
  const unassigned=(config.model?.floorplan?.objects ?? []).filter(o=>o.domain==='light' && !o.entityId);
  const key=unassigned.map(o=>o.id).join(',')+groups.map(g=>g.map(l=>l.entityId).join(',')).join('|');
  // HA colors change with state updates, not with the render frame.
  useEffect(()=>{
    for(const group of groups){
      const element=buttons.current[group[0].entityId];if(!element)continue;
      const active=group.find(l=>states[l.entityId]?.state==='on');
      const a=active?states[active.entityId].attributes:undefined;
      element.style.color=group.some(l=>isHueSyncLocked(l.entityId,states))?HUE_SYNC_COLOR:!a?'#64748b':a.hs_color?`hsl(${a.hs_color[0]} ${a.hs_color[1]}% 60%)`:a.rgb_color?`rgb(${a.rgb_color.join(',')})`:'#efc975';
    }
  });
  useEffect(()=>{
    const clearTouch=()=>{Object.values(buttons.current).forEach(button=>button?.classList.remove('touch-active'));};
    const trackTouch=(event:PointerEvent)=>{
      if(event.pointerType!=='touch'){if(event.type==='pointerdown')touchGesture.current=null;return;}
      if(event.type==='pointerdown')touchGesture.current={x:event.clientX,y:event.clientY,moved:false};
      else if(touchGesture.current && Math.hypot(event.clientX-touchGesture.current.x,event.clientY-touchGesture.current.y)>8)touchGesture.current.moved=true;
      for(const button of Object.values(buttons.current)){
        if(!button)continue;
        const r=button.getBoundingClientRect();
        button.classList.toggle('touch-active',button.style.display!=='none' && event.clientX>=r.left && event.clientX<=r.right && event.clientY>=r.top && event.clientY<=r.bottom);
      }
    };
    const clearModelHover=()=>{for(const group of groups)for(const l of group){const icon=meshes[l.entityId]?.touchIconMesh;if(icon)icon.scaling.setAll(1);}};
    const endTouch=(event:PointerEvent)=>{if(event.pointerType==='touch'){clearTouch();clearModelHover();}};
    const cancel=()=>{clearTouch();clearModelHover();};
    document.addEventListener('pointerdown',trackTouch,true);document.addEventListener('pointermove',trackTouch,true);
    document.addEventListener('pointerup',endTouch);document.addEventListener('pointercancel',endTouch);window.addEventListener('blur',cancel);
    const canvas=scene.getEngine().getRenderingCanvas();canvas?.addEventListener('pointerleave',clearModelHover);
    return()=>{document.removeEventListener('pointerdown',trackTouch,true);document.removeEventListener('pointermove',trackTouch,true);document.removeEventListener('pointerup',endTouch);document.removeEventListener('pointercancel',endTouch);window.removeEventListener('blur',cancel);canvas?.removeEventListener('pointerleave',clearModelHover);};
  },[scene,key,meshes]);
  useEffect(()=>{
    const hidden=new Set(groups.flatMap(g=>g.map(l=>meshes[l.entityId]?.touchIconMesh).filter(m=>!!m)));
    hidden.forEach(m=>m.setEnabled(false));
    const unassignedPositions=unassigned.map(o=>{
      const targets=scene.meshes.filter(m=>floorplanId(m)===o.id && m.getTotalVertices()>0);
      const center=targets.length?targets.reduce((sum,m)=>sum.add(m.getBoundingInfo().boundingBox.centerWorld),Vector3.Zero()).scale(1/targets.length):new Vector3(o.position.x,o.position.y,o.position.z).scale(config.model?.scale ?? 1);
      return {id:o.id,center:center.add(new Vector3(0,.2*(config.model?.scale ?? 1),0))};
    });
    const center=Vector3.Zero();
    const observer=scene.onAfterRenderObservable.add(()=>{
      const projection = getMarkerProjection(scene); if (!projection) return;
      const { rect, width, height } = projection;
      for(const {id,center} of unassignedPositions){
        const element=buttons.current[id];if(!element)continue;
        const p=projection.project(center, element);
        setMarkerStyle(element, 'display', p.z<0||p.z>1||p.x<0||p.x>width||p.y<0||p.y>height?'none':'grid');
        setMarkerStyle(element, 'left', `${rect.left+p.x/width*rect.width}px`);setMarkerStyle(element, 'top', `${rect.top+p.y/height*rect.height}px`);
      }
      for(const group of groups){
        center.setAll(0);
        let count=0,hovered=false;
        for(const l of group){
          const entry=meshes[l.entityId],icon=entry?.touchIconMesh;
          if(icon){if(icon.isEnabled(false))icon.setEnabled(false);hidden.add(icon);if(icon.scaling.x>1)hovered=true;}
          const anchor=icon??entry?.bulb;
          if(anchor){center.addInPlace(anchor.getAbsolutePosition());count++;}
        }
        const element=buttons.current[group[0].entityId];if(!element)continue;
        if(element.classList.contains('model-hovered')!==hovered)element.classList.toggle('model-hovered',hovered);
        if(!count){setMarkerStyle(element, 'display', 'none');continue;}
        center.scaleInPlace(1/count);
        const p=projection.project(center, element);
        setMarkerStyle(element, 'display', p.z<0||p.z>1||p.x<0||p.x>width||p.y<0||p.y>height?'none':'grid');
        setMarkerStyle(element, 'left', `${rect.left+p.x/width*rect.width}px`);setMarkerStyle(element, 'top', `${rect.top+p.y/height*rect.height}px`);
      }
    });
    return()=>{scene.onAfterRenderObservable.remove(observer);hidden.forEach(m=>{if(!m.isDisposed())m.setEnabled(true);});};
  },[scene,key,meshes,config]);
  return <>{groups.map(group=>{const locked=group.some(l=>isHueSyncLocked(l.entityId,states));const title=group.length===1?group[0].label:isEnsis(group[0].label)?'Ensis · Tisch & Decke':group[0].group?config.lightGroups?.find(g=>g.id===group[0].group)?.name??'Leuchtengruppe':/kueche|küche/i.test(group[0].label)?'Küchenspots':'Spotgruppe';return <button key={group[0].entityId} ref={el=>{buttons.current[group[0].entityId]=el;}} className={`cluster-map-marker${locked?' hue-sync-locked':''}`} aria-label={locked?`${title} · Hue Sync aktiv · gesperrt`:group.length===1?`${title} steuern`:`${group.length} ${title} steuern`} title={locked?`${title} · Hue Sync aktiv`:title} onPointerEnter={e=>{if(e.pointerType!=='touch')onOpen(group[0].entityId,e.clientX,e.clientY,false);}} onPointerLeave={onLeave} onClick={e=>{if(touchGesture.current?.moved)return;const r=e.currentTarget.getBoundingClientRect();onOpen(group[0].entityId,r.left+r.width/2,r.top+r.height/2,true);}}><Lightbulb size={16} strokeWidth={2} aria-hidden="true" />{locked&&<span className="hue-sync-lock"><LockKeyhole size={10} strokeWidth={2.5} aria-hidden="true"/></span>}</button>;})}{unassigned.map(o=><button key={o.id} ref={el=>{buttons.current[o.id]=el;}} className="cluster-map-marker unassigned-lamp-marker" aria-label={`${o.label} zuordnen`} title={`${o.label} · noch nicht zugeordnet`} onClick={()=>{if(!touchGesture.current?.moved)onAssign?.(o.id);}}><Lightbulb size={16} aria-hidden="true"/><span aria-hidden="true">+</span></button>)}</>;
}
