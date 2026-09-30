/**
 * Tablets and phones get the lighter rendering tier (fewer lamps per surface,
 * no clustered lighting, capped pixel ratio and textures): they are GPU- and
 * memory-bound. An iPad with a keyboard/trackpad case reports a fine primary
 * pointer, so touch capability decides, not `(pointer: coarse)`. Camera input
 * handling still follows the pointer type. `?device=tablet|desktop` overrides.
 */
export function isTabletClass(): boolean {
  if (typeof window === 'undefined') return false;
  const requested = new URLSearchParams(window.location.search).get('device');
  if (requested === 'tablet') return true;
  if (requested === 'desktop') return false;
  return (window.matchMedia?.('(any-pointer: coarse)').matches ?? false) || (navigator.maxTouchPoints ?? 0) > 1;
}

/**
 * Tablet tier effects: sun shadows with single-tap (hardware-filtered) PCF and
 * a quarter-resolution glow with a smaller blur. Both are per-pixel costs of
 * every frame on a GPU-bound tablet. `?fx=full` keeps full quality there.
 */
export function reducedEffects(): boolean {
  if (typeof window === 'undefined') return false;
  return isTabletClass() && new URLSearchParams(window.location.search).get('fx') !== 'full';
}

/**
 * Map marker size factor: tablets are used at arm's length and tapped with a
 * finger, so markers grow with the screen (short side / 760 CSS px, at most
 * 1.4; an iPad Pro in landscape gets ~1.35). Desktops keep 1. `?iconscale=`
 * overrides (0.5-2).
 */
export function markerSizeScale(): number {
  if (typeof window === 'undefined') return 1;
  const requested = Number(new URLSearchParams(window.location.search).get('iconscale'));
  if (requested >= 0.5 && requested <= 2) return requested;
  if (!isTabletClass()) return 1;
  return Math.min(1.4, Math.max(1, Math.min(window.innerWidth, window.innerHeight) / 760));
}
