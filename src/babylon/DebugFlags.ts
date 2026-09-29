/**
 * Device diagnostics without developer tools (e.g. an iPad on the wall):
 * `?off=glow,shadows,exterior,markers,batches` switches single subsystems off,
 * so their cost shows up directly in the `?perf` overlay. Never set by the app.
 */
export type DebugSubsystem = 'glow' | 'shadows' | 'exterior' | 'markers' | 'batches';

export function isDisabledForDebug(subsystem: DebugSubsystem): boolean {
  if (typeof location === 'undefined') return false;
  const off = new URLSearchParams(location.search).get('off');
  return !!off && off.split(',').map(s => s.trim()).includes(subsystem);
}

/** `?dpr=<n>` caps the render resolution (device pixels per CSS pixel). */
export function debugDevicePixelRatio(): number | undefined {
  if (typeof location === 'undefined') return undefined;
  const value = Number(new URLSearchParams(location.search).get('dpr'));
  return value > 0 && value <= 4 ? value : undefined;
}
