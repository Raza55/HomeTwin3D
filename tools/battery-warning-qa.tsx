import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ArcRotateCamera, Engine, HemisphericLight, Scene, Vector3 } from '@babylonjs/core';
import { loadModel } from '../src/babylon/ModelLoader';
import { getConfig, getModelBlob } from '../src/services/configApi';
import BatteryWarningMarkers from '../src/components/BatteryWarningMarkers';
import DoorMarkers from '../src/components/DoorMarkers';
import { WATER_LEAK_SENSORS } from '../src/services/waterLeak';
import type { HAState } from '../src/types';
const canvas = document.querySelector<HTMLCanvasElement>('#scene')!, engine = new Engine(canvas, true), scene = new Scene(engine);
const camera = new ArcRotateCamera('preview', -Math.PI / 2, .4, 18, new Vector3(-7, .5, 5.5), scene);
camera.attachControl(canvas, true);
new HemisphericLight('sun', new Vector3(0, 1, 0), scene).intensity = 1.2;
engine.runRenderLoop(() => scene.render()); window.addEventListener('resize', () => engine.resize());
const config = getConfig(); await loadModel(scene, (await getModelBlob())!, undefined, { showTextures: true });
const ids = [...(config.model?.floorplan?.objects.filter(o => o.door && o.entityId).map(o => o.entityId) ?? []), ...WATER_LEAK_SENSORS.map(s => s.entityId)];
const registry = ids.flatMap((id, index) => [{ entity_id: id, device_id: id }, { entity_id: `sensor.test_battery_${index}`, device_id: id }]);
function QA() {
  const [value, setValue] = useState('10'), [connected, setConnected] = useState(true);
  const states: Record<string, HAState> = Object.fromEntries(ids.map((id,index) => [`sensor.test_battery_${index}`, { entity_id: `sensor.test_battery_${index}`, state: value, attributes: { device_class: 'battery', unit_of_measurement: '%' }, last_changed: '', last_updated: '' }]));
  return <><nav>Simulation · keine echten Sensoränderungen<br/>
    <button onClick={() => setValue('10')}>Batterie schwach</button><button onClick={() => setValue('80')}>Batterie normal</button>
    <button onClick={() => setConnected(v => !v)}>Verbindung wechseln</button><p>{connected ? `${value} %` : 'Getrennt'}</p>
  </nav><DoorMarkers scene={scene} config={config} states={states} connected={connected} onAssign={() => {}}/>
    <BatteryWarningMarkers scene={scene} config={config} states={states} connected={connected} registryOverride={registry}/></>;
}
createRoot(document.getElementById('root')!).render(<QA/>);
