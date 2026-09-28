import { getConfig, getModelBlob, uploadModel, restoreModel } from '../src/services/configApi';
import { saveObjectAsset } from '../src/services/storageApi';
import { readFloorplanManifest } from '../src/services/floorplanImport';
const status = document.querySelector('#status')!, button = document.querySelector<HTMLButtonElement>('#import')!;
try {
  const response = await fetch('../.qa/v96.glb');
  if (!response.ok) throw Error('v96-Modell fehlt');
  const blob = await response.blob(), manifest = (await readFloorplanManifest(blob))!;
  for (const object of manifest.objects.filter(o => o.entityId === 'fan.balcony_air_purifier')) {
    const li = document.createElement('li'); li.textContent = `${object.label}: ${object.entityId}`; document.querySelector('#objects')!.append(li);
  }
  status.textContent = `Vorhandener Plan: ${getConfig().model?.floorplan?.source ?? 'Keiner'}. Bestehende Zuordnungen und Einstellungen werden erhalten.`;
  button.disabled = false;
  button.onclick = async () => {
    button.disabled = true;
    const before = getConfig(), previous = await getModelBlob();
    try {
      localStorage.setItem('config:before-dyson-v96', JSON.stringify(before));
      if (previous) await saveObjectAsset('model:before-dyson-v96', previous);
      await uploadModel(blob);
      const after = getConfig();
      if (before.model?.floorplan?.objects.some(o => !after.model?.floorplan?.objects.some(n => n.id === o.id && n.entityId === o.entityId))) throw Error('Bestehende Zuordnung abweichend');
      status.textContent = 'v96 übernommen. Dyson am Grill integriert; alle bisherigen Zuordnungen erhalten. Backup gespeichert.';
    } catch (error) { await restoreModel(previous, before); status.textContent = String(error); button.disabled = false; }
  };
} catch (error) { status.textContent = String(error); }
