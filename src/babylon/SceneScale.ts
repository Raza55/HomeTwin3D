import { TransformNode, Vector3, type Node, type Scene } from '@babylonjs/core';
import type { LightPosition, ModelConfig } from '../types';

export const MODEL_SCALE_DEFAULT = 1;
export const MODEL_SCALE_MIN = 0.001;
export const MODEL_SCALE_MAX = 1000;

export function normalizeModelScale(value: unknown): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return MODEL_SCALE_DEFAULT;
  return Math.min(MODEL_SCALE_MAX, Math.max(MODEL_SCALE_MIN, numeric));
}

export function getModelScale(model?: ModelConfig | null): number {
  return normalizeModelScale(model?.scale);
}

export function createSceneScaleRoot(scene: Scene, scale: number): TransformNode {
  const root = new TransformNode('app_entity_scale_root', scene);
  const normalized = normalizeModelScale(scale);
  root.scaling = new Vector3(normalized, normalized, normalized);
  return root;
}

export function attachToScaleRoot(root: TransformNode | null | undefined, nodes: Array<Node | null | undefined>): void {
  if (!root) return;
  for (const node of nodes) {
    if (node) node.parent = root;
  }
}

export function worldToConfigPosition(point: Vector3, modelScale: number): LightPosition {
  const scale = normalizeModelScale(modelScale);
  return {
    x: parseFloat((point.x / scale).toFixed(3)),
    y: parseFloat((point.y / scale).toFixed(3)),
    z: parseFloat((point.z / scale).toFixed(3)),
  };
}
