import { Quaternion, Vector3, type AbstractMesh, type Observer, type Scene } from '@babylonjs/core';
import type { FloorplanObject } from '../types';
import type { VacuumPose } from '../services/vacuumPosition';
import { floorplanId } from './FloorplanBindings';
import { invalidateShadowsNear } from './ShadowRange';

interface Part { mesh: AbstractMesh; offset: Vector3; rotation: Quaternion; animatedRotation: Quaternion }

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
  private turn = Quaternion.Identity();
  private up = Vector3.Up();
  private center = Vector3.Zero();
  private moved = Vector3.Zero();

  constructor(private scene: Scene, object: FloorplanObject, private requestRender: () => void) {
    this.rest = { x: object.position.x, z: object.position.z, yaw: (object.vacuum?.restYawDeg ?? 0) * Math.PI / 180 };
    const restCenter = new Vector3(-this.rest.x, 0, this.rest.z);
    for (const mesh of scene.meshes) {
      if (!mesh.getTotalVertices() || floorplanId(mesh) !== object.id) continue;
      this.parts.push({ mesh, offset: mesh.position.subtract(restCenter),
        rotation: mesh.rotationQuaternion?.clone() ?? Quaternion.FromEulerVector(mesh.rotation), animatedRotation: Quaternion.Identity() });
    }
    this.current = { ...this.rest };
    this.from = { ...this.rest };
    this.to = { ...this.rest };
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
    this.current.x = from.x + (to.x - from.x) * t;
    this.current.z = from.z + (to.z - from.z) * t;
    this.current.yaw = from.yaw + (to.yaw - from.yaw) * t;
    this.apply(this.current);
    if (t < 1) { this.requestRender(); return; }
    this.scene.onBeforeRenderObservable.remove(this.observer);
    this.observer = null;
    invalidateShadowsNear(this.scene, this.parts.map(p => p.mesh), .5);
  }

  private apply(pose: VacuumPose): void {
    Object.assign(this.current, pose);
    // A model-space turn by ψ is a local turn by ψ about Y as well: the mirror flips both the axis sense and the handedness.
    Quaternion.RotationAxisToRef(this.up, pose.yaw - this.rest.yaw, this.turn);
    this.center.set(-pose.x, 0, pose.z);
    for (const part of this.parts) {
      if (part.mesh.isDisposed()) continue;
      part.offset.rotateByQuaternionToRef(this.turn, this.moved);
      part.mesh.unfreezeWorldMatrix();
      this.center.addToRef(this.moved, part.mesh.position);
      this.turn.multiplyToRef(part.rotation, part.animatedRotation);
      // Keep Babylon's setter side effects (Euler reset and dirty flag).
      part.mesh.rotationQuaternion = part.animatedRotation;
      part.mesh.computeWorldMatrix(true);
    }
  }

  dispose(): void {
    if (this.observer) this.scene.onBeforeRenderObservable.remove(this.observer);
    this.observer = null;
    this.apply(this.rest);
  }
}
