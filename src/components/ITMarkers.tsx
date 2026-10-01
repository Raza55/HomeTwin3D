import { useEffect, useRef, useState } from 'react';
import { Monitor, Server, Pencil, X, Power } from 'lucide-react';
import { Vector3, type Scene } from '@babylonjs/core';
import type { AppConfig, HAState, ITConfig, ITDevice, ITAction } from '../types';
import { useLatest, useMapMarkers } from './useMapMarkers';
import { itStatus, itStatusLabel, itMetric, itActionAvailable, itCommand, validateIT } from '../services/itState';
import { getActiveHAConnection } from '../services/haWebSocket';
import EntityPicker from './EntityPicker';
import './ITMarkers.css';
import { useConfiguredEntityStates } from '../services/entityStateSignal';

export default function ITMarkers({scene,config,states,connected,open,onOpen,onSave,onCommand}: {
  scene:Scene;config:AppConfig;states:Record<string,HAState>;connected:boolean;open:string|null;
  onOpen:(id:string|null)=>void;onSave:(id:string,it:ITConfig)=>void;
  onCommand?:(domain:string,service:string,entityId:string)=>Promise<unknown>;
}) {
  useConfiguredEntityStates(config, o => Boolean(o.it));
  const refs=useRef<Record<string,HTMLButtonElement|null>>({});
  const pending=useRef(false);
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  const [draft,setDraft]=useState<ITConfig|null>(null);
  const [confirmation,setConfirmation]=useState<{device:ITDevice;action:ITAction}|null>(null);
  const [now,setNow]=useState(Date.now());
  const objects=config.model?.floorplan?.objects.filter(o=>o.it)??[];
  const current=objects.find(o=>o.id===open);
  useEffect(()=>{setDraft(null);setError('');setConfirmation(null);},[open]);
  useEffect(()=>{if(!open)return;const id=window.setInterval(()=>setNow(Date.now()),30000);return()=>clearInterval(id);},[open]);
  useEffect(()=>{
    const escape=(e:KeyboardEvent)=>{if(e.key==='Escape' && !(e.target as HTMLElement)?.closest('[role=combobox]'))onOpen(null);};
    window.addEventListener('keydown',escape);return()=>window.removeEventListener('keydown',escape);
  },[onOpen]);
  // PCs and the shared server/network control remain visible through walls and furniture.
  const latest=useLatest({states,connected,send:(device:ITDevice,action:ITAction)=>send(device,action,true)});
  useMapMarkers(scene,()=>objects.map(o=>{
    const center=new Vector3(o.position.x,o.position.y,o.position.z).scale(config.model?.scale??1);
    const device=o.it!.kind==='pc'&&o.it!.devices.length===1?o.it!.devices[0]:null;
    // Long press on a PC: sleep when on, main switch on when off; no action while the state is unknown.
    const primaryAction=device?()=>{
      const {states,connected,send}=latest.current,status=itStatus(device,states,connected);
      const action=status==='on'?device.actions.find(a=>a.kind==='button'&&/schlaf|ruhe|hibern|sleep|standby/i.test(a.label))
        :status==='off'?device.actions.find(a=>a.kind==='toggle'||a.kind==='wake'):undefined;
      if(!action||!itActionAvailable(action,device,states,connected))return false;
      void send(device,action);
      return true;
    }:undefined;
    return {id:o.id,element:()=>refs.current[o.id],display:'flex',primaryAction,anchor:(out:Vector3)=>out.copyFrom(center)};
  }),[config]);
  const send=async(device:ITDevice,action:ITAction,confirmed=false)=>{
    const command=itCommand(action,device,states,connected),ha=getActiveHAConnection();
    if(!command||pending.current||(!onCommand&&!ha?.isConnected))return;
    if(!confirmed&&action.kind==='button'){setConfirmation({device,action});return;}
    pending.current=true;setBusy(true);setError('');setConfirmation(null);
    try{if(onCommand)await onCommand(command.domain,command.service,command.entityId);else await ha!.callService(command.domain,command.service,command.entityId);}
    catch(e){setError(e instanceof Error?e.message:'Befehl fehlgeschlagen.');}
    finally{pending.current=false;setBusy(false);}
  };
  const options=Object.values(states).map(s=>({entity_id:s.entity_id,friendly_name:String(s.attributes.friendly_name??s.entity_id)}));
  const change=(index:number,fn:(d:ITDevice)=>void)=>setDraft(value=>{const next=structuredClone(value!);fn(next.devices[index]);return next;});
  return <>{objects.map(o=>{
    const statuses=o.it!.devices.map(d=>itStatus(d,states,connected));
    const status=statuses.includes('on')?'on':statuses.every(s=>s==='off')?'off':statuses.includes('unassigned')?'unassigned':'unknown';
    const Icon=o.it!.kind==='rack'?Server:Monitor;
    return <button key={o.id} ref={el=>{refs.current[o.id]=el;}} className={`it-marker is-${status}`} title={`${o.label} · ${itStatusLabel[status]}`} aria-label={`${o.label} öffnen`} aria-expanded={open===o.id} aria-haspopup="dialog" onClick={()=>onOpen(open===o.id?null:o.id)}><Icon size={20}/>{status==='unassigned'&&<span>+</span>}</button>;
  })}{current&&<div className="it-backdrop" onPointerDown={e=>{if(e.target===e.currentTarget&&!draft)onOpen(null);}}><section className={`it-popup ${current.it!.kind==='rack'?'is-rack':''}`} role="dialog" aria-modal="true" aria-label={current.label}>
    <header><Server size={20}/><div><strong>{current.label}</strong><small>{current.room} · {draft?'Entitäten zuordnen':'Systemübersicht'}</small></div><button aria-label="IT-Geräte zuordnen" disabled={busy} onClick={()=>{setDraft(structuredClone(current.it!));setConfirmation(null);}}><Pencil size={17}/></button><button aria-label="IT-Übersicht schließen" onClick={()=>onOpen(null)}><X size={20}/></button></header>
    {!connected&&<p className="it-warning">Home Assistant ist nicht verbunden.</p>}
    {draft?<form onSubmit={e=>{e.preventDefault();try{validateIT(draft);onSave(current.id,draft);setDraft(null);setError('');}catch(e){setError(String(e));}}}>
      {draft.devices.map((d,i)=><fieldset key={d.id}><legend>{d.label}</legend>
        <label>Online-/An-Aus-Status<EntityPicker value={d.statusEntityId} onChange={v=>change(i,n=>{n.statusEntityId=v;})} entities={options.filter(e=>/^(switch|binary_sensor|sensor|device_tracker)\./.test(e.entity_id))}/></label>
        <label>Statusauswertung<select value={d.statusMode} onChange={e=>change(i,n=>{n.statusMode=e.target.value as ITDevice['statusMode'];})}><option value="power">An/Aus</option><option value="connection">Verbunden/Abwesend</option><option value="telemetry">Erreichbarer Messwert</option></select></label>
        {d.kind==='pc'&&<label>Bildschirm-Kamera<EntityPicker value={d.screenshotEntityId??''} onChange={v=>change(i,n=>{n.screenshotEntityId=v;})} entities={options.filter(e=>e.entity_id.startsWith('camera.'))}/></label>}
        {d.metrics.map((m,j)=><label key={m.key}>{m.label}<EntityPicker value={m.entityId} onChange={v=>change(i,n=>{n.metrics[j].entityId=v;})} entities={options.filter(e=>/^(sensor|binary_sensor|switch|device_tracker|update)\./.test(e.entity_id))}/></label>)}
        {d.actions.map((a,j)=><label key={a.id}>{a.label}<EntityPicker value={a.entityId} onChange={v=>change(i,n=>{n.actions[j].entityId=v;})} entities={options.filter(e=>e.entity_id.startsWith(a.kind==='button'?'button.':'switch.'))}/></label>)}
      </fieldset>)}<div className="it-actions"><button type="submit">Zuordnung speichern</button><button type="button" onClick={()=>setDraft(null)}>Abbrechen</button></div>
    </form>:<div className="it-grid">{current.it!.devices.map(d=>{
      const status=itStatus(d,states,connected);
      return <article key={d.id} className="it-device"><div className="it-device-title"><h3>{d.label}</h3><span className={`it-state is-${status}`}><i/>{itStatusLabel[status]}</span></div>
        {status==='unassigned'?<p className="it-hint">Für diesen PC sind noch keine Hassio-Entitäten zugeordnet. Über den Stift kannst du die gleichen Messwerte und Schalter für diesen Rechner verbinden.</p>:<dl>{d.metrics.filter(m=>m.entityId).map(m=><div key={m.key}><dt>{m.label}</dt><dd className={states[m.entityId]?.state==='warning'&&status==='on'?'it-warning':''}>{itMetric(m,states,status==='on',now)}</dd></div>)}</dl>}
        <div className="it-actions">{d.actions.filter(a=>a.entityId).map(a=><button key={a.id} disabled={busy||!itActionAvailable(a,d,states,connected)} className={a.kind==='toggle'?'it-power':''} aria-label={`${d.label}: ${a.label}`} aria-pressed={a.kind==='toggle'?states[a.entityId]?.state==='on':undefined} onClick={()=>void send(d,a)}>{a.kind==='toggle'&&<Power size={15}/>} {a.kind==='toggle'?`${a.label}: ${states[a.entityId]?.state==='on'?'Ausschalten':'Einschalten'}`:a.label}</button>)}</div>
      </article>;
    })}</div>}
    {confirmation&&<div className="it-confirm" role="alert"><p>{confirmation.device.label}: {confirmation.action.kind==='button'?confirmation.action.label:'Ausschalten'}?</p><button disabled={busy} onClick={()=>void send(confirmation.device,confirmation.action,true)}>Bestätigen</button><button onClick={()=>setConfirmation(null)}>Abbrechen</button></div>}
    {busy&&<p role="status">Befehl wird gesendet …</p>}{error&&<p role="alert">{error}</p>}
  </section></div>}</>;
}
