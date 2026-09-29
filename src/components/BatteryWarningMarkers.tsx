import { useEffect, useRef, useState } from 'react';
import { TriangleAlert } from 'lucide-react';
import { Vector3, type Scene } from '@babylonjs/core';
import type { AppConfig, HAState } from '../types';
import { getActiveHAConnection } from '../services/haWebSocket';
import { batteryWarnings, type BatteryRegistryEntry } from '../services/batteryWarning';
import { WATER_LEAK_SENSORS } from '../services/waterLeak';
import { getMarkerProjection, setMarkerStyle } from '../babylon/MarkerProjection';
import { createDoorRigs, doorMarkerAnchor } from '../babylon/DoorAnimation';
import './BatteryWarningMarkers.css';

export default function BatteryWarningMarkers({ scene, config, states, connected, registryOverride }: {
  scene: Scene; config: AppConfig; states: Record<string, HAState>; connected: boolean;
  registryOverride?: BatteryRegistryEntry[];
}) {
  const [registry, setRegistry] = useState<BatteryRegistryEntry[]>([]);
  const refs = useRef<Record<string, HTMLSpanElement | null>>({});
  useEffect(() => {
    if (!connected || registryOverride) return;
    let cancelled = false;
    void getActiveHAConnection()?.request({ type: 'config/entity_registry/list' }).then(result => {
      if (!cancelled && Array.isArray(result)) setRegistry(result);
    }).catch(() => { if (!cancelled) setRegistry([]); });
    return () => { cancelled = true; };
  }, [connected, registryOverride, config]);
  const objects = config.model?.floorplan?.objects ?? [];
  const candidates = objects.filter(o => o.entityId && /^(sensor|binary_sensor|lock)\./.test(o.entityId)).map(o => ({
    id: o.id, entityId: o.entityId, label: o.label, anchorId: o.doorLock?.doorId ?? o.id, water: '',
  }));
  for (const sensor of WATER_LEAK_SENSORS) candidates.push({ id: sensor.entityId, entityId: sensor.entityId, label: `Wassersensor ${sensor.location}`, anchorId: '', water: sensor.anchor });
  const warnings = candidates.flatMap(candidate => {
    const messages = batteryWarnings(candidate.entityId, registryOverride ?? registry, states, connected);
    return messages.length ? [{ ...candidate, text: `${candidate.label}: ${[...new Set(messages)].join(' · ')}` }] : [];
  });
  const key = warnings.map(w => w.id).join('|');
  useEffect(() => {
    if (!key) return;
    const scale = config.model?.scale ?? 1;
    const rigs = new Map(createDoorRigs(scene).map(rig => [rig.id, rig]));
    const anchors = warnings.map(warning => {
      const object = objects.find(o => warning.water === 'washer' ? o.appliance?.kind === 'washer' : o.id === warning.anchorId);
      const rig = object && rigs.get(object.id);
      const point = rig ? doorMarkerAnchor(scene, rig) : object ? new Vector3(object.position.x, warning.water ? .12 : object.position.y + object.size.height / 2 + .12, object.position.z).scale(scale) : null;
      return { ...warning, point };
    });
    let nextSinkLookup = 0;
    const observer = scene.onAfterRenderObservable.add(() => {
      const projection = getMarkerProjection(scene); if (!projection) return;
      const { rect, width, height } = projection;
      for (const anchor of anchors) {
        const element = refs.current[anchor.id]; if (!element) continue;
        // A missing anchor mesh is looked up at most once per second, not on every frame.
        if (!anchor.point && anchor.water === 'sink' && performance.now() >= nextSinkLookup) {
          nextSinkLookup = performance.now() + 1000;
          const sink = scene.meshes.find(mesh => /^Spuelschwamm(?:\.|$)/.test(mesh.name) && mesh.getTotalVertices() > 0);
          if (sink) { anchor.point = sink.getBoundingInfo().boundingBox.centerWorld.clone(); anchor.point.y = .12 * scale; }
        }
        if (!anchor.point) continue;
        const p = projection.project(anchor.point);
        setMarkerStyle(element, 'display', p.z < 0 || p.z > 1 || p.x < 0 || p.x > width || p.y < 0 || p.y > height ? 'none' : 'grid');
        setMarkerStyle(element, 'left', `${rect.left + p.x / width * rect.width + 16}px`);
        setMarkerStyle(element, 'top', `${rect.top + p.y / height * rect.height - 16}px`);
      }
    });
    return () => { scene.onAfterRenderObservable.remove(observer); };
  }, [scene, config, key]);
  return <>{warnings.map(warning => <span key={warning.id} ref={el => { refs.current[warning.id] = el; }} className="battery-warning-marker" style={{ display: 'none' }} role="img" aria-label={warning.text} title={warning.text}><TriangleAlert size={14}/></span>)}</>;
}
