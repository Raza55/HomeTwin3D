import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ArcRotateCamera, Engine, HemisphericLight, Scene, Vector3 } from '@babylonjs/core';
import { loadModel } from '../src/babylon/ModelLoader';
import { bindFloorplanMeshes } from '../src/babylon/FloorplanBindings';
import { readFloorplanManifest, applyFloorplanMappings } from '../src/services/floorplanImport';
import { getConfig, getModelBlob, uploadModel, restoreModel } from '../src/services/configApi';
import { saveObjectAsset } from '../src/services/storageApi';
import FanMarkers from '../src/components/FanMarkers';
import VisualMatchingGuide from '../src/components/VisualMatchingGuide';
import type { AppConfig, HAState } from '../src/types';

const canvas = document.querySelector<HTMLCanvasElement>('#scene')!;
const engine = new Engine(canvas, true), scene = new Scene(engine);
const camera = new ArcRotateCamera('camera', -Math.PI / 2, .55, 5, new Vector3(-7.3, .8, 11), scene);
camera.attachControl(canvas, true);
new HemisphericLight('sun', new Vector3(0, 1, 0), scene).intensity = 1.4;
engine.runRenderLoop(() => scene.render()); window.addEventListener('resize', () => engine.resize());
const blob = await (await fetch('../.qa/balcony-v94.glb')).blob();
const manifest = (await readFloorplanManifest(blob))!;
const initial = applyFloorplanMappings({ lights: [], location: { latitude: 0, longitude: 0 } }, manifest);
const model = await loadModel(scene, blob, undefined, { showTextures: true });
bindFloorplanMeshes(scene, model.meshes, initial, {});
const state = (entity_id: string, value: string, percentage = 0) => ({ entity_id, state: value, attributes: { percentage, percentage_step: 10, supported_features: 63 }, last_changed: '', last_updated: '' } as HAState);
function QA() {
  const [config, setConfig] = useState<AppConfig>(initial);
  const [open, setOpen] = useState<string | null>(null);
  const [matching, setMatching] = useState<string | null>(null);
  const [connected, setConnected] = useState(true);
  const [note, setNote] = useState('Simulation · keine HA-Befehle');
  const [states, setStates] = useState<Record<string, HAState>>({
    'fan.turmventilator': state('fan.turmventilator', 'on', 40),
    'fan.balcony_air_purifier': state('fan.balcony_air_purifier', 'on', 70),
    'sensor.rauchstatus_balkon': state('sensor.rauchstatus_balkon', 'Ja'),
  });
  const assign = (id: string) => { setOpen(null); setMatching(id); };
  scene.onPointerPick = (_event, pick) => {
    const id = pick.pickedMesh?.metadata?.smartDeviceId;
    const device = config.smartDevices?.find(o => o.id === id);
    if (device?.floorplanIds?.length) setOpen(device.floorplanIds[0]);
  };
  return <><nav style={{ position: 'fixed', top: 12, left: 12, padding: 16, background: '#14212ef2', borderRadius: 12, maxWidth: 330 }}>
    <strong>Balkon · Funktionsprüfung</strong><p>{note}</p>
    <button onClick={() => setStates(s => ({ ...s, 'sensor.rauchstatus_balkon': state('sensor.rauchstatus_balkon', s['sensor.rauchstatus_balkon'].state === 'Ja' ? 'Nein' : 'Ja') }))}>Rauch Ja / Nein</button>
    <button onClick={() => setConnected(v => !v)}>Verbindung {connected ? 'trennen' : 'herstellen'}</button>
    <p><button onClick={() => assign(manifest.objects.find(o => o.entityId === 'fan.turmventilator')!.id)}>Lüfter-Wizard</button></p>
    <p>Gespeicherter Plan: {getConfig().model?.floorplan?.source ?? 'Keiner auf dieser Browser-Origin'}</p>
    <button onClick={async () => {
      const before = getConfig(), previous = await getModelBlob();
      try {
        localStorage.setItem('config:before-balcony-v94', JSON.stringify(before));
        if (previous) await saveObjectAsset('model:before-balcony-v94', previous);
        await uploadModel(blob);
        const after = getConfig();
        if (before.model?.floorplan?.objects.some(o => !after.model?.floorplan?.objects.some(n => n.id === o.id && n.entityId === o.entityId))) throw Error('Bestehende Zuordnung abweichend');
        setNote('v94 importiert; bestehende Zuordnungen erhalten. Dashboard neu laden.');
      } catch (error) { await restoreModel(previous, before); setNote(String(error)); }
    }}>v94 in lokalen Plan übernehmen (mit Backup)</button>
  </nav>
  {!matching && <FanMarkers scene={scene} config={config} states={states} connected={connected} open={open} onOpen={setOpen} onAssign={assign} onCommand={async (entityId, service, data) => {
    setNote(`Simuliert: fan.${service} · ${entityId}${data ? ` · ${data.percentage} %` : ''}`);
    setStates(s => ({ ...s, [entityId]: state(entityId, service === 'turn_off' || data?.percentage === 0 ? 'off' : 'on', Number(data?.percentage ?? (service === 'turn_on' ? 50 : 0))) }));
  }}/>}
  {matching && <VisualMatchingGuide scene={scene} initialConfig={config} objectId={matching} category="other" onClose={() => setMatching(null)} onSave={setConfig} loadInventory={async () => ({ entities: manifest.objects.filter(o => o.room === 'Balkon' && o.entityId).map(o => ({ entity_id: o.entityId, friendly_name: o.label })), lightTypes: {}, note: 'Simulierte Zuordnung; keine echten Einstellungen werden verändert.' })}/>}
  </>;
}
createRoot(document.getElementById('root')!).render(<QA/>);
