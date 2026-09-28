import {
  Color3,
  DynamicTexture,
  LinesMesh,
  Mesh,
  MeshBuilder,
  StandardMaterial,
  Tools,
  VertexData,
  Vector3,
  type Scene,
  type TransformNode,
} from '@babylonjs/core';
import * as polygonClippingModule from 'polygon-clipping';
import type { MultiPolygon, Polygon } from 'polygon-clipping';
import type { RoomConfig, RoomZone, RoomZonePoint } from '../types';

type PolygonClippingApi = {
  intersection: (subject: Polygon, ...clips: Polygon[]) => MultiPolygon;
};

const polygonClipping = (
  (polygonClippingModule as unknown as { default?: PolygonClippingApi }).default
  ?? polygonClippingModule
) as PolygonClippingApi;

export interface RoomZoneMeshEntry {
  zone: Mesh;
  outline: LinesMesh;
  label: Mesh;
  zoneMaterial: StandardMaterial;
  labelMaterial: StandardMaterial;
  labelTexture: DynamicTexture;
}

export type RoomZoneMeshMap = Record<string, RoomZoneMeshEntry>;

export interface RoomZoneLabelEntry {
  label: Mesh;
  labelMaterial: StandardMaterial;
  labelTexture: DynamicTexture;
}

export const ROOM_FLOOR_TOLERANCE = 0.12;
export const DEFAULT_ROOM_ZONE_OPACITY = 0.14;
export const ROOM_ZONE_COLOR_PALETTE = [
  '#38bdf8',
  '#4ade80',
  '#fbbf24',
  '#fb7185',
  '#2dd4bf',
  '#a3e635',
  '#f97316',
  '#818cf8',
] as const;

function stableRoomHash(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index++) {
    hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0;
  }
  return Math.abs(hash);
}

export function defaultRoomZoneColor(roomId: string): string {
  return ROOM_ZONE_COLOR_PALETTE[stableRoomHash(roomId) % ROOM_ZONE_COLOR_PALETTE.length];
}

export function resolveRoomZoneColor(room: Pick<RoomConfig, 'id' | 'zone'>): string {
  const configured = room.zone.color?.trim();
  return configured && /^#[\da-f]{6}$/i.test(configured)
    ? configured
    : defaultRoomZoneColor(room.id);
}

export function clampRoomZoneOpacity(opacity?: number): number {
  if (typeof opacity !== 'number' || !Number.isFinite(opacity)) return DEFAULT_ROOM_ZONE_OPACITY;
  return Math.min(0.55, Math.max(0.04, opacity));
}

export function roomZoneColor3(color: string, fallback = ROOM_ZONE_COLOR_PALETTE[0]): Color3 {
  return Color3.FromHexString(/^#[\da-f]{6}$/i.test(color) ? color : fallback);
}

export function getRoomZoneWorldPoints(room: RoomConfig): RoomZonePoint[] {
  const angle = Tools.ToRadians(room.zone.rotationY ?? 0);
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  return getRoomZonePoints(room.zone).map((point) => ({
    x: room.anchor.x + point.x * cosine + point.z * sine,
    z: room.anchor.z - point.x * sine + point.z * cosine,
  }));
}

function polygonBounds(points: RoomZonePoint[]) {
  const xs = points.map((point) => point.x);
  const zs = points.map((point) => point.z);
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minZ: Math.min(...zs),
    maxZ: Math.max(...zs),
  };
}

function triangleProjection(points: RoomZonePoint[], axisX: number, axisZ: number): [number, number] {
  const values = points.map((point) => point.x * axisX + point.z * axisZ);
  return [Math.min(...values), Math.max(...values)];
}

