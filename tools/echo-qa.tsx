import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ArcRotateCamera, Engine, HemisphericLight, Scene, Vector3 } from '@babylonjs/core';
import { loadModel } from '../src/babylon/ModelLoader';
import { bindFloorplanMeshes } from '../src/babylon/FloorplanBindings';
import { readFloorplanManifest, applyFloorplanMappings } from '../src/services/floorplanImport';
import EchoMarkers from '../src/components/EchoMarkers';
import VisualMatchingGuide from '../src/components/VisualMatchingGuide';
import type { AppConfig, HAState } from '../src/types';

const canvas = document.querySelector<HTMLCanvasElement>('#scene')!;
const engine = new Engine(canvas, true), scene = new Scene(engine);
const camera = new ArcRotateCamera('camera', -Math.PI / 2, .55, 17, new Vector3(-7, .8, 6), scene);
camera.attachControl(canvas, true);
new HemisphericLight('sun', new Vector3(0, 1, 0), scene).intensity = 1.4;
engine.runRenderLoop(() => scene.render()); window.addEventListener('resize', () => engine.resize());
const blob = await (await fetch('../.qa/echo-v95.glb')).blob();
const manifest = (await readFloorplanManifest(blob))!;
const initial = applyFloorplanMappings({ lights: [], location: { latitude: 0, longitude: 0 } }, manifest);
const model = await loadModel(scene, blob, undefined, { showTextures: true });
bindFloorplanMeshes(scene, model.meshes, initial, {});
const state = (entity_id: string, value: string, percentage = 0) => ({ entity_id, state: value, attributes: { volume_level: percentage / 100, supported_features: 318399 }, last_changed: '', last_updated: '' } as HAState);
function QA() {
  const [config, setConfig] = useState<AppConfig>(initial);
  const [open, setOpen] = useState<string | null>(null);
  const [matching, setMatching] = useState<string | null>(null);
  const [connected, setConnected] = useState(true);
  const [note, setNote] = useState('Simulation · keine HA-Befehle');
  const [states, setStates] = useState<Record<string, HAState>>({
    'media_player.bedroom_speaker': state('media_player.bedroom_speaker', 'idle', 26),
    'media_player.schlafzimmer_echo': state('media_player.schlafzimmer_echo', 'playing', 52),
    'media_player.room_display': state('media_player.room_display', 'paused', 57),
  });
  const assign = (id: string) => { setOpen(null); setMatching(id); };
  scene.onPointerPick = (_event, pick) => {
    const id = pick.pickedMesh?.metadata?.smartDeviceId;
    const device = config.smartDevices?.find(o => o.id === id);
    if (device?.floorplanIds?.length) setOpen(device.floorplanIds[0]);
  };
  return <><nav style={{ position: 'fixed', top: 12, left: 12, padding: 16, background: '#14212ef2', borderRadius: 12, maxWidth: 330 }}>
    <strong>Echo · Funktionsprüfung</strong><p>{note}</p>
    <button onClick={() => setConnected(v => !v)}>Verbindung {connected ? 'trennen' : 'herstellen'}</button>
    <p><button onClick={() => assign(manifest.objects.find(o => o.entityId === 'media_player.room_display')!.id)}>Echo-Wizard</button></p>
  </nav>
  {!matching && <EchoMarkers scene={scene} config={config} states={states} connected={connected} open={open} onOpen={setOpen} onAssign={assign} onCommand={async (entityId, service, data) => {
    setNote(`Simuliert: media_player.${service} · ${entityId}${data ? ` · ${data.volume_level}` : ''}`);
    setStates(s => ({ ...s, [entityId]: state(entityId, service === 'media_play' ? 'playing' : service === 'media_pause' ? 'paused' : s[entityId].state, Number(data?.volume_level ?? s[entityId].attributes.volume_level) * 100) }));
  }}/>}
  {matching && <VisualMatchingGuide scene={scene} initialConfig={config} objectId={matching} category="other" onClose={() => setMatching(null)} onSave={setConfig} loadInventory={async () => ({ entities: manifest.objects.filter(o => o.echo && o.entityId).map(o => ({ entity_id: o.entityId, friendly_name: o.label })), lightTypes: {}, note: 'Simulierte Zuordnung; keine echten Einstellungen werden verändert.' })}/>}
  </>;
}
createRoot(document.getElementById('root')!).render(<QA/>);
