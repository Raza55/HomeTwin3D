import type { HAState, ITConfig, ITDevice, ITMetric, ITAction } from '../types';
export const knownITState = (s?: HAState) => !!s && !['unknown','unavailable',''].includes(s.state);
export function itStatus(device: ITDevice, states: Record<string, HAState>, connected: boolean): 'on' | 'off' | 'unknown' | 'unassigned' {
  if (!device.statusEntityId) return 'unassigned';
  const s = states[device.statusEntityId];
  if (!connected || !knownITState(s)) return 'unknown';
  if (device.statusMode === 'telemetry') return 'on';
  if (['on','home','online','connected'].includes(s.state.toLowerCase())) return 'on';
  if (['off','not_home','offline','disconnected'].includes(s.state.toLowerCase())) return 'off';
  return 'unknown';
}
export const itStatusLabel = { on: 'An', off: 'Aus', unknown: 'Nicht erreichbar', unassigned: 'Noch nicht zugeordnet' };
export function itMetric(metric: ITMetric, states: Record<string, HAState>, online: boolean, now = Date.now()): string {
  const s = states[metric.entityId];
  if (!online || !knownITState(s)) return '–';
  if (metric.format === 'uptime') {
    const start = Date.parse(s.state); if (!Number.isFinite(start) || start > now) return '–';
    const minutes = Math.floor((now - start) / 60000);
    return minutes >= 1440 ? `${Math.floor(minutes / 1440)} T ${Math.floor(minutes % 1440 / 60)} Std` : `${Math.floor(minutes / 60)} Std ${minutes % 60} Min`;
  }
  const n = Number(s.state), unit = String(s.attributes.unit_of_measurement ?? '');
  if (metric.positiveOnly && (!Number.isFinite(n) || n <= 0)) return '–';
  const labels: Record<string, string> = { warning:'Warnung', good:'Gut', ok:'OK' };
  const value = Number.isFinite(n) ? n.toLocaleString('de-DE', { maximumFractionDigits: 1 }) : (labels[s.state] ?? s.state);
  return `${value}${unit ? ' ' + unit : ''}`;
}
export function itActionAvailable(action: ITAction, device: ITDevice, states: Record<string, HAState>, connected: boolean): boolean {
  if (!connected || !action.entityId) return false;
  const s = states[action.entityId], status = itStatus(device, states, connected);
  if (!s || s.state === 'unavailable') return false;
  if (action.kind === 'button') return status === 'on'; // unknown is normal for a never-pressed button
  if (!['on','off'].includes(s.state)) return false;
  return action.kind === 'wake' ? s.state === 'off' : true;
}
export function itEntityIds(config: ITConfig): string[] {
  return config.devices.flatMap(d => [d.statusEntityId, d.screenshotEntityId ?? '', ...d.metrics.map(m => m.entityId), ...d.actions.map(a => a.entityId)]).filter(Boolean);
}
export function itCommand(action: ITAction, device: ITDevice, states: Record<string, HAState>, connected: boolean) {
  if (!itActionAvailable(action, device, states, connected)) return null;
  return { domain: action.kind === 'button' ? 'button' : 'switch', service: action.kind === 'button' ? 'press' : states[action.entityId].state === 'on' ? 'turn_off' : 'turn_on', entityId: action.entityId };
}
export function validateIT(config: ITConfig): void {
  const entity = (v: unknown, domains: string) => typeof v === 'string' && (!v || new RegExp(`^(${domains})\\.[a-z0-9_]+$`).test(v));
  if (!config || !['pc','rack'].includes(config.kind) || !Array.isArray(config.devices) || !config.devices.length || config.devices.length > 16) throw Error('Ungültige IT-Geräte');
  const ids = new Set<string>();
  for (const d of config.devices) {
    if (!d || !d.id || ids.has(d.id) || typeof d.label !== 'string' || !['pc','nas','host','router'].includes(d.kind) || !['power','telemetry','connection'].includes(d.statusMode) || !entity(d.statusEntityId,'sensor|binary_sensor|switch|device_tracker') || !Array.isArray(d.metrics) || !Array.isArray(d.actions)) throw Error('Ungültiges IT-Gerät');
    ids.add(d.id);
    if (d.screenshotEntityId !== undefined && !entity(d.screenshotEntityId,'camera')) throw Error('Ungültige Bildschirm-Kamera');
    if (d.metrics.some(m => !m || typeof m.key !== 'string' || typeof m.label !== 'string' || !entity(m.entityId,'sensor|binary_sensor|switch|device_tracker|update') || (m.format && !['value','uptime'].includes(m.format)))) throw Error('Ungültige IT-Messwerte');
    if (d.actions.some(a => !a || typeof a.id !== 'string' || typeof a.label !== 'string' || !['toggle','button','wake'].includes(a.kind) || !entity(a.entityId,a.kind === 'button' ? 'button' : 'switch'))) throw Error('Ungültige IT-Bedienung');
    if ([d.screenMaterials,d.rgbMaterials].some(list => list !== undefined && (!Array.isArray(list) || list.some(n => typeof n !== 'string' || !n)))) throw Error('Ungültige IT-Materialien');
  }
}
