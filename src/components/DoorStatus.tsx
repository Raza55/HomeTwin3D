import { useEffect, useRef } from 'react';
import { AbstractMesh, type Scene } from '@babylonjs/core';
import type { AppConfig, HAState } from '../types';
import { createDoorRigs, setDoorPose, swingDoor } from '../babylon/DoorAnimation';
import { nextDoorPoseDelay, doorPose } from '../services/doorState';
import { invalidateShadowsNear } from '../babylon/ShadowRange';
import { useConfiguredEntityStates } from '../services/entityStateSignal';

/** Geometry only; status markers are rendered independently by DoorMarkers. */
export default function DoorStatus({ scene, config, states, connected }: {
  scene: Scene; config: AppConfig; states: Record<string, HAState>; connected: boolean;
}) {
  const stateVersion = useConfiguredEntityStates(config, o => Boolean(o.door));
  const live = useRef({ states, connected });live.current = { states, connected };
  useEffect(() => {
    const rigs = createDoorRigs(scene);
    const doors = new Map(config.model?.floorplan?.objects.filter(o => o.door).map(o => [o.id, o]));
    const update = () => {
      const moved: AbstractMesh[] = [];
      let sweep = 0;
      for (const rig of rigs) {
        const door = doors.get(rig.id);if (!door) continue;
        const pose = !door.entityId ? 'closed' : live.current.connected ? doorPose(live.current.states[door.entityId], Date.now(), door.door?.kind) : null;
        const meshes = [...(rig.node instanceof AbstractMesh ? [rig.node] : []), ...rig.node.getChildMeshes(false)];
        const reach = Math.max(0, ...meshes.map(mesh => mesh.getBoundingInfo().boundingBox.extendSizeWorld.length() * 2));
        // The day demo swings doors visibly; shadows follow once the leaf has arrived.
        if (scene.metadata?.animateDoors) {
          swingDoor(scene, rig, pose, 1100, () => invalidateShadowsNear(scene, meshes, reach));
          continue;
        }
        if (!setDoorPose(rig, pose)) continue;
        sweep = Math.max(sweep, reach);
        moved.push(...meshes);
      }
      // A leaf sweeps around its hinge: its own diagonal bounds the old position.
      invalidateShadowsNear(scene, moved, sweep);
    };
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => {
      update();
      const delay = live.current.connected ? nextDoorPoseDelay([...doors.values()], live.current.states) : null;
      if (delay !== null) timer = setTimeout(refresh, Math.max(1, delay));
    };
    refresh();
    return () => clearTimeout(timer);
  }, [scene, config, connected, stateVersion]);
  return null;
}
