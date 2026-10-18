import React, { useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import LightQuickControls from '../src/components/LightQuickControls';
import HueSyncControls from '../src/components/HueSyncControls';
import { HUE_SYNC_SWITCH, HUE_SYNC_AREA, HUE_SYNC_AREA_NAME, HUE_SYNC_MEMBERS, isHueSyncLocked } from '../src/services/hueSync';
import type { HAState } from '../src/types';
import type { HALike } from '../src/services/haWebSocket';
function Preview() {
  const [open,setOpen]=useState(true),[calls,setCalls]=useState(0);
  const [states,setStates]=useState<Record<string,HAState>>(()=>Object.fromEntries([
    {entity_id:HUE_SYNC_SWITCH,state:'on',attributes:{}},
    {entity_id:HUE_SYNC_AREA,state:HUE_SYNC_AREA_NAME,attributes:{}},
    ...HUE_SYNC_MEMBERS.map(entity_id=>({entity_id,state:'off',attributes:{supported_color_modes:['rgb'],brightness:100}})),
  ].map(s=>[s.entity_id,s])));
  const current=useRef(states);current.current=states;
  const ha={isConnected:true,callService:async(_domain:string,service:string,id:string,data?:Record<string,unknown>)=>{
    setCalls(c=>c+1);await new Promise(r=>setTimeout(r,100));
    setStates(s=>({...s,[id]:{...s[id],state:service==='turn_on'?'on':'off',attributes:{...s[id].attributes,...data}}}));
  }} as HALike;
  return <main style={{background:'#17202e',color:'white',minHeight:'100vh',fontFamily:'system-ui',padding:12}}>
    <h1>Hue Sync</h1><p>Testdaten · keine echten Gerätebefehle</p><p data-testid="calls">{calls}</p><button onClick={()=>setOpen(true)}>Lampe öffnen</button>
    {open&&<LightQuickControls label="TV-Lampe" state={states[HUE_SYNC_MEMBERS[0]]} connected anchor={{x:20,y:140,pinned:true}}
      syncLocked={isHueSyncLocked(HUE_SYNC_MEMBERS[0],states)} onClose={()=>setOpen(false)} onPin={()=>{}} onEnter={()=>{}} onLeave={()=>{}} onMore={()=>{}} onCommand={async()=>{setCalls(c=>c+1);}}
      syncControls={<HueSyncControls states={states} connected getConnection={()=>ha} getStates={()=>current.current} onContinue={()=>setOpen(false)}/>}/>}
  </main>;
}
createRoot(document.getElementById('root')!).render(<Preview/>);