function trianglesOverlapWithArea(
  first: RoomZonePoint[],
  second: RoomZonePoint[],
  epsilon: number,
): boolean {
  for (const triangle of [first, second]) {
    for (let index = 0; index < 3; index++) {
      const start = triangle[index];
      const end = triangle[(index + 1) % 3];
      const edgeX = end.x - start.x;
      const edgeZ = end.z - start.z;
      const length = Math.hypot(edgeX, edgeZ);
      if (length <= epsilon) continue;
      const axisX = -edgeZ / length;
      const axisZ = edgeX / length;
      const [firstMin, firstMax] = triangleProjection(first, axisX, axisZ);
      const [secondMin, secondMax] = triangleProjection(second, axisX, axisZ);
      if (Math.min(firstMax, secondMax) - Math.max(firstMin, secondMin) <= epsilon) return false;
    }
  }
  return true;
}

function toClippingPolygon(points: RoomZonePoint[]): Polygon {
  return [[...points.map((point) => [point.x, point.z] as [number, number]), [points[0].x, points[0].z]]];
}

function clippingRingArea(ring: number[][]): number {
  let area = 0;
  for (let index = 0; index < ring.length - 1; index++) {
    const current = ring[index];
    const next = ring[index + 1];
    area += current[0] * next[1] - next[0] * current[1];
  }
  return Math.abs(area / 2);
}

function clippingMultiPolygonArea(multiPolygon: MultiPolygon): number {
  return multiPolygon.reduce((total, polygon) => {
    const outerArea = clippingRingArea(polygon[0] ?? []);
    const holesArea = polygon.slice(1).reduce((sum, ring) => sum + clippingRingArea(ring), 0);
    return total + Math.max(0, outerArea - holesArea);
  }, 0);
}

/** Returns true only for a positive-area overlap. Shared corners and edges are allowed. */
export function roomZonesOverlap(first: RoomConfig, second: RoomConfig): boolean {
  if (Math.abs(first.anchor.y - second.anchor.y) > ROOM_FLOOR_TOLERANCE) return false;

  const firstPoints = getRoomZoneWorldPoints(first);
  const secondPoints = getRoomZoneWorldPoints(second);
  if (firstPoints.length < 3 || secondPoints.length < 3) return false;

  const firstBounds = polygonBounds(firstPoints);
  const secondBounds = polygonBounds(secondPoints);
  const span = Math.max(
    firstBounds.maxX - firstBounds.minX,
    firstBounds.maxZ - firstBounds.minZ,
    secondBounds.maxX - secondBounds.minX,
    secondBounds.maxZ - secondBounds.minZ,
    1,
  );
  const epsilon = span * 1e-6;
  if (Math.min(firstBounds.maxX, secondBounds.maxX) - Math.max(firstBounds.minX, secondBounds.minX) <= epsilon
    || Math.min(firstBounds.maxZ, secondBounds.maxZ) - Math.max(firstBounds.minZ, secondBounds.minZ) <= epsilon) {
    return false;
  }

  try {
    const intersection = polygonClipping.intersection(
      toClippingPolygon(firstPoints),
      toClippingPolygon(secondPoints),
    );
    const areaTolerance = Math.max(span * span * 1e-8, 1e-10);
    return clippingMultiPolygonArea(intersection) > areaTolerance;
  } catch (error) {
    console.warn('[Rooms] Falling back to triangle overlap detection:', error);
  }

  const firstTriangles = triangulateRoomZone(firstPoints);
  const secondTriangles = triangulateRoomZone(secondPoints);
  for (let firstIndex = 0; firstIndex < firstTriangles.length; firstIndex += 3) {
    const firstTriangle = firstTriangles.slice(firstIndex, firstIndex + 3).map((index) => firstPoints[index]);
    for (let secondIndex = 0; secondIndex < secondTriangles.length; secondIndex += 3) {
      const secondTriangle = secondTriangles.slice(secondIndex, secondIndex + 3).map((index) => secondPoints[index]);
      if (trianglesOverlapWithArea(firstTriangle, secondTriangle, epsilon)) return true;
    }
  }
  return false;
}

export function findOverlappingRooms(room: RoomConfig, rooms: RoomConfig[]): RoomConfig[] {
  return rooms.filter((candidate) => candidate.id !== room.id && roomZonesOverlap(room, candidate));
}

