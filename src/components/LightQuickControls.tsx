import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Power, X, SlidersHorizontal, Pencil, LockKeyhole } from 'lucide-react';
import type { HAState } from '../types';
import './LightQuickControls.css';

interface Props {
  label: string; state: HAState | null; connected: boolean;
  anchor: { x: number; y: number; pinned: boolean };
  onClose: () => void; onPin: () => void; onEnter: () => void; onLeave: () => void; onMore: () => void;
  onCommand: (service: string, data?: Record<string, unknown>) => Promise<void>;
  onEdit?: () => void;
  children?: ReactNode;
  syncLocked?: boolean;
  hideColors?: boolean;
  hideTemperature?: boolean;
}

export default function LightQuickControls({ label, state, connected, anchor, onClose, onPin, onEnter, onLeave, onMore, onCommand, onEdit, children, hideColors, hideTemperature, syncLocked = false }: Props) {
  const root = useRef<HTMLDivElement>(null);
  const [position,setPosition] = useState({left:anchor.x+16,top:anchor.y+16});
  const [level,setLevel] = useState(100), [kelvin,setKelvin] = useState(3000);
  const [color,setColor] = useState('#ffbb66'), [error,setError] = useState('');
  const [busy,setBusy] = useState(false);
  const editing = useRef(false);
  const pending = useRef(false);
  const a = state?.attributes;
  const modes = a?.supported_color_modes ?? (a?.color_mode ? [a.color_mode] : []);
  const dim = modes.length ? modes.some(m=>!['onoff','unknown'].includes(m)) : typeof a?.brightness === 'number';
  const rgb = modes.some(m=>['rgb','rgbw','rgbww','hs','xy'].includes(m)) || (!modes.length && !!a?.rgb_color);
  const temp = modes.includes('color_temp') || (!modes.length && !!a?.color_temp_kelvin);
  const available = connected && !!state && !['unavailable','unknown'].includes(state.state);
  const min = a?.min_color_temp_kelvin ?? 2000, max = a?.max_color_temp_kelvin ?? 6500;
  useEffect(()=>{
    if(editing.current) return;
    setLevel(Math.round((a?.brightness ?? 255)/255*100));
    setKelvin(a?.color_temp_kelvin ?? 3000);
    if(a?.rgb_color) setColor('#'+a.rgb_color.map(c=>Math.round(c).toString(16).padStart(2,'0')).join(''));
  },[state]);
  useLayoutEffect(()=>{
    const place=()=>{
      const box=root.current?.getBoundingClientRect(); if(!box) return;
      const left=anchor.x+box.width+24>window.innerWidth ? anchor.x-box.width-16 : anchor.x+16;
      setPosition({left:Math.max(8,Math.min(left,window.innerWidth-box.width-8)),top:Math.max(8,Math.min(anchor.y-28,window.innerHeight-box.height-8))});
    };
    place(); const observer=new ResizeObserver(place); if(root.current) observer.observe(root.current);
    window.addEventListener('resize',place);
    return ()=>{observer.disconnect();window.removeEventListener('resize',place);};
  },[anchor.x,anchor.y]);
  useEffect(()=>{
    const down=(e:PointerEvent)=>{if(root.current && !root.current.contains(e.target as Node)) onClose();};
    const key=(e:KeyboardEvent)=>{if(e.key==='Escape') {e.stopPropagation();onClose();}};
    document.addEventListener('pointerdown',down); document.addEventListener('keydown',key);
    return ()=>{document.removeEventListener('pointerdown',down);document.removeEventListener('keydown',key);};
  },[onClose]);
  useEffect(()=>{if(anchor.pinned && !root.current?.contains(document.activeElement)) root.current?.querySelector<HTMLButtonElement>('button')?.focus({preventScroll:true});},[anchor.pinned]);
  const send=async(service:string,data?:Record<string,unknown>)=>{
    if(syncLocked || !available || pending.current) return; pending.current=true;editing.current=false;setBusy(true);setError('');
    try {await onCommand(service,data);} catch {setError('Änderung fehlgeschlagen. Bitte erneut versuchen.');}
    finally {pending.current=false;setBusy(false);editing.current=false;}
  };
  const commitLevel=()=>{if(editing.current) void send(level===0?'turn_off':'turn_on',level===0?undefined:{brightness:Math.round(level/100*255)});};
  const commitTemp=()=>{if(editing.current) void send('turn_on',{color_temp_kelvin:kelvin});};
  const setRgb=(value:string)=>{setColor(value);void send('turn_on',{rgb_color:[1,3,5].map(i=>parseInt(value.slice(i,i+2),16))});};
  return <div ref={root} className="light-quick" style={position} role="dialog" aria-label={`Lichtsteuerung ${label}`} onPointerEnter={onEnter} onPointerLeave={onLeave} onPointerDown={e=>{e.stopPropagation();onPin();}} onWheel={e=>e.stopPropagation()}>
    <header><div><strong title={label}>{label}</strong><small>{!connected?'Nicht verbunden':!available?'Nicht verfügbar':syncLocked?'An · Hue Sync aktiv':state?.state==='on'?`An · ${dim?`${level} %`:'Licht'}`:'Aus'}</small></div>
      {onEdit && <button className="light-quick-icon" aria-label="Lampenzuordnung bearbeiten" title="Zuordnung bearbeiten" onClick={onEdit}><Pencil size={15}/></button>}
      <button className="light-quick-icon" aria-label="Lichtsteuerung schließen" onClick={onClose}><X size={16}/></button></header>
    {syncLocked ? <p className="light-quick-sync" role="status"><LockKeyhole size={16}/><span>Hue Sync steuert diese Lampen. Nach dem Stoppen von Sync sind die Regler wieder verfügbar.</span></p> : <>
    <button className={`light-quick-power ${state?.state==='on'?'is-on':''}`} disabled={!available||busy} aria-label={state?.state==='on'?'Licht ausschalten':'Licht einschalten'} onClick={()=>void send(state?.state==='on'?'turn_off':'turn_on')}><Power size={16}/>{state?.state==='on'?'Ausschalten':'Einschalten'}</button>
    {children}
    {dim && <label className="light-quick-slider"><span>Helligkeit <output>{level} %</output></span><input aria-label="Helligkeit" type="range" min="0" max="100" value={level} disabled={!available||busy} onChange={e=>{editing.current=true;setLevel(Number(e.target.value));}} onPointerUp={commitLevel} onKeyUp={commitLevel} onBlur={commitLevel}/></label>}
    {temp && !hideTemperature && <label className="light-quick-slider"><span>Weißtemperatur <output>{kelvin} K</output></span><input className="light-quick-temp" aria-label="Weißtemperatur" type="range" min={min} max={max} step="50" value={kelvin} disabled={!available||busy} onChange={e=>{editing.current=true;setKelvin(Number(e.target.value));}} onPointerUp={commitTemp} onKeyUp={commitTemp} onBlur={commitTemp}/></label>}
    {rgb && !hideColors && <div className="light-quick-colors" aria-label="Lichtfarbe">{[['Warm','#ffbb66'],['Rot','#ff5050'],['Grün','#63de9a'],['Blau','#709eff'],['Violett','#c58aff']].map(([name,hex])=><button key={hex} aria-label={`Farbe ${name}`} title={name} disabled={!available||busy} style={{background:hex}} onClick={()=>setRgb(hex)}/>)}<input aria-label="Eigene Lichtfarbe" title="Eigene Lichtfarbe" type="color" value={color} disabled={!available||busy} onChange={e=>setRgb(e.target.value)}/></div>}
    </>}
    {error && <p className="light-quick-error" role="alert">{error}</p>}
    <footer><span>{busy?'Wird gesendet …':anchor.pinned?'Esc zum Schließen':'Klick zum Fixieren'}</span><button disabled={syncLocked} aria-label="Weitere Lichtoptionen" onClick={onMore}><SlidersHorizontal size={14}/>Mehr</button></footer>
  </div>;
}
