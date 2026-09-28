import {
  MeshBuilder,
  StandardMaterial,
  HighlightLayer,
  Color3,
  Vector3,
  DynamicTexture,
  Mesh,
  VertexBuffer,
  type Scene,
  type GlowLayer,
  type Node,
  type Observer,
} from '@babylonjs/core';
import { getLucideIconImage } from '../services/lucideIcons';
import type { TubeConfig, TubeInputUnit } from '../types';
import { GRID_RADIUS } from './GroundGrid';
import { positionAtDistanceToRef } from './PathInterpolation';

// --- Types ---

interface TubeLabelEntry {
  sensorId: string;
  plane: Mesh;
  texture: DynamicTexture;
  material: StandardMaterial;
  color: string;
  fontSize: number;
  icon?: string;
  inputUnit: TubeInputUnit;
  displayBytes: boolean;
  displayUnit?: string;
  autoScale: boolean;
  precision?: number;
  lastText: string;
  lastValue: string;
  lastUnit: string;
  theme: 'light' | 'dark';
}

/** Conversion factor from each input unit to bits. */
const UNIT_TO_BITS: Record<TubeInputUnit, number> = {
  b:  1,
  kb: 1e3,
  mb: 1e6,
  gb: 1e9,
  tb: 1e12,
  B:  8,
  kB: 8e3,
  mB: 8e6,
  gB: 8e9,
  tB: 8e12,
};

// --- Icon cache (same approach as DisplayMeshFactory) ---

interface TubeParticleEntry {
  spheres: Mesh[];
  path: Vector3[];
  /** Cumulative distances along the path (same length as path). */
  distances: number[];
  /** Total path length. */
  totalLength: number;
  /** Progress offset for each sphere (0..1). */
  offsets: number[];
  /** Per-particle random speed factor (0.75–1.25). */
  speedJitter: number[];
  /** Current base speed in world-units per second (updated from sensor). */
  speed: number;
  /** 1 = inward (edge→building), -1 = outward (building→edge). */
  direction: 1 | -1;
  sensorId: string;
  inputUnit: TubeInputUnit;
  /** User-defined speed multiplier. */
  speedMultiplier: number;
  /** Sensor value (in raw input units) at which particles reach max speed. */
  maxSensorValue: number;
  /** Scene reference for creating/disposing dynamic particles. */
  scene: Scene;
  /** Tube color for new particles. */
  color: Color3;
  /** Sphere radius for new particles. */
  sphereRadius: number;
  /** Current active count (some spheres may be hidden). */
  activeCount: number;
  /** Reference to the glow layer (to exclude new spheres). */
  glowLayer: GlowLayer | null;
}

export interface TubeMeshEntry {
  config: TubeConfig;
  tubes: Mesh[];
  labels: TubeLabelEntry[];
  particles: TubeParticleEntry[];
  /** Observer handle for the per-frame particle animation. */
  particleObserver: Observer<Scene> | null;
}

export type TubeMap = Record<string, TubeMeshEntry>;

// --- Constants ---

const GROUND_Y = -1;
const MODEL_FLOOR_Y = 0;
const GROUND_CLEARANCE = 0.1; // 10cm above ground
const TUBE_TESSELLATION = 16;
const CORNER_SEGMENTS = 8;
const CORNER_RADIUS = 0.35; // world units — fixed radius for the rounded bend

// --- Value formatting ---

export function formatSpeed(raw: number, bytes = false, precision?: number): { value: string; unit: string } {
  const n = bytes ? Math.abs(raw) / 8 : Math.abs(raw);
  const s = bytes ? 'B/s' : 'b/s';
  const k = bytes ? 'KB/s' : 'Kb/s';
  const m = bytes ? 'MB/s' : 'Mb/s';
  const g = bytes ? 'GB/s' : 'Gb/s';
  if (n >= 1e9) return { value: (n / 1e9).toFixed(precision ?? 1), unit: g };
  if (n >= 1e6) return { value: (n / 1e6).toFixed(precision ?? 1), unit: m };
  if (n >= 1e3) return { value: (n / 1e3).toFixed(precision ?? 0), unit: k };
  return { value: n.toFixed(precision ?? 0), unit: s };
}

