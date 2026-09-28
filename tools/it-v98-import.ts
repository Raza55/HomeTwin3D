import {getConfig,getModelBlob,uploadModel,restoreModel} from '../src/services/configApi';
import {saveObjectAsset} from '../src/services/storageApi';
import {readFloorplanManifest} from '../src/services/floorplanImport';
const status=document.querySelector('#status')!,button=document.querySelector<HTMLButtonElement>('#import')!;
const retired='cfeb684f-ab77-51ef-8677-8fb7af317deb';
try{
  const response=await fetch('../.qa/it-v98.glb');if(!response.ok)throw Error('v98-Modell fehlt');
  const blob=await response.blob(),manifest=(await readFloorplanManifest(blob))!;
  for(const object of manifest.objects.filter(o=>o.it)){
    const li=document.createElement('li');li.textContent=`${object.label}: ${object.it!.devices.map(d=>d.statusEntityId||'Zuordnung vorbereitet').join(', ')}`;document.querySelector('#objects')!.append(li);
  }
  status.textContent=`Vorhandener Plan: ${getConfig().model?.floorplan?.source??'Keiner'}. PC-RGB wird durch den PC-Status gesteuert. Alle anderen Zuordnungen bleiben erhalten.`;
  button.disabled=false;
  button.onclick=async()=>{
    button.disabled=true;const before=getConfig(),previous=await getModelBlob();
    try{
      localStorage.setItem('config:before-it-v98',JSON.stringify(before));
      if(previous)await saveObjectAsset('model:before-it-v98',previous);
      await uploadModel(blob);const after=getConfig();
      if(before.model?.floorplan?.objects.some(o=>o.id!==retired&&!after.model?.floorplan?.objects.some(n=>n.id===o.id&&n.entityId===o.entityId)))throw Error('Bestehende Zuordnung abweichend');
      status.textContent='v98 übernommen. DesktopMain, zweiter PC und Servergruppe integriert. Bestehende Zuordnungen erhalten; Backup gespeichert.';
    }catch(error){await restoreModel(previous,before);status.textContent=String(error);button.disabled=false;}
  };
}catch(error){status.textContent=String(error);}
