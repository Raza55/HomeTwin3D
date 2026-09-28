import { useRef, useState, type ComponentProps, type PointerEvent } from 'react';
import type { HAState } from '../types';
import { isEnsis, ensisChannel } from '../services/lightClusters';
import LightQuickControls from './LightQuickControls';
import './LightClusterControls.css';

export interface ClusterMember { entityId: string; label: string; state: HAState | null }
type Props = Omit<ComponentProps<typeof LightQuickControls>, 'label'|'state'|'onCommand'|'onMore'> & {
  members: ClusterMember[]; label: string; onMore: (entityId: string) => void;
  onCommand: (entityId: string, service: string, data?: Record<string,unknown>) => Promise<void>;
};
const modes=(s:HAState|null)=>s?.attributes.supported_color_modes ?? (s?.attributes.color_mode?[s.attributes.color_mode]:[]);
const colorCapable=(s:HAState|null)=>modes(s).some(m=>['rgb','rgbw','rgbww','hs','xy'].includes(m));
const available=(s:HAState|null)=>!!s && !['unknown','unavailable'].includes(s.state);
function hs(s:HAState|null):[number,number] {
  if(s?.attributes.hs_color) return s.attributes.hs_color;
  const rgb=s?.attributes.rgb_color;
  if(!rgb)return [35,60];
  const [r,g,b]=rgb.map(c=>c/255),max=Math.max(r,g,b),min=Math.min(r,g,b),d=max-min;
  return [d ? ((max===r?(g-b)/d:max===g?(b-r)/d+2:(r-g)/d+4)*60+360)%360:0,max?d/max*100:0];
}
export default function LightClusterControls({members,label,onCommand,onMore,...props}:Props){
  const [selected,setSelected]=useState<string|null>(null);
  const [whiteMode,setWhiteMode]=useState(false);
  const [draft,setDraft]=useState<Record<string,[number,number]>>({});
  const [error,setError]=useState(''),[busy,setBusy]=useState(false);
  const pending=useRef(false), disk=useRef<HTMLDivElement>(null), dragging=useRef<string|null>(null);
  const dragValue=useRef<[number,number]>([0,100]);
  const dragStart=useRef({x:0,y:0}), moved=useRef(false);
  const current=members.find(m=>m.entityId===selected);
  const allReady=members.every(m=>available(m.state));
  const dim=members.every(m=>modes(m.state).some(mode=>!['onoff','unknown'].includes(mode)));
  const color=members.every(m=>colorCapable(m.state));
  const temp=members.every(m=>modes(m.state).includes('color_temp'));
  const group:HAState={entity_id:'light.visual_group',state:allReady?(members.some(m=>m.state?.state==='on')?'on':'off'):'unavailable',attributes:{
    supported_color_modes:[...(dim?['brightness']:[]),...(color?['rgb']:[]),...(temp?['color_temp']:[]),...(!dim?['onoff']:[])],
    brightness:Math.round(members.reduce((sum,m)=>sum+(m.state?.state==='on'?(m.state.attributes.brightness??255):0),0)/members.length),
    color_temp_kelvin:members[0]?.state?.attributes.color_temp_kelvin,
    min_color_temp_kelvin:Math.max(...members.map(m=>m.state?.attributes.min_color_temp_kelvin??2000)),
    max_color_temp_kelvin:Math.min(...members.map(m=>m.state?.attributes.max_color_temp_kelvin??6500)),
  }};
  const targets=current?[current]:members;
  const command=async(service:string,data?:Record<string,unknown>)=>{
    const results=await Promise.allSettled(targets.map(m=>onCommand(m.entityId,service,data)));
    if(results.some(r=>r.status==='rejected'))throw new Error('Group command failed');
  };
  const colors=members.map((m,i)=>{const [h,s]=draft[m.entityId]??hs(m.state);return {m,h,s,i};});
  const handles:Array<{x:number;y:number}>=[];
  for(const {h,s} of colors){
    const angle=h*Math.PI/180,r=s/100*62;
    const candidates=[0,-28,28,-56,56,-84,84].map(offset=>({x:Math.max(12,Math.min(148,80+Math.sin(angle)*r+Math.cos(angle)*offset)),y:Math.max(12,Math.min(148,80-Math.cos(angle)*r+Math.sin(angle)*offset))}));
    const distance=(p:{x:number;y:number})=>Math.min(...handles.map(q=>Math.hypot(p.x-q.x,p.y-q.y)));
    handles.push(candidates.find(p=>distance(p)>=27)??candidates.sort((a,b)=>distance(b)-distance(a))[0]);
  }
  const applyColors=async(values:Array<{entityId:string;value:[number,number]}>)=>{
    if(pending.current)return;
    pending.current=true;setBusy(true);setError('');
    setDraft(d=>({...d,...Object.fromEntries(values.map(v=>[v.entityId,v.value]))}));
    const results=await Promise.allSettled(values.map(v=>onCommand(v.entityId,'turn_on',{hs_color:v.value})));
    if(results.some(r=>r.status==='rejected'))setError('Nicht alle Farben wurden übernommen. Bitte erneut versuchen.');
    setDraft(d=>{const next={...d};values.forEach(v=>delete next[v.entityId]);return next;});
    pending.current=false;setBusy(false);
  };
  const move=(e:PointerEvent)=>{
    if(!dragging.current||!disk.current)return;
    if(Math.hypot(e.clientX-dragStart.current.x,e.clientY-dragStart.current.y)<3 && !moved.current)return;
    moved.current=true;
    const rect=disk.current.getBoundingClientRect(),x=(e.clientX-rect.left)/rect.width*160-80,y=(e.clientY-rect.top)/rect.height*160-80;
    const value:[number,number]=[Math.round((Math.atan2(x,-y)*180/Math.PI+360)%360),Math.round(Math.min(100,Math.hypot(x,y)/62*100))];
    dragValue.current=value;setDraft(d=>({...d,[dragging.current!]:value}));
  };
  return <LightQuickControls {...props} label={current?current.label:label} state={current?.state??group} onMore={()=>onMore(current?.entityId??members[0].entityId)} onCommand={command} hideColors hideTemperature={!whiteMode}>
    <div className="cluster-members" aria-label="Leuchten auswählen"><button className={!selected?'active':''} onClick={()=>setSelected(null)}>Alle {members.length}</button>{members.map((m,i)=><button key={m.entityId} className={selected===m.entityId?'active':''} title={m.label} aria-label={isEnsis(m.label)?`${ensisChannel(m.label)} einzeln bedienen`:`Spot ${i+1} einzeln bedienen`} onClick={()=>setSelected(m.entityId)}>{isEnsis(m.label)?ensisChannel(m.label):i+1}</button>)}</div>
    <div className="cluster-tabs"><button className={!whiteMode?'active':''} onClick={()=>setWhiteMode(false)}>Farbe</button><button className={whiteMode?'active':''} onClick={()=>setWhiteMode(true)}>Weiß</button></div>
    {!whiteMode && <><div ref={disk} className="cluster-wheel" aria-label="Runder Farbverlauf der Spots">
      {colors.map(({m,h,s,i})=>{
        // Spread overlapping handles, preserving their actual colour values.
        const {x,y}=handles[i];
        return <button key={m.entityId} className={`cluster-handle ${selected===m.entityId?'selected':''}`} style={{left:Math.max(12,Math.min(148,x)),top:Math.max(12,Math.min(148,y)),background:`hsl(${h} ${s}% 55%)`}}
          role="slider" aria-label={isEnsis(m.label)?`Farbpunkt ${ensisChannel(m.label)}`:`Farbpunkt Spot ${i+1}`} aria-valuemin={0} aria-valuemax={359} aria-valuenow={h} aria-valuetext={`${h} Grad, ${s} Prozent Sättigung`}
          disabled={!props.connected||!available(m.state)||!colorCapable(m.state)||busy}
          onPointerDown={e=>{e.preventDefault();e.currentTarget.focus();e.currentTarget.setPointerCapture(e.pointerId);dragging.current=m.entityId;dragStart.current={x:e.clientX,y:e.clientY};moved.current=false;dragValue.current=[h,s];setSelected(m.entityId);props.onPin();}}
          onPointerMove={move} onPointerUp={e=>{if(!dragging.current)return;const entityId=dragging.current;dragging.current=null;e.currentTarget.releasePointerCapture(e.pointerId);if(moved.current)void applyColors([{entityId,value:dragValue.current}]);}}
          onPointerCancel={()=>{dragging.current=null;setDraft({});}}
          onKeyDown={e=>{if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key))return;e.preventDefault();const step=e.shiftKey?10:1;const value:[number,number]=[e.key==='ArrowLeft'?(h-step+360)%360:e.key==='ArrowRight'?(h+step)%360:h,e.key==='ArrowUp'?Math.min(100,s+step):e.key==='ArrowDown'?Math.max(0,s-step):s];setSelected(m.entityId);void applyColors([{entityId:m.entityId,value}]);}}>{i+1}</button>;
      })}
    </div>
    <div className="cluster-gradient" style={{background:`linear-gradient(90deg,${colors.map(c=>`hsl(${c.h} ${c.s}% 55%)`).join(',')})`}} aria-label="Farbverlauf in Spot-Reihenfolge"/>
    <div className="cluster-presets"><button disabled={!props.connected||!allReady||!color||busy} onClick={()=>void applyColors(members.map((m,i)=>({entityId:m.entityId,value:[(35-i/(members.length-1)*165+360)%360,85]})))}>Warm → Blau</button><button disabled={!props.connected||!allReady||!color||busy} onClick={()=>void applyColors(members.map(m=>({entityId:m.entityId,value:hs(current?.state??members[0].state)})))}>Gleiche Farbe</button></div>
    <p className="cluster-hint">Farbpunkte ziehen · Mitte = Weiß</p></>}
    {error&&<p className="light-quick-error" role="alert">{error}</p>}
  </LightQuickControls>;
}
