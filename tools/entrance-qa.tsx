import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Engine, Scene, ArcRotateCamera, Vector3, HemisphericLight, SceneLoader } from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import VisualMatchingGuide from '../src/components/VisualMatchingGuide';
import DoorStatus from '../src/components/DoorStatus';
import DoorMarkers from '../src/components/DoorMarkers';
import { floorplanId } from '../src/babylon/FloorplanBindings';
import { readFloorplanManifest, applyFloorplanMappings } from '../src/services/floorplanImport';
import type { AppConfig, HAState } from '../src/types';
const inventory = async () => ({ entities: [
  { entity_id: 'binary_sensor.essplatz', friendly_name: 'Fenstertür Essplatz', deviceClass: 'window', areaName: 'Wohn- und Essbereich' },
  { entity_id: 'lock.front', friendly_name: 'Haustuer Schloss', areaName: 'Flur' },
  { entity_id: 'binary_sensor.motion', friendly_name: 'Bewegung Essplatz', deviceClass: 'motion' },
], lightTypes: {}, note: 'Isolierter Test – keine Verbindung zu Home Assistant.' });

function QA() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [scene, setScene] = useState<Scene>(); const [config, setConfig] = useState<AppConfig>();
  const [lockValue, setLockValue] = useState('locked');
  const [objectId, setObjectId] = useState<string>();
  const [matching, setMatching] = useState(false); const [connected, setConnected] = useState(true);
  const [status, setStatus] = useState('Modell wird geladen');
  const [state, setState] = useState<HAState>({ entity_id: 'binary_sensor.essplatz', state: 'off', last_changed: new Date().toISOString(), attributes: {} });
  useEffect(() => {
    const engine = new Engine(canvas.current!, true); const s = new Scene(engine);
    const camera = new ArcRotateCamera('camera', -Math.PI / 2, 1.05, 5, new Vector3(-11, 1, 5), s);
    camera.attachControl(canvas.current, true);new HemisphericLight('day', new Vector3(0, 1, 0), s);
    let disposed = false;
    void (async () => {
      const response = await fetch('/HomeTwin3D/.qa/v87.glb'); const blob = await response.blob();
      const manifest = (await readFloorplanManifest(blob))!;
      const url = URL.createObjectURL(blob);
      try { await SceneLoader.ImportMeshAsync('', '', url, s, undefined, '.glb'); } finally { URL.revokeObjectURL(url); }
      if (disposed) return;
      s.animationGroups.forEach(g => g.stop());
      const target = manifest.objects.find(o => o.door?.kind === 'entrance')!;
      target.entityId = 'binary_sensor.essplatz';
      const lock = manifest.objects.find(o => o.doorLock?.doorId === target.id)!;lock.entityId = 'lock.front';
      const next = applyFloorplanMappings({ location: { latitude: 0, longitude: 0 }, lights: [] }, { ...manifest, objects: [target, lock] });

      // Isolate the inspected pair for clear movement QA; source model stays intact.
      for (const mesh of s.meshes) if (mesh.getTotalVertices() && floorplanId(mesh) !== target.id && !mesh.name.startsWith('WZ_Essplatz_Links')) mesh.setEnabled(false);
      const meshes = s.meshes.filter(m => floorplanId(m) === target.id && m.getTotalVertices());
      const center = meshes.reduce((sum, m) => { m.computeWorldMatrix(true); return sum.add(m.getBoundingInfo().boundingBox.centerWorld); }, Vector3.Zero()).scale(1 / meshes.length);
      camera.setTarget(center);camera.alpha = -.6;camera.beta = 1.05;camera.radius = 4;
      setConfig(next);setScene(s);setStatus(`Geladen: ${manifest.objects.filter(o => o.door).length} Türkontakte`);
    })().catch(e => setStatus(String(e)));
    engine.runRenderLoop(() => s.render()); return () => { disposed = true;engine.dispose(); };
  }, []);
  const signal = (value: string, minutes: number) => setState({ entity_id: 'binary_sensor.essplatz', state: value, last_changed: new Date(Date.now() - minutes * 60000).toISOString(), attributes: {} });
  return <><canvas ref={canvas} style={{ width: '100vw', height: '100vh' }}/><div style={{ position: 'fixed', top: 10, left: 10, background: '#fff', padding: 10, maxWidth: 480 }}>
    <button onClick={() => setLockValue(v => v === "locked" ? "unlocked" : "locked")}>Schloss umschalten</button><p role="status">{status}</p><button onClick={() => setMatching(true)}>Tür zuordnen</button>
    <button onClick={() => signal('off', 0)}>Geschlossen</button><button onClick={() => signal('on', 2)}>2 Minuten offen</button>
    <button onClick={() => signal('on', 16)}>16 Minuten offen</button><button onClick={() => signal('unavailable', 0)}>Nicht verfügbar</button>
    <button onClick={() => { signal('on', 14.95); }}>Schwelle in 3 Sekunden</button>
    <button onClick={() => setConnected(c => !c)}>Verbindung umschalten</button>
  </div>{scene && config && <DoorStatus scene={scene} config={config} states={{ [state.entity_id]: state, 'lock.front': { entity_id: 'lock.front', state: lockValue, attributes: {} } }} connected={connected} />}
  {scene && config && !matching && <DoorMarkers scene={scene} config={config} states={{ [state.entity_id]: state, 'lock.front': { entity_id: 'lock.front', state: lockValue, attributes: {} } }} connected={connected} onAssign={id => { setObjectId(id);setMatching(true); }} />}
  {scene && config && matching && <VisualMatchingGuide scene={scene} initialConfig={config} objectId={objectId} category="other" loadInventory={inventory} onSave={next => { setConfig(next);setStatus('Zuordnung gespeichert: ' + next.model!.floorplan!.objects[0].entityId + ' · bisheriges Fenster: ' + (next.floorplanBindings?.find(o => o.id === 'previous-window')?.entityId || 'frei')); }} onClose={() => setMatching(false)} />}</>;
}
createRoot(document.getElementById('root')!).render(<QA />);
