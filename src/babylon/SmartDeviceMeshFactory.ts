import {
  Color3,
  MeshBuilder,
  StandardMaterial,
  Tools,
  Vector3,
  type AnimationGroup,
  type Mesh,
  type Node,
  type Scene,
} from '@babylonjs/core';
import type { HAState, SmartDeviceConfig } from '../types';

import { applianceRunning } from './ApplianceAnimation';
import { floorplanId } from './FloorplanBindings';

export interface SmartDeviceMeshEntry {
  animations?: AnimationGroup[];
  running?: boolean;
  root: Mesh;
  meshes: Mesh[];
  housingMat: StandardMaterial;
  accentMat: StandardMaterial;
  config: SmartDeviceConfig;
}

export type SmartDeviceMeshMap = Record<string, SmartDeviceMeshEntry>;

const OFF_STATES = new Set(['off', 'idle', 'docked', 'standby', 'paused', 'unknown', 'unavailable']);

export function createSmartDeviceMesh(scene: Scene, config: SmartDeviceConfig, parent?: Node): SmartDeviceMeshEntry {
  const housingMat = new StandardMaterial(`smart_device_housing_${config.id}`, scene);
  housingMat.diffuseColor = new Color3(0.16, 0.19, 0.23);
  housingMat.specularColor = new Color3(0.12, 0.14, 0.16);

  const accentMat = new StandardMaterial(`smart_device_accent_${config.id}`, scene);
  accentMat.diffuseColor = new Color3(0.08, 0.45, 0.7);
  accentMat.emissiveColor = new Color3(0.02, 0.09, 0.14);

  const root = MeshBuilder.CreateBox(`smart_device_root_${config.id}`, { size: 0.25 }, scene);
  root.visibility = 0;
  root.isPickable = false;
  root.position = toVector(config.position);
  const rotation = config.rotation ?? { x: 0, y: 0, z: 0 };
  root.rotation.set(Tools.ToRadians(rotation.x), Tools.ToRadians(rotation.y), Tools.ToRadians(rotation.z));
  root.scaling = toVector(config.scale ?? { x: 1, y: 1, z: 1 });
  if (parent) root.parent = parent;

  const metadata = { smartDeviceId: config.id, entityId: config.entityId };
  const meshes: Mesh[] = [];
  // Imported devices already have their own model geometry and picking metadata.
  // Do not draw a second generic device (e.g. a glowing speaker on top of a TV).
  if (config.floorplanIds?.length) {
    const animations = config.appliance ? scene.animationGroups.filter(g => g.targetedAnimations.some(t => config.floorplanIds!.includes(floorplanId(t.target) ?? ''))) : [];
    animations.forEach(g=>g.stop());
    return { root, meshes, housingMat, accentMat, config, animations, running: false };
  }
  const add = (mesh: Mesh, material: StandardMaterial, position: [number, number, number] = [0, 0, 0]) => {
    mesh.parent = root;
    mesh.position.set(position[0], position[1], position[2]);
    mesh.material = material;
    mesh.metadata = metadata;
    mesh.isPickable = true;
    mesh.applyFog = false;
    meshes.push(mesh);
    return mesh;
  };
  const box = (name: string, size: [number, number, number], material = housingMat, position?: [number, number, number]) =>
    add(MeshBuilder.CreateBox(`${name}_${config.id}`, { width: size[0], height: size[1], depth: size[2] }, scene), material, position);
  const cylinder = (name: string, diameter: number, height: number, material = housingMat, position?: [number, number, number]) =>
    add(MeshBuilder.CreateCylinder(`${name}_${config.id}`, { diameter, height, tessellation: 24 }, scene), material, position);

  switch (config.type) {
    case 'coffeeMaker':
      box('coffee_body', [0.36, 0.5, 0.32], housingMat, [0, 0.25, 0]);
      box('coffee_front', [0.25, 0.24, 0.05], accentMat, [0, 0.26, -0.185]);
      cylinder('coffee_cup', 0.16, 0.2, housingMat, [0, 0.1, -0.27]);
      break;
    case 'fan': {
      cylinder('fan_stand', 0.12, 0.55, housingMat, [0, 0.28, 0]);
      const hub = cylinder('fan_hub', 0.18, 0.12, accentMat, [0, 0.65, 0]);
      hub.rotation.x = Math.PI / 2;
      for (let i = 0; i < 3; i++) {
        const blade = box(`fan_blade_${i}`, [0.08, 0.34, 0.035], housingMat, [0, 0.65, -0.08]);
        blade.rotation.z = (Math.PI * 2 * i) / 3;
        blade.setPivotPoint(new Vector3(0, -0.12, 0));
      }
      break;
    }
    case 'vacuum':
      cylinder('vacuum_body', 0.5, 0.14, housingMat, [0, 0.08, 0]);
      cylinder('vacuum_lidar', 0.13, 0.08, accentMat, [0, 0.19, 0.03]);
      break;
    case 'airPurifier':
      box('purifier_body', [0.36, 0.7, 0.36], housingMat, [0, 0.35, 0]);
      cylinder('purifier_top', 0.28, 0.025, accentMat, [0, 0.715, 0]);
      break;
    case 'humidifier':
      cylinder('humidifier_body', 0.36, 0.48, housingMat, [0, 0.24, 0]);
      cylinder('humidifier_top', 0.24, 0.035, accentMat, [0, 0.5, 0]);
      break;
    case 'speaker':
      cylinder('speaker_body', 0.28, 0.48, housingMat, [0, 0.24, 0]);
      cylinder('speaker_ring', 0.24, 0.025, accentMat, [0, 0.49, 0]);
      break;
    case 'camera': {
      cylinder('camera_base', 0.24, 0.08, housingMat, [0, 0.04, 0]);
      const body = box('camera_body', [0.28, 0.2, 0.22], housingMat, [0, 0.2, 0]);
      body.rotation.x = -0.18;
      const lens = cylinder('camera_lens', 0.11, 0.045, accentMat, [0, 0.22, -0.13]);
      lens.rotation.x = Math.PI / 2;
      break;
    }
    default:
      box('device_body', [0.42, 0.42, 0.42], housingMat, [0, 0.21, 0]);
      box('device_indicator', [0.2, 0.06, 0.025], accentMat, [0, 0.3, -0.225]);
  }

  const entry = { root, meshes, housingMat, accentMat, config };
  updateSmartDeviceState(entry, null);
  return entry;
}

