import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Engine, Scene, ArcRotateCamera, Vector3, HemisphericLight, MeshBuilder } from '@babylonjs/core';
import VisualMatchingGuide from '../src/components/VisualMatchingGuide';
import type { AppConfig } from '../src/types';
import type { MatchingInventory } from '../src/services/matchingInventory';
const config: AppConfig = {location:{latitude:0,longitude:0},lights:[],model:{floorplan:{version:1,source:'QA',coordinateSystem:'babylon-lh-meters',objects:[1,2,3].map(n=>({id:`qa-${n}`,label:`Küchenspot ${n}`,room:'Küche',domain:'light',entityId:'',position:{x:(n-2)*2,y:1,z:0},size:{width:.2,height:.2,depth:.2},rotationY:0}))}}};
const inventory: MatchingInventory = {entities:[1,2,3].map(n=>({entity_id:`light.spot_${n}`,friendly_name:`Küchenspot ${n}`,areaId:'k',areaName:'Küche'})),lightTypes:{'light.spot_1':'rgb','light.spot_2':'rgb','light.spot_3':'rgb'},note:''};
const loadInventory=async()=>inventory;
function QA(){
  const canvas=useRef<HTMLCanvasElement>(null);const [scene,setScene]=useState<Scene|null>(null);const [open,setOpen]=useState(true);const [fail,setFail]=useState(false);const [report,setReport]=useState('Keine Zuordnung gespeichert');
  useEffect(()=>{const engine=new Engine(canvas.current!,true);const s=new Scene(engine);const camera=new ArcRotateCamera('camera',1,.7,10,Vector3.Zero(),s);camera.attachControl(canvas.current,true);new HemisphericLight('day',Vector3.Up(),s);
    config.model!.floorplan!.objects.forEach(o=>{const mesh=MeshBuilder.CreateSphere(o.id,{diameter:.5},s);mesh.position.copyFromFloats(o.position.x,o.position.y,o.position.z);mesh.metadata={gltf:{extras:{ha_id:o.id}}};});
    setScene(s);engine.runRenderLoop(()=>s.render());return()=>engine.dispose();},[]);
  return <><canvas ref={canvas} style={{width:'100vw',height:'100vh',display:'block'}}/><div style={{position:'fixed',right:10,top:10}}><label><input type="checkbox" checked={fail} onChange={e=>setFail(e.target.checked)}/>Speicherfehler simulieren</label><pre role="status">{report}</pre></div>{scene&&open&&<VisualMatchingGuide scene={scene} initialConfig={config} loadInventory={loadInventory} onSave={next=>{if(fail)throw Error('Test: Speicher voll');setReport(JSON.stringify(next.floorplanBindings));}} onClose={()=>{setOpen(false);setReport('Assistent geschlossen');}}/>}</>;
}
createRoot(document.getElementById('root')!).render(<QA/>);
