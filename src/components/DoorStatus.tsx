import { useEffect, useRef } from 'react';
import type { Scene } from '@babylonjs/core';
import type { AppConfig, HAState } from '../types';
import { createDoorRigs, setDoorPose } from '../babylon/DoorAnimation';
import { doorPose } from '../services/doorState';

/** Geometry only; status markers are rendered independently by DoorMarkers. */
export default function DoorStatus({ scene, config, states, connected }: {
  scene: Scene; config: AppConfig; states: Record<string, HAState>; connected: boolean;
}) {
  const live = useRef({ states, connected });live.current = { states, connected };
  useEffect(() => {
    const rigs = createDoorRigs(scene);
    const doors = new Map(config.model?.floorplan?.objects.filter(o => o.door).map(o => [o.id, o]));
    const update = () => {
      let changed = false;
      for (const rig of rigs) {
        const door = doors.get(rig.id);if (!door) continue;
        const pose = !door.entityId ? 'closed' : live.current.connected ? doorPose(live.current.states[door.entityId], Date.now(), door.door?.kind) : null;
        changed = setDoorPose(rig, pose) || changed;
      }
      if (changed) scene.lights.forEach(light => light.getShadowGenerator()?.getShadowMap()?.resetRefreshCounter());
    };
    update();const timer = window.setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [scene, config]);
  return null;
}
