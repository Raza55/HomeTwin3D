/**
 * Startup phases for the `?perf` overlay, in seconds since navigation: model
 * loaded (GLB parsed), scene prepared (lights, batches, glow), first frame with
 * every shader compiled. Lets tablets report where their startup time goes.
 */
const marks: Record<string, number> = {};

export function markStartup(phase: 'model' | 'ready' | 'frame'): void {
  if (!(phase in marks)) marks[phase] = performance.now();
}

export function startupSummary(): string {
  const s = (phase: string) => (phase in marks ? `${(marks[phase] / 1000).toFixed(1)}s` : '–');
  return `start: model ${s('model')}  ready ${s('ready')}  frame ${s('frame')}`;
}

export function startupPhase(phase: 'model' | 'ready' | 'frame'): boolean { return phase in marks; }
