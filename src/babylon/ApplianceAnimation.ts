import type { HAState, ApplianceConfig } from '../types';
/** Explicit operating states only: a powered but idle appliance must stay still. */
export function applianceRunning(config: ApplianceConfig, state?: HAState | null): boolean {
  if (!state || ['unknown','unavailable','off','idle','paused','standby','finished','complete'].includes(state.state.toLowerCase())) return false;
  const unit = String(state.attributes.unit_of_measurement ?? '').toLowerCase();
  if (unit === 'w' || unit === 'kw') {
    const watts = Number(state.state) * (unit === 'kw' ? 1000 : 1);
    return Number.isFinite(watts) && watts > (config.powerThreshold ?? 5);
  }
  return (config.runningStates ?? ['on','running','run','washing','drying','spinning','rinsing','active','in_progress']).some(s => s.toLowerCase() === state.state.toLowerCase());
}

export function applianceRemaining(state?: HAState): string {
  if(!state || ['unknown','unavailable'].includes(state.state))return '';
  const unit=String(state.attributes.unit_of_measurement??'').toLowerCase();
  const value=Number(state.state);
  if(Number.isFinite(value) && ['s','sec','min','h'].includes(unit)) {
    const minutes=Math.max(0,Math.ceil(value*(unit==='s'||unit==='sec'?1/60:unit==='h'?60:1)));
    return minutes>=60?`${Math.floor(minutes/60)} h ${minutes%60} min`:`${minutes} min`;
  }
  return state.state+(unit?' '+unit:'');
}
