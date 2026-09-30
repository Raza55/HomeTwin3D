import { useRef } from 'react';
import { Droplets } from 'lucide-react';
import { Vector3, type Scene } from '@babylonjs/core';
import type { AppConfig, HAState } from '../types';
import { useMapMarkers } from './useMapMarkers';
import { WATER_LEAK_SENSORS, waterLeakActive } from '../services/waterLeak';
import './WaterLeakMarkers.css';
import { useEntityStatesVersion } from '../services/entityStateSignal';

export default function WaterLeakMarkers({ scene, config, states, connected }: {
  scene: Scene; config: AppConfig; states: Record<string, HAState>; connected: boolean;
}) {
  useEntityStatesVersion(); // re-render on state changes (see entityStateSignal)
  const refs = useRef<Record<string, HTMLDivElement | null>>({});
  const active = WATER_LEAK_SENSORS.filter(sensor => waterLeakActive(states[sensor.entityId], connected));
  const activeKey = active.map(sensor => sensor.entityId).join('|');
  // Active leak warnings remain visible through cabinets and walls.
  useMapMarkers(scene, () => {
    if (!activeKey) return [];
    const washer = config.model?.floorplan?.objects.find(object => object.appliance?.kind === 'washer');
    const scale = config.model?.scale ?? 1;
    const washerPoint = washer ? new Vector3(washer.position.x, .12, washer.position.z).scale(scale) : null;
    // The sink is part of the static kitchen mesh; its sponge provides a local anchor.
    const findSink = () => scene.meshes.find(mesh => /^Spuelschwamm(?:\.|$)/.test(mesh.name) && mesh.getTotalVertices() > 0);
    let sink = findSink();
    let nextSinkLookup = 0;
    return WATER_LEAK_SENSORS.map(sensor => ({
      id: sensor.entityId, element: () => refs.current[sensor.entityId], display: 'flex', interactive: false,
      anchor: (out: Vector3) => {
        if (sensor.anchor === 'washer') return washerPoint ? out.copyFrom(washerPoint) : null;
        // A missing anchor mesh is looked up at most once per second, not on every frame.
        if ((!sink || sink.isDisposed()) && performance.now() >= nextSinkLookup) { nextSinkLookup = performance.now() + 1000; sink = findSink(); }
        if (sensor.anchor !== 'sink' || !sink) return null;
        out.copyFrom(sink.getBoundingInfo().boundingBox.centerWorld);
        out.y = .12 * scale;
        return out;
      },
    }));
  }, [config, activeKey]);
  return <>{active.map(sensor => <div key={sensor.entityId} ref={el => { refs.current[sensor.entityId] = el; }}
    className="water-leak-marker" role="alert" style={{ display: 'none' }}>
    <Droplets size={23}/><strong>Wasserleck erkannt</strong><span>{sensor.location}</span>
  </div>)}</>;
}
