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
