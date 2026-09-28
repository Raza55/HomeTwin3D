import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import BlindQuickControls from '../src/components/BlindQuickControls';
import type {AppConfig,HAState} from '../src/types';
const config={model:{floorplan:{objects:['a','b','offline','other'].map((id,i)=>({domain:'cover',entityId:`cover.${id}`,room:i===3?'Schlafzimmer':'Wohnzimmer'}))}}} as AppConfig;
const states=Object.fromEntries(['a','b','offline','other'].map(id=>[`cover.${id}`,{entity_id:`cover.${id}`,state:id==='offline'?'unavailable':'open',attributes:{current_position:65,supported_features:15}}])) as Record<string,HAState>;
function App(){const [calls,setCalls]=useState<string[]>([]);const record=async(action:string,id:string,p?:number)=>{setCalls(c=>[...c,`${action} ${id}${p===undefined?'':` ${p}`}`]);};return <><pre aria-label="Testbefehle">{calls.join('\n')||'Noch keine Befehle'}</pre><BlindQuickControls visible entityId="cover.a" label="Wohnzimmer · Fenster links" state={states['cover.a']} states={states} config={config} connected anchor={{x:280,y:150}} onClose={()=>{}} onOpenCover={id=>record('open_cover',id)} onCloseCover={id=>record('close_cover',id)} onStopCover={id=>record('stop_cover',id)} onSetPosition={(id,p)=>record('set_cover_position',id,p)}/></>;}createRoot(document.querySelector('#root')!).render(<App/>);
