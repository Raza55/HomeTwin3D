import {useEffect,useRef,useState} from 'react';
import {Tv,Monitor,Gamepad2,Play,Power,X} from 'lucide-react';
import {type Scene,type Vector3} from '@babylonjs/core';
import type {HAState} from '../types';
import {floorplanId} from '../babylon/FloorplanBindings';
import {useMapMarkers} from './useMapMarkers';
import {getActiveHAConnection} from '../services/haWebSocket';
import {TV_DIAL_AUTOMATION,TV_DIAL_CHOICES,tvDialRequest,tvDialSelected,type TVDialChoice} from '../services/tvDial';
import './ITMarkers.css';
import './TVDialControl.css';

export default function TVDialControl({scene,states,connected,onCommand}:{scene:Scene;states:Record<string,HAState>;connected:boolean;onCommand?:(request:ReturnType<typeof tvDialRequest>)=>Promise<unknown>}){
  const marker=useRef<HTMLButtonElement|null>(null),pending=useRef(false);
  const [open,setOpen]=useState(false),[busy,setBusy]=useState(false),[feedback,setFeedback]=useState(''),[error,setError]=useState('');
  const selected=tvDialSelected(states,connected),enabled=connected&&states[TV_DIAL_AUTOMATION]?.state==='on';
  const running=Number(states[TV_DIAL_AUTOMATION]?.attributes.current??0)>0;
  useMapMarkers(scene,()=>{
    const find=()=>scene.meshes.find(m=>floorplanId(m)==='4784bb9f-40cd-5e6b-9165-63d8ffbe0dc1'&&/Fernseher_Bildschirm/.test(m.name)&&m.getTotalVertices()>0);
    let screen=find(),nextLookup=0;
    // TV controls remain accessible even when the screen is occluded.
    return [{id:'tv-dial',element:()=>marker.current,display:'flex',anchor:(out:Vector3)=>{
      if(!screen||screen.isDisposed()){
        if(performance.now()<nextLookup)return null;nextLookup=performance.now()+1000;
        screen=find();if(!screen)return null;
      }
      const box=screen.getBoundingInfo().boundingBox;
      out.copyFrom(box.centerWorld);out.y=box.maximumWorld.y+.12;
      return out;
    }}];
  },[]);
  const close=()=>{setOpen(false);marker.current?.focus();};
  useEffect(()=>{if(!open)return;const escape=(e:KeyboardEvent)=>{if(e.key==='Escape'){setOpen(false);marker.current?.focus();}};window.addEventListener('keydown',escape);return()=>window.removeEventListener('keydown',escape);},[open]);
  const send=async(choice:TVDialChoice)=>{
    const ha=getActiveHAConnection();if(pending.current||!enabled||(!onCommand&&!ha?.isConnected))return;
    pending.current=true;setBusy(true);setError('');setFeedback('');
    try{
      const request=tvDialRequest(choice);if(onCommand)await onCommand(request);else await ha!.request(request);
      setFeedback(choice==='aus'?'Ausschalten angefordert.':`${TV_DIAL_CHOICES.find(c=>c.id===choice)!.label} angefordert.`);
    }catch(e){setError(e instanceof Error?e.message:'TV-Steuerung fehlgeschlagen.');}
    finally{pending.current=false;setBusy(false);}
  };
  const icons=[Play,Monitor,Gamepad2,Gamepad2];
  return <><button ref={marker} style={{display:'none'}} className={`it-marker tv-dial-marker ${selected&&selected!=='aus'?'is-on':''}`} aria-label="Fernseher steuern" title="Fernseher · TV Dial" aria-haspopup="dialog" aria-expanded={open} onClick={()=>{setOpen(v=>!v);setFeedback('');setError('');}}><Tv size={22}/></button>
    {open&&<div className="it-backdrop" onPointerDown={e=>{if(e.target===e.currentTarget)close();}}><section className="it-popup tv-dial-popup" role="dialog" aria-modal="true" aria-label="Fernseher · TV Dial">
      <header><Tv size={23}/><div><strong>Fernseher</strong><small>TV Dial · {selected==='aus'?'Aus':TV_DIAL_CHOICES.find(c=>c.id===selected)?.label??'Status unbekannt'}</small></div><button aria-label="TV-Steuerung schließen" onClick={close}><X size={20}/></button></header>
      {!enabled&&<p className="it-warning">{connected?'TV-Dial-Automation ist nicht aktiv.':'Home Assistant ist nicht verbunden.'}</p>}
      <div className="tv-dial-grid">{TV_DIAL_CHOICES.map((c,i)=>{const Icon=icons[i];return <button key={c.id} disabled={!enabled||busy} aria-pressed={selected===c.id} onClick={()=>void send(c.id)}><span className="tv-dial-number">{i+1}</span><Icon size={25}/><strong>{c.label}</strong></button>;})}</div>
      <button className="tv-dial-off" disabled={!enabled||busy} aria-pressed={selected==='aus'} onClick={()=>void send('aus')}><Power size={18}/> Alles aus</button>
      <small className="tv-dial-hint">Wie am TV Dial: Quelle einschalten oder wechseln. „Alles aus“ startet den hinterlegten Ausschaltablauf.</small>
      {(running||busy||feedback)&&<p role="status">{busy?'Befehl wird gesendet …':running?'TV Dial schaltet …':feedback}</p>}{error&&<p role="alert">{error}</p>}
    </section></div>}
  </>;
}
