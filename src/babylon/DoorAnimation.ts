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

export function setDoorPose(rig: DoorRig, pose: DoorPose | null): boolean {
  if (!pose || rig.node.isDisposed()) return false; // Keep the last known geometry on lost contact.
  const changed = pose !== rig.pose;
  const { geometry: g, node } = rig;
  const rotation = pose === 'closed' ? Quaternion.Identity() : Quaternion.RotationAxis(
    Vector3.FromArray(pose === 'open' ? g.swingAxis : g.tiltAxis).normalize(),
    (pose === 'open' ? g.swingDegrees : g.tiltDegrees) * Math.PI / 180,
  );
  const hinge = Vector3.FromArray(g.hinge);
  const offset = rig.position.subtract(hinge);
  const moved = Vector3.Zero(); offset.rotateByQuaternionToRef(rotation, moved);
  node.position.copyFrom(hinge.add(moved));
  node.rotationQuaternion = rotation.multiply(rig.rotation);
  node.computeWorldMatrix(true);
  for (const mesh of node.getChildMeshes()) mesh.computeWorldMatrix(true);
  rig.pose = pose;
  return changed;
}
