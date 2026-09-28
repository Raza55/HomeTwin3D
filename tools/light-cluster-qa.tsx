import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import LightClusterControls,{type ClusterMember} from '../src/components/LightClusterControls';
function Test(){
 const [anchor,setAnchor]=useState({x:90,y:180,pinned:true});
 const [members,setMembers]=useState<ClusterMember[]>(Array.from({length:4},(_,i)=>({entityId:`light.spot_${i+1}`,label:`Küchenspot ${i+1}`,state:{entity_id:`light.spot_${i+1}`,state:'on',attributes:{brightness:170,supported_color_modes:['rgb','color_temp'],color_temp_kelvin:3000,hs_color:[35,85]}}})));
 const [calls,setCalls]=useState<string[]>([]);
 return <main style={{padding:24}}><h1>Küchenspots · gemeinsame Steuerung</h1><p>Isolierte Vorschau mit vier Testleuchten – keine echten Geräte</p>
 <button onClick={()=>setAnchor({x:window.innerWidth-20,y:window.innerHeight-20,pinned:true})}>Am Bildschirmrand anzeigen</button>
 <pre role="status" style={{marginLeft:360,whiteSpace:'pre-wrap'}}>{calls.length} Befehle{calls.map(c=>'\n'+c)}</pre>
 <LightClusterControls label="Küchenspots" members={members} connected={true} anchor={anchor} onClose={()=>{}} onEnter={()=>{}} onLeave={()=>{}} onPin={()=>{}} onMore={()=>{}} onCommand={async(entityId,service,data)=>{setCalls(c=>[...c,JSON.stringify({entityId,service,data})]);setMembers(ms=>ms.map(m=>m.entityId===entityId?{...m,state:{...m.state!,state:service==='turn_off'?'off':'on',attributes:{...m.state!.attributes,...data}}}:m));}}/>
 </main>;
}
createRoot(document.getElementById('root')!).render(<Test/>);
