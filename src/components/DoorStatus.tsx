import { useEffect, useRef } from 'react';
import { AbstractMesh, type Scene } from '@babylonjs/core';
import type { DoorPose } from '../services/doorState';
import type { AppConfig, HAState } from '../types';
import { createDoorRigs, setDoorPose, swingDoor } from '../babylon/DoorAnimation';
import { nextDoorPoseDelay, doorPose } from '../services/doorState';
import { invalidateShadowsNear } from '../babylon/ShadowRange';
import { useConfiguredEntityStates } from '../services/entityStateSignal';

/** Click-to-open hook on scene.metadata, used by the dashboard (orbit) and the walkthrough camera. */
export interface HaDoorClicks { has(mesh: AbstractMesh): boolean; toggle(mesh: AbstractMesh): boolean }

/**
 * Geometry only; status markers are rendered independently by DoorMarkers.
 * A click on a leaf opens/closes it locally; the next change of the HA-derived pose ends that override.
 */
export default function DoorStatus({ scene, config, states, connected }: {
  scene: Scene; config: AppConfig; states: Record<string, HAState>; connected: boolean;
}) {
  const stateVersion = useConfiguredEntityStates(config, o => Boolean(o.door));
  const live = useRef({ states, connected });live.current = { states, connected };
  const overrides = useRef(new Map<string, { pose: DoorPose; base: DoorPose | null }>());
  useEffect(() => {
    const rigs = createDoorRigs(scene);
    const doors = new Map(config.model?.floorplan?.objects.filter(o => o.door).map(o => [o.id, o]));
    const haPose = (id: string): DoorPose | null => {
      const door = doors.get(id);
      return !door?.entityId ? 'closed' : live.current.connected ? doorPose(live.current.states[door.entityId], Date.now(), door.door?.kind, door.door?.tiltOnly) : null;
    };
    const parts = (rig: typeof rigs[number]) => [...(rig.node instanceof AbstractMesh ? [rig.node] : []), ...rig.node.getChildMeshes(false)];
    const reachOf = (meshes: AbstractMesh[]) => Math.max(0, ...meshes.map(mesh => mesh.getBoundingInfo().boundingBox.extendSizeWorld.length() * 2));
    const rigOf = (mesh: AbstractMesh) => rigs.find(rig => doors.has(rig.id) && (mesh === rig.node || mesh.isDescendantOf(rig.node)));
    for (const rig of rigs) if (doors.has(rig.id)) for (const mesh of parts(rig)) mesh.isPickable = true;
    const clicks: HaDoorClicks = {
      has: mesh => !!rigOf(mesh),
      toggle: mesh => {
        const rig = rigOf(mesh);if (!rig) return false;
        const pose: DoorPose = rig.pose === 'closed' ? doors.get(rig.id)?.door?.tiltOnly ? 'tilted' : 'open' : 'closed', meshes = parts(rig);
        overrides.current.set(rig.id, { pose, base: haPose(rig.id) });
        swingDoor(scene, rig, pose, 900, () => invalidateShadowsNear(scene, meshes, reachOf(meshes)));
        return true;
      },
    };
    scene.metadata = { ...scene.metadata, haDoorClicks: clicks };
    const update = () => {
      const moved: AbstractMesh[] = [];
      let sweep = 0;
      for (const rig of rigs) {
        if (!doors.has(rig.id)) continue;
        const ha = haPose(rig.id), override = overrides.current.get(rig.id);
        if (override && override.base !== ha) overrides.current.delete(rig.id);
        const pose = overrides.current.get(rig.id)?.pose ?? ha;
        const meshes = parts(rig);
        const reach = reachOf(meshes);
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
    return () => {
      clearTimeout(timer);
      if (scene.metadata?.haDoorClicks === clicks) scene.metadata = { ...scene.metadata, haDoorClicks: undefined };
    };
  }, [scene, config, connected, stateVersion]);
  return null;
}