export function findOverlappingRoomIds(rooms: RoomConfig[]): Set<string> {
  const overlappingIds = new Set<string>();
  for (let firstIndex = 0; firstIndex < rooms.length; firstIndex++) {
    for (let secondIndex = firstIndex + 1; secondIndex < rooms.length; secondIndex++) {
      if (!roomZonesOverlap(rooms[firstIndex], rooms[secondIndex])) continue;
      overlappingIds.add(rooms[firstIndex].id);
      overlappingIds.add(rooms[secondIndex].id);
    }
  }
  return overlappingIds;
}

export function removeRoomZoneMesh(map: RoomZoneMeshMap, roomId: string): void {
  const entry = map[roomId];
  if (!entry) return;
  entry.zone.dispose();
  entry.outline.dispose();
  entry.label.dispose();
  entry.zoneMaterial.dispose();
  entry.labelMaterial.dispose();
  entry.labelTexture.dispose();
  delete map[roomId];
}

export function rectangleRoomZonePoints(width: number, depth: number): RoomZonePoint[] {
  const halfWidth = Math.max(0.1, width) / 2;
  const halfDepth = Math.max(0.1, depth) / 2;
  return [
    { x: -halfWidth, z: -halfDepth },
    { x: halfWidth, z: -halfDepth },
    { x: halfWidth, z: halfDepth },
    { x: -halfWidth, z: halfDepth },
  ];
}

export function getRoomZonePoints(zone: RoomZone): RoomZonePoint[] {
  if (zone.points && zone.points.length >= 3) {
    return zone.points.map((point) => ({ x: point.x, z: point.z }));
  }
  return rectangleRoomZonePoints(zone.width, zone.depth);
}

function signedArea(points: RoomZonePoint[]): number {
  let area = 0;
  for (let index = 0; index < points.length; index++) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    area += current.x * next.z - next.x * current.z;
  }
  return area / 2;
}

function pointInTriangle(point: RoomZonePoint, a: RoomZonePoint, b: RoomZonePoint, c: RoomZonePoint): boolean {
  const cross = (p1: RoomZonePoint, p2: RoomZonePoint, p3: RoomZonePoint) =>
    (p2.x - p1.x) * (p3.z - p1.z) - (p2.z - p1.z) * (p3.x - p1.x);
  const ab = cross(a, b, point);
  const bc = cross(b, c, point);
  const ca = cross(c, a, point);
  return (ab >= -1e-7 && bc >= -1e-7 && ca >= -1e-7)
    || (ab <= 1e-7 && bc <= 1e-7 && ca <= 1e-7);
}

/** Ear-clipping triangulation for simple concave room polygons. */
function triangulateRoomZone(points: RoomZonePoint[]): number[] {
  if (points.length < 3) return [];
  const order = points.map((_, index) => index);
  if (signedArea(points) < 0) order.reverse();
  const triangles: number[] = [];
  let attempts = 0;

  while (order.length > 3 && attempts < points.length * points.length) {
    let clipped = false;
    for (let index = 0; index < order.length; index++) {
      const previous = order[(index - 1 + order.length) % order.length];
      const current = order[index];
      const next = order[(index + 1) % order.length];
      const a = points[previous];
      const b = points[current];
      const c = points[next];
      const convex = (b.x - a.x) * (c.z - b.z) - (b.z - a.z) * (c.x - b.x);
      if (convex <= 1e-7) continue;
      if (order.some((candidate) => candidate !== previous && candidate !== current && candidate !== next
        && pointInTriangle(points[candidate], a, b, c))) continue;
      triangles.push(previous, current, next);
      order.splice(index, 1);
      clipped = true;
      break;
    }
    if (!clipped) break;
    attempts++;
  }

  if (order.length === 3) triangles.push(order[0], order[1], order[2]);
  if (triangles.length === (points.length - 2) * 3) return triangles;

  // A malformed/self-intersecting polygon still gets a visible fallback surface.
  return points.slice(1, -1).flatMap((_, index) => [0, index + 1, index + 2]);
}