/** Generic SI auto-scaling formatter for any unit (W, L, m³, etc.). */
export function formatGenericValue(raw: number, unit: string, precision?: number): { value: string; unit: string } {
  const n = Math.abs(raw);
  const d = precision ?? 1;
  if (n >= 1e9) return { value: (raw / 1e9).toFixed(d), unit: `G${unit}` };
  if (n >= 1e6) return { value: (raw / 1e6).toFixed(d), unit: `M${unit}` };
  if (n >= 1e3) return { value: (raw / 1e3).toFixed(d), unit: `k${unit}` };
  if (n >= 1)   return { value: raw.toFixed(d), unit };
  if (n >= 1e-3) return { value: (raw * 1e3).toFixed(d), unit: `m${unit}` };
  return { value: raw.toFixed(precision ?? 2), unit };
}

function formatDisplayValue(raw: number, unit: string, precision: number | undefined, autoScale: boolean) {
  return autoScale
    ? formatGenericValue(raw, unit, precision)
    : { value: raw.toFixed(precision ?? 1), unit };
}

// --- Direction helpers ---

function getApproachAxis(dir: TubeConfig['originDirection']): { x: number; z: number } {
  switch (dir) {
    case 'left':   return { x:  1, z:  0 };
    case 'right':  return { x: -1, z:  0 };
    case 'top':    return { x:  0, z: -1 };
    case 'bottom': return { x:  0, z:  1 };
  }
}

function getEdgeStart(dir: TubeConfig['originDirection'], endX: number, endZ: number): { x: number; z: number } {
  const dist = GRID_RADIUS;
  switch (dir) {
    case 'left':   return { x: -dist, z: endZ };
    case 'right':  return { x:  dist, z: endZ };
    case 'top':    return { x: endX,  z:  dist };
    case 'bottom': return { x: endX,  z: -dist };
  }
}

// --- Path building ---

/**
 * Build the 3D path for a single tube line with a smooth rounded corner.
 * Uses many intermediate points around the bend so CreateTube produces
 * a clean rounded corner with uniform radius.
 */
function buildTubePath(
  config: TubeConfig,
  lineIndex: number,
): Vector3[] {
  const approach = getApproachAxis(config.originDirection);
  const radius = config.diameter / 2;

  const lineCount = config.lines.length;
  const perpOffset = (lineIndex - (lineCount - 1) / 2) * config.gap;
  const perpX = -approach.z;
  const perpZ = approach.x;

  const edge = getEdgeStart(config.originDirection, config.endX, config.endZ);
  const startX = edge.x + perpX * perpOffset;
  const startZ = edge.z + perpZ * perpOffset;
  const endX = config.endX + perpX * perpOffset;
  const endZ = config.endZ + perpZ * perpOffset;

  // Tube center sits radius + 10cm above the ground surface
  const tubeY = GROUND_Y + GROUND_CLEARANCE + radius;
  const cr = Math.max(CORNER_RADIUS, config.diameter * 2);

  const points: Vector3[] = [];

  // 1. Start at scene edge, floating above ground
  points.push(new Vector3(startX, tubeY, startZ));

  // 2. End of horizontal segment — stop cornerRadius before the bend point
  const preCornerX = endX - approach.x * cr;
  const preCornerZ = endZ - approach.z * cr;
  points.push(new Vector3(preCornerX, tubeY, preCornerZ));

  // 3. Rounded 90° corner (quarter circle from horizontal to vertical)
  // Corner pivot is at (endX, tubeY, endZ) — the sharp bend point.
  // Arc sweeps from the horizontal end inward toward the vertical,
  // staying tight against the inner corner.
  for (let i = 1; i <= CORNER_SEGMENTS; i++) {
    const t = (i / CORNER_SEGMENTS) * (Math.PI / 2);
    // At t=0: full horizontal offset, no vertical (matches preCorner point)
    // At t=PI/2: no horizontal offset, full vertical (matches vertical segment)
    const horizOffset = (1 - Math.sin(t)) * cr;
    const vertOffset = (1 - Math.cos(t)) * cr;
    const px = endX - approach.x * horizOffset;
    const pz = endZ - approach.z * horizOffset;
    const py = tubeY + vertOffset;
    points.push(new Vector3(px, py, pz));
  }

  // 4. Extend vertical segment up to model floor (if corner top doesn't reach)
  const cornerTopY = tubeY + cr;
  if (MODEL_FLOOR_Y > cornerTopY) {
    points.push(new Vector3(endX, MODEL_FLOOR_Y, endZ));
  }

  return points;
}

