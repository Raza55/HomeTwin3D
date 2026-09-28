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
export function coffeeState(object: FloorplanObject, states: Record<string, HAState>, connected: boolean, now = Date.now()) {
  const c = object.coffee!;
  const power = states[object.entityId], operation = states[c.statusEntityId], active = states[c.activeProgramEntityId];
  const available = !!object.entityId && connected && states[c.connectivityEntityId]?.state === 'on';
  const status = available && valid(operation) ? operation.state : '';
  const running = status === 'run', inProgress = ['run', 'pause', 'actionrequired'].includes(status);
  const on = available && power?.state === 'on';
  const options: string[] = available && active && active.state !== 'unavailable' && Array.isArray(active.attributes.options)
    ? active.attributes.options.filter((x: unknown): x is string => typeof x === 'string' && !!x) : [];
  const program = inProgress && valid(active) ? coffeeProgram(active.state) : '';
  const end = states[c.remainingEntityId];
  const endTime = valid(end) && end.attributes.device_class === 'timestamp' ? Date.parse(end.state) : NaN;
  const remaining = running && Number.isFinite(endTime) && endTime >= now ? coffeeDuration((endTime - now) / 1000) : '';
  const since = operation?.last_changed ? Date.parse(operation.last_changed) : NaN;
  const elapsed = running && Number.isFinite(since) && since <= now ? coffeeDuration((now - since) / 1000) : '';
  const rawProgress = states[c.progressEntityId];
  const percent = valid(rawProgress) ? Number(rawProgress.state) : NaN;
  const progress = inProgress && Number.isFinite(percent) && percent >= 0 && percent <= 100 ? percent : null;
  const local = states[c.localControlEntityId]?.state !== 'off';
  const remote = states[c.remoteStartEntityId]?.state === 'on';
  const labels: Record<string, string> = { inactive: on ? 'Bereit' : 'Aus', ready: 'Bereit', run: 'Läuft', pause: 'Pausiert', actionrequired: 'Aktion am Gerät nötig', finished: 'Fertig', error: 'Fehler am Gerät', aborting: 'Wird gestoppt', delayedstart: 'Start geplant' };
  return { available, on, running, inProgress, options, program, remaining, elapsed, progress,
    label: !object.entityId ? 'Noch nicht zugeordnet' : !available ? 'Nicht verbunden' : labels[status] ?? 'Status nicht verfügbar',
    canPower: available && valid(power) && !local,
    canStart: available && on && remote && !local && ['ready', 'inactive', 'finished'].includes(status) && options.length > 0,
    canStop: available && inProgress && !local && !!states[c.stopEntityId] && states[c.stopEntityId].state !== 'unavailable',
    startHint: !available ? 'Gerät nicht verbunden' : !on ? 'Maschine zuerst einschalten' : local ? 'Lokale Bedienung aktiv oder unbekannt' : !remote ? 'Fernstart am Gerät nicht freigegeben' : '',
  };
}
