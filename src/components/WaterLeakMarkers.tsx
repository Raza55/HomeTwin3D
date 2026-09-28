import { useEffect, useRef } from 'react';
import { Droplets } from 'lucide-react';
import { Vector3, type Scene } from '@babylonjs/core';
import type { AppConfig, HAState } from '../types';
import { getMarkerProjection, setMarkerStyle } from '../babylon/MarkerProjection';
import { WATER_LEAK_SENSORS, waterLeakActive } from '../services/waterLeak';
import './WaterLeakMarkers.css';

export default function WaterLeakMarkers({ scene, config, states, connected }: {
  scene: Scene; config: AppConfig; states: Record<string, HAState>; connected: boolean;
}) {
  const refs = useRef<Record<string, HTMLDivElement | null>>({});
  const active = WATER_LEAK_SENSORS.filter(sensor => waterLeakActive(states[sensor.entityId], connected));
  const activeKey = active.map(sensor => sensor.entityId).join('|');
  useEffect(() => {
    if (!activeKey) return;
    const washer = config.model?.floorplan?.objects.find(object => object.appliance?.kind === 'washer');
    const scale = config.model?.scale ?? 1;
    const washerPoint = washer ? new Vector3(washer.position.x, .12, washer.position.z).scale(scale) : null;
    // The sink is part of the static kitchen mesh; its sponge provides a local anchor.
    let sink = scene.meshes.find(mesh => /^Spuelschwamm(?:\.|$)/.test(mesh.name) && mesh.getTotalVertices() > 0);
    const point = Vector3.Zero();
    const observer = scene.onAfterRenderObservable.add(() => {
      const projection = getMarkerProjection(scene); if (!projection) return;
      const { rect, width, height } = projection;
      if (!sink || sink.isDisposed()) sink = scene.meshes.find(mesh => /^Spuelschwamm(?:\.|$)/.test(mesh.name) && mesh.getTotalVertices() > 0);
      for (const sensor of WATER_LEAK_SENSORS) {
        const element = refs.current[sensor.entityId]; if (!element) continue;
        if (sensor.anchor === 'washer' && washerPoint) point.copyFrom(washerPoint);
        else if (sensor.anchor === 'sink' && sink) {
          point.copyFrom(sink.getBoundingInfo().boundingBox.centerWorld);
          point.y = .12 * scale;
        } else { setMarkerStyle(element, 'display', 'none'); continue; }
        // Active leak warnings remain visible through cabinets and walls.
        const p = projection.project(point);
        setMarkerStyle(element, 'display', p.z < 0 || p.z > 1 || p.x < 0 || p.x > width || p.y < 0 || p.y > height ? 'none' : 'flex');
        setMarkerStyle(element, 'left', `${rect.left + p.x / width * rect.width}px`);
        setMarkerStyle(element, 'top', `${rect.top + p.y / height * rect.height}px`);
      }
    });
    return () => { scene.onAfterRenderObservable.remove(observer); };
  }, [scene, config, activeKey]);
  return <>{active.map(sensor => <div key={sensor.entityId} ref={el => { refs.current[sensor.entityId] = el; }}
    className="water-leak-marker" role="alert" style={{ display: 'none' }}>
    <Droplets size={23}/><strong>Wasserleck erkannt</strong><span>{sensor.location}</span>
  </div>)}</>;
}