function roomZoneVertexData(points: RoomZonePoint[], height: number): VertexData {
  const safeHeight = Math.max(0.01, height);
  const topOffset = points.length;
  const positions: number[] = [];
  const uvs: number[] = [];
  for (const y of [0, safeHeight]) {
    for (const point of points) {
      positions.push(point.x, y, point.z);
      uvs.push(point.x, point.z);
    }
  }

  const topTriangles = triangulateRoomZone(points);
  const indices: number[] = [];
  for (let index = 0; index < topTriangles.length; index += 3) {
    const a = topTriangles[index];
    const b = topTriangles[index + 1];
    const c = topTriangles[index + 2];
    indices.push(topOffset + a, topOffset + c, topOffset + b);
    indices.push(a, b, c);
  }
  for (let index = 0; index < points.length; index++) {
    const next = (index + 1) % points.length;
    indices.push(index, next, topOffset + next, index, topOffset + next, topOffset + index);
  }

  const normals: number[] = [];
  VertexData.ComputeNormals(positions, indices, normals);
  const data = new VertexData();
  data.positions = positions;
  data.indices = indices;
  data.normals = normals;
  data.uvs = uvs;
  return data;
}

export function createRoomZoneSurface(
  scene: Scene,
  name: string,
  points: RoomZonePoint[],
  height: number,
  updatable = false,
): Mesh {
  const mesh = new Mesh(name, scene);
  roomZoneVertexData(points, height).applyToMesh(mesh, updatable);
  return mesh;
}

export function updateRoomZoneSurface(mesh: Mesh, points: RoomZonePoint[], height: number): void {
  roomZoneVertexData(points, height).applyToMesh(mesh, true);
  mesh.refreshBoundingInfo();
}

export function roomZoneOutlinePoints(points: RoomZonePoint[], height: number): Vector3[] {
  const y = Math.max(0.01, height) + 0.003;
  return [...points, points[0]].map((point) => new Vector3(point.x, y, point.z));
}

export function createRoomZoneLabel(
  scene: Scene,
  id: string,
  text: string,
  points: RoomZonePoint[],
  surfacePosition: Vector3,
  parent?: TransformNode,
  visible = false,
): RoomZoneLabelEntry {
  const xs = points.map((point) => point.x);
  const zs = points.map((point) => point.z);
  const roomSpan = Math.max(
    0.1,
    Math.max(...xs) - Math.min(...xs),
    Math.max(...zs) - Math.min(...zs),
  );
  const labelWidth = Math.min(0.58, Math.max(0.22, roomSpan * 0.4));
  const labelHeight = labelWidth / 4;
  const labelText = text.trim() || 'Room';

  const labelTexture = new DynamicTexture(`room-label-texture-${id}`, { width: 512, height: 128 }, scene, true);
  labelTexture.hasAlpha = true;
  const context = labelTexture.getContext();
  context.clearRect(0, 0, 512, 128);
  let fontSize = 42;
  while (fontSize > 24) {
    context.font = `bold ${fontSize}px Arial`;
    if (context.measureText(labelText).width <= 440) break;
    fontSize -= 2;
  }
  labelTexture.drawText(
    labelText,
    null,
    64 + fontSize * 0.34,
    `bold ${fontSize}px Arial`,
    '#e8f7ff',
    'rgba(4, 15, 28, 0.86)',
    true,
    true,
  );

  const label = MeshBuilder.CreatePlane(`room-label-${id}`, { width: labelWidth, height: labelHeight }, scene);
  label.position.copyFrom(surfacePosition);
  label.position.y += labelHeight * 0.9;
  label.billboardMode = Mesh.BILLBOARDMODE_ALL;
  label.metadata = { roomId: id, roomLabel: true };
  label.isPickable = false;
  label.renderingGroupId = 2;
  if (parent) label.parent = parent;

  const labelMaterial = new StandardMaterial(`room-label-material-${id}`, scene);
  labelMaterial.diffuseTexture = labelTexture;
  labelMaterial.emissiveColor = Color3.White();
  labelMaterial.opacityTexture = labelTexture;
  labelMaterial.disableLighting = true;
  labelMaterial.disableDepthWrite = true;
  labelMaterial.backFaceCulling = false;
  label.material = labelMaterial;
  label.setEnabled(visible);

  return { label, labelMaterial, labelTexture };
}

