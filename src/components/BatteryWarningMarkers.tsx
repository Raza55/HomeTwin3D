import { useEffect, useRef, useState } from 'react';
import { TriangleAlert } from 'lucide-react';
import { Vector3, type Scene } from '@babylonjs/core';
import type { AppConfig, HAState } from '../types';
import { getActiveHAConnection } from '../services/haWebSocket';
import { batteryWarnings, type BatteryRegistryEntry } from '../services/batteryWarning';
import { WATER_LEAK_SENSORS } from '../services/waterLeak';
import { useMapMarkers } from './useMapMarkers';
import { createDoorRigs, doorMarkerAnchor } from '../babylon/DoorAnimation';
import './BatteryWarningMarkers.css';
import { useEntityStatesVersion } from '../services/entityStateSignal';

export default function BatteryWarningMarkers({ scene, config, states, connected, registryOverride }: {
  scene: Scene; config: AppConfig; states: Record<string, HAState>; connected: boolean;
  registryOverride?: BatteryRegistryEntry[];
}) {
  useEntityStatesVersion(); // re-render on state changes (see entityStateSignal)
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
  useMapMarkers(scene, () => {
    if (!key) return [];
    const scale = config.model?.scale ?? 1;
    const rigs = new Map(createDoorRigs(scene).map(rig => [rig.id, rig]));
    let nextSinkLookup = 0;
    return warnings.map(warning => {
      const object = objects.find(o => warning.water === 'washer' ? o.appliance?.kind === 'washer' : o.id === warning.anchorId);
      const rig = object && rigs.get(object.id);
      let point = rig ? doorMarkerAnchor(scene, rig) : object ? new Vector3(object.position.x, warning.water ? .12 : object.position.y + object.size.height / 2 + .12, object.position.z).scale(scale) : null;
      return {
        id: warning.id, element: () => refs.current[warning.id], display: 'grid', offset: { x: 16, y: -16 },
        anchor: (out: Vector3) => {
          // A missing anchor mesh is looked up at most once per second, not on every frame.
          if (!point && warning.water === 'sink' && performance.now() >= nextSinkLookup) {
            nextSinkLookup = performance.now() + 1000;
            const sink = scene.meshes.find(mesh => /^Spuelschwamm(?:\.|$)/.test(mesh.name) && mesh.getTotalVertices() > 0);
            if (sink) { point = sink.getBoundingInfo().boundingBox.centerWorld.clone(); point.y = .12 * scale; }
          }
          return point ? out.copyFrom(point) : null;
        },
      };
    });
  }, [config, key]);
  return <>{warnings.map(warning => <span key={warning.id} ref={el => { refs.current[warning.id] = el; }} className="battery-warning-marker" style={{ display: 'none' }} role="img" aria-label={warning.text} title={warning.text}><TriangleAlert size={14}/></span>)}</>;
}
