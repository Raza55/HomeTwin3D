import type { FloorplanObject, HAState } from '../types';

export function fanState(state: HAState | undefined, connected: boolean) {
  const available = connected && !!state && ['on', 'off'].includes(state.state);
  const on = available && state?.state === 'on';
  const raw = state?.attributes.percentage;
  const percentage = typeof raw === 'number' && Number.isFinite(raw) ? Math.max(0, Math.min(100, raw)) : null;
  const step = Number(state?.attributes.percentage_step);
  return { available, on, percentage: on ? percentage : available ? 0 : null,
    step: Number.isFinite(step) && step > 0 && step <= 100 ? step : 1,
    supportsSpeed: available && (Number(state?.attributes.supported_features) & 1) !== 0 };
}

export function statusIndicatorActive(object: FloorplanObject, state: HAState | undefined, connected: boolean) {
  if (!connected || !state || ['unknown', 'unavailable'].includes(state.state)) return false;
  return !!object.statusIndicator?.activeStates.some(value => value.trim().toLowerCase() === state.state.trim().toLowerCase());
}
