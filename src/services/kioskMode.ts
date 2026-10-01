/**
 * Kiosk mode: the app runs as a wall/tablet display, e.g. added to the iPad
 * home screen. iOS then draws its status bar (with the time) over the page
 * (`black-translucent`), so the layout moves below it and drops its own clock.
 *
 * The `kiosk` class on <html> drives the layout (see kiosk.css). `auto`
 * detects a home-screen/installed or fullscreen app; `on`/`off` force it.
 */
export type KioskSetting = 'auto' | 'on' | 'off';

const QUERIES = ['(display-mode: standalone)', '(display-mode: fullscreen)', '(display-mode: minimal-ui)'];

/** True when the app runs as an installed/home-screen app or in fullscreen. */
export function detectKiosk(): boolean {
  if (typeof window === 'undefined') return false;
  if ((navigator as Navigator & { standalone?: boolean }).standalone === true) return true;
  return QUERIES.some(query => window.matchMedia?.(query).matches);
}

export function isKioskActive(setting: KioskSetting | undefined): boolean {
  return setting === 'on' || ((setting ?? 'auto') === 'auto' && detectKiosk());
}

export function applyKioskMode(setting: KioskSetting | undefined): boolean {
  const active = isKioskActive(setting);
  document.documentElement.classList.toggle('kiosk', active);
  return active;
}

/** Re-run `apply` when the display mode changes (e.g. entering fullscreen). */
export function watchDisplayMode(apply: () => void): () => void {
  const lists = QUERIES.map(query => window.matchMedia?.(query)).filter((list): list is MediaQueryList => !!list);
  lists.forEach(list => list.addEventListener('change', apply));
  return () => lists.forEach(list => list.removeEventListener('change', apply));
}