export function setRoomZoneLabelVisibility(
  map: RoomZoneMeshMap,
  hoveredRoomId: string | null,
  selectedRoomId: string | null = null,
): void {
  for (const [roomId, entry] of Object.entries(map)) {
    entry.label.setEnabled(roomId === hoveredRoomId || roomId === selectedRoomId);
  }
}

export function disposeAllRoomZones(map: RoomZoneMeshMap): void {
  for (const roomId of Object.keys(map)) removeRoomZoneMesh(map, roomId);
}

export function createRoomZoneMesh(
  scene: Scene,
  room: RoomConfig,
  parent?: TransformNode,
  selected = false,
  overlapping = false,
): RoomZoneMeshEntry {
  const height = Math.max(0.01, room.zone.height ?? 0.025);
  const points = getRoomZonePoints(room.zone);
  const zone = createRoomZoneSurface(scene, `room-zone-${room.id}`, points, height);
  zone.position.set(room.anchor.x, room.anchor.y, room.anchor.z);
  zone.rotation.y = Tools.ToRadians(room.zone.rotationY ?? 0);
  zone.metadata = { roomId: room.id };
  zone.isPickable = true;
  if (parent) zone.parent = parent;

  const configuredColor = roomZoneColor3(resolveRoomZoneColor(room));
  const configuredOpacity = clampRoomZoneOpacity(room.zone.opacity);
  const zoneMaterial = new StandardMaterial(`room-zone-material-${room.id}`, scene);
  zoneMaterial.diffuseColor = overlapping ? new Color3(0.82, 0.12, 0.18) : configuredColor;
  zoneMaterial.emissiveColor = overlapping ? new Color3(0.48, 0.03, 0.06) : configuredColor.scale(0.45);
  zoneMaterial.alpha = overlapping ? 0.3 : selected
    ? Math.min(0.55, configuredOpacity + 0.1)
    : configuredOpacity;
  zoneMaterial.disableLighting = true;
  zoneMaterial.backFaceCulling = false;
  zone.material = zoneMaterial;
  const outline = MeshBuilder.CreateLines(`room-zone-outline-${room.id}`, {
    points: roomZoneOutlinePoints(points, height),
  }, scene);
  outline.color = overlapping
    ? new Color3(1, 0.24, 0.3)
    : Color3.Lerp(configuredColor, Color3.White(), selected ? 0.34 : 0.18);
  outline.alpha = overlapping || selected ? 1 : 0.7;
  outline.position.copyFrom(zone.position);
  outline.rotation.copyFrom(zone.rotation);
  outline.metadata = { roomId: room.id };
  outline.isPickable = false;
  if (parent) outline.parent = parent;

  const { label, labelMaterial, labelTexture } = createRoomZoneLabel(
    scene,
    room.id,
    room.name,
    points,
    new Vector3(room.anchor.x, room.anchor.y + height, room.anchor.z),
    parent,
    selected,
  );

  return { zone, outline, label, zoneMaterial, labelMaterial, labelTexture };
}

export function rebuildAllRoomZones(
  scene: Scene,
  map: RoomZoneMeshMap,
  rooms: RoomConfig[],
  parent?: TransformNode,
  selectedRoomId?: string | null,
  overlappingRoomIds: ReadonlySet<string> = new Set(),
): void {
  disposeAllRoomZones(map);
  for (const room of rooms) {
    map[room.id] = createRoomZoneMesh(
      scene,
      room,
      parent,
      room.id === selectedRoomId,
      overlappingRoomIds.has(room.id),
    );
  }
}
