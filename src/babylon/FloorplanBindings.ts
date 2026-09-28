import { Color3, MeshBuilder, PBRMaterial, StandardMaterial, type AbstractMesh, type Node, type Scene } from '@babylonjs/core';
import type { AppConfig } from '../types';
import type { MeshMap } from './LightMeshFactory';

/** glTF extras can live on a parent TransformNode for multi-material meshes. */
export function floorplanId(mesh: Node): string | undefined {
  for (let node: Node | null = mesh; node; node = node.parent) {
    const value = node.metadata?.gltf?.extras?.ha_id;
    if (typeof value === 'string') return value;
  }
}

export function bindFloorplanMeshes(scene: Scene, meshes: AbstractMesh[], config: AppConfig, lights: MeshMap): void {
  // Legacy GLBs merged small devices into static material batches. Preserve that
  // geometry and add only an invisible pick volume until the next full export.
  const targets = [...meshes];
  for (const object of config.model?.floorplan?.objects ?? []) {
    if ((object.domain !== 'fan' && !object.echo && !object.coffee && !object.it) || meshes.some(mesh => floorplanId(mesh) === object.id)) continue;
    const proxy = MeshBuilder.CreateBox(`${object.coffee ? 'coffee' : object.echo ? 'echo' : 'fan'}-pick:${object.id}`, object.size, scene);
    const scale = config.model?.scale ?? 1;
    proxy.position.set(object.position.x * scale, object.position.y * scale, object.position.z * scale);
    proxy.scaling.setAll(scale);
    proxy.rotation.y = object.rotationY * Math.PI / 180;
    proxy.visibility = 0;
    proxy.metadata = { gltf: { extras: { ha_id: object.id } }, fanPickProxy: true };
    targets.push(proxy);
  }
  const controls = new Map<string, { entityId: string; blindId?: string; smartDeviceId?: string; displayId?: string }>();
  for (const o of config.model?.floorplan?.objects ?? []) {
    if (!o.entityId || o.door || o.doorLock || o.statusIndicator || o.it) continue;
    const blind = config.blinds?.find(b => b.entityId === o.entityId);
    const device = config.smartDevices?.find(d => d.entityId === o.entityId);
    const display = config.displays?.find(d => d.sources.some(s => s.entityId === o.entityId));
    controls.set(o.id, { entityId: o.entityId, blindId: blind?.id, smartDeviceId: device?.id, displayId: display?.id });
  }
  const unassigned = new Set(config.model?.floorplan?.objects.filter(o=>((['light','fan'].includes(o.domain) || o.echo || o.coffee) && !o.entityId) || !!o.appliance).map(o=>o.id));
  const emissive: Array<{ mesh: AbstractMesh; entityId: string }> = [];
  for (const mesh of targets) {
    const id = floorplanId(mesh);
    if (id && config.model?.floorplan?.objects.some(o => o.id === id && o.it)) { mesh.metadata = {...mesh.metadata,itFloorplanId:id}; mesh.isPickable=true; continue; }
    const control = id ? controls.get(id) : undefined;
    if(id && unassigned.has(id) && mesh.getTotalVertices()>0){mesh.metadata={...mesh.metadata,unassignedFloorplanId:id};mesh.isPickable=true;}
    if (!control || mesh.getTotalVertices() === 0) continue;
    mesh.metadata = { ...mesh.metadata, ...control };
    mesh.isPickable = true;
    if (control.blindId) {
      // The animated HA cover replaces only slats, never frames or window panes.
      mesh.setEnabled(false);
    } else if (control.entityId.startsWith('light.')) {
      const original = mesh.metadata.originalMaterial ?? mesh.material;
      if (original) {
        const clone = original.clone(`${original.name}:ha:${mesh.uniqueId}`);
        mesh.metadata.originalMaterial = clone;
        if (mesh.material === original) mesh.material = clone;
      }
      const cartoon = scene.getMaterialByName('cartoon_white');
      if (cartoon) mesh.metadata.floorplanSketchMaterial = cartoon.clone(`ha-sketch:${mesh.uniqueId}`);
      emissive.push({ mesh, entityId: control.entityId });
    }
  }
  // Share the existing light-state pipeline, including dimming, color and disconnects.
  const off = Color3.Black();
  const observer = scene.onBeforeRenderObservable.add(() => {
    for (const { mesh, entityId } of emissive) {
      if (mesh.isDisposed()) continue;
      const color = lights[entityId]?.mat.emissiveColor ?? off;
      const material = mesh.metadata.originalMaterial;
      if ((material instanceof PBRMaterial || material instanceof StandardMaterial) && !material.emissiveColor.equals(color)) material.emissiveColor.copyFrom(color);
      if (mesh.material && mesh.material !== material) {
        let sketch = mesh.metadata.floorplanSketchMaterial;
        if (!sketch) sketch = mesh.metadata.floorplanSketchMaterial = mesh.material.clone(`ha-sketch:${mesh.uniqueId}`);
        if (sketch instanceof StandardMaterial && mesh.material instanceof StandardMaterial) {
          if (mesh.material !== sketch) {
            sketch.diffuseColor.copyFrom(mesh.material.diffuseColor);
            sketch.specularColor.copyFrom(mesh.material.specularColor);
            sketch.maxSimultaneousLights = mesh.material.maxSimultaneousLights;
            mesh.material = sketch;
          }
          if (!sketch.emissiveColor.equals(color)) sketch.emissiveColor.copyFrom(color);
        }
      }
    }
  });
  scene.onDisposeObservable.addOnce(() => scene.onBeforeRenderObservable.remove(observer));
}
