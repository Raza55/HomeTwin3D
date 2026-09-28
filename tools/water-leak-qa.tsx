import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ArcRotateCamera, Engine, HemisphericLight, Scene, Vector3 } from '@babylonjs/core';
import { loadModel } from '../src/babylon/ModelLoader';
import { getConfig, getModelBlob } from '../src/services/configApi';
import WaterLeakMarkers from '../src/components/WaterLeakMarkers';
import { WATER_LEAK_SENSORS } from '../src/services/waterLeak';
import type { HAState } from '../src/types';
const canvas = document.querySelector<HTMLCanvasElement>('#scene')!, engine = new Engine(canvas, true), scene = new Scene(engine);
const camera = new ArcRotateCamera('preview', -Math.PI / 2, .4, 18, new Vector3(-7, .5, 5.5), scene);
camera.attachControl(canvas, true);
new HemisphericLight('sun', new Vector3(0, 1, 0), scene).intensity = 1.2;
engine.runRenderLoop(() => scene.render()); window.addEventListener('resize', () => engine.resize());
const config = getConfig(); await loadModel(scene, (await getModelBlob())!, undefined, { showTextures: true });
function QA() {
  const [value, setValue] = useState('on'), [connected, setConnected] = useState(true);
  const states = Object.fromEntries(WATER_LEAK_SENSORS.map(sensor => [sensor.entityId, { entity_id: sensor.entityId, state: value, attributes: {}, last_changed: '', last_updated: '' } as HAState]));
  return <><nav>Alarm-Simulation · keine echten Sensoränderungen<br/>
    <button onClick={() => setValue('on')}>Alarm</button><button onClick={() => setValue('off')}>Trocken</button><button onClick={() => setValue('unavailable')}>Nicht verfügbar</button>
    <button onClick={() => setConnected(v => !v)}>Verbindung wechseln</button><p>{connected ? value : 'Getrennt'}</p>
  </nav><WaterLeakMarkers scene={scene} config={config} states={states} connected={connected}/></>;
}
createRoot(document.getElementById('root')!).render(<QA/>);
