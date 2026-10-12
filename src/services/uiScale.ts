export function resolveUiScale(manual: number | undefined, touch: boolean, width: number, height: number): number {
  if (typeof manual === 'number' && Number.isFinite(manual)) return Math.min(1.8, Math.max(1, manual));
  // CSS pixels already account for pixel density. Multiplying by DPR again
  // would oversize Retina screens and desktop browsers at increased zoom.
  return touch ? (Math.min(width, height) >= 600 ? 1.4 : 1.3) : 1;
}

export function applyUiScale(manual?: number): number {
  const touch = navigator.maxTouchPoints > 0 || window.matchMedia('(any-pointer: coarse)').matches;
  const scale = resolveUiScale(manual, touch, window.innerWidth, window.innerHeight);
  const root = document.documentElement;
  root.style.setProperty('--ui-scale', String(scale));
  root.dataset.uiCompact = String(window.innerWidth < 900 * scale);
  return scale;
}

export function watchUiScale(apply: () => void): () => void {
  const pointer = window.matchMedia('(any-pointer: coarse)');
  window.addEventListener('resize', apply);
  pointer.addEventListener('change', apply);
  return () => {
    window.removeEventListener('resize', apply);
    pointer.removeEventListener('change', apply);
  };
}
