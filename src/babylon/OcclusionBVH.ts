import { Matrix, Vector3, type AbstractMesh, type Mesh } from '@babylonjs/core';

/**
 * Bounding-volume hierarchy over a mesh's triangles in local space, for
 * "is anything in the way" ray queries (marker occlusion).
 *
 * Babylon's Ray.intersectsMesh tests every triangle of a sub-mesh. The batched
 * room meshes have tens of thousands, so a single marker check could take
 * >10 ms. The BVH answers the same any-hit question (double-sided, within the
 * segment) in a few dozen node visits. It lives in local space, so moving a
 * mesh (e.g. a door leaf) keeps it valid; only geometry changes need a rebuild.
 */
const LEAF_SIZE = 8;

export class TriangleBVH {
  /** Per node: minX, minY, minZ, maxX, maxY, maxZ. */
  private bounds: Float32Array;
  /** Per node: [left child | first triangle, right child | -count]; count < 0 marks a leaf. */
  private links: Int32Array;
  private nodeCount = 0;
  private order: Uint32Array;

  constructor(private positions: Float32Array | number[], private indices: Uint32Array | Int32Array | number[]) {
    const triangles = indices.length / 3;
    this.order = new Uint32Array(triangles);
    const centroids = new Float32Array(triangles * 3);
    for (let t = 0; t < triangles; t++) {
      this.order[t] = t;
      for (let k = 0; k < 3; k++) {
        centroids[t * 3 + k] = (positions[indices[t * 3] * 3 + k] + positions[indices[t * 3 + 1] * 3 + k] + positions[indices[t * 3 + 2] * 3 + k]) / 3;
      }
    }
    const estimate = Math.max(1, Math.ceil(triangles / LEAF_SIZE) * 2);
    this.bounds = new Float32Array(estimate * 6);
    this.links = new Int32Array(estimate * 2);
    this.build(0, triangles, centroids);
    this.bounds = this.bounds.slice(0, this.nodeCount * 6);
    this.links = this.links.slice(0, this.nodeCount * 2);
  }

  private build(start: number, end: number, centroids: Float32Array): number {
    const node = this.nodeCount++;
    if (node * 2 + 2 > this.links.length) {
      const bounds = new Float32Array(this.bounds.length * 2); bounds.set(this.bounds); this.bounds = bounds;
      const links = new Int32Array(this.links.length * 2); links.set(this.links); this.links = links;
    }
    const b = node * 6;
    let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    let cMinX = Infinity, cMinY = Infinity, cMinZ = Infinity, cMaxX = -Infinity, cMaxY = -Infinity, cMaxZ = -Infinity;
    for (let i = start; i < end; i++) {
      const t = this.order[i];
      for (let v = 0; v < 3; v++) {
        const p = this.indices[t * 3 + v] * 3;
        const x = this.positions[p], y = this.positions[p + 1], z = this.positions[p + 2];
        if (x < minX) minX = x; if (y < minY) minY = y; if (z < minZ) minZ = z;
        if (x > maxX) maxX = x; if (y > maxY) maxY = y; if (z > maxZ) maxZ = z;
      }
      const cx = centroids[t * 3], cy = centroids[t * 3 + 1], cz = centroids[t * 3 + 2];
      if (cx < cMinX) cMinX = cx; if (cy < cMinY) cMinY = cy; if (cz < cMinZ) cMinZ = cz;
      if (cx > cMaxX) cMaxX = cx; if (cy > cMaxY) cMaxY = cy; if (cz > cMaxZ) cMaxZ = cz;
    }
    this.bounds.set([minX, minY, minZ, maxX, maxY, maxZ], b);
    const count = end - start;
    const ex = cMaxX - cMinX, ey = cMaxY - cMinY, ez = cMaxZ - cMinZ;
    if (count <= LEAF_SIZE || Math.max(ex, ey, ez) <= 0) {
      this.links[node * 2] = start; this.links[node * 2 + 1] = -count;
      return node;
    }
    // Split at the centroid midpoint of the widest axis (in-place partition).
    const axis = ex >= ey && ex >= ez ? 0 : ey >= ez ? 1 : 2;
    const split = axis === 0 ? cMinX + ex / 2 : axis === 1 ? cMinY + ey / 2 : cMinZ + ez / 2;
    let mid = start;
    for (let i = start; i < end; i++) {
      const t = this.order[i];
      if (centroids[t * 3 + axis] < split) { this.order[i] = this.order[mid]; this.order[mid] = t; mid++; }
    }
    if (mid === start || mid === end) mid = (start + end) >> 1;
    const left = this.build(start, mid, centroids);
    const right = this.build(mid, end, centroids);
    this.links[node * 2] = left; this.links[node * 2 + 1] = right;
    return node;
  }

