import { Quaternion, Vector3, type AbstractMesh, type Node } from '@babylonjs/core';
import { requestShadowRefresh } from './ShadowRange';

interface RoomDoorSpec { id: string; hinge: number[]; closedDegrees: number; openDegrees: number }
interface Part { mesh: AbstractMesh; position: Vector3; rotation: Quaternion }
interface Door { spec: RoomDoorSpec; parts: Part[]; angle: number; target: number; open: boolean }

/** Local room-door animation. Deliberately independent of HA contact/lock rigs. */
export class RoomDoors {
  private doors = new Map<string, Door>();
  private byMesh = new Map<AbstractMesh, Door>();
  private moving = new Set<Door>();
  private movedMeshes = new Set<AbstractMesh>();
  constructor(meshes: AbstractMesh[]) {
    for (const mesh of meshes) {
      if (!mesh.getTotalVertices()) continue;
      let spec: RoomDoorSpec | undefined;
      for (let node: Node | null = mesh; node; node = node.parent) {
        if (node.metadata?.gltf?.extras?.ha_room_door) { spec = node.metadata.gltf.extras.ha_room_door; break; }
      }
      if (!spec || !Array.isArray(spec.hinge) || spec.hinge.length !== 3 || !spec.hinge.every(Number.isFinite)
        || !Number.isFinite(spec.closedDegrees) || !Number.isFinite(spec.openDegrees)) continue;
      let door = this.doors.get(spec.id);
      if (!door) {
        door = { spec, parts: [], angle: 0, target: 0, open: Math.abs(spec.openDegrees) < Math.abs(spec.closedDegrees) };
        this.doors.set(spec.id, door);
      }
      door.parts.push({ mesh, position: mesh.position.clone(), rotation: mesh.rotationQuaternion?.clone() ?? Quaternion.FromEulerVector(mesh.rotation) });
      this.byMesh.set(mesh, door);
    }
  }
  has(mesh: AbstractMesh): boolean { return this.byMesh.has(mesh); }
  toggle(mesh: AbstractMesh): boolean {
    const door = this.byMesh.get(mesh); if (!door) return false;
    door.open = !door.open;
    door.target = (door.open ? door.spec.openDegrees : door.spec.closedDegrees) * Math.PI / 180;
    this.moving.add(door);
    return true;
  }
  update(dt: number): void {
    if (!this.moving.size || dt <= 0) return;
    const movedMeshes = this.movedMeshes; movedMeshes.clear();
    for (const door of this.moving) {
      const delta = door.target - door.angle;
      if (Math.abs(delta) < 1e-7) { this.moving.delete(door); continue; }
      door.angle += Math.sign(delta) * Math.min(Math.abs(delta), Math.max(0, dt) * Math.PI);
      const rotation = Quaternion.RotationAxis(Vector3.Up(), door.angle), hinge = Vector3.FromArray(door.spec.hinge);
      for (const part of door.parts) {
        if (part.mesh.isDisposed()) continue;
        part.mesh.unfreezeWorldMatrix();
        const offset = part.position.subtract(hinge), moved = Vector3.Zero();
        offset.rotateByQuaternionToRef(rotation, moved);
        part.mesh.position.copyFrom(hinge.add(moved));
        part.mesh.rotationQuaternion = rotation.multiply(part.rotation);
        part.mesh.computeWorldMatrix(true);
        movedMeshes.add(part.mesh);
      }
      if (Math.abs(door.target - door.angle) < 1e-7) this.moving.delete(door);
    }
    // Spot-light maps are cached while geometry is static; opening a door must
    // also update its shadow, then return to the normal idle cache behavior.
    const scene = movedMeshes.values().next().value?.getScene();
    for (const light of scene?.lights ?? []) {
      const map = light.getShadowGenerator()?.getShadowMap();
      if (map?.renderList?.some(mesh => movedMeshes.has(mesh))) requestShadowRefresh(light);
    }
  }
}
