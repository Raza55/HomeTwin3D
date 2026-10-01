import { Matrix, Quaternion, Vector3, type TransformNode, type Scene } from '@babylonjs/core';
import type { DoorPose } from '../services/doorState';

interface DoorGeometry { hinge: number[]; swingAxis: number[]; tiltAxis: number[]; swingDegrees: number; tiltDegrees: number }
export interface DoorRig { id: string; node: TransformNode; geometry: DoorGeometry; position: Vector3; rotation: Quaternion; pose: DoorPose }
const closedTransforms = new WeakMap<TransformNode, { position: Vector3; rotation: Quaternion }>();

/** Fixed anchor above the entire closed opening, including the static left leaf. */
export function doorMarkerAnchor(scene: Scene, rig: DoorRig): Vector3 {
  const node = rig.node;
  node.computeWorldMatrix(true);
  const closedWorld = Matrix.Compose(node.scaling, rig.rotation, rig.position).multiply(node.parent?.getWorldMatrix() ?? Matrix.Identity());
  const inverse = node.getWorldMatrix().clone().invert();
  const leftName = node.name.replace('_Rechts', '_Links');
  const left = leftName !== node.name ? [...scene.transformNodes, ...scene.meshes].find(n => n.name === leftName) : undefined;
  const points: Vector3[] = [];
  for (const mesh of scene.meshes) {
    const moving = mesh === node || mesh.isDescendantOf(node);
    if (!moving && !(left && (mesh === left || mesh.isDescendantOf(left)))) continue;
    if (!mesh.getTotalVertices()) continue;
    mesh.computeWorldMatrix(true);
    const matrix = moving ? mesh.getWorldMatrix().multiply(inverse).multiply(closedWorld) : mesh.getWorldMatrix();
    points.push(...mesh.getBoundingInfo().boundingBox.vectors.map(p => Vector3.TransformCoordinates(p, matrix)));
  }
  if (!points.length) return Vector3.TransformCoordinates(Vector3.Zero(), closedWorld);
  const low = points.reduce((a, p) => Vector3.Minimize(a, p), points[0].clone());
  const high = points.reduce((a, p) => Vector3.Maximize(a, p), points[0].clone());
  return new Vector3((low.x + high.x) / 2, high.y + Math.max(.08, (high.y - low.y) * .06), (low.z + high.z) / 2);
}

/** Metadata is in the exported node's parent (glTF) coordinates, before the loader's LH root. */
export function createDoorRigs(scene: Scene): DoorRig[] {
  return [...scene.transformNodes, ...scene.meshes].flatMap(node => {
    const extras = node.metadata?.gltf?.extras;
    const geometry = extras?.ha_door as DoorGeometry | undefined;
    if (!geometry || typeof extras.ha_id !== 'string') return [];
    if (![geometry.hinge, geometry.swingAxis, geometry.tiltAxis].every(v => Array.isArray(v) && v.length === 3 && v.every(Number.isFinite))
      || ![geometry.swingDegrees, geometry.tiltDegrees].every(Number.isFinite)
      || Vector3.FromArray(geometry.swingAxis).length() < .9 || Vector3.FromArray(geometry.tiltAxis).length() < .9) return [];
    let closed = closedTransforms.get(node);
    if (!closed) {
      closed = { position: node.position.clone(), rotation: node.rotationQuaternion?.clone() ?? Quaternion.FromEulerVector(node.rotation) };
      closedTransforms.set(node, closed);
    }
    return [{ id: extras.ha_id, node, geometry, ...closed, pose: 'closed' as DoorPose }];
  });
}

function poseRotation(g: DoorGeometry, pose: DoorPose): Quaternion {
  return pose === 'closed' ? Quaternion.Identity() : Quaternion.RotationAxis(
    Vector3.FromArray(pose === 'open' ? g.swingAxis : g.tiltAxis).normalize(),
    (pose === 'open' ? g.swingDegrees : g.tiltDegrees) * Math.PI / 180,
  );
}

/** Places the leaf turned by `rotation` around its hinge. */
function applyTurn(rig: DoorRig, rotation: Quaternion): void {
  const hinge = Vector3.FromArray(rig.geometry.hinge);
  const offset = rig.position.subtract(hinge);
  const moved = Vector3.Zero(); offset.rotateByQuaternionToRef(rotation, moved);
  rig.node.position.copyFrom(hinge.add(moved));
  rig.node.rotationQuaternion = rotation.multiply(rig.rotation);
  rig.node.computeWorldMatrix(true);
  for (const mesh of rig.node.getChildMeshes()) mesh.computeWorldMatrix(true);
}

const swings = new WeakMap<TransformNode, { pose: DoorPose; stop: () => void }>();

export function setDoorPose(rig: DoorRig, pose: DoorPose | null): boolean {
  if (!pose || rig.node.isDisposed()) return false; // Keep the last known geometry on lost contact.
  const changed = pose !== rig.pose;
  swings.get(rig.node)?.stop();
  applyTurn(rig, poseRotation(rig.geometry, pose));
  rig.pose = pose;
  return changed;
}

/**
 * Swings the leaf from where it is now to `pose` over `ms` (day demo). Returns
 * false when it already is there or on its way; `done` runs once it arrives.
 */
export function swingDoor(scene: Scene, rig: DoorRig, pose: DoorPose | null, ms: number, done: () => void): boolean {
  if (!pose || rig.node.isDisposed()) return false;
  const running = swings.get(rig.node);
  if (running?.pose === pose) { rig.pose = pose; return false; }
  running?.stop();
  const from = (rig.node.rotationQuaternion ?? Quaternion.Identity()).multiply(Quaternion.Inverse(rig.rotation));
  const to = poseRotation(rig.geometry, pose);
  rig.pose = pose;
  if (Math.abs(Quaternion.Dot(from, to)) > .99999) return false;
  const start = performance.now();
  const observer = scene.onBeforeRenderObservable.add(() => {
    const t = Math.min(1, (performance.now() - start) / ms), u = t * t * (3 - 2 * t);
    if (rig.node.isDisposed()) { stop(); return; }
    applyTurn(rig, Quaternion.Slerp(from, to, u));
    if (t >= 1) { stop(); done(); }
  });
  const stop = () => { scene.onBeforeRenderObservable.remove(observer); if (swings.get(rig.node)?.stop === stop) swings.delete(rig.node); };
  swings.set(rig.node, { pose, stop });
  return true;
}
