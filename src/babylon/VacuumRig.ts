import { Quaternion, Vector3, type AbstractMesh, type Observer, type Scene } from '@babylonjs/core';
import type { FloorplanObject } from '../types';
import type { VacuumPose } from '../services/vacuumPosition';
import { floorplanId } from './FloorplanBindings';
import { invalidateShadowsNear } from './ShadowRange';

interface Part { mesh: AbstractMesh; position: Vector3; rotation: Quaternion }

/**
 * Moves the modelled robot (all meshes carrying its floorplan ID) over the floor.
 * The meshes sit directly under the loader's mirrored glTF root, so local X is
 * model −X. The rest pose is the exported one: the robot at its station.
 */
export class VacuumRig {
  private parts: Part[] = [];
  private rest: VacuumPose;
  private current: VacuumPose;
  private from: VacuumPose;
  private to: VacuumPose;
  private start = 0;
  private duration = 0;
  private observer: Observer<Scene> | null = null;

  constructor(private scene: Scene, object: FloorplanObject, private requestRender: () => void) {
    for (const mesh of scene.meshes) {
      if (!mesh.getTotalVertices() || floorplanId(mesh) !== object.id) continue;
      this.parts.push({ mesh, position: mesh.position.clone(), rotation: mesh.rotationQuaternion?.clone() ?? Quaternion.FromEulerVector(mesh.rotation) });
    }
    this.rest = { x: object.position.x, z: object.position.z, yaw: (object.vacuum?.restYawDeg ?? 0) * Math.PI / 180 };
    this.current = this.from = this.to = { ...this.rest };
  }

  get empty(): boolean { return !this.parts.length; }

  /** Glides to `pose` over `ms`; null returns the robot to its station. */
  moveTo(pose: VacuumPose | null, ms: number): void {
    const target = pose ?? this.rest;
    const turn = Math.atan2(Math.sin(target.yaw - this.current.yaw), Math.cos(target.yaw - this.current.yaw));
    const step = Math.hypot(target.x - this.current.x, target.z - this.current.z);
    if (step < .005 && Math.abs(turn) < .01) return;
    this.from = { ...this.current };
    this.to = { ...target, yaw: this.current.yaw + turn };
    this.start = performance.now();
    // Long jumps (first fix, return to the station) are placed immediately.
    this.duration = step > 1.5 || !pose ? 0 : ms;
    if (!this.observer) this.observer = this.scene.onBeforeRenderObservable.add(() => this.tick());
    this.requestRender();
  }

  private tick(): void {
    const t = this.duration ? Math.min(1, (performance.now() - this.start) / this.duration) : 1;
    const { from, to } = this;
    this.apply({ x: from.x + (to.x - from.x) * t, z: from.z + (to.z - from.z) * t, yaw: from.yaw + (to.yaw - from.yaw) * t });
    if (t < 1) { this.requestRender(); return; }
    this.scene.onBeforeRenderObservable.remove(this.observer);
    this.observer = null;
    invalidateShadowsNear(this.scene, this.parts.map(p => p.mesh), .5);
  }

  private apply(pose: VacuumPose): void {
    this.current = pose;
    // A model-space turn by ψ is a local turn by ψ about Y as well: the mirror flips both the axis sense and the handedness.
    const turn = Quaternion.RotationAxis(Vector3.Up(), pose.yaw - this.rest.yaw);
    const restCenter = new Vector3(-this.rest.x, 0, this.rest.z);
    const center = new Vector3(-pose.x, 0, pose.z);
    for (const part of this.parts) {
      if (part.mesh.isDisposed()) continue;
      const moved = Vector3.Zero();
      part.position.subtract(restCenter).rotateByQuaternionToRef(turn, moved);
      part.mesh.unfreezeWorldMatrix();
      part.mesh.position.copyFrom(center.add(moved));
      part.mesh.rotationQuaternion = turn.multiply(part.rotation);
      part.mesh.computeWorldMatrix(true);
    }
  }

  dispose(): void {
    if (this.observer) this.scene.onBeforeRenderObservable.remove(this.observer);
    this.observer = null;
    this.apply(this.rest);
  }
}