// --- Mesh creation ---

function hexToColor3(hex: string): Color3 {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16) / 255;
  const g = parseInt(h.substring(2, 4), 16) / 255;
  const b = parseInt(h.substring(4, 6), 16) / 255;
  return new Color3(r, g, b);
}

// --- Particle helpers ---

const PARTICLE_MIN_COUNT = 6;
const PARTICLE_MAX_COUNT = 24;
/** Base speed in world-units/s — must be high enough relative to path length (~50 units). */
const PARTICLE_BASE_SPEED = 4;
/** Max additional speed from sensor values. */
const PARTICLE_MAX_SPEED = 40;

/** Build cumulative distance array for a path. */
function buildDistances(path: Vector3[]): { distances: number[]; totalLength: number } {
  const distances = [0];
  let total = 0;
  for (let i = 1; i < path.length; i++) {
    total += Vector3.Distance(path[i - 1], path[i]);
    distances.push(total);
  }
  return { distances, totalLength: total };
}

/** Map raw sensor value to a particle speed (world-units/s).
 *  @param rawValue - sensor value in its input unit (not converted to bits)
 *  @param maxValue - sensor value at which speed is maxed out
 *  @param multiplier - user speed multiplier
 */
function rawToParticleSpeed(rawValue: number, maxValue: number, multiplier: number): number {
  if (rawValue <= 0) return 0;
  const t = Math.min(rawValue / maxValue, 1);
  return (PARTICLE_BASE_SPEED + t * PARTICLE_MAX_SPEED) * multiplier;
}

// --- Position-based fade (replaces camera-distance fog) ---

/** Fade tube vertices based on horizontal distance from origin.
 *  Vertices far from origin (near grid edge) become transparent;
 *  vertices close to origin (near building) stay fully opaque.
 *  This is independent of camera distance, so it works on mobile. */
function applyPositionFade(mesh: Mesh, fadeStart: number, fadeEnd: number): void {
  const positions = mesh.getVerticesData(VertexBuffer.PositionKind);
  if (!positions) return;

  const vertexCount = positions.length / 3;
  const colors = new Float32Array(vertexCount * 4);

  for (let i = 0; i < vertexCount; i++) {
    const x = positions[i * 3];
    const z = positions[i * 3 + 2];
    const dist = Math.sqrt(x * x + z * z);
    // 1 when dist < fadeStart, 0 when dist > fadeEnd
    const alpha = 1 - Math.max(0, Math.min(1, (dist - fadeStart) / (fadeEnd - fadeStart)));
    colors[i * 4]     = 1; // R (ignored — emissive drives color)
    colors[i * 4 + 1] = 1; // G
    colors[i * 4 + 2] = 1; // B
    colors[i * 4 + 3] = alpha;
  }

  mesh.setVerticesData(VertexBuffer.ColorKind, colors);
  mesh.hasVertexAlpha = true;
}

/** Dedicated highlight layer for tube glow — separate from the pending-command
 *  highlight layer so tube glow doesn't pulse when lights are toggled. */
let tubeHighlightLayer: HighlightLayer | null = null;

function getTubeHighlightLayer(scene: Scene): HighlightLayer {
  if (!tubeHighlightLayer) {
    tubeHighlightLayer = new HighlightLayer('tubeGlowHL', scene);
    tubeHighlightLayer.innerGlow = false;
    tubeHighlightLayer.outerGlow = true;
    tubeHighlightLayer.blurHorizontalSize = 1.5;
    tubeHighlightLayer.blurVerticalSize = 1.5;
  }
  return tubeHighlightLayer;
}

