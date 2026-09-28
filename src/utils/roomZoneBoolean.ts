import * as polygonClippingModule from 'polygon-clipping';
import type { MultiPolygon, Polygon } from 'polygon-clipping';
import { getRoomZoneWorldPoints } from '../babylon/RoomZoneMeshFactory';
import type { LightPosition, RoomConfig, RoomZonePoint } from '../types';

type PolygonClippingApi = {
  difference: (subject: Polygon, ...clips: Polygon[]) => MultiPolygon;
  intersection: (subject: Polygon, ...clips: Polygon[]) => MultiPolygon;
};

const polygonClipping = (
  (polygonClippingModule as unknown as { default?: PolygonClippingApi }).default
  ?? polygonClippingModule
) as PolygonClippingApi;

const EPSILON = 1e-7;

function samePoint(first: RoomZonePoint, second: RoomZonePoint): boolean {
  return Math.abs(first.x - second.x) <= EPSILON && Math.abs(first.z - second.z) <= EPSILON;
}

function cleanRing(ring: number[][]): RoomZonePoint[] {
  const points = ring.map(([x, z]) => ({ x, z }));
  if (points.length > 1 && samePoint(points[0], points[points.length - 1])) points.pop();
  const unique = points.filter((point, index) => index === 0 || !samePoint(point, points[index - 1]));
  if (unique.length < 4) return unique;
  return unique.filter((point, index) => {
    const previous = unique[(index - 1 + unique.length) % unique.length];
    const next = unique[(index + 1) % unique.length];
    const cross = (point.x - previous.x) * (next.z - point.z)
      - (point.z - previous.z) * (next.x - point.x);
    return Math.abs(cross) > EPSILON;
  });
}

function toPolygon(points: RoomZonePoint[]): Polygon {
  return [[...points.map((point) => [point.x, point.z] as [number, number]), [points[0].x, points[0].z]]];
}

function pointOnSegment(point: RoomZonePoint, start: RoomZonePoint, end: RoomZonePoint): boolean {
  const cross = (point.x - start.x) * (end.z - start.z) - (point.z - start.z) * (end.x - start.x);
  if (Math.abs(cross) > EPSILON) return false;
  const dot = (point.x - start.x) * (end.x - start.x) + (point.z - start.z) * (end.z - start.z);
  const lengthSquared = (end.x - start.x) ** 2 + (end.z - start.z) ** 2;
  return dot >= -EPSILON && dot <= lengthSquared + EPSILON;
}

function pointInRing(point: RoomZonePoint, ring: RoomZonePoint[]): boolean {
  let inside = false;
  for (let index = 0, previousIndex = ring.length - 1; index < ring.length; previousIndex = index++) {
    const current = ring[index];
    const previous = ring[previousIndex];
    if (pointOnSegment(point, previous, current)) return true;
    const crosses = (current.z > point.z) !== (previous.z > point.z)
      && point.x < ((previous.x - current.x) * (point.z - current.z))
        / (previous.z - current.z) + current.x;
    if (crosses) inside = !inside;
  }
  return inside;
}

function polygonArea(points: RoomZonePoint[]): number {
  let area = 0;
  for (let index = 0; index < points.length; index++) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    area += current.x * next.z - next.x * current.z;
  }
  return Math.abs(area / 2);
}

export function roomZonePointArea(points: RoomZonePoint[]): number {
  return polygonArea(points);
}

export function roomZonePointBounds(points: RoomZonePoint[]): { width: number; depth: number } {
  const xs = points.map((point) => point.x);
  const zs = points.map((point) => point.z);
  return {
    width: Math.max(0.1, Math.max(...xs) - Math.min(...xs)),
    depth: Math.max(0.1, Math.max(...zs) - Math.min(...zs)),
  };
}

export interface AvailableRoomZoneResult {
  points: RoomZonePoint[];
  removedOverlap: boolean;
  discardedParts: number;
}

