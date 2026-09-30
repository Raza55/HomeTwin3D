import {useEffect,useLayoutEffect,useRef,useState} from 'react';
import {ArrowUp,ArrowDown,Square,X,Blinds} from 'lucide-react';
import type {AppConfig,HAState} from '../types';
import {coverRoom,coverSupports,type CoverAction} from '../services/coverControls';
import {loadMatchingInventory} from '../services/matchingInventory';
import type {MatchEntity} from '../services/floorplanMatching';
import './LightQuickControls.css';
import './BlindQuickControls.css';
import { useEntityStatesVersion } from '../services/entityStateSignal';
interface Props {
 visible:boolean;entityId:string|null;label:string;state:HAState|null;states:Record<string,HAState>;config:AppConfig;connected:boolean;
 anchor:{x:number;y:number}|null;onClose:()=>void;
 onOpenCover:(id:string)=>Promise<unknown>;onCloseCover:(id:string)=>Promise<unknown>;onStopCover:(id:string)=>Promise<unknown>;onSetPosition:(id:string,position:number)=>Promise<unknown>;
}
export default function BlindQuickControls(props:Props){
  useEntityStatesVersion(); // re-render on state changes (see entityStateSignal)
 if(!props.visible||!props.entityId)return null;
 return <Controls key={props.entityId} {...props} entityId={props.entityId}/>;
}
function Controls({entityId,label,state,states,config,connected,anchor,onClose,onOpenCover,onCloseCover,onStopCover,onSetPosition}:Props&{entityId:string}){
 const root=useRef<HTMLDivElement>(null),pending=useRef(false),editing=useRef(false);
 const [position,setPosition]=useState(0),[busy,setBusy]=useState(false),[error,setError]=useState(''),[place,setPlace]=useState({left:8,top:8});
 const [inventory,setInventory]=useState<MatchEntity[]|null>(null);
 useEffect(()=>{let cancelled=false;loadMatchingInventory().then(data=>{if(!cancelled)setInventory(data.entities);}).catch(()=>{if(!cancelled)setInventory([]);});return()=>{cancelled=true;};},[connected]);
 const room=coverRoom(config,entityId,inventory??[]),value=state?.attributes.current_position;
 useEffect(()=>{if(!editing.current&&typeof value==='number')setPosition(value);},[value]);
 useLayoutEffect(()=>{const layout=()=>{const r=root.current?.getBoundingClientRect();if(!r)return;setPlace({left:Math.max(8,Math.min(anchor?anchor.x+16:(innerWidth-r.width)/2,innerWidth-r.width-8)),top:Math.max(8,Math.min(anchor?anchor.y-28:(innerHeight-r.height)/2,innerHeight-r.height-8))});};layout();const ro=new ResizeObserver(layout);if(root.current)ro.observe(root.current);window.addEventListener('resize',layout);return()=>{ro.disconnect();window.removeEventListener('resize',layout);};},[anchor]);
 useEffect(()=>{const outside=(e:PointerEvent)=>{if(!root.current?.contains(e.target as Node))onClose();};document.addEventListener('pointerdown',outside);root.current?.querySelector<HTMLButtonElement>('button')?.focus({preventScroll:true});return()=>document.removeEventListener('pointerdown',outside);},[onClose]);
 const eligible=(ids:string[],action:CoverAction)=>connected?ids.filter(id=>coverSupports(id===entityId?state:states[id],action)):[];
 const send=async(action:CoverAction,ids=[entityId])=>{
  if(pending.current)return;const targets=eligible(ids,action);if(!targets.length)return;
  pending.current=true;setBusy(true);setError('');
  const results=await Promise.allSettled(targets.map(async id=>{if(action==='open_cover')await onOpenCover(id);else if(action==='close_cover')await onCloseCover(id);else if(action==='stop_cover')await onStopCover(id);else await onSetPosition(id,position);}));
  const failed=results.filter(r=>r.status==='rejected').length;if(failed)setError(`${failed} von ${targets.length} Befehlen fehlgeschlagen. Bitte erneut versuchen.`);
  pending.current=false;editing.current=false;setBusy(false);
 };
 const actions=(ids:string[],all=false)=><div className="blind-actions">{([['open_cover','Öffnen',ArrowUp],['stop_cover','Stopp',Square],['close_cover','Schließen',ArrowDown]] as const).map(([action,text,Icon])=><button key={action} disabled={busy||!eligible(ids,action).length} aria-label={all?`Alle Rollos in ${room.name} ${text.toLowerCase()}`:`Rollo ${text.toLowerCase()}`} onClick={()=>void send(action,ids)}><Icon size={16}/>{text}</button>)}</div>;
 const status=!connected?'Nicht verbunden':!state||['unknown','unavailable'].includes(state.state)?'Nicht verfügbar':state.state==='opening'?'Öffnet …':state.state==='closing'?'Schließt …':typeof value==='number'?`${Math.round(value)} % geöffnet`:state.state==='closed'?'Geschlossen':'Offen';
 return <div ref={root} className="light-quick blind-quick" style={place} role="dialog" aria-label={`Rollosteuerung ${label}`} onPointerDown={e=>e.stopPropagation()} onKeyDown={e=>{e.stopPropagation();if(e.key==='Escape')onClose();}}>
  <header><Blinds size={20}/><div><strong title={label}>{label}</strong><small>{status}</small></div><button className="light-quick-icon" aria-label="Rollosteuerung schließen" onClick={onClose}><X size={16}/></button></header>
  {actions([entityId])}
  {coverSupports(state,'set_cover_position')&&<label className="blind-position">Öffnung <span>{position} %</span><input aria-label="Rollo Öffnung" type="range" min="0" max="100" value={position} disabled={busy||!connected} onChange={e=>{editing.current=true;setPosition(Number(e.target.value));}} onPointerUp={()=>{if(editing.current)void send('set_cover_position');}} onKeyUp={e=>{if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End','PageUp','PageDown'].includes(e.key)&&editing.current)void send('set_cover_position');}} onBlur={()=>{if(editing.current)void send('set_cover_position');}}/></label>}
  {inventory!==null&&room.ids.length>1&&<section className="blind-room"><strong>{room.name}</strong><small>Alle {room.ids.length} zugeordneten Rollos im Raum</small>{actions(room.ids,true)}{room.ids.some(id=>!states[id]||['unknown','unavailable'].includes(states[id].state))&&<small>Nicht verfügbare Rollos werden übersprungen.</small>}</section>}
  {error&&<p className="light-quick-error" role="alert">{error}</p>}
 </div>;
}