export function createTubeMeshes(
  scene: Scene,
  config: TubeConfig,
  glowLayer: GlowLayer | null,
  parent?: Node,
): TubeMeshEntry {
  const tubes: Mesh[] = [];
  const labels: TubeLabelEntry[] = [];
  const particles: TubeParticleEntry[] = [];

  config.lines.forEach((line, lineIndex) => {
    const path = buildTubePath(config, lineIndex);
    const color = hexToColor3(line.color);
    const tubeRadius = config.diameter / 2;

    // Core tube mesh — force constant radius via radiusFunction
    const tube = MeshBuilder.CreateTube(`tube_${config.id}_${lineIndex}`, {
      path,
      radiusFunction: () => tubeRadius,
      tessellation: TUBE_TESSELLATION,
      cap: Mesh.NO_CAP,
      updatable: false,
    }, scene);

    const mat = new StandardMaterial(`tubeMat_${config.id}_${lineIndex}`, scene);
    mat.emissiveColor = color;
    mat.diffuseColor = Color3.Black();
    mat.specularColor = Color3.Black();
    mat.disableLighting = true;

    tube.material = mat;
    tube.isPickable = true;
    tube.metadata = { tubeId: config.id };
    tube.applyFog = false;
    if (parent) tube.parent = parent;

    // Position-based fade: transparent at grid edge, opaque near building
    applyPositionFade(tube, GRID_RADIUS * 0.75, GRID_RADIUS * 0.97);

    // Exclude from glow layer (bleeds through model).
    if (glowLayer) {
      glowLayer.addExcludedMesh(tube);
    }

    tubes.push(tube);

    // Glow: create a shorter invisible tube near the model and add it to
    // the highlight layer. The full tube fades with fog, but HighlightLayer
    // ignores fog — so we only glow the nearby portion to avoid visible
    // glow past the fog fade distance.
    const GLOW_LENGTH = 22; // only glow this many units from the endpoint
    const approach = getApproachAxis(config.originDirection);
    const perpX2 = -approach.z;
    const perpZ2 = approach.x;
    const perpOffset2 = (lineIndex - (config.lines.length - 1) / 2) * config.gap;
    const glowStartX = config.endX + perpX2 * perpOffset2 - approach.x * GLOW_LENGTH;
    const glowStartZ = config.endZ + perpZ2 * perpOffset2 - approach.z * GLOW_LENGTH;
    const glowEndX = config.endX + perpX2 * perpOffset2;
    const glowEndZ = config.endZ + perpZ2 * perpOffset2;
    const tubeY = GROUND_Y + GROUND_CLEARANCE + tubeRadius;
    const cr = Math.max(CORNER_RADIUS, config.diameter * 2);

    const glowPath: Vector3[] = [
      new Vector3(glowStartX, tubeY, glowStartZ),
      new Vector3(glowEndX - approach.x * cr, tubeY, glowEndZ - approach.z * cr),
    ];
    // Add the corner arc
    for (let i = 1; i <= CORNER_SEGMENTS; i++) {
      const t = (i / CORNER_SEGMENTS) * (Math.PI / 2);
      const horizOffset = (1 - Math.sin(t)) * cr;
      const vertOffset = (1 - Math.cos(t)) * cr;
      glowPath.push(new Vector3(
        glowEndX - approach.x * horizOffset,
        tubeY + vertOffset,
        glowEndZ - approach.z * horizOffset,
      ));
    }
    const cornerTopY = tubeY + cr;
    if (MODEL_FLOOR_Y > cornerTopY) {
      glowPath.push(new Vector3(glowEndX, MODEL_FLOOR_Y, glowEndZ));
    }

    const glowTube = MeshBuilder.CreateTube(`tubeGlowSrc_${config.id}_${lineIndex}`, {
      path: glowPath,
      radiusFunction: () => tubeRadius,
      tessellation: TUBE_TESSELLATION,
      cap: Mesh.NO_CAP,
      updatable: false,
    }, scene);
    glowTube.visibility = 0.001; // near-invisible — only serves as glow source
    glowTube.isPickable = false;
    if (parent) glowTube.parent = parent;
    if (glowLayer) glowLayer.addExcludedMesh(glowTube);

    const hl = getTubeHighlightLayer(scene);
    hl.addMesh(glowTube, color);
    tubes.push(glowTube);

    // --- Floating label ---
    const labelApproach = getApproachAxis(config.originDirection);
    const labelPerpX = -labelApproach.z;
    const labelPerpZ = labelApproach.x;
    const labelPerpOffset = (lineIndex - (config.lines.length - 1) / 2) * config.gap;
    const labelEdge = getEdgeStart(config.originDirection, config.endX, config.endZ);
    const labelStartX = labelEdge.x + labelPerpX * labelPerpOffset;
    const labelStartZ = labelEdge.z + labelPerpZ * labelPerpOffset;

    const labelPos = config.labelPosition ?? 0.95;
    const labelH = config.labelHeight ?? 0.3;
    const labelTubeY = GROUND_Y + GROUND_CLEARANCE + tubeRadius;

    // Interpolate along horizontal segment
    const tubeEndX = config.endX + labelPerpX * labelPerpOffset;
    const tubeEndZ = config.endZ + labelPerpZ * labelPerpOffset;
    const labelX = labelStartX + (tubeEndX - labelStartX) * labelPos;
    const labelZ = labelStartZ + (tubeEndZ - labelStartZ) * labelPos;
    const labelY = labelTubeY + tubeRadius + labelH;

    // Offset label perpendicular to the tube direction so it doesn't overlap
    // the tube from the top-down home view (same color = invisible)
    const labelPerpSign = config.lines.length > 1
      ? (lineIndex < config.lines.length / 2 ? -1 : 1)
      : 1;
    const labelSideOffset = labelPerpSign * (config.diameter * 2 + 0.2);

    const hasIcon = !!line.icon;
    const texWidth = hasIcon ? 700 : 512;
    const texHeight = 128;
    const dt = new DynamicTexture(`tubeLabelTex_${config.id}_${lineIndex}`, { width: texWidth, height: texHeight }, scene, false);
    dt.hasAlpha = true;

    const labelMat = new StandardMaterial(`tubeLabelMat_${config.id}_${lineIndex}`, scene);
    labelMat.diffuseTexture = dt;
    labelMat.emissiveTexture = dt;
    labelMat.opacityTexture = dt;
    labelMat.specularColor = Color3.Black();
    labelMat.disableLighting = true;
    labelMat.backFaceCulling = false;
    labelMat.useAlphaFromDiffuseTexture = true;
    // Alpha blend so the dark pill composites correctly over the scene
    labelMat.alphaMode = 2; // ALPHA_COMBINE
    labelMat.transparencyMode = 2; // MATERIAL_ALPHABLEND

    const planeWidth = hasIcon ? 1.65 : 1.2;
    const planeHeight = 0.3;
    const plane = MeshBuilder.CreatePlane(`tubeLabel_${config.id}_${lineIndex}`, {
      width: planeWidth,
      height: planeHeight,
    }, scene);
    plane.position = new Vector3(
      labelX + labelPerpX * labelSideOffset,
      labelY,
      labelZ + labelPerpZ * labelSideOffset,
    );
    plane.billboardMode = 7; // always face camera
    plane.material = labelMat;
    plane.isPickable = true;
    plane.metadata = { tubeId: config.id };
    plane.applyFog = false;
    if (parent) plane.parent = parent;

    // Exclude label from glow layer
    if (glowLayer) {
      glowLayer.addExcludedMesh(plane);
    }

    labels.push({
      sensorId: line.sensorId,
      plane,
      texture: dt,
      material: labelMat,
      color: line.color,
      fontSize: config.fontSize,
      icon: line.icon,
      inputUnit: line.inputUnit ?? 'b',
      displayBytes: line.displayBytes ?? false,
      displayUnit: line.displayUnit,
      autoScale: line.autoScale ?? true,
      precision: line.precision,
      lastText: '',
      lastValue: '',
      lastUnit: '',
      theme: 'dark',
    });

    // --- Particles ---
    if (line.particles) {
      const particlePath = buildTubePath(config, lineIndex);
      const { distances, totalLength } = buildDistances(particlePath);
      const sphereRadius = config.diameter * 0.8;
      const dir = line.particleDirection === 'outward' ? -1 : 1;
      const brightColor = Color3.Lerp(color, Color3.White(), 0.5);

      const spheres: Mesh[] = [];
      const offsets: number[] = [];
      const speedJitter: number[] = [];
      const pMat = new StandardMaterial(`tubeParticleMat_${config.id}_${lineIndex}`, scene);
      pMat.emissiveColor = brightColor;
      pMat.diffuseColor = Color3.Black();
      pMat.specularColor = Color3.Black();
      pMat.disableLighting = true;
      pMat.alpha = 0.9;

      // Pre-create MAX particles; hide extras beyond initial active count
      for (let p = 0; p < PARTICLE_MAX_COUNT; p++) {
        const sphere = MeshBuilder.CreateSphere(
          `tubeParticle_${config.id}_${lineIndex}_${p}`,
          { diameter: sphereRadius * 2, segments: 6 },
          scene,
        );
        sphere.material = pMat;
        sphere.isPickable = false;
        sphere.applyFog = false;
        if (parent) sphere.parent = parent;
        if (glowLayer) glowLayer.addExcludedMesh(sphere);

        const offset = p / PARTICLE_MIN_COUNT;
        offsets.push(offset % 1);
        // Random speed jitter: each particle gets 0.75–1.25× base speed
        speedJitter.push(0.75 + Math.random() * 0.5);
        positionAtDistanceToRef(particlePath, distances, (offset % 1) * totalLength, sphere.position);
        // Hide particles beyond initial count
        sphere.setEnabled(p < PARTICLE_MIN_COUNT);
        spheres.push(sphere);
      }

      particles.push({
        spheres,
        path: particlePath,
        distances,
        totalLength,
        offsets,
        speedJitter,
        speed: PARTICLE_BASE_SPEED * (line.particleSpeed ?? 1),
        direction: dir as 1 | -1,
        sensorId: line.sensorId,
        inputUnit: line.inputUnit ?? 'b',
        speedMultiplier: line.particleSpeed ?? 1,
        maxSensorValue: line.particleMaxValue ?? 1000,
        scene,
        color: brightColor,
        sphereRadius,
        activeCount: PARTICLE_MIN_COUNT,
        glowLayer,
      });
    }
  });

  // Register per-frame particle animation
  let particleObserver: Observer<Scene> | null = null;
  if (particles.length > 0) {
    particleObserver = scene.onBeforeRenderObservable.add(() => {
      const dt = scene.getEngine().getDeltaTime() / 1000; // seconds
      for (const pe of particles) {
        if (pe.speed <= 0) continue;
        const baseAdvance = (pe.speed * dt * pe.direction) / pe.totalLength;
        for (let i = 0; i < pe.activeCount; i++) {
          const advance = baseAdvance * pe.speedJitter[i];
          pe.offsets[i] = ((pe.offsets[i] + advance) % 1 + 1) % 1; // wrap 0..1
          const d = pe.offsets[i] * pe.totalLength;
          positionAtDistanceToRef(pe.path, pe.distances, d, pe.spheres[i].position);
        }
      }
    });
  }

  return { config, tubes, labels, particles, particleObserver };
}

