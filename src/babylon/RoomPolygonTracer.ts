import { Ray, Vector3, VertexBuffer, type AbstractMesh, type PickingInfo, type Scene } from '@babylonjs/core';
import type { RoomVirtualWall, RoomZonePoint } from '../types';

export interface RoomPolygonTraceResult {
  points: RoomZonePoint[];
  width: number;
  depth: number;
  floorY: number;
  confidence: number;
  usedFallback: boolean;
}

interface TraceOptions {
  modelDiagonal: number;
  modelScale: number;
  fallbackWidth: number;
  fallbackDepth: number;
  rayCount?: number;
  /** Virtual wall segments in world-space X/Z coordinates. */
  virtualWalls?: RoomVirtualWall[];
}

interface Point2 {
  x: number;
  z: number;
}

interface ModelBounds {
  min: Vector3;
  max: Vector3;
}

interface FloorCandidate {
  y: number;
  surfaceBonus: number;
  mesh: AbstractMesh | null;
}

interface FloorSurface {
  y: number;
  mesh: AbstractMesh | null;
}

interface BoundaryEdge {
  a: string;
  b: string;
}

interface WallHit {
  distance: number;
  heightIndex: number;
  wallLike: boolean;
}

interface DistanceCluster {
  distanceSum: number;
  count: number;
  heightIndexes: Set<number>;
  wallHeightIndexes: Set<number>;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function distanceToSegment(point: Point2, start: Point2, end: Point2): number {
  const dx = end.x - start.x;
  const dz = end.z - start.z;
  const lengthSquared = dx * dx + dz * dz;
  if (lengthSquared <= 1e-10) return Math.hypot(point.x - start.x, point.z - start.z);
  const t = clamp(((point.x - start.x) * dx + (point.z - start.z) * dz) / lengthSquared, 0, 1);
  return Math.hypot(point.x - (start.x + t * dx), point.z - (start.z + t * dz));
}

function cross2(a: Point2, b: Point2): number {
  return a.x * b.z - a.z * b.x;
}

function raySegmentDistance(
  origin: Point2,
  direction: Point2,
  start: Point2,
  end: Point2,
  minimumDistance = 0,
): number | null {
  const segment = { x: end.x - start.x, z: end.z - start.z };
  const denominator = cross2(direction, segment);
  if (Math.abs(denominator) <= 1e-9) return null;
  const offset = { x: start.x - origin.x, z: start.z - origin.z };
  const distance = cross2(offset, segment) / denominator;
  const segmentRatio = cross2(offset, direction) / denominator;
  if (distance < minimumDistance || segmentRatio < -1e-6 || segmentRatio > 1 + 1e-6) return null;
  return distance;
}

function closestSegmentDistance(
  origin: Point2,
  direction: Point2,
  segments: RoomVirtualWall[],
  minimumDistance = 0,
): number | null {
  let closest: number | null = null;
  for (const segment of segments) {
    const distance = raySegmentDistance(origin, direction, segment.start, segment.end, minimumDistance);
    if (distance !== null && (closest === null || distance < closest)) closest = distance;
  }
  return closest;
}

function polygonRayDistance(origin: Point2, direction: Point2, polygon: Point2[]): number | null {
  let closest: number | null = null;
  for (let index = 0; index < polygon.length; index++) {
    const distance = raySegmentDistance(origin, direction, polygon[index], polygon[(index + 1) % polygon.length]);
    if (distance !== null && (closest === null || distance < closest)) closest = distance;
  }
  return closest;
}

function applyVirtualWallsToFloorBoundary(
  boundary: Point2[],
  origin: Point2,
  virtualWalls: RoomVirtualWall[],
  diagonal: number,
): Point2[] | null {
  const usableWalls = virtualWalls.filter((wall) =>
    Math.hypot(wall.end.x - wall.start.x, wall.end.z - wall.start.z) >= diagonal * 0.002);
  if (!usableWalls.length) return boundary;

  const angles = new Set<number>();
  const addAngle = (angle: number) => {
    const normalized = (angle + Math.PI * 2) % (Math.PI * 2);
    angles.add(parseFloat(normalized.toFixed(7)));
  };
  for (let index = 0; index < 96; index++) addAngle((index / 96) * Math.PI * 2);
  for (const point of [...boundary, ...usableWalls.flatMap((wall) => [wall.start, wall.end])]) {
    const angle = Math.atan2(point.z - origin.z, point.x - origin.x);
    addAngle(angle - 0.00001);
    addAngle(angle);
    addAngle(angle + 0.00001);
  }

  const inset = diagonal * 0.0008;
  const sampled = [...angles]
    .sort((a, b) => a - b)
    .map((angle) => {
      const direction = { x: Math.cos(angle), z: Math.sin(angle) };
      const floorDistance = polygonRayDistance(origin, direction, boundary);
      if (floorDistance === null) return null;
      const wallDistance = closestSegmentDistance(origin, direction, usableWalls, diagonal * 0.001);
      const distance = Math.max(0, Math.min(floorDistance, wallDistance ?? floorDistance) - inset);
      return {
        x: origin.x + direction.x * distance,
        z: origin.z + direction.z * distance,
      };
    })
    .filter((point): point is Point2 => point !== null);
  if (sampled.length < 3) return null;

  let tolerance = diagonal * 0.0015;
  let simplified = simplifyClosed(sampled, tolerance);
  while (simplified.length > 20) {
    tolerance *= 1.35;
    simplified = simplifyClosed(sampled, tolerance);
  }
  return simplified.length >= 3 ? simplified : null;
}

function simplifyOpen(points: Point2[], tolerance: number): Point2[] {
  if (points.length <= 2) return points;
  let furthestIndex = -1;
  let furthestDistance = tolerance;
  for (let index = 1; index < points.length - 1; index++) {
    const distance = distanceToSegment(points[index], points[0], points[points.length - 1]);
    if (distance > furthestDistance) {
      furthestDistance = distance;
      furthestIndex = index;
    }
  }
  if (furthestIndex === -1) return [points[0], points[points.length - 1]];
  const before = simplifyOpen(points.slice(0, furthestIndex + 1), tolerance);
  const after = simplifyOpen(points.slice(furthestIndex), tolerance);
  return [...before.slice(0, -1), ...after];
}

function circularPath(points: Point2[], start: number, end: number): Point2[] {
  const path: Point2[] = [];
  let index = start;
  while (true) {
    path.push(points[index]);
    if (index === end) return path;
    index = (index + 1) % points.length;
  }
}

function simplifyClosed(points: Point2[], tolerance: number): Point2[] {
  if (points.length <= 4) return points;
  let first = 0;
  let second = Math.floor(points.length / 2);
  let largestDistance = -1;
  for (let a = 0; a < points.length; a++) {
    for (let b = a + 1; b < points.length; b++) {
      const distance = (points[a].x - points[b].x) ** 2 + (points[a].z - points[b].z) ** 2;
      if (distance > largestDistance) {
        largestDistance = distance;
        first = a;
        second = b;
      }
    }
  }
  const pathA = simplifyOpen(circularPath(points, first, second), tolerance);
  const pathB = simplifyOpen(circularPath(points, second, first), tolerance);
  return [...pathA.slice(0, -1), ...pathB.slice(0, -1)];
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function fillMissingDistances(distances: Array<number | null>): number[] | null {
  const validCount = distances.filter((value): value is number => value !== null).length;
  if (validCount < distances.length * 0.32) return null;
  const result = [...distances];
  for (let index = 0; index < result.length; index++) {
    if (result[index] !== null) continue;
    let previous = index;
    let next = index;
    for (let step = 1; step < result.length; step++) {
      const candidate = (index - step + result.length) % result.length;
      if (result[candidate] !== null) { previous = candidate; break; }
    }
    for (let step = 1; step < result.length; step++) {
      const candidate = (index + step) % result.length;
      if (result[candidate] !== null) { next = candidate; break; }
    }
    const previousDistance = result[previous] as number;
    const nextDistance = result[next] as number;
    const span = (next - previous + result.length) % result.length || result.length;
    const offset = (index - previous + result.length) % result.length;
    result[index] = previousDistance + (nextDistance - previousDistance) * (offset / span);
  }
  return result as number[];
}

function smoothDistances(distances: number[]): number[] {
  return distances.map((_, index) => median([
    distances[(index - 2 + distances.length) % distances.length],
    distances[(index - 1 + distances.length) % distances.length],
    distances[index],
    distances[(index + 1) % distances.length],
    distances[(index + 2) % distances.length],
  ]));
}

function roundPoint(point: Point2): RoomZonePoint {
  return {
    x: parseFloat(point.x.toFixed(3)),
    z: parseFloat(point.z.toFixed(3)),
  };
}

function dimensions(points: RoomZonePoint[]): { width: number; depth: number } {
  const xs = points.map((point) => point.x);
  const zs = points.map((point) => point.z);
  return {
    width: Math.max(0.1, Math.max(...xs) - Math.min(...xs)),
    depth: Math.max(0.1, Math.max(...zs) - Math.min(...zs)),
  };
}

function fallbackResult(
  width: number,
  depth: number,
  floorY: number,
  origin: Point2,
  scale: number,
  virtualWalls: RoomVirtualWall[],
  diagonal: number,
): RoomPolygonTraceResult {
  const localPoints = [
    { x: -width / 2, z: -depth / 2 },
    { x: width / 2, z: -depth / 2 },
    { x: width / 2, z: depth / 2 },
    { x: -width / 2, z: depth / 2 },
  ];
  const worldBoundary = localPoints.map((point) => ({
    x: origin.x + point.x * scale,
    z: origin.z + point.z * scale,
  }));
  const constrained = applyVirtualWallsToFloorBoundary(worldBoundary, origin, virtualWalls, diagonal);
  const points = (constrained ?? worldBoundary).map((point) => roundPoint({
    x: (point.x - origin.x) / scale,
    z: (point.z - origin.z) / scale,
  }));
  const size = dimensions(points);
  return { points, width: size.width, depth: size.depth, floorY, confidence: 0, usedFallback: true };
}

function modelBounds(meshes: AbstractMesh[]): ModelBounds {
  let min = new Vector3(Infinity, Infinity, Infinity);
  let max = new Vector3(-Infinity, -Infinity, -Infinity);
  for (const mesh of meshes) {
    try {
      const box = mesh.getBoundingInfo().boundingBox;
      min = Vector3.Minimize(min, box.minimumWorld);
      max = Vector3.Maximize(max, box.maximumWorld);
    } catch {
      // Imported helper meshes may not expose stable bounds.
    }
  }
  if (!Number.isFinite(min.x) || !Number.isFinite(max.x)) {
    return { min: Vector3.Zero(), max: Vector3.Zero() };
  }
  return { min, max };
}

function pickNormalY(pick: PickingInfo): number | null {
  try {
    const normal = pick.getNormal(true, true);
    return normal ? Math.abs(normal.y) : null;
  } catch {
    return null;
  }
}

function meshName(mesh: AbstractMesh): string {
  const metadata = mesh.metadata as Record<string, unknown> | null;
  return `${mesh.name} ${String(metadata?.modelObjectLabel ?? '')}`.toLowerCase();
}

function horizontalFootprintBonus(mesh: AbstractMesh, diagonal: number): number {
  try {
    const box = mesh.getBoundingInfo().boundingBox;
    const size = box.maximumWorld.subtract(box.minimumWorld);
    const longSide = Math.max(size.x, size.z);
    const shortSide = Math.min(size.x, size.z);
    const name = meshName(mesh);
    if (/floor|ground|boden|decke|ceiling/.test(name)) return 0.3;
    if (longSide >= diagonal * 0.16 && shortSide >= diagonal * 0.07) return 0.2;
    if (longSide >= diagonal * 0.1 && shortSide >= diagonal * 0.035) return 0.1;
  } catch {
    // No footprint bonus when imported bounds cannot be read.
  }
  return 0;
}

function likelyWallMesh(mesh: AbstractMesh, floorY: number, wallHeight: number, diagonal: number): boolean {
  const name = meshName(mesh);
  if (/wall|wand|mur|cloison/.test(name)) return true;
  if (/chair|stuhl|table|tisch|bed|bett|sofa|couch|cabinet|schrank|shelf|regal/.test(name)) return false;
  try {
    const box = mesh.getBoundingInfo().boundingBox;
    const size = box.maximumWorld.subtract(box.minimumWorld);
    const horizontalLong = Math.max(size.x, size.z);
    const horizontalShort = Math.min(size.x, size.z);
    const reachesUpperWall = box.maximumWorld.y >= floorY + wallHeight * 0.68;
    const isTall = size.y >= wallHeight * 0.52;
    const isThin = horizontalShort <= Math.max(diagonal * 0.018, horizontalLong * 0.22);
    return reachesUpperWall && isTall && isThin && horizontalLong >= diagonal * 0.025;
  } catch {
    return false;
  }
}

function modelPicks(scene: Scene, ray: Ray, modelMeshSet: Set<AbstractMesh>): PickingInfo[] {
  return (scene.multiPickWithRay(
    ray,
    (mesh) => modelMeshSet.has(mesh) && mesh.isEnabled() && mesh.isVisible,
  ) ?? []).filter((pick) => pick.hit && Boolean(pick.pickedPoint));
}

function mergeFloorCandidate(candidates: FloorCandidate[], candidate: FloorCandidate, tolerance: number): void {
  const existing = candidates.find((entry) => Math.abs(entry.y - candidate.y) <= tolerance);
  if (existing) {
    existing.y = (existing.y + candidate.y) / 2;
    if (candidate.surfaceBonus >= existing.surfaceBonus && candidate.mesh) {
      existing.mesh = candidate.mesh;
    }
    existing.surfaceBonus = Math.max(existing.surfaceBonus, candidate.surfaceBonus);
    return;
  }
  candidates.push(candidate);
}

function floorSurfaceSupport(
  scene: Scene,
  x: number,
  z: number,
  candidateY: number,
  modelMeshSet: Set<AbstractMesh>,
  diagonal: number,
): number {
  const offsets: Point2[] = [{ x: 0, z: 0 }];
  for (const radius of [diagonal * 0.012, diagonal * 0.028]) {
    for (let index = 0; index < 8; index++) {
      const angle = (index / 8) * Math.PI * 2;
      offsets.push({ x: Math.cos(angle) * radius, z: Math.sin(angle) * radius });
    }
  }
  const tolerance = diagonal * 0.004;
  let supported = 0;
  for (const offset of offsets) {
    const ray = new Ray(
      new Vector3(x + offset.x, candidateY + diagonal * 0.018, z + offset.z),
      Vector3.Down(),
      diagonal * 0.045,
    );
    const hasSurface = modelPicks(scene, ray, modelMeshSet).some((pick) => {
      const point = pick.pickedPoint;
      const normalY = pickNormalY(pick);
      return Boolean(point) && Math.abs(point!.y - candidateY) <= tolerance && (normalY === null || normalY >= 0.68);
    });
    if (hasSurface) supported++;
  }
  return supported / offsets.length;
}

function findFloorSurface(
  scene: Scene,
  clickedPoint: Vector3,
  modelMeshes: AbstractMesh[],
  modelMeshSet: Set<AbstractMesh>,
  diagonal: number,
): FloorSurface {
  const bounds = modelBounds(modelMeshes);
  const verticalSpan = Math.max(diagonal * 0.03, bounds.max.y - bounds.min.y);
  const maxDrop = clamp(verticalSpan * 0.65, diagonal * 0.035, diagonal * 0.14);
  const tolerance = diagonal * 0.003;
  const candidates: FloorCandidate[] = [{ y: clickedPoint.y, surfaceBonus: 0, mesh: null }];
  const ray = new Ray(
    new Vector3(clickedPoint.x, bounds.max.y + diagonal * 0.02, clickedPoint.z),
    Vector3.Down(),
    verticalSpan + diagonal * 0.08,
  );

  for (const pick of modelPicks(scene, ray, modelMeshSet)) {
    const point = pick.pickedPoint;
    const mesh = pick.pickedMesh;
    const normalY = pickNormalY(pick);
    if (!point || !mesh || (normalY !== null && normalY < 0.68)) continue;
    if (point.y > clickedPoint.y + tolerance || point.y < clickedPoint.y - maxDrop) continue;
    mergeFloorCandidate(candidates, {
      y: point.y,
      surfaceBonus: horizontalFootprintBonus(mesh, diagonal),
      mesh,
    }, tolerance);
  }

  let bestY = clickedPoint.y;
  let bestMesh: AbstractMesh | null = null;
  let bestScore = -Infinity;
  for (const candidate of candidates) {
    const support = floorSurfaceSupport(
      scene,
      clickedPoint.x,
      clickedPoint.z,
      candidate.y,
      modelMeshSet,
      diagonal,
    );
    const dropPenalty = Math.abs(clickedPoint.y - candidate.y) / Math.max(maxDrop, 1e-6) * 0.08;
    const score = support + candidate.surfaceBonus - dropPenalty;
    if (score > bestScore) {
      bestScore = score;
      bestY = candidate.y;
      bestMesh = candidate.mesh;
    }
  }
  return { y: bestY, mesh: bestMesh };
}

function vertexKey(point: Point2, precision: number): string {
  return `${Math.round(point.x / precision)}:${Math.round(point.z / precision)}`;
}

function edgeKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function polygonArea(points: Point2[]): number {
  let area = 0;
  for (let index = 0; index < points.length; index++) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    area += current.x * next.z - next.x * current.z;
  }
  return area / 2;
}

function pointInPolygon(point: Point2, polygon: Point2[]): boolean {
  let inside = false;
  for (let current = 0, previous = polygon.length - 1; current < polygon.length; previous = current++) {
    const a = polygon[current];
    const b = polygon[previous];
    const crosses = (a.z > point.z) !== (b.z > point.z)
      && point.x < ((b.x - a.x) * (point.z - a.z)) / (b.z - a.z) + a.x;
    if (crosses) inside = !inside;
  }
  return inside;
}

function boundaryLoops(
  edges: BoundaryEdge[],
  pointsByKey: Map<string, Point2>,
): Point2[][] {
  const adjacency = new Map<string, Set<string>>();
  const unused = new Set<string>();
  for (const edge of edges) {
    if (!adjacency.has(edge.a)) adjacency.set(edge.a, new Set());
    if (!adjacency.has(edge.b)) adjacency.set(edge.b, new Set());
    adjacency.get(edge.a)!.add(edge.b);
    adjacency.get(edge.b)!.add(edge.a);
    unused.add(edgeKey(edge.a, edge.b));
  }

  const loops: Point2[][] = [];
  for (const edge of edges) {
    const firstEdgeKey = edgeKey(edge.a, edge.b);
    if (!unused.has(firstEdgeKey)) continue;
    unused.delete(firstEdgeKey);
    const loopKeys = [edge.a];
    let previous = edge.a;
    let current = edge.b;
    let closed = false;

    for (let guard = 0; guard <= edges.length; guard++) {
      if (current === loopKeys[0]) {
        closed = true;
        break;
      }
      loopKeys.push(current);
      const next = [...(adjacency.get(current) ?? [])].find((candidate) =>
        candidate !== previous && unused.has(edgeKey(current, candidate)));
      if (!next) break;
      unused.delete(edgeKey(current, next));
      previous = current;
      current = next;
    }

    if (!closed || loopKeys.length < 3) continue;
    const loop = loopKeys
      .map((key) => pointsByKey.get(key))
      .filter((point): point is Point2 => Boolean(point));
    if (loop.length >= 3) loops.push(loop);
  }
  return loops;
}

function traceFloorMeshBoundary(
  mesh: AbstractMesh,
  clickedPoint: Vector3,
  floorY: number,
  diagonal: number,
  scale: number,
  virtualWalls: RoomVirtualWall[],
): RoomPolygonTraceResult | null {
  const positions = mesh.getVerticesData(VertexBuffer.PositionKind);
  const indices = mesh.getIndices();
  if (!positions || !indices || indices.length < 3) return null;

  const worldMatrix = mesh.computeWorldMatrix(true);
  const heightTolerance = diagonal * 0.004;
  const keyPrecision = diagonal * 0.00025;
  const edgeRecords = new Map<string, { count: number; edge: BoundaryEdge }>();
  const pointsByKey = new Map<string, Point2>();

  const worldVertex = (index: number) => Vector3.TransformCoordinates(
    new Vector3(positions[index * 3], positions[index * 3 + 1], positions[index * 3 + 2]),
    worldMatrix,
  );
  const addEdge = (start: Vector3, end: Vector3) => {
    const start2 = { x: start.x, z: start.z };
    const end2 = { x: end.x, z: end.z };
    const a = vertexKey(start2, keyPrecision);
    const b = vertexKey(end2, keyPrecision);
    if (a === b) return;
    pointsByKey.set(a, start2);
    pointsByKey.set(b, end2);
    const key = edgeKey(a, b);
    const existing = edgeRecords.get(key);
    if (existing) existing.count++;
    else edgeRecords.set(key, { count: 1, edge: { a, b } });
  };

  for (let offset = 0; offset + 2 < indices.length; offset += 3) {
    const a = worldVertex(Number(indices[offset]));
    const b = worldVertex(Number(indices[offset + 1]));
    const c = worldVertex(Number(indices[offset + 2]));
    const minimumY = Math.min(a.y, b.y, c.y);
    const maximumY = Math.max(a.y, b.y, c.y);
    if (maximumY - minimumY > heightTolerance || Math.abs((minimumY + maximumY) / 2 - floorY) > heightTolerance) continue;
    const normal = Vector3.Cross(b.subtract(a), c.subtract(a));
    if (normal.lengthSquared() <= 1e-12 || Math.abs(normal.normalize().y) < 0.82) continue;
    addEdge(a, b);
    addEdge(b, c);
    addEdge(c, a);
  }

  const edges = [...edgeRecords.values()]
    .filter((record) => record.count === 1)
    .map((record) => record.edge);
  if (edges.length < 3) return null;

  const clicked2 = { x: clickedPoint.x, z: clickedPoint.z };
  const containingLoops = boundaryLoops(edges, pointsByKey)
    .filter((loop) => pointInPolygon(clicked2, loop)
      || loop.some((point, index) => distanceToSegment(clicked2, point, loop[(index + 1) % loop.length]) <= heightTolerance))
    .sort((a, b) => Math.abs(polygonArea(a)) - Math.abs(polygonArea(b)));
  if (!containingLoops.length) return null;

  let worldPoints = applyVirtualWallsToFloorBoundary(
    containingLoops[0],
    clicked2,
    virtualWalls,
    diagonal,
  );
  if (!worldPoints) return null;
  let tolerance = diagonal * 0.0015;
  worldPoints = simplifyClosed(worldPoints, tolerance);
  while (worldPoints.length > 16) {
    tolerance *= 1.35;
    worldPoints = simplifyClosed(worldPoints, tolerance);
  }
  if (worldPoints.length < 3) return null;

  const worldXs = worldPoints.map((point) => point.x);
  const worldZs = worldPoints.map((point) => point.z);
  const worldWidth = Math.max(...worldXs) - Math.min(...worldXs);
  const worldDepth = Math.max(...worldZs) - Math.min(...worldZs);
  if (worldWidth > diagonal * 0.72 || worldDepth > diagonal * 0.72) return null;

  const points = worldPoints.map((point) => roundPoint({
    x: (point.x - clickedPoint.x) / scale,
    z: (point.z - clickedPoint.z) / scale,
  }));
  const size = dimensions(points);
  if (size.width < 0.15 || size.depth < 0.15) return null;
  return {
    points,
    width: size.width,
    depth: size.depth,
    floorY,
    confidence: 1,
    usedFallback: false,
  };
}

function clusterWallHits(hits: WallHit[], tolerance: number): DistanceCluster[] {
  const clusters: DistanceCluster[] = [];
  for (const hit of [...hits].sort((a, b) => a.distance - b.distance)) {
    const cluster = clusters.find((candidate) =>
      Math.abs(candidate.distanceSum / candidate.count - hit.distance) <= tolerance);
    if (cluster) {
      cluster.distanceSum += hit.distance;
      cluster.count++;
      cluster.heightIndexes.add(hit.heightIndex);
      if (hit.wallLike) cluster.wallHeightIndexes.add(hit.heightIndex);
    } else {
      clusters.push({
        distanceSum: hit.distance,
        count: 1,
        heightIndexes: new Set([hit.heightIndex]),
        wallHeightIndexes: new Set(hit.wallLike ? [hit.heightIndex] : []),
      });
    }
  }
  return clusters;
}

function wallDistance(
  scene: Scene,
  origin: Vector3,
  direction: Vector3,
  probeHeights: number[],
  modelMeshSet: Set<AbstractMesh>,
  wallHeight: number,
  diagonal: number,
  minimumDistance: number,
  maxDistance: number,
): number | null {
  const hits: WallHit[] = [];
  probeHeights.forEach((height, heightIndex) => {
    const ray = new Ray(new Vector3(origin.x, origin.y + height, origin.z), direction, maxDistance);
    for (const pick of modelPicks(scene, ray, modelMeshSet)) {
      if (!pick.pickedMesh || pick.distance <= minimumDistance || pick.distance > maxDistance) continue;
      const normalY = pickNormalY(pick);
      if (normalY !== null && normalY > 0.58) continue;
      hits.push({
        distance: pick.distance,
        heightIndex,
        wallLike: likelyWallMesh(pick.pickedMesh, origin.y, wallHeight, diagonal),
      });
    }
  });
  if (!hits.length) return null;

  const clusters = clusterWallHits(hits, diagonal * 0.012);
  const minimumSupport = Math.max(2, Math.ceil(probeHeights.length * 0.6));
  const wallClusters = clusters.filter((cluster) => cluster.wallHeightIndexes.size >= minimumSupport);
  if (wallClusters.length) {
    return Math.min(...wallClusters.map((cluster) => cluster.distanceSum / cluster.count));
  }

  const consistent = clusters.filter((cluster) => cluster.heightIndexes.size >= minimumSupport);
  if (!consistent.length) return null;
  const bestSupport = Math.max(...consistent.map((cluster) => cluster.heightIndexes.size));
  return Math.min(...consistent
    .filter((cluster) => cluster.heightIndexes.size >= bestSupport - 1)
    .map((cluster) => cluster.distanceSum / cluster.count));
}

/**
 * Projects the click onto a broad horizontal floor and then approximates the room
 * boundary with horizontal rays. Wall candidates must be vertically consistent at
 * several heights, which filters most furniture before the contour is simplified.
 */
export function traceRoomPolygon(
  scene: Scene,
  floorPoint: Vector3,
  modelMeshes: AbstractMesh[],
  options: TraceOptions,
): RoomPolygonTraceResult {
  const diagonal = Math.max(0.1, options.modelDiagonal);
  const scale = Math.max(0.001, options.modelScale);
  const rayCount = Math.max(32, options.rayCount ?? 72);
  const maxDistance = diagonal * 0.42;
  const minimumDistance = diagonal * 0.006;
  const inset = diagonal * 0.0025;
  const modelMeshSet = new Set(modelMeshes);
  const floorSurface = findFloorSurface(scene, floorPoint, modelMeshes, modelMeshSet, diagonal);
  const floorY = floorSurface.y;
  const floorBoundary = floorSurface.mesh
    ? traceFloorMeshBoundary(
      floorSurface.mesh,
      floorPoint,
      floorY,
      diagonal,
      scale,
      options.virtualWalls ?? [],
    )
    : null;
  if (floorBoundary) return floorBoundary;
  const bounds = modelBounds(modelMeshes);
  const wallHeight = clamp(bounds.max.y - floorY, diagonal * 0.06, diagonal * 0.24);
  const probeHeights = [0.3, 0.44, 0.58, 0.72, 0.86].map((ratio) =>
    clamp(wallHeight * ratio, diagonal * 0.018, diagonal * 0.22));
  const rayOrigin = new Vector3(floorPoint.x, floorY, floorPoint.z);
  const rawDistances: Array<number | null> = [];

  for (let index = 0; index < rayCount; index++) {
    const angle = (index / rayCount) * Math.PI * 2;
    const direction = new Vector3(Math.cos(angle), 0, Math.sin(angle));
    rawDistances.push(wallDistance(
      scene,
      rayOrigin,
      direction,
      probeHeights,
      modelMeshSet,
      wallHeight,
      diagonal,
      minimumDistance,
      maxDistance,
    ));
  }

  const validCount = rawDistances.filter((value) => value !== null).length;
  const filled = fillMissingDistances(rawDistances);
  if (!filled) return fallbackResult(
    options.fallbackWidth,
    options.fallbackDepth,
    floorY,
    { x: rayOrigin.x, z: rayOrigin.z },
    scale,
    options.virtualWalls ?? [],
    diagonal,
  );
  const smoothed = smoothDistances(filled);
  let worldPoints: Point2[] = smoothed.map((distance, index) => {
    const angle = (index / rayCount) * Math.PI * 2;
    const virtualDistance = closestSegmentDistance(
      { x: rayOrigin.x, z: rayOrigin.z },
      { x: Math.cos(angle), z: Math.sin(angle) },
      options.virtualWalls ?? [],
      minimumDistance,
    );
    const safeDistance = Math.max(minimumDistance, Math.min(distance, virtualDistance ?? distance) - inset);
    return {
      x: Math.cos(angle) * safeDistance,
      z: Math.sin(angle) * safeDistance,
    };
  });

  let tolerance = diagonal * 0.004;
  worldPoints = simplifyClosed(worldPoints, tolerance);
  while (worldPoints.length > 16) {
    tolerance *= 1.35;
    worldPoints = simplifyClosed(worldPoints, tolerance);
  }
  if (worldPoints.length < 3) return fallbackResult(
    options.fallbackWidth,
    options.fallbackDepth,
    floorY,
    { x: rayOrigin.x, z: rayOrigin.z },
    scale,
    options.virtualWalls ?? [],
    diagonal,
  );

  const points = worldPoints.map((point) => roundPoint({ x: point.x / scale, z: point.z / scale }));
  const size = dimensions(points);
  if (size.width < 0.15 || size.depth < 0.15) {
    return fallbackResult(
      options.fallbackWidth,
      options.fallbackDepth,
      floorY,
      { x: rayOrigin.x, z: rayOrigin.z },
      scale,
      options.virtualWalls ?? [],
      diagonal,
    );
  }
  return {
    points,
    width: size.width,
    depth: size.depth,
    floorY,
    confidence: validCount / rayCount,
    usedFallback: false,
  };
}
