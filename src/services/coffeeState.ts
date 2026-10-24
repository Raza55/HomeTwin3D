import type { FloorplanObject, HAState } from '../types';

const valid = (state?: HAState) => !!state && !['unknown', 'unavailable', ''].includes(state.state);
export function coffeeProgram(value: string): string {
  if (['unknown', 'unavailable', ''].includes(value)) return '';
  const short = value.replace(/^consumer_products_coffee_maker_program_(beverage|coffee_world)_/, '');
  const names: Record<string, string> = { coffee: 'Kaffee', x_l_coffee: 'XL Kaffee', hot_water: 'Heißwasser', warm_milk: 'Warme Milch', milk_froth: 'Milchschaum', caffe_latte: 'Caffè Latte', cafe_au_lait: 'Café au Lait', cafe_con_leche: 'Café con Leche', cafe_cortado: 'Café Cortado', verlaengerter: 'Verlängerter', verlaengerter_braun: 'Verlängerter braun', grosser_brauner: 'Großer Brauner' };
  return names[short] ?? short.split('_').map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(' ');
}
export function coffeeDuration(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
/**
 * Home Connect reports "act at the machine" events as sensors next to the
 * operation state (`sensor.<device>_operation_state` → `sensor.<device>_drip_tray_full`).
 * `present` = event active, `confirmed` = acknowledged in the app but not fixed yet.
 */
const COFFEE_ALERTS = [
  { key: 'dripTray', suffix: 'drip_tray_full', label: 'Tropfschale voll' },
  { key: 'waterTank', suffix: 'water_tank_empty', label: 'Wassertank leer' },
  { key: 'beans', suffix: 'bean_container_empty', label: 'Bohnenbehälter leer' },
] as const;

export function coffeeAlertEntityIds(statusEntityId: string): { key: string; entityId: string; label: string }[] {
  const base = /^sensor\.(.+)_operation_state$/.exec(statusEntityId)?.[1];
  return base ? COFFEE_ALERTS.map(alert => ({ key: alert.key, entityId: `sensor.${base}_${alert.suffix}`, label: alert.label })) : [];
}

/** Home Connect pairs `select.<device>_active_program` with `select.<device>_selected_program`. */
export function coffeeSelectedProgramEntityId(activeProgramEntityId: string): string {
  const swapped = activeProgramEntityId.replace(/_aktives_programm$/, '_ausgewahltes_programm').replace(/_active_program$/, '_selected_program');
  return swapped === activeProgramEntityId ? '' : swapped;
}
/** Cup warmer setting: `switch.<device>_cup_warmer` (English) or `switch.<device>_tassenwarmer` (German entity names). */
export function coffeeCupWarmerEntityIds(statusEntityId: string): string[] {
  const base = /^sensor\.(.+)_operation_state$/.exec(statusEntityId)?.[1];
  return base ? [`switch.${base}_cup_warmer`, `switch.${base}_tassenwarmer`] : [];
}
export function coffeeCompanionEntityIds(c: NonNullable<FloorplanObject['coffee']>): string[] {
  return [...coffeeAlertEntityIds(c.statusEntityId).map(alert => alert.entityId), coffeeSelectedProgramEntityId(c.activeProgramEntityId),
    ...coffeeCupWarmerEntityIds(c.statusEntityId)].filter(Boolean);
}

/**
 * The machine reports no end time, only progress (%) about once per second. The countdown
 * extrapolates the progress rate of the last seconds and ticks down between samples.
 */
type Sample = { t: number; p: number };
const progressRuns = new Map<string, Sample[]>();
const lastPrograms = new Map<string, string>();
function estimateRemaining(id: string, inProgress: boolean, percent: number, changed: number, now: number): number | null {
  if (!inProgress || !Number.isFinite(percent) || !Number.isFinite(changed)) { if (!inProgress) progressRuns.delete(id); return null; }
  let samples = progressRuns.get(id) ?? [];
  const last = samples[samples.length - 1];
  if (last && percent < last.p) samples = [];
  if (!last || percent < last.p || changed > last.t) samples.push({ t: changed, p: percent });
  samples = samples.filter((sample, i) => i === samples.length - 1 || sample.t >= changed - 30_000);
  progressRuns.set(id, samples);
  const head = samples[samples.length - 1];
  const base = [...samples].reverse().find(sample => sample.t <= head.t - 3000 && head.t - sample.t <= 10_000) ?? samples[0];
  if (head.p >= 100) return 0;
  if (head.t - base.t < 3000 || head.p - base.p <= 0) return null;
  const rate = (head.p - base.p) / (head.t - base.t);
  return Math.max(0, (100 - head.p) / rate - Math.max(0, now - head.t));
}

export function coffeeState(object: FloorplanObject, states: Record<string, HAState>, connected: boolean, now = Date.now()) {
  const c = object.coffee!;
  const power = states[object.entityId], operation = states[c.statusEntityId], active = states[c.activeProgramEntityId];
  const available = !!object.entityId && connected && states[c.connectivityEntityId]?.state === 'on';
  const status = available && valid(operation) ? operation.state : '';
  const running = status === 'run', inProgress = ['run', 'pause', 'actionrequired'].includes(status);
  const on = available && power?.state === 'on';
  const options: string[] = available && active && active.state !== 'unavailable' && Array.isArray(active.attributes.options)
    ? active.attributes.options.filter((x: unknown): x is string => typeof x === 'string' && !!x) : [];
  // Started at the machine, the active program often stays unknown; the selection shown on the
  // display is reported until the start, so the last known one names the running drink.
  const selectedProgram = states[coffeeSelectedProgramEntityId(c.activeProgramEntityId)];
  const known = valid(active) ? active.state : valid(selectedProgram) ? selectedProgram.state : '';
  if (available && known) lastPrograms.set(object.id, known);
  const program = inProgress ? coffeeProgram(known || lastPrograms.get(object.id) || '') : '';
  const end = states[c.remainingEntityId];
  const endTime = valid(end) && end.attributes.device_class === 'timestamp' ? Date.parse(end.state) : NaN;
  const rawProgress = states[c.progressEntityId];
  const percent = valid(rawProgress) ? Number(rawProgress.state) : NaN;
  const estimate = estimateRemaining(object.id, running, percent, rawProgress?.last_changed ? Date.parse(rawProgress.last_changed) : NaN, now);
  const reported = running && Number.isFinite(endTime) && endTime >= now;
  const remainingEstimated = !reported && running && estimate !== null;
  const remaining = reported ? coffeeDuration((endTime - now) / 1000)
    : estimate !== null ? coffeeDuration(Math.ceil(estimate / 1000)) : '';
  const since = operation?.last_changed ? Date.parse(operation.last_changed) : NaN;
  const elapsed = running && Number.isFinite(since) && since <= now ? coffeeDuration((now - since) / 1000) : '';
  const progress = inProgress && Number.isFinite(percent) && percent >= 0 && percent <= 100 ? percent : null;
  const local = states[c.localControlEntityId]?.state !== 'off';
  const remote = states[c.remoteStartEntityId]?.state === 'on';
  const labels: Record<string, string> = { inactive: on ? 'Bereit' : 'Aus', ready: 'Bereit', run: 'Läuft', pause: 'Pausiert', actionrequired: 'Aktion am Gerät nötig', finished: 'Fertig', error: 'Fehler am Gerät', aborting: 'Wird gestoppt', delayedstart: 'Start geplant' };
  const alerts = available ? coffeeAlertEntityIds(c.statusEntityId)
    .filter(alert => ['present', 'confirmed'].includes(states[alert.entityId]?.state ?? ''))
    .map(alert => alert.label) : [];
  const warmerId = coffeeCupWarmerEntityIds(c.statusEntityId).find(id => states[id]);
  const warmer = warmerId ? states[warmerId] : undefined;
  const cupWarmer = warmerId ? { entityId: warmerId, on: available && warmer?.state === 'on', canToggle: available && valid(warmer) && !local } : null;
  return { available, on, running, inProgress, options, program, remaining, remainingEstimated, elapsed, progress, alerts, cupWarmer,
    label: !object.entityId ? 'Noch nicht zugeordnet' : !available ? 'Nicht verbunden' : labels[status] ?? 'Status nicht verfügbar',
    canPower: available && valid(power) && !local,
    canStart: available && on && remote && !local && ['ready', 'inactive', 'finished'].includes(status) && options.length > 0,
    canStop: available && inProgress && !local && !!states[c.stopEntityId] && states[c.stopEntityId].state !== 'unavailable',
    startHint: !available ? 'Gerät nicht verbunden' : !on ? 'Maschine zuerst einschalten' : local ? 'Lokale Bedienung aktiv oder unbekannt' : !remote ? 'Fernstart am Gerät nicht freigegeben' : '',
  };
}