// --- Label update ---

/** Darken a hex color by mixing with black. t=0 → original, t=1 → black. */
function darkenHex(hex: string, t: number): string {
  const h = hex.replace('#', '');
  const r = Math.round(parseInt(h.substring(0, 2), 16) * (1 - t));
  const g = Math.round(parseInt(h.substring(2, 4), 16) * (1 - t));
  const b = Math.round(parseInt(h.substring(4, 6), 16) * (1 - t));
  return `rgb(${r},${g},${b})`;
}

/** Brighten a hex color by mixing with white. t=0 → original, t=1 → white. */
function brightenHex(hex: string, t: number): string {
  const h = hex.replace('#', '');
  const r = Math.round(parseInt(h.substring(0, 2), 16) + (255 - parseInt(h.substring(0, 2), 16)) * t);
  const g = Math.round(parseInt(h.substring(2, 4), 16) + (255 - parseInt(h.substring(2, 4), 16)) * t);
  const b = Math.round(parseInt(h.substring(4, 6), 16) + (255 - parseInt(h.substring(4, 6), 16)) * t);
  return `rgb(${r},${g},${b})`;
}

function renderLabel(entry: TubeLabelEntry, value: string, unit: string): void {
  const text = `${entry.theme}|${entry.icon ?? ''}|${value} ${unit}`;
  if (text === entry.lastText) return;
  entry.lastText = text;
  entry.lastValue = value;
  entry.lastUnit = unit;

  const ctx = entry.texture.getContext();
  const w = entry.texture.getSize().width;
  const h = entry.texture.getSize().height;

  ctx.clearRect(0, 0, w, h);

  const isLight = entry.theme === 'light';
  // Light theme: lighter pill, darker text | Dark theme: dark pill, bright text
  const pillColor = isLight ? 'rgba(240, 242, 245, 0.9)' : 'rgba(10, 14, 26, 0.85)';
  const textColor = entry.color;
  const iconColor = entry.color;

  const valueFontSize = entry.fontSize;
  const unitFontSize = Math.round(valueFontSize / 2);
  const iconSize = valueFontSize;
  const iconGap = 6;

  ctx.font = `bold ${valueFontSize}px DM Mono, monospace`;
  const valueMetrics = ctx.measureText(value);

  ctx.font = `${unitFontSize}px DM Mono, monospace`;
  const unitMetrics = ctx.measureText(unit);

  const hasIcon = !!entry.icon;
  const iconSpace = hasIcon ? iconSize + iconGap : 0;
  const totalWidth = iconSpace + valueMetrics.width + 6 + unitMetrics.width;
  let startX = (w - totalWidth) / 2;
  const baselineY = h / 2 + valueFontSize / 3;

  // Backing pill
  const pad = 10;
  const pillX = startX - pad;
  const pillY = h / 2 - valueFontSize / 2 - pad / 2;
  const pillW = totalWidth + pad * 2;
  const pillH = valueFontSize + pad;
  const pillR = Math.min(pillH / 2, pillW / 2);
  ctx.fillStyle = pillColor;
  ctx.beginPath();
  ctx.moveTo(pillX + pillR, pillY);
  ctx.lineTo(pillX + pillW - pillR, pillY);
  ctx.arc(pillX + pillW - pillR, pillY + pillR, pillR, -Math.PI / 2, 0);
  ctx.lineTo(pillX + pillW, pillY + pillH - pillR);
  ctx.arc(pillX + pillW - pillR, pillY + pillH - pillR, pillR, 0, Math.PI / 2);
  ctx.lineTo(pillX + pillR, pillY + pillH);
  ctx.arc(pillX + pillR, pillY + pillH - pillR, pillR, Math.PI / 2, Math.PI);
  ctx.lineTo(pillX, pillY + pillR);
  ctx.arc(pillX + pillR, pillY + pillR, pillR, Math.PI, -Math.PI / 2);
  ctx.closePath();
  ctx.fill();

  // Draw icon if present
  if (hasIcon) {
    const img = getLucideIconImage(entry.icon!, iconColor, iconSize, entry, () => {
      if (entry.plane.isDisposed()) return;
      entry.lastText = '';
      renderLabel(entry, entry.lastValue, entry.lastUnit);
    });
    if (img) {
      const iconY = h / 2 - iconSize / 2;
      ctx.drawImage(img, startX, iconY, iconSize, iconSize);
    }
    startX += iconSpace;
  }

  ctx.font = `bold ${valueFontSize}px DM Mono, monospace`;
  ctx.fillStyle = textColor;
  ctx.fillText(value, startX, baselineY);

  ctx.font = `${unitFontSize}px DM Mono, monospace`;
  ctx.fillStyle = textColor;
  ctx.fillText(unit, startX + valueMetrics.width + 6, baselineY);

  entry.texture.update();

}

