import {
  Color3,
  DynamicTexture,
  MeshBuilder,
  StandardMaterial,
  Vector3,
  type Node,
  type Mesh,
  type Scene,
} from '@babylonjs/core';
import type { BlindConfig, HAState } from '../types';

export interface BlindMeshEntry {
  frame: Mesh;
  panel: Mesh;
  slats: Mesh[];
  label: Mesh;
  frameMat: StandardMaterial;
  panelMat: StandardMaterial;
  labelMat: StandardMaterial;
  labelTexture: DynamicTexture;
  config: BlindConfig;
  renderedPosition?: number;
}

export type BlindMeshMap = Record<string, BlindMeshEntry>;

const MIN_VISIBLE_HEIGHT = 0.04;

export function createBlindMesh(
  scene: Scene,
  cfg: BlindConfig,
  position = 0,
  parent?: Node,
): BlindMeshEntry {
  const depth = cfg.size.depth || 0.04;
  const rotationY = degreesToRadians(cfg.rotationY ?? 0);
  const metadata = { blindId: cfg.id, entityId: cfg.entityId };
  const slatCount = Math.max(1, Math.min(40, Math.round(cfg.slats ?? 10)));

  const frameMat = new StandardMaterial(`blind_frame_mat_${cfg.id}`, scene);
  frameMat.diffuseColor = new Color3(0.08, 0.1, 0.13);
  frameMat.emissiveColor = new Color3(0.015, 0.018, 0.022);
  frameMat.alpha = 0.45;

  const panelMat = new StandardMaterial(`blind_panel_mat_${cfg.id}`, scene);
  panelMat.diffuseColor = new Color3(0.22, 0.28, 0.34);
  panelMat.emissiveColor = new Color3(0.02, 0.03, 0.04);
  panelMat.specularColor = new Color3(0.03, 0.04, 0.05);

  const labelTexture = new DynamicTexture(`blind_label_tex_${cfg.id}`, { width: 256, height: 96 }, scene, true);
  labelTexture.hasAlpha = true;
  const labelMat = new StandardMaterial(`blind_label_mat_${cfg.id}`, scene);
  labelMat.diffuseTexture = labelTexture;
  labelMat.emissiveTexture = labelTexture;
  labelMat.disableLighting = true;
  labelMat.useAlphaFromDiffuseTexture = true;
  labelMat.backFaceCulling = false;

  const frame = MeshBuilder.CreateBox(`blind_frame_${cfg.id}`, {
    width: cfg.size.width,
    height: cfg.size.height,
    depth,
  }, scene);
  frame.position = toVector(cfg.position);
  frame.rotation.y = rotationY;
  frame.material = frameMat;
  frame.metadata = metadata;
  frame.isPickable = true;
  frame.applyFog = false;
  if (cfg.floorplanIds?.length) frame.visibility = 0;

  const panel = MeshBuilder.CreateBox(`blind_panel_${cfg.id}`, {
    width: Math.max(0.01, cfg.size.width * 0.92),
    height: cfg.size.height,
    depth: depth * 1.25,
  }, scene);
  panel.rotation.y = rotationY;
  panel.material = panelMat;
  panel.metadata = metadata;
  panel.isPickable = true;
  panel.applyFog = false;
  panel.visibility = 0.18;
  if (cfg.floorplanIds?.length) {
    panel.visibility = 1;
    panel.receiveShadows = true;
    panelMat.diffuseColor = new Color3(.34, .37, .39);
  }

  const slats: Mesh[] = [];
  const slatGap = cfg.size.height / slatCount;
  const slatHeight = Math.max(0.01, Math.min(slatGap * 0.42, 0.08));
  for (let i = 0; i < slatCount; i++) {
    const slat = MeshBuilder.CreateBox(`blind_slat_${cfg.id}_${i}`, {
      width: Math.max(0.01, cfg.size.width * 0.94),
      height: slatHeight,
      depth: depth * 2.4,
    }, scene);
    slat.rotation.y = rotationY;
    slat.material = panelMat;
    slat.metadata = metadata;
    slat.isPickable = true;
    slat.applyFog = false;
    slats.push(slat);
  }

  const label = MeshBuilder.CreatePlane(`blind_label_${cfg.id}`, {
    width: Math.min(Math.max(cfg.size.width * 0.7, 0.45), 1.2),
    height: 0.28,
  }, scene);
  label.rotation.y = rotationY;
  label.material = labelMat;
  label.metadata = metadata;
  label.isPickable = true;
  label.applyFog = false;

  const entry = { frame, panel, slats, label, frameMat, panelMat, labelMat, labelTexture, config: cfg };
  if (parent) {
    frame.parent = parent;
    panel.parent = parent;
    for (const slat of slats) slat.parent = parent;
    label.parent = parent;
  }
  updateBlindPosition(entry, position);
  return entry;
}

