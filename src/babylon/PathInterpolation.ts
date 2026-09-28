import { Vector3 } from '@babylonjs/core';

/** Interpolate into existing particle storage without allocating a vector per frame. */
export function positionAtDistanceToRef(path: Vector3[], distances: number[], distance: number, result: Vector3): Vector3 {
  if (distance <= 0) return result.copyFrom(path[0]);
  if (distance >= distances[distances.length - 1]) return result.copyFrom(path[path.length - 1]);
  let lo = 0;
  let hi = distances.length - 1;
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1;
    if (distances[mid] <= distance) lo = mid;
    else hi = mid;
  }
  const length = distances[hi] - distances[lo];
  const t = length > 0 ? (distance - distances[lo]) / length : 0;
  return Vector3.LerpToRef(path[lo], path[hi], t, result);
}
