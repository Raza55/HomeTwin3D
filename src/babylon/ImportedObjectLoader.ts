import {
  AbstractMesh,
  Color3,
  MeshBuilder,
  Scene,
  SceneLoader,
  StandardMaterial,
  TransformNode,
  Vector3,
  type ISceneLoaderProgressEvent,
  type Mesh,
  type Node,
} from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import '@babylonjs/loaders/OBJ';
import '@babylonjs/loaders/STL';
import type { ImportedModelObjectConfig, ModelObjectTransform } from '../types';
import { applyModelObjectTransform } from './ModelLoader';

export interface ImportedObjectLoadResult {
  root: Mesh;
  meshes: AbstractMesh[];
  shadowCasters: AbstractMesh[];
}

export const SUPPORTED_IMPORTED_OBJECT_FORMATS = ['glb', 'gltf', 'obj', 'stl'] as const;
export type SupportedImportedObjectFormat = typeof SUPPORTED_IMPORTED_OBJECT_FORMATS[number];

export function getImportedObjectFormat(fileName: string): string {
  return fileName.split('.').pop()?.trim().toLowerCase() ?? '';
}

export function isSupportedImportedObjectFormat(format: string): format is SupportedImportedObjectFormat {
  return SUPPORTED_IMPORTED_OBJECT_FORMATS.includes(format as SupportedImportedObjectFormat);
}

export async function loadImportedObject(
  scene: Scene,
  blob: Blob,
  config: ImportedModelObjectConfig,
  options?: {
    parent?: Node;
    editor?: boolean;
    onProgress?: (percent: number) => void;
  },
): Promise<ImportedObjectLoadResult> {
  if (!isSupportedImportedObjectFormat(config.format)) {
    throw new Error(`Unsupported model object format: ${config.format}`);
  }

  const blobUrl = URL.createObjectURL(blob);
  scene.onDisposeObservable.addOnce(() => URL.revokeObjectURL(blobUrl));

  const result = await SceneLoader.ImportMeshAsync(
    '',
    '',
    blobUrl,
    scene,
    (evt: ISceneLoaderProgressEvent) => {
      if (evt.lengthComputable && options?.onProgress) {
        options.onProgress(Math.round((evt.loaded / evt.total) * 100));
      }
    },
    `.${config.format}`,
  );

  const importedNodes = result.meshes.filter((node): node is AbstractMesh => node instanceof AbstractMesh);
  const solidMeshes = importedNodes.filter((mesh) => mesh.getTotalVertices?.() > 0);
  for (const mesh of solidMeshes) {
    mesh.receiveShadows = true;
    mesh.isPickable = false;
    mesh.applyFog = false;
  }

  const bounds = computeBounds(solidMeshes);
  const root = createObjectRoot(scene, config, bounds.size, options?.editor ?? false);
  root.position = bounds.center.clone();
  root.metadata = {
    modelObjectId: config.id,
    modelObjectLabel: config.label,
    importedObjectId: config.id,
    modelObjectOriginalTransform: readImportedObjectOriginalTransform(bounds.center),
  };

  const importedSet = new Set<AbstractMesh>(importedNodes);
  const topLevelNodes = importedNodes.filter((node) => !node.parent || !importedSet.has(node.parent as AbstractMesh));
  for (const node of topLevelNodes) {
    if (node !== root) node.setParent(root);
  }

  root.isPickable = true;
  if (options?.parent) root.parent = options.parent;
  applyModelObjectTransform(root, config);

  return {
    root,
    meshes: solidMeshes,
    shadowCasters: solidMeshes,
  };
}

function createObjectRoot(scene: Scene, config: ImportedModelObjectConfig, size: Vector3, editor: boolean): Mesh {
  const root = MeshBuilder.CreateBox(`imported_object_root_${config.id}`, {
    width: Math.max(0.05, size.x || 0.2),
    height: Math.max(0.05, size.y || 0.2),
    depth: Math.max(0.05, size.z || 0.2),
  }, scene);

  const mat = new StandardMaterial(`imported_object_root_mat_${config.id}`, scene);
  mat.disableLighting = true;
  mat.emissiveColor = new Color3(0.25, 0.7, 1);
  mat.alpha = editor ? 0.08 : 0;
  mat.wireframe = true;
  root.material = mat;
  root.visibility = editor ? 1 : 0;
  root.applyFog = false;
  return root;
}

function computeBounds(meshes: AbstractMesh[]): { center: Vector3; size: Vector3 } {
  let min = new Vector3(Infinity, Infinity, Infinity);
  let max = new Vector3(-Infinity, -Infinity, -Infinity);

  for (const mesh of meshes) {
    mesh.computeWorldMatrix(true);
    mesh.refreshBoundingInfo({});
    const box = mesh.getBoundingInfo().boundingBox;
    min = Vector3.Minimize(min, box.minimumWorld);
    max = Vector3.Maximize(max, box.maximumWorld);
  }

  if (!Number.isFinite(min.x) || !Number.isFinite(max.x)) {
    min = Vector3.Zero();
    max = new Vector3(0.2, 0.2, 0.2);
  }

  return {
    center: Vector3.Lerp(min, max, 0.5),
    size: max.subtract(min),
  };
}

function readImportedObjectOriginalTransform(center: Vector3): ModelObjectTransform {
  return {
    position: {
      x: parseFloat(center.x.toFixed(4)),
      y: parseFloat(center.y.toFixed(4)),
      z: parseFloat(center.z.toFixed(4)),
    },
    rotation: { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
  };
}

export function disposeImportedObject(result: ImportedObjectLoadResult): void {
  result.root.dispose(false, true);
  for (const mesh of result.meshes) {
    if (!mesh.isDisposed()) mesh.dispose(false, true);
  }
}