export function updateSmartDeviceState(entry: SmartDeviceMeshEntry, state?: HAState | null): void {
  if (entry.config.appliance) {
    const running = applianceRunning(entry.config.appliance, state);
    if(running !== entry.running) {
      entry.animations?.forEach(g => running ? g.play(true) : g.pause());
      entry.running = running;
    }
  }
  const unavailable = state?.state === 'unavailable' || state?.state === 'unknown';
  const active = !!state && !OFF_STATES.has(state.state);
  const color = unavailable
    ? new Color3(0.8, 0.08, 0.08)
    : active
      ? new Color3(0.05, 0.65, 0.38)
      : new Color3(0.02, 0.09, 0.14);
  entry.accentMat.emissiveColor = color;
  entry.accentMat.diffuseColor = color.scale(active ? 1 : 0.7);
}

export function removeSmartDeviceMesh(map: SmartDeviceMeshMap, id: string): void {
  const entry = map[id];
  if (!entry) return;
  entry.animations?.forEach(g=>g.stop());
  entry.root.dispose(false, false);
  entry.housingMat.dispose();
  entry.accentMat.dispose();
  delete map[id];
}

export function rebuildAllSmartDeviceMeshes(scene: Scene, map: SmartDeviceMeshMap, devices: SmartDeviceConfig[], parent?: Node): void {
  Object.keys(map).forEach((id) => removeSmartDeviceMesh(map, id));
  devices.forEach((device) => { map[device.id] = createSmartDeviceMesh(scene, device, parent); });
}

function toVector(value: { x: number; y: number; z: number }): Vector3 {
  return new Vector3(value.x, value.y, value.z);
}
