import type { ApplianceConfig, HAState } from '../types';

export interface ApplianceRegistryEntry {
  entity_id: string; device_id?: string | null; disabled_by?: string | null;
  original_name?: string | null;
}
export interface ApplianceControls {
  program?: string; start?: string; stop?: string; connectivity?: string; remote?: string;
}

/** Discover siblings by device identity, never by similar appliance names. */
export function resolveApplianceControls(appliance: ApplianceConfig, entityId: string, registry: ApplianceRegistryEntry[]): ApplianceControls {
  const enabled = registry.filter(entry => !entry.disabled_by);
  const anchor = [appliance.programSelectEntityId, appliance.programEntityId, appliance.remainingEntityId, entityId]
    .map(id => enabled.find(entry => entry.entity_id === id)).find(entry => entry?.device_id);
  const siblings = anchor ? enabled.filter(entry => entry.device_id === anchor.device_id) : [];
  const unique = (domain: string, names: string[]) => {
    const matches = siblings.filter(entry => entry.entity_id.startsWith(`${domain}.`) && names.includes((entry.original_name ?? '').toLowerCase()));
    return matches.length === 1 ? matches[0].entity_id : undefined;
  };
  return {
    program: appliance.programSelectEntityId || (appliance.programEntityId?.startsWith('select.') ? appliance.programEntityId : unique('select', ['program uid', 'selected program'])),
    start: appliance.startEntityId || unique('button', ['start']),
    stop: appliance.stopEntityId || unique('button', ['stopreset', 'stop']),
    connectivity: unique('sensor', ['connectivity state']),
    remote: unique('sensor', ['remote control']),
  };
}

export function applianceControlOffline(controls: ApplianceControls, states: Record<string, HAState>, connected: boolean): boolean {
  if (!connected) return true;
  return !!controls.connectivity && !['connected', 'on', 'online'].includes(states[controls.connectivity]?.state.toLowerCase() ?? '');
}

export function programOptions(state?: HAState): string[] {
  return Array.isArray(state?.attributes.options) ? state.attributes.options.filter((option): option is string => typeof option === 'string') : [];
}
export function rankPrograms(options: string[], counts: Record<string, number>): string[] {
  const count = (key: string) => Number.isFinite(counts[key]) && counts[key] > 0 ? counts[key] : 0;
  return [...options].sort((a, b) => count(b) - count(a) || a.localeCompare(b));
}
const usageKey = (entityId: string) => `hometwin:appliance-program-use:${entityId}`;
export function readProgramUsage(entityId: string): Record<string, number> {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(usageKey(entityId)) || '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, number> : {};
  } catch { return {}; }
}
export function recordProgramStart(entityId: string, program: string): void {
  const counts = readProgramUsage(entityId);
  counts[program] = (Number.isFinite(counts[program]) ? counts[program] : 0) + 1;
  try { localStorage.setItem(usageKey(entityId), JSON.stringify(counts)); } catch { /* Device control also works without local storage. */ }
}

/** AEG reports `<Category> Pr <Program>`; the program part with a German name reads best. */
const PROGRAM_NAMES: Record<string, string> = {
  'Baby Wm Wd': 'Baby', Bedlinenxl: 'Bettwäsche XL', Duvet: 'Bettdecken', Pillows: 'Kopfkissen', Cottons: 'Baumwolle',
  'Eco40-60': 'Eco 40-60', Curtains: 'Gardinen', Delicates: 'Feinwäsche', Denim: 'Jeans', Machineclean: 'Maschinenpflege',
  Absolutewash49Min: 'AbsoluteWash 49 Min', Businessshirt: 'Businesshemden', 'Linen Wm Wd': 'Leinen', Silk: 'Seide',
  '1Itemfast': '1 Teil schnell', Pethair: 'Tierhaare', '20Min3Kg': '20 Min 3 kg', Antiallergyvapour: 'Antiallergie Dampf',
  Hygiene: 'Hygiene', Runningshoes: 'Laufschuhe', 'Soccer Rugby Soccer Rugby': 'Sporttrikots', Rinse: 'Spülen',
  'Drain Spin': 'Abpumpen und Schleudern', 'Sportwear Wx': 'Sportbekleidung', 'Down Jacket': 'Daunenjacke', Outdoor: 'Outdoor',
  Skiing: 'Skibekleidung', Steamcashmere: 'Dampf Kaschmir', Steam: 'Dampf auffrischen', Easyiron: 'Bügelleicht',
  Synthetics: 'Pflegeleicht', 'Towels Base': 'Handtücher', Dailytraining: 'Trainingskleidung', Wool: 'Wolle',
};
export function programLabel(option: string): string {
  const short = option.includes(' Pr ') ? option.slice(option.lastIndexOf(' Pr ') + 4) : option;
  return PROGRAM_NAMES[short] ?? PROGRAM_NAMES[option] ?? short;
}

export interface HistoryPoint { state: string; last_changed: string }
/**
 * Derive program starts from the recorder: a start is the running signal turning on after at
 * least `gapMs` without it (plugs flicker off for seconds mid-cycle), and its program is the
 * selection reported at that moment. Covers starts at the machine and in other apps.
 */
export function programStartsFromHistory(program: HistoryPoint[], running: HistoryPoint[], isRunning: (state: string) => boolean, gapMs = 30 * 60_000): Record<string, string> {
  const time = (p: HistoryPoint) => Date.parse(p.last_changed);
  const selections = program.filter(p => !['unknown', 'unavailable', ''].includes(p.state) && Number.isFinite(time(p))).sort((a, b) => time(a) - time(b));
  const points = running.filter(p => Number.isFinite(time(p))).sort((a, b) => time(a) - time(b));
  const starts: Record<string, string> = {};
  let on = false, lastOff = -Infinity;
  for (const point of points) {
    const t = time(point), now = isRunning(point.state);
    if (now && !on && t - lastOff >= gapMs) {
      // The selection may arrive a moment after the power signal.
      const selected = [...selections].reverse().find(p => time(p) <= t + 60_000);
      if (selected) starts[new Date(t).toISOString()] = selected.state;
    }
    if (!now && on) lastOff = t;
    on = now;
  }
  return starts;
}
// The recorder keeps only days; known starts accumulate in this browser.
const startsKey = (entityId: string) => `hometwin:appliance-program-starts:${entityId}`;
export function mergeProgramStarts(entityId: string, starts: Record<string, string>, now = Date.now()): Record<string, string> {
  let saved: Record<string, string> = {};
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(startsKey(entityId)) || '{}');
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) saved = parsed as Record<string, string>;
  } catch { /* Ranking then uses the recorder only. */ }
  const cutoff = now - 365 * 86_400_000;
  const merged = Object.fromEntries(Object.entries({ ...saved, ...starts }).filter(([t, p]) => typeof p === 'string' && Date.parse(t) >= cutoff));
  try { localStorage.setItem(startsKey(entityId), JSON.stringify(merged)); } catch { /* Optional cache. */ }
  return merged;
}
export function countProgramStarts(starts: Record<string, string>): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const program of Object.values(starts)) counts[program] = (counts[program] ?? 0) + 1;
  return counts;
}
