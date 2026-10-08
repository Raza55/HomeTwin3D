import { useEffect, useRef } from 'react';
import type { Scene } from '@babylonjs/core';
import type { AppConfig, HAState } from '../types';
import { VacuumRig } from '../babylon/VacuumRig';
import { getActiveHAConnection } from '../services/haWebSocket';
import { useEntityStatesVersion } from '../services/entityStateSignal';
import { mapToModel, parseEcovacsPosition, vacuumPollDelay } from '../services/vacuumPosition';

/**
 * Drives modelled robot vacuums from their live map position while they are away from
 * the station. The position comes from `ecovacs.raw_get_positions` (a service response,
 * not a state), so it is polled while the robot works and dropped once it docks.
 */
export default function VacuumTracker({ scene, config, states, connected, requestRender }: {
  scene: Scene; config: AppConfig; states: Record<string, HAState>; connected: boolean; requestRender: () => void;
}) {
  const robots = (config.model?.floorplan?.objects ?? []).filter(o => o.domain === 'vacuum' && o.vacuum);
  const stateIds = robots.flatMap(o => [o.vacuum!.positionEntityId, o.entityId]).filter(Boolean);
  const stateVersion = useEntityStatesVersion(stateIds);
  const live = useRef({ states, connected }); live.current = { states, connected };
  const rigs = useRef(new Map<string, VacuumRig>());

  useEffect(() => {
    const map = rigs.current;
    for (const object of robots) {
      const rig = new VacuumRig(scene, object, requestRender);
      if (!rig.empty) map.set(object.id, rig);
    }
    return () => { for (const rig of map.values()) rig.dispose(); map.clear(); };
  }, [scene, config]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    let stopped = false;
    for (const object of robots) {
      const rig = rigs.current.get(object.id), tracking = object.vacuum!;
      if (!rig) continue;
      const stateOf = () => live.current.states[tracking.positionEntityId] ?? live.current.states[object.entityId];
      const poll = async () => {
        const delay = live.current.connected ? vacuumPollDelay(stateOf()) : null;
        if (delay === null) { rig.moveTo(null, 0); return; }
        try {
          const result = await getActiveHAConnection()?.request({ type: 'call_service', domain: 'ecovacs', service: 'raw_get_positions',
            target: { entity_id: tracking.positionEntityId }, return_response: true }) as { response?: unknown } | undefined;
          const position = parseEcovacsPosition(result?.response, tracking.positionEntityId);
          if (!stopped && position) rig.moveTo(mapToModel(tracking, position), delay);
        } catch { /* Keep the last known position; the next poll tries again. */ }
        if (!stopped) timers.push(setTimeout(poll, delay));
      };
      void poll();
    }
    return () => { stopped = true; timers.forEach(clearTimeout); };
  }, [scene, config, connected, stateVersion]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}