/** Subtracts saved rooms and keeps the remaining component containing the detection click. */
export function keepAvailableDetectedRoomPart(
  detectedPoints: RoomZonePoint[],
  anchor: LightPosition,
  neighboringRooms: RoomConfig[],
): AvailableRoomZoneResult | null {
  if (detectedPoints.length < 3) return null;
  if (!neighboringRooms.length) {
    return { points: detectedPoints.map((point) => ({ ...point })), removedOverlap: false, discardedParts: 0 };
  }

  const subject = toPolygon(detectedPoints);
  const clips = neighboringRooms.map((room) => toPolygon(
    getRoomZoneWorldPoints(room).map((point) => ({
      x: point.x - anchor.x,
      z: point.z - anchor.z,
    })),
  ));
  let difference: MultiPolygon;
  try {
    difference = polygonClipping.difference(subject, ...clips);
  } catch (error) {
    console.warn('[Rooms] Could not subtract neighboring room zones:', error);
    return null;
  }
  const clickPoint = { x: 0, z: 0 };
  const candidates = difference
    .map((polygon) => ({
      outer: cleanRing(polygon[0]),
      holes: polygon.slice(1).map(cleanRing),
    }))
    .filter(({ outer, holes }) => outer.length >= 3
      && pointInRing(clickPoint, outer)
      && !holes.some((hole) => pointInRing(clickPoint, hole)))
    .sort((first, second) => polygonArea(second.outer) - polygonArea(first.outer));
  const selected = candidates[0];
  if (!selected || selected.holes.length || polygonArea(selected.outer) <= EPSILON) return null;

  const originalArea = polygonArea(detectedPoints);
  const remainingArea = difference.reduce((sum, polygon) => {
    const outerArea = polygonArea(cleanRing(polygon[0]));
    const holeArea = polygon.slice(1)
      .reduce((holeSum, ring) => holeSum + polygonArea(cleanRing(ring)), 0);
    return sum + Math.max(0, outerArea - holeArea);
  }, 0);
  const areaTolerance = Math.max(originalArea * 1e-7, EPSILON);

  return {
    points: selected.outer.map((point) => ({
      x: parseFloat(point.x.toFixed(3)),
      z: parseFloat(point.z.toFixed(3)),
    })),
    removedOverlap: remainingArea < originalArea - areaTolerance,
    discardedParts: Math.max(0, difference.length - 1),
  };
}

function halfPlanePolygon(
  centre: RoomZonePoint,
  direction: RoomZonePoint,
  normal: RoomZonePoint,
  extent: number,
): Polygon {
  const low = { x: centre.x - direction.x * extent, z: centre.z - direction.z * extent };
  const high = { x: centre.x + direction.x * extent, z: centre.z + direction.z * extent };
  return toPolygon([
    low,
    high,
    { x: high.x + normal.x * extent * 2, z: high.z + normal.z * extent * 2 },
    { x: low.x + normal.x * extent * 2, z: low.z + normal.z * extent * 2 },
  ]);
}

/** Splits a simple room polygon by the infinite line through start and end. */
export function splitRoomZoneByLine(
  points: RoomZonePoint[],
  start: RoomZonePoint,
  end: RoomZonePoint,
): RoomZonePoint[][] {
  const delta = { x: end.x - start.x, z: end.z - start.z };
  const length = Math.hypot(delta.x, delta.z);
  if (points.length < 3 || length <= 0.03) return [];
  const direction = { x: delta.x / length, z: delta.z / length };
  const normal = { x: -direction.z, z: direction.x };
  const centre = { x: (start.x + end.x) / 2, z: (start.z + end.z) / 2 };
  const bounds = roomZonePointBounds(points);
  const extent = Math.max(bounds.width, bounds.depth, length, 1) * 20;
  const subject = toPolygon(points);
  let halves: MultiPolygon;
  try {
    halves = [normal, { x: -normal.x, z: -normal.z }]
      .flatMap((sideNormal) => polygonClipping.intersection(
        subject,
        halfPlanePolygon(centre, direction, sideNormal, extent),
      ));
  } catch (error) {
    console.warn('[Rooms] Could not split room zone:', error);
    return [];
  }
  const minimumArea = Math.max(bounds.width * bounds.depth * 1e-6, EPSILON);
  return halves
    .map((polygon) => cleanRing(polygon[0]))
    .filter((piece) => piece.length >= 3 && polygonArea(piece) > minimumArea)
    .map((piece) => piece.map((point) => ({
      x: parseFloat(point.x.toFixed(3)),
      z: parseFloat(point.z.toFixed(3)),
    })));
}
