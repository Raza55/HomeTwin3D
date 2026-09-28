import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import LightQuickControls from '../src/components/LightQuickControls';
import type {HAState} from '../src/types';
function Test(){
 const [anchor,setAnchor]=useState<{x:number;y:number;pinned:boolean}|null>(null);
 const [state,setState]=useState<HAState>({entity_id:'light.test',state:'on',attributes:{brightness:170,supported_color_modes:['rgb','color_temp'],color_temp_kelvin:3000,rgb_color:[255,187,102]}});
 const [calls,setCalls]=useState<string[]>([]),[fail,setFail]=useState(false);
 return <main style={{padding:24}}><h1>Kompakte Lichtsteuerung</h1><p>Isolierter UI-Test – keine echten Geräte</p>
 <button onClick={()=>setState(s=>({...s,attributes:{supported_color_modes:['onoff']}}))}>Nur Schalten</button>
 <button onClick={()=>setFail(true)}>Fehler simulieren</button>
 <button onClick={()=>setState(s=>({...s,state:'unavailable'}))}>Nicht verfügbar</button>
 <button style={{position:'fixed',right:20,bottom:20,borderRadius:30,padding:18,background:'#efc975',border:0}} onPointerEnter={e=>setAnchor({x:e.clientX,y:e.clientY,pinned:false})} onClick={e=>setAnchor({x:e.clientX,y:e.clientY,pinned:true})}>Esstischlampe</button>
 <pre role="status">{calls.length} Befehle{calls.map(c=>'\n'+c)}</pre>
 {anchor && <LightQuickControls label="Esstischlampe" state={state} connected={true} anchor={anchor} onClose={()=>setAnchor(null)} onEnter={()=>{}} onLeave={()=>{}} onPin={()=>setAnchor(a=>a?{...a,pinned:true}:a)} onMore={()=>{setCalls(c=>[...c,'Weitere Optionen']);setAnchor(null);}} onCommand={async(service,data)=>{if(fail)throw new Error('Test');setCalls(c=>[...c,JSON.stringify({service,data})]);setState(s=>({...s,state:service==='turn_off'?'off':'on',attributes:{...s.attributes,...data}}));}}/>}
 </main>;
}
createRoot(document.getElementById('root')!).render(<Test/>);
