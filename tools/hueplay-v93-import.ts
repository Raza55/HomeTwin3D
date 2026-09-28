import {getConfig,uploadModel,updateConfig} from '../src/services/configApi';
import {readFloorplanManifest,mergeFloorplan,applyFloorplanMappings} from '../src/services/floorplanImport';
const status=document.querySelector('#status')!,button=document.querySelector<HTMLButtonElement>('#import')!;
button.disabled=false;status.textContent='Beide Hue Play wiederherstellen';
button.onclick=async()=>{button.disabled=true;try{
 const blob=await(await fetch('../.qa/hueplay-v93.glb')).blob(),manifest=(await readFloorplanManifest(blob))!;
 const before=getConfig();localStorage.setItem('config:before-hueplay-v93',JSON.stringify(before));
 await uploadModel(blob);
 const merged=getConfig();const restored=merged.model!.floorplan!.objects.find(o=>o.id==='7bd84ba8-5d43-546c-a9db-9382b4490098')!;
 restored.entityId='';updateConfig(applyFloorplanMappings(merged,merged.model!.floorplan));
 const after=getConfig();
 if(before.model!.floorplan!.objects.some(o=>!after.model!.floorplan!.objects.some(n=>n.id===o.id&&n.entityId===o.entityId)))throw Error('Bestehende Zuordnung abweichend');
 status.textContent='Beide Leuchten importiert. Rechte Leuchte unverändert; linke Leuchte separat zuordenbar.';button.textContent='Import erfolgreich';
}catch(e){status.textContent=String(e);button.disabled=false;}};