  /** True when the segment origin + dir * t, 0 < t <= 1, touches any triangle (both sides). */
  hitsSegment(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number): boolean {
    const ix = 1 / dx, iy = 1 / dy, iz = 1 / dz;
    let stack = TriangleBVH.stack;
    let top = 0;
    stack[top++] = 0;
    while (top) {
      const node = stack[--top], b = node * 6;
      // Slab test against the node box for t in [0, 1].
      let t1 = (this.bounds[b] - ox) * ix, t2 = (this.bounds[b + 3] - ox) * ix;
      let near = Math.min(t1, t2), far = Math.max(t1, t2);
      t1 = (this.bounds[b + 1] - oy) * iy; t2 = (this.bounds[b + 4] - oy) * iy;
      near = Math.max(near, Math.min(t1, t2)); far = Math.min(far, Math.max(t1, t2));
      t1 = (this.bounds[b + 2] - oz) * iz; t2 = (this.bounds[b + 5] - oz) * iz;
      near = Math.max(near, Math.min(t1, t2)); far = Math.min(far, Math.max(t1, t2));
      if (!(far >= Math.max(near, 0) && near <= 1)) continue;
      const a = this.links[node * 2], c = this.links[node * 2 + 1];
      if (c >= 0) {
        if (top + 2 > stack.length) stack = TriangleBVH.stack = TriangleBVH.grow(stack);
        stack[top++] = a; stack[top++] = c;
        continue;
      }
      for (let i = a, end = a - c; i < end; i++) if (this.triangle(this.order[i], ox, oy, oz, dx, dy, dz)) return true;
    }
    return false;
  }

  /** Möller–Trumbore, double-sided, accepting 0 < t <= 1. */
  private triangle(t: number, ox: number, oy: number, oz: number, dx: number, dy: number, dz: number): boolean {
    const p = this.positions, i0 = this.indices[t * 3] * 3, i1 = this.indices[t * 3 + 1] * 3, i2 = this.indices[t * 3 + 2] * 3;
    const ax = p[i0], ay = p[i0 + 1], az = p[i0 + 2];
    const e1x = p[i1] - ax, e1y = p[i1 + 1] - ay, e1z = p[i1 + 2] - az;
    const e2x = p[i2] - ax, e2y = p[i2 + 1] - ay, e2z = p[i2 + 2] - az;
    const px = dy * e2z - dz * e2y, py = dz * e2x - dx * e2z, pz = dx * e2y - dy * e2x;
    const det = e1x * px + e1y * py + e1z * pz;
    if (Math.abs(det) < 1e-12) return false;
    const inv = 1 / det;
    const sx = ox - ax, sy = oy - ay, sz = oz - az;
    const u = (sx * px + sy * py + sz * pz) * inv;
    if (u < 0 || u > 1) return false;
    const qx = sy * e1z - sz * e1y, qy = sz * e1x - sx * e1z, qz = sx * e1y - sy * e1x;
    const v = (dx * qx + dy * qy + dz * qz) * inv;
    if (v < 0 || u + v > 1) return false;
    const hit = (e2x * qx + e2y * qy + e2z * qz) * inv;
    return hit > 0 && hit <= 1;
  }

  private static stack = new Int32Array(128);
  private static grow(stack: Int32Array): Int32Array { const next = new Int32Array(stack.length * 2); next.set(stack); return next; }
}

const inverse = Matrix.Identity();
const from = Vector3.Zero(), to = Vector3.Zero();

/** BVH cache per geometry; meshes sharing geometry (instances, clones) share one tree. */
export class OcclusionBVHCache {
  private trees = new Map<string, TriangleBVH | null>();

  /** Minimum triangle count at which a tree beats Babylon's linear test. */
  constructor(private minTriangles = 256) {}

  private key(mesh: AbstractMesh): string | null {
    const source = (mesh as AbstractMesh & { sourceMesh?: AbstractMesh }).sourceMesh ?? mesh;
    const geometry = (source as AbstractMesh & { geometry?: { uniqueId: number } | null }).geometry;
    return geometry ? String(geometry.uniqueId) : null;
  }

  /** Tree for the mesh, built on demand; null when the linear test should be used instead. */
  get(mesh: AbstractMesh, build = true): TriangleBVH | null | undefined {
    const source = ((mesh as AbstractMesh & { sourceMesh?: Mesh }).sourceMesh ?? mesh) as Mesh;
    if (mesh.skeleton || mesh.morphTargetManager || source.getVertexBuffer?.('position')?.isUpdatable()) return null;
    const key = this.key(mesh);
    if (!key) return null;
    if (this.trees.has(key)) return this.trees.get(key);
    if (!build) return undefined;
    const positions = mesh.getVerticesData('position'), indices = mesh.getIndices();
    const tree = positions && indices && indices.length / 3 >= this.minTriangles
      ? new TriangleBVH(positions as Float32Array, indices as Uint32Array) : null;
    this.trees.set(key, tree);
    return tree;
  }

  /** Any-hit test of the world-space segment start → end against the mesh. */
  static segmentHits(tree: TriangleBVH, mesh: AbstractMesh, start: Vector3, end: Vector3): boolean {
    mesh.getWorldMatrix().invertToRef(inverse);
    Vector3.TransformCoordinatesToRef(start, inverse, from);
    Vector3.TransformCoordinatesToRef(end, inverse, to);
    return tree.hitsSegment(from.x, from.y, from.z, to.x - from.x, to.y - from.y, to.z - from.z);
  }
}