export function updateTubeEntryValue(entry: TubeMeshEntry, sensorId: string, stateValue: string): void {
  const raw = parseFloat(stateValue);
  if (isNaN(raw)) return;

  for (const label of entry.labels) {
    if (label.sensorId === sensorId) {
      if (label.displayUnit) {
        const { value, unit } = formatDisplayValue(raw, label.displayUnit, label.precision, label.autoScale);
        renderLabel(label, value, unit);
      } else {
        const bits = raw * UNIT_TO_BITS[label.inputUnit];
        const { value, unit } = formatSpeed(bits, label.displayBytes, label.precision);
        renderLabel(label, value, unit);
      }
    }
  }

  // Update particle speed & density for matching sensors.
  for (const pe of entry.particles) {
    if (pe.sensorId === sensorId) {
      pe.speed = rawToParticleSpeed(raw, pe.maxSensorValue, pe.speedMultiplier);
      // Scale active particle count with sensor intensity.
      const t = Math.min(raw / pe.maxSensorValue, 1);
      const target = Math.round(PARTICLE_MIN_COUNT + t * (PARTICLE_MAX_COUNT - PARTICLE_MIN_COUNT));
      if (target !== pe.activeCount) {
        // Show/hide particles to match target count.
        for (let i = 0; i < PARTICLE_MAX_COUNT; i++) {
          const shouldBeActive = i < target;
          if (shouldBeActive && !pe.spheres[i].isEnabled()) {
            pe.offsets[i] = Math.random();
            pe.speedJitter[i] = 0.75 + Math.random() * 0.5;
            positionAtDistanceToRef(pe.path, pe.distances, pe.offsets[i] * pe.totalLength, pe.spheres[i].position);
          }
          pe.spheres[i].setEnabled(shouldBeActive);
        }
        pe.activeCount = target;
      }
    }
  }
}

