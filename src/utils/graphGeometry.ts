import type { HAHistoryPoint } from '../types';

export const GRAPH_DIMENSIONS = { padX: 40, padY: 20, w: 300, h: 120, graphH: 80 };

/** Keep every history sample; prepare the unchanged SVG path once per data update. */
export function computeGraphGeometry(points: HAHistoryPoint[]) {
  const numeric = points.map(p => ({ value: parseFloat(p.state), time: new Date(p.last_changed).getTime() }))
    .filter(p => !isNaN(p.value));
  let minVal = Infinity, maxVal = -Infinity, minTime = Infinity, maxTime = -Infinity;
  for (const point of numeric) {
    minVal = Math.min(minVal, point.value); maxVal = Math.max(maxVal, point.value);
    minTime = Math.min(minTime, point.time); maxTime = Math.max(maxTime, point.time);
  }
  const valRange = maxVal - minVal || 1, timeRange = maxTime - minTime || 1;
  const { padX, padY, w, graphH } = GRAPH_DIMENSIONS;
  const polylinePoints = numeric.map(p => {
    const x = padX + ((p.time - minTime) / timeRange) * (w - padX);
    const y = padY + graphH - ((p.value - minVal) / valRange) * graphH;
    return `${x},${y}`;
  }).join(' ');
  return { count: numeric.length, minVal, maxVal, polylinePoints };
}
