import {getConfig,getModelBlob,uploadModel,restoreModel} from '../src/services/configApi';
import {saveObjectAsset} from '../src/services/storageApi';
import {readFloorplanManifest} from '../src/services/floorplanImport';
const status=document.querySelector('#status')!,button=document.querySelector<HTMLButtonElement>('#import')!;
try{
  const response=await fetch('../.qa/door-attach-v105.glb');if(!response.ok)throw Error('v105-Modell fehlt');
  const blob=await response.blob(),manifest=(await readFloorplanManifest(blob))!;
  for(const object of manifest.objects.filter(o=>o.it)){
    const li=document.createElement('li');li.textContent=`${object.label}: ${object.it!.devices.map(d=>d.statusEntityId||'Zuordnung vorbereitet').join(', ')}`;document.querySelector('#objects')!.append(li);
  }
  status.textContent=`Vorhandener Plan: ${getConfig().model?.floorplan?.source??'Keiner'}. Anbauteile an Innentüren (Bademantel-Futter, Jackenärmel, Klinke) schwenken mit der Tür. Alle anderen Zuordnungen bleiben erhalten.`;
  button.disabled=false;
  button.onclick=async()=>{
    button.disabled=true;const before=getConfig(),previous=await getModelBlob();
    try{
      localStorage.setItem('config:before-door-attach-v105',JSON.stringify(before));
      if(previous)await saveObjectAsset('model:before-door-attach-v105',previous);
      await uploadModel(blob);const after=getConfig();
      if(before.model?.floorplan?.objects.some(o=>!after.model?.floorplan?.objects.some(n=>n.id===o.id&&n.entityId===o.entityId)))throw Error('Bestehende Zuordnung abweichend');
      status.textContent='v105 übernommen. Türanbauteile schwenken mit. Bestehende Zuordnungen erhalten; Backup gespeichert.';
    }catch(error){await restoreModel(previous,before);status.textContent=String(error);button.disabled=false;}
  };
}catch(error){status.textContent=String(error);}