export function updateTubeValue(tubeMap: TubeMap, sensorId: string, stateValue: string): void {
  for (const entry of Object.values(tubeMap)) {
    updateTubeEntryValue(entry, sensorId, stateValue);
  }
}

/** Update theme for all tube labels and force re-render. */
export function setTubeTheme(tubeMap: TubeMap, theme: 'light' | 'dark'): void {
  for (const entry of Object.values(tubeMap)) {
    for (const label of entry.labels) {
      label.theme = theme;
      label.lastText = ''; // force redraw
      if (label.lastValue) {
        renderLabel(label, label.lastValue, label.lastUnit);
      }
    }
  }
  // The shared image cache includes the color, so theme changes need no eviction.
}

/** Render mockup speed values on all tube labels (for config editor preview). */
export function renderMockupLabels(tubeMap: TubeMap): void {
  for (const entry of Object.values(tubeMap)) {
    for (let i = 0; i < entry.labels.length; i++) {
      const label = entry.labels[i];
      let mockup: { value: string; unit: string };
      if (label.displayUnit) {
        mockup = i % 2 === 0
          ? formatDisplayValue(1234, label.displayUnit, label.precision, label.autoScale)
          : formatDisplayValue(567, label.displayUnit, label.precision, label.autoScale);
      } else {
        mockup = i % 2 === 0
          ? { value: '42.7', unit: 'Mb/s' }
          : { value: '12.3', unit: 'Mb/s' };
      }
      renderLabel(label, mockup.value, mockup.unit);
    }
  }
}

// --- Cleanup ---

export function removeTubeMeshes(tubeMap: TubeMap, tubeId: string): void {
  const entry = tubeMap[tubeId];
  if (!entry) return;

  // Remove particle animation observer
  if (entry.particleObserver) {
    entry.tubes[0]?.getScene()?.onBeforeRenderObservable.remove(entry.particleObserver);
  }
  // Dispose particle spheres
  for (const pe of entry.particles) {
    pe.spheres[0]?.material?.dispose();
    for (const s of pe.spheres) {
      s.dispose();
    }
  }

  for (const tube of entry.tubes) {
    tube.material?.dispose();
    tube.dispose();
  }
  for (const label of entry.labels) {
    label.texture.dispose();
    label.material.dispose();
    label.plane.dispose();
  }

  delete tubeMap[tubeId];
}

export function disposeAllTubes(tubeMap: TubeMap): void {
  for (const id of Object.keys(tubeMap)) {
    removeTubeMeshes(tubeMap, id);
  }
  // Dispose the dedicated tube highlight layer when all tubes are gone
  if (tubeHighlightLayer) {
    tubeHighlightLayer.dispose();
    tubeHighlightLayer = null;
  }
}