export function updateBlindState(entry: BlindMeshEntry, state: HAState): boolean {
  if (state.state === 'unknown' || state.state === 'unavailable') {
    drawLabel(entry, null);
    entry.renderedPosition = undefined;
    return false; // Preserve the last known geometry; do not invent a closed position.
  }
  if (['opening', 'closing'].includes(state.state) && state.attributes.current_position == null && state.attributes.current_cover_position == null && state.attributes.position == null) return false;
  const { x, y, z } = entry.panel.position;
  const height = entry.panel.scaling.y;
  updateBlindPosition(entry, getCoverPosition(state));
  return x !== entry.panel.position.x || y !== entry.panel.position.y || z !== entry.panel.position.z || height !== entry.panel.scaling.y;
}

export function updateBlindPosition(entry: BlindMeshEntry, openPercent: number): void {
  const cfg = entry.config;
  const open = clamp(openPercent, 0, 100);
  const closedRatio = 1 - open / 100;
  const visibleHeight = Math.max(MIN_VISIBLE_HEIGHT, cfg.size.height * closedRatio);
  const topY = cfg.position.y + cfg.size.height / 2;
  const slatCount = entry.slats.length || 1;
  const slatGap = cfg.size.height / slatCount;
  const tilt = degreesToRadians(open <= 2 ? 0 : Math.min(50, 8 + open * 0.42));

  entry.panel.scaling.y = visibleHeight / cfg.size.height;
  entry.panel.position = toVector({
    x: cfg.position.x,
    y: topY - visibleHeight / 2,
    z: cfg.position.z,
  });

  entry.slats.forEach((slat, index) => {
    const y = topY - slatGap * (index + 0.5);
    const inVisibleArea = y >= topY - visibleHeight;
    slat.setEnabled(inVisibleArea);
    if (!inVisibleArea) return;
    slat.position = toVector({
      x: cfg.position.x,
      y,
      z: cfg.position.z,
    });
    slat.rotation.x = tilt;
    slat.rotation.y = degreesToRadians(cfg.rotationY ?? 0);
  });

  entry.label.position = toVector({
    x: cfg.position.x,
    y: cfg.position.y + cfg.size.height / 2 + 0.2,
    z: cfg.position.z + (cfg.size.depth || 0.04) * 1.6,
  });

  const brightness = 0.08 + closedRatio * 0.18;
  entry.panelMat.emissiveColor = cfg.floorplanIds?.length ? Color3.Black() : new Color3(brightness, brightness * 1.1, brightness * 1.25);
  if (entry.renderedPosition !== Math.round(open)) {
    entry.renderedPosition = Math.round(open);
    drawLabel(entry, open);
  }
}

export function removeBlindMesh(meshMap: BlindMeshMap, id: string): void {
  const entry = meshMap[id];
  if (!entry) return;
  entry.frame.dispose();
  entry.panel.dispose();
  entry.slats.forEach((slat) => slat.dispose());
  entry.label.dispose();
  entry.frameMat.dispose();
  entry.panelMat.dispose();
  entry.labelMat.dispose();
  entry.labelTexture.dispose();
  delete meshMap[id];
}

export function rebuildAllBlindMeshes(
  scene: Scene,
  meshMap: BlindMeshMap,
  blinds: BlindConfig[],
  parent?: Node,
): void {
  Object.keys(meshMap).forEach((id) => removeBlindMesh(meshMap, id));
  for (const cfg of blinds) {
    meshMap[cfg.id] = createBlindMesh(scene, cfg, 0, parent);
  }
}

export function getCoverPosition(state?: HAState | null): number {
  if (!state) return 0;
  const attrs = state.attributes || {};
  const raw = attrs.current_position ?? attrs.current_cover_position ?? attrs.position;
  const fromAttr = typeof raw === 'number' ? raw : Number(raw);
  if (raw !== null && raw !== undefined && raw !== '' && Number.isFinite(fromAttr)) return clamp(fromAttr, 0, 100);
  if (state.state === 'open') return 100;
  if (state.state === 'opening') return 75;
  if (state.state === 'closing') return 25;
  return 0;
}

function drawLabel(entry: BlindMeshEntry, open: number | null): void {
  const texture = entry.labelTexture;
  const ctx = texture.getContext() as unknown as CanvasRenderingContext2D;
  ctx.clearRect(0, 0, 256, 96);
  ctx.fillStyle = 'rgba(7, 10, 14, 0.72)';
  roundRect(ctx, 12, 14, 232, 68, 14);
  ctx.fill();
  ctx.fillStyle = '#e5edf7';
  ctx.font = 'bold 30px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(open === null ? '—' : `${Math.round(open)}%`, 128, 40);
  ctx.fillStyle = 'rgba(148, 163, 184, 0.95)';
  ctx.font = '14px monospace';
  ctx.fillText(open === null ? 'unavailable' : 'open', 128, 68);
  texture.update();
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function toVector(pos: { x: number; y: number; z: number }): Vector3 {
  return new Vector3(pos.x, pos.y, pos.z);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function degreesToRadians(degrees: number): number {
  return degrees * Math.PI / 180;
}
