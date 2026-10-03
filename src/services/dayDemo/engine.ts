/**
 * Day demo engine: plays the story on a virtual clock and writes the resulting
 * entity states through `hooks.setState` (the demo HA adapter). Nothing here
 * talks to Home Assistant or touches the DOM, so it runs under node --test.
 */
import type { CastEntity, CastLight, DayDemoCast, RoomRole } from './cast.ts';
import {
  STORY, CHAPTERS, DAY_LENGTH, paceAt, weatherAt, virtualToClock, clockLabel, pick,
  type Chapter, type DemoWeather, type LightTarget, type ScreenKind, type StoryAction, type Text, type TVMode,
} from './story.ts';

export type BoardControlRequest =
  /** `candidates`: lamps that fit, best first (the dashboard taps the first single lamp in view). */
  | { kind: 'light'; entityId: string; candidates: string[]; swatch?: string; kelvin?: number; brightness: number }
  | { kind: 'blinds'; entityId: string; position: number }
  | { kind: 'tv'; choice: string }
  | { kind: 'pc' };

export interface DayDemoHooks {
  setState(entityId: string, state: string, attributes?: Record<string, unknown>): void;
  getState(entityId: string): { state: string; attributes: Record<string, unknown> } | undefined;
  /** Renders a screen frame (data URL); omitted in tests. */
  screen?(kind: ScreenKind, frame: ScreenFrame): string | undefined;
  now?(): number;
  random?(): number;
  /** Operates the board's own popups with a visible finger (dashboard UI); ignored when seeking. */
  control?(control: BoardControlRequest): void;
  /** Opens/closes a device popup (dashboard UI); ignored when seeking. */
  popup?(target: 'coffee', open: boolean): void;
}

export interface ScreenFrame { frame: number; clock: number; title: string; language: string; progress: number }

export interface LogEntry { id: number; clock: number; icon: string; text: Text }

/** What the day brought (shown at the end instead of plain benchmark numbers). */
export interface DayStats {
  automations: number;
  /** Lamp-hours (one lamp on for one hour = 1). */
  lightHours: number;
  rainMinutes: number;
  minTemp: number;
  maxTemp: number;
  maxGust: number;
  /** Lamps switched on or off. */
  lightSwitches: number;
  /** Blind movements started. */
  blindMoves: number;
  /** Entity state updates sent to the dashboard. */
  updates: number;
}

export interface DayDemoSnapshot {
  virtual: number;
  clock: number;
  playing: boolean;
  finished: boolean;
  speed: number;
  chapterIndex: number;
  chapter?: Chapter;
  weather: DemoWeather;
  log: LogEntry[];
  stats: DayStats;
}

interface Transition {
  startV: number; endV: number; lastReal: number;
  /** Minimum real time between intermediate updates. */ interval: number;
  apply(t: number, final: boolean): void;
}

interface Loop { hues: number[]; period: number; brightness: number; saturation: number; breathe: number; startV: number; offset: number }

interface Screen { entityId: string; kind: ScreenKind; state: string; attributes: Record<string, unknown>; title: string; startV: number; tv?: { shield: string; duration: number } }

const EMIT_INTERVAL_MS = 140;
const BLIND_INTERVAL_MS = 450;
const LOOP_INTERVAL_MS = 380;
const SCREEN_INTERVAL_MS = 1800;
const METRIC_INTERVAL_MS = 2500;
const LOG_LIMIT = 8;

const ECHO_FEATURES = 1 | 4 | 8 | 16 | 32 | 128 | 256 | 4096 | 16384;
const COFFEE_PROGRAM = 'consumer_products_coffee_maker_program_beverage_caffe_latte';
const COFFEE_OPTIONS = [
  'consumer_products_coffee_maker_program_beverage_coffee',
  'consumer_products_coffee_maker_program_beverage_caffe_latte',
  'consumer_products_coffee_maker_program_beverage_cappuccino',
  'consumer_products_coffee_maker_program_beverage_hot_water',
];

export const ROOM_NAMES: Record<RoomRole, Text> = {
  bedroom: { de: 'Schlafzimmer', en: 'Bedroom' }, bath: { de: 'Bad', en: 'Bathroom' },
  kitchen: { de: 'Küche', en: 'Kitchen' }, dining: { de: 'Essbereich', en: 'Dining' },
  living: { de: 'Wohnzimmer', en: 'Living room' }, hall: { de: 'Flur', en: 'Hallway' },
  office: { de: 'Büro', en: 'Office' }, outdoor: { de: 'Balkon', en: 'Balcony' }, other: { de: 'Wohnung', en: 'Home' },
};

export function hsToRgb(hue: number, saturation: number): [number, number, number] {
  const h = ((hue % 360) + 360) % 360, s = Math.max(0, Math.min(100, saturation)) / 100;
  const f = (n: number) => {
    const k = (n + h / 60) % 6;
    return Math.round(255 * (1 - s * Math.max(0, Math.min(k, 4 - k, 1))));
  };
  return [f(5), f(3), f(1)];
}

const domain = (entityId: string) => entityId.split('.')[0];
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const ease = (t: number) => t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

export class DayDemoEngine {
  readonly cast: DayDemoCast;
  private hooks: DayDemoHooks;
  private language: string;
  private virtual = 0;
  private beatIndex = 0;
  private playing = false;
  private finished = false;
  private speed = 1;
  private transitions = new Map<string, Transition>();
  private loops = new Map<string, Loop>();
  private screens = new Map<string, Screen>();
  private pcOn = new Map<string, ScreenKind>();
  private log: LogEntry[] = [];
  private logId = 0;
  private chapterIndex = -1;
  private lastLoop = 0;
  private lastScreen = 0;
  private lastMetrics = 0;
  private screenFrame = 0;
  private listeners = new Set<() => void>();
  private snapshot: DayDemoSnapshot;
  private snapshotDirty = true;
  private seeking = false;
  private stats: DayStats = DayDemoEngine.emptyStats();
  private static emptyStats(): DayStats { return { automations: 0, lightHours: 0, rainMinutes: 0, minTemp: Infinity, maxTemp: -Infinity, maxGust: 0, lightSwitches: 0, blindMoves: 0, updates: 0 }; }
  private lastNotify = 0;
  private structuralChange = false;

  constructor(cast: DayDemoCast, hooks: DayDemoHooks, language = 'de-DE') {
    this.cast = cast;
    // Count what the day does to the home (not the replay after a jump).
    this.hooks = {
      ...hooks,
      setState: (entityId, state, attributes) => {
        if (!this.seeking) {
          this.stats.updates++;
          if (entityId.startsWith('light.')) {
            const before = hooks.getState(entityId)?.state;
            if ((before === 'on') !== (state === 'on')) this.stats.lightSwitches++;
          } else if (entityId.startsWith('cover.') && (state === 'opening' || state === 'closing') && !['opening', 'closing'].includes(hooks.getState(entityId)?.state ?? '')) {
            this.stats.blindMoves++;
          }
        }
        hooks.setState(entityId, state, attributes);
      },
    };
    this.language = language;
    this.snapshot = this.buildSnapshot();
  }

  private now(): number { return this.hooks.now?.() ?? Date.now(); }
  private random(): number { return this.hooks.random?.() ?? Math.random(); }

  // --- Public control ---------------------------------------------------------

  start(): void { this.seek(0); this.play(); }
  play(): void { if (this.finished) this.seek(0); this.playing = true; this.touch(); }
  pause(): void { this.playing = false; this.touch(); }
  setSpeed(speed: number): void { this.speed = Math.max(.25, Math.min(8, speed)); this.touch(); }
  setLanguage(language: string): void { this.language = language; this.touch(); }
  get time(): number { return this.virtual; }
  get isPlaying(): boolean { return this.playing; }
  get isFinished(): boolean { return this.finished; }
  get weather(): DemoWeather { return weatherAt(this.virtual); }
  /** Real milliseconds per virtual minute right now. */
  get realMsPerMinute(): number { return 1000 / (paceAt(this.virtual) * this.speed); }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  getSnapshot(): DayDemoSnapshot {
    if (this.snapshotDirty) { this.snapshot = this.buildSnapshot(); this.snapshotDirty = false; }
    return this.snapshot;
  }

  /** Jump to a point of the day: replays every beat up to there without transitions. */
  seek(target: number): void {
    const v = Math.max(0, Math.min(DAY_LENGTH, target));
    this.seeking = true;
    this.reset();
    while (this.beatIndex < STORY.length && STORY[this.beatIndex].at <= v) this.runBeat(this.beatIndex++);
    this.virtual = v;
    this.updateTransitions(true);
    this.updateLoops(true);
    this.seeking = false;
    this.lastScreen = 0; this.lastMetrics = 0;
    this.updatePeriodic();
    this.finished = v >= DAY_LENGTH;
    this.touch();
  }

  /** Advance by real elapsed milliseconds. */
  advance(realMs: number): void {
    if (!this.playing || this.finished) return;
    const step = Math.min(realMs, 250) / 1000 * paceAt(this.virtual) * this.speed;
    const target = Math.min(DAY_LENGTH, this.virtual + step);
    while (this.beatIndex < STORY.length && STORY[this.beatIndex].at <= target) {
      this.virtual = Math.max(this.virtual, STORY[this.beatIndex].at);
      this.runBeat(this.beatIndex++);
    }
    this.collectStats(target - this.virtual);
    this.virtual = target;
    this.updateTransitions(false);
    this.updateLoops(false);
    this.updatePeriodic();
    const done = this.virtual >= DAY_LENGTH;
    if (done) { this.finished = true; this.playing = false; }
    this.touch(done);
  }


  // --- Internals ---------------------------------------------------------------

  /** Listeners hear about structural changes at once and about the running clock ~5× per second. */
  private touch(structural = true): void {
    this.snapshotDirty = true;
    if (this.seeking) return;
    const now = this.now();
    if (!structural && !this.structuralChange && now - this.lastNotify < 200) return;
    this.lastNotify = now; this.structuralChange = false;
    for (const listener of this.listeners) listener();
  }

  private buildSnapshot(): DayDemoSnapshot {
    const chapter = this.chapterIndex >= 0 ? CHAPTERS[this.chapterIndex]?.chapter : undefined;
    return {
      virtual: this.virtual, clock: virtualToClock(this.virtual), playing: this.playing, finished: this.finished,
      speed: this.speed, chapterIndex: this.chapterIndex, chapter, weather: weatherAt(this.virtual), log: [...this.log], stats: { ...this.stats },
    };
  }

  private reset(): void {
    this.virtual = 0; this.beatIndex = 0; this.finished = false; this.chapterIndex = -1;
    this.stats = DayDemoEngine.emptyStats();
    this.transitions.clear(); this.loops.clear(); this.screens.clear(); this.pcOn.clear();
    this.log = [];
    this.hooks.popup?.('coffee', false);
    const c = this.cast, set = this.hooks.setState.bind(this.hooks);
    for (const light of c.lights) if (this.hooks.getState(light.entityId)?.state !== 'off') set(light.entityId, 'off', { ...this.attrs(light.entityId), friendly_name: light.label, brightness: 0 });
    for (const blind of c.blinds) set(blind.entityId, 'closed', this.blindAttrs(blind, 0));
    this.tv('off');
    for (const pc of c.pcs) this.pc(pc.device.statusEntityId, false);
    for (const coffee of c.coffee) {
      const ids = coffee.ids;
      set(coffee.entityId, 'off', {});
      set(ids.connectivityEntityId, 'on', {}); set(ids.remoteStartEntityId, 'on', {}); set(ids.localControlEntityId, 'off', {});
      set(ids.statusEntityId, 'inactive', {}); set(ids.activeProgramEntityId, 'unknown', { options: COFFEE_OPTIONS });
      set(ids.progressEntityId, '0', { unit_of_measurement: '%' }); set(ids.remainingEntityId, 'unknown', { device_class: 'timestamp' });
      set(ids.stopEntityId, 'unknown', {});
      const base = /^sensor\.(.+)_operation_state$/.exec(ids.statusEntityId)?.[1];
      if (base) for (const suffix of ['drip_tray_full', 'water_tank_empty', 'bean_container_empty']) set(`sensor.${base}_${suffix}`, 'absent', {});
    }
    for (const echo of c.echos) set(echo.entityId, 'idle', this.echoAttrs(echo.label));
    for (const door of c.doors) set(door.entityId, 'off', { friendly_name: door.label });
    for (const lock of c.locks) set(lock, 'locked', {});
    for (const entry of c.fans) set(entry.entityId, 'off', { friendly_name: entry.label, percentage: 0, percentage_step: 10, supported_features: 1 });
    for (const vacuum of c.vacuums) set(vacuum, 'docked', {});
    for (const appliance of c.appliances) this.appliance(appliance.entityId, false);
  }

  private attrs(entityId: string): Record<string, unknown> {
    return { ...(this.hooks.getState(entityId)?.attributes ?? {}) };
  }

  private addLog(icon: string, text: Text): void {
    if (this.seeking) return;
    this.structuralChange = true;
    this.stats.automations++;
    this.log = [{ id: ++this.logId, clock: virtualToClock(this.virtual), icon, text }, ...this.log].slice(0, LOG_LIMIT);
  }

  private runBeat(index: number): void {
    const beat = STORY[index];
    if (beat.chapter) {
      this.chapterIndex = CHAPTERS.findIndex(c => c.chapter.id === beat.chapter!.id);
      this.structuralChange = true;
    }
    for (const action of beat.actions) this.run(action, beat.at);
  }

  private run(action: StoryAction, at: number): void {
    switch (action.type) {
      case 'light': return this.lightAction(action, at);
      case 'colorloop': return this.colorloopAction(action, at);
      case 'blind': return this.blindAction(action, at);
      case 'tv': {
        if (!this.cast.tvRoutes.length && !this.cast.tvPlayers.length) return;
        this.tv(action.mode, action.title, at);
        const titles: Record<TVMode, Text> = {
          off: { de: 'Fernseher aus', en: 'TV off' }, news: { de: 'Fernseher: Nachrichten', en: 'TV: the news' },
          movie: { de: `Fernseher: ${action.title?.de ?? 'Film'}`, en: `TV: ${action.title?.en ?? 'movie'}` },
          pc: { de: 'Fernseher: PC-Eingang', en: 'TV: PC input' }, game: { de: 'Fernseher: Konsole', en: 'TV: console' },
        };
        return this.addLog('tv', titles[action.mode]);
      }
      case 'pc': {
        if (!this.cast.pcs.length) return;
        for (const pc of this.cast.pcs) this.pc(pc.device.statusEntityId, action.on, action.screen, at);
        return this.addLog('monitor', action.on
          ? action.screen === 'game' ? { de: 'PC startet ein Spiel – RGB an', en: 'PC launches a game – RGB on' } : { de: 'PC eingeschaltet', en: 'PC switched on' }
          : { de: 'PC heruntergefahren', en: 'PC shut down' });
      }
      case 'coffee': return this.coffeeAction(action.phase, action.minutes ?? 4, at);
      case 'control': return this.controlAction(action, at);
      case 'popup': {
        if (action.target === 'coffee' && !this.cast.coffee.length) return;
        if (!this.seeking) this.hooks.popup?.(action.target, action.open);
        return;
      }
      case 'echo': return this.echoAction(action.playing, action.rooms, action.title);
      case 'door': {
        const doors = this.cast.doors.filter(d => d.kind === action.kind);
        for (const door of doors) this.hooks.setState(door.entityId, action.open ? 'on' : 'off', { friendly_name: door.label });
        if (!doors.length) return;
        if (action.kind === 'window') {
          return this.addLog('door', action.open
            ? { de: 'Fenstertüren geöffnet: Lüften', en: 'French windows open: airing' }
            : { de: 'Fenstertüren geschlossen', en: 'French windows closed' });
        }
        const name = action.kind === 'entrance' ? { de: 'Haustür', en: 'Front door' } : { de: 'Balkontür', en: 'Balcony door' };
        return this.addLog('door', { de: `${name.de} ${action.open ? 'geöffnet' : 'geschlossen'}`, en: `${name.en} ${action.open ? 'opened' : 'closed'}` });
      }
      case 'lock': {
        for (const lock of this.cast.locks) this.hooks.setState(lock, action.locked ? 'locked' : 'unlocked', {});
        if (!this.cast.locks.length) return;
        return this.addLog('lock', action.locked ? { de: 'Haustür verriegelt', en: 'Front door locked' } : { de: 'Haustür entriegelt', en: 'Front door unlocked' });
      }
      case 'fan': {
        let fans = action.rooms ? this.cast.fans.filter(f => action.rooms!.includes(f.room)) : this.cast.fans;
        if (!fans.length && action.on) fans = this.cast.fans.slice(0, 1);
        for (const fan of fans) this.hooks.setState(fan.entityId, action.on ? 'on' : 'off', { ...this.attrs(fan.entityId), percentage: action.on ? action.percentage ?? 50 : 0 });
        if (!fans.length || !action.on && !this.cast.fans.length) return;
        return this.addLog('fan', action.on ? { de: `Ventilator ${action.percentage ?? 50} %`, en: `Fan ${action.percentage ?? 50} %` } : { de: 'Ventilator aus', en: 'Fan off' });
      }
      case 'vacuum': {
        for (const vacuum of this.cast.vacuums) this.hooks.setState(vacuum, action.phase, {});
        if (!this.cast.vacuums.length) return;
        const text = { cleaning: { de: 'Saugroboter startet', en: 'Robot vacuum starts' }, returning: { de: 'Saugroboter fährt zur Station', en: 'Robot vacuum returns' }, docked: { de: 'Saugroboter angedockt', en: 'Robot vacuum docked' } }[action.phase];
        return this.addLog('robot', text);
      }
      case 'appliance': {
        const list = this.cast.appliances.filter(a => a.kind === action.kind);
        for (const appliance of list) this.applianceAction(appliance.entityId, action.running, action.minutes ?? (action.kind === 'washer' ? 130 : 100), at);
        if (!list.length) return;
        const name = action.kind === 'washer' ? { de: 'Waschmaschine', en: 'Washer' } : { de: 'Trockner', en: 'Dryer' };
        return this.addLog('washer', { de: `${name.de} ${action.running ? 'gestartet' : 'fertig'}`, en: `${name.en} ${action.running ? 'started' : 'finished'}` });
      }
    }
  }

  private collectStats(minutes: number): void {
    if (minutes <= 0) return;
    const weather = weatherAt(this.virtual);
    const lit = this.cast.lights.reduce((n, light) => n + (this.hooks.getState(light.entityId)?.state === 'on' ? 1 : 0), 0);
    this.stats.lightHours += lit * minutes / 60;
    if (weather.rain > 0) this.stats.rainMinutes += minutes;
    this.stats.minTemp = Math.min(this.stats.minTemp, weather.temperature_2m);
    this.stats.maxTemp = Math.max(this.stats.maxTemp, weather.temperature_2m);
    this.stats.maxGust = Math.max(this.stats.maxGust, weather.wind_gusts_10m);
  }

  // --- Lights ------------------------------------------------------------------

  resolveLights(target: LightTarget): CastLight[] {
    const all = this.cast.lights;
    let list = target.all ? all : all.filter(l => target.rooms?.includes(l.room));
    if (target.exclude) list = list.filter(l => !target.exclude!.includes(l.room));
    if (target.color) list = list.filter(l => l.color);
    if (!list.length && target.fallback) {
      const usable = all.filter(l => (!target.color || l.color) && !target.exclude?.includes(l.room));
      // Prefer lights the story has no room for; rotate by the target so each scene gets other lamps.
      const pool = [...usable.filter(l => l.room === 'other'), ...usable.filter(l => l.room !== 'other')];
      const seed = (target.rooms ?? []).join().split('').reduce((sum, ch) => sum + ch.charCodeAt(0), 0);
      for (let i = 0; i < Math.min(target.fallback, pool.length); i++) list.push(pool[(seed + i) % pool.length]);
    }
    return list;
  }

  private lightAttrs(lamp: CastLight, brightness: number, kelvin?: number, hue?: number, saturation?: number): Record<string, unknown> {
    const attrs = this.attrs(lamp.entityId);
    attrs.friendly_name = lamp.label;
    attrs.brightness = lamp.dim ? Math.max(1, Math.round(brightness / 100 * 255)) : 255;
    delete attrs.effect;
    if (hue !== undefined && lamp.color) {
      attrs.hs_color = [hue, saturation ?? 90];
      attrs.rgb_color = hsToRgb(hue, saturation ?? 90);
      attrs.color_mode = 'hs';
      delete attrs.color_temp_kelvin;
    } else if (lamp.temp) {
      attrs.color_temp_kelvin = Math.round(kelvin ?? (hue !== undefined ? 2400 : 3000));
      attrs.color_mode = 'color_temp';
      delete attrs.hs_color; delete attrs.rgb_color;
    } else {
      attrs.color_mode = lamp.dim ? 'brightness' : 'onoff';
    }
    return attrs;
  }

  private currentLight(light: CastLight): { on: boolean; brightness: number; kelvin: number } {
    const state = this.hooks.getState(light.entityId);
    const on = state?.state === 'on';
    const raw = Number(state?.attributes.brightness);
    const kelvin = Number(state?.attributes.color_temp_kelvin);
    return { on, brightness: on && Number.isFinite(raw) ? raw / 255 * 100 : 0, kelvin: Number.isFinite(kelvin) && kelvin > 0 ? kelvin : 2700 };
  }

  private lightAction(action: Extract<StoryAction, { type: 'light' }>, at: number): void {
    const lights = this.resolveLights(action.target);
    if (!lights.length) return;
    let touched = 0;
    lights.forEach((light, i) => {
      const key = `light:${light.entityId}`;
      const start = at + i * (action.stagger ?? 0);
      if (!action.on) {
        const pending = this.transitions.has(key);
        this.loops.delete(light.entityId);
        if (!pending && !this.currentLight(light).on) return;
        touched++;
        const ramp = action.ramp ?? 0;
        const from = this.currentLight(light).brightness;
        this.schedule(key, start, start + ramp, (t, final) => {
          if (final) this.hooks.setState(light.entityId, 'off', { ...this.attrs(light.entityId), brightness: 0 });
          else this.hooks.setState(light.entityId, 'on', this.lightAttrs(light, Math.max(1, lerp(from, 1, t)), this.currentLight(light).kelvin));
        });
        return;
      }
      touched++;
      this.loops.delete(light.entityId);
      const ramp = action.ramp ?? 0;
      const current = this.currentLight(light);
      const from = action.from ?? { brightness: current.on ? current.brightness : 1, kelvin: current.kelvin };
      this.schedule(key, start, start + ramp, t => {
        const k = ease(t);
        const kelvin = action.kelvin !== undefined ? lerp(from.kelvin ?? action.kelvin, action.kelvin, k) : undefined;
        this.hooks.setState(light.entityId, 'on', this.lightAttrs(light, lerp(from.brightness, action.brightness, k), kelvin, action.hue, action.saturation));
      });
    });
    if (!touched) return;
    const rooms = this.roomsText(lights);
    this.addLog(action.on ? 'lamp' : 'lamp-off', action.on
      ? { de: `${rooms.de}: Licht ${action.brightness} %${action.ramp ? ` (${action.ramp} min Übergang)` : ''}`, en: `${rooms.en}: lights ${action.brightness} %${action.ramp ? ` (${action.ramp} min fade)` : ''}` }
      : { de: `${rooms.de}: Licht aus (${touched})`, en: `${rooms.en}: lights off (${touched})` });
  }

  private roomsText(items: { room: RoomRole }[]): Text {
    const rooms = [...new Set(items.map(i => i.room))];
    if (rooms.length > 3) return { de: 'Alle Räume', en: 'All rooms' };
    return { de: rooms.map(r => ROOM_NAMES[r].de).join(', '), en: rooms.map(r => ROOM_NAMES[r].en).join(', ') };
  }

  private colorloopAction(action: Extract<StoryAction, { type: 'colorloop' }>, at: number): void {
    if (!action.on) {
      // Ending a colour scene switches its lamps off; the next beat decides what lights up.
      const ids = action.target.all ? [...this.loops.keys()] : this.resolveLights(action.target).map(l => l.entityId).filter(id => this.loops.has(id));
      for (const id of ids) {
        this.loops.delete(id);
        this.schedule(`light:${id}`, at, at, () => this.hooks.setState(id, 'off', { ...this.attrs(id), brightness: 0 }));
      }
      return;
    }
    const lights = this.resolveLights(action.target);
    if (!lights.length) return;
    lights.forEach((light, i) => {
      this.transitions.delete(`light:${light.entityId}`);
      this.loops.set(light.entityId, { hues: action.hues ?? [240, 255], period: action.period ?? 20, brightness: action.brightness ?? 60, saturation: action.saturation ?? 70, breathe: action.breathe ?? .15, startV: at, offset: i * 0.35 });
    });
    this.lastLoop = 0;
    this.addLog('palette', { de: `${this.roomsText(lights).de}: Farbszene (${lights.length} Lampen)`, en: `${this.roomsText(lights).en}: colour scene (${lights.length} lamps)` });
  }

  private updateLoops(force: boolean): void {
    if (!this.loops.size) return;
    const now = this.now();
    if (!force && now - this.lastLoop < LOOP_INTERVAL_MS) return;
    this.lastLoop = now;
    for (const [entityId, loop] of this.loops) {
      const light = this.cast.lights.find(l => l.entityId === entityId);
      if (!light) continue;
      const position = Math.max(0, (this.virtual - loop.startV) / loop.period + loop.offset);
      const index = Math.floor(position) % loop.hues.length;
      const a = loop.hues[index], b = loop.hues[(index + 1) % loop.hues.length];
      const delta = ((b - a + 540) % 360) - 180;
      const hue = (a + delta * ease(position % 1) + 360) % 360;
      // Mostly dimming: a slow breath (about one per 1.5 hue steps), phase-shifted per lamp.
      const breath = Math.sin((this.virtual - loop.startV) / (loop.period * 1.5) * Math.PI * 2 + loop.offset * 2);
      const level = loop.brightness * (1 - loop.breathe / 2 + loop.breathe / 2 * breath);
      this.hooks.setState(entityId, 'on', this.lightAttrs(light, Math.max(3, level), 2400, hue, loop.saturation));
    }
  }

  // --- Blinds --------------------------------------------------------------------

  /** Blind attributes as HA reports them; the board's popup enables its buttons from supported_features. */
  private blindAttrs(blind: CastEntity, position: number): Record<string, unknown> {
    return { friendly_name: blind.label, current_position: position, current_cover_position: position, supported_features: 15 };
  }

  private blindAction(action: Extract<StoryAction, { type: 'blind' }>, at: number): void {
    const blinds = (action.rooms ? this.cast.blinds.filter(b => action.rooms!.includes(b.room)) : this.cast.blinds)
      .filter(b => !action.exclude?.includes(b.room));
    if (!blinds.length) return;
    let moved = 0;
    blinds.forEach((blind, i) => {
      const key = `blind:${blind.entityId}`;
      // A room-specific beat may already have moved this blind in the same minute.
      if (!action.rooms && this.transitions.has(key) && (this.transitions.get(key)!.startV === at)) return;
      const current = Number(this.hooks.getState(blind.entityId)?.attributes.current_position ?? 0);
      if (current === action.position && !this.transitions.has(key)) return;
      moved++;
      const start = at + moved * (action.stagger ?? 0);
      const from = current;
      this.schedule(key, start, start + (action.ramp ?? 0), (t, final) => {
        const position = Math.round(lerp(from, action.position, ease(t)));
        const moving = !final ? (action.position > from ? 'opening' : 'closing') : position > 0 ? 'open' : 'closed';
        this.hooks.setState(blind.entityId, moving, this.blindAttrs(blind, position));
        // Every blind step re-renders the shadow maps of nearby lamps: fewer, larger steps.
      }, BLIND_INTERVAL_MS);
    });
    if (!moved) return;
    const text = action.position === 0 ? { de: 'Rollos schließen', en: 'Blinds closing' }
      : action.position === 100 ? { de: 'Rollos öffnen', en: 'Blinds opening' }
        : { de: `Rollos auf ${action.position} % Beschattung`, en: `Blinds to ${action.position} % shading` };
    const rooms = action.rooms ? this.roomsText(blinds) : undefined;
    this.addLog('blinds', rooms ? { de: `${rooms.de}: ${text.de}`, en: `${rooms.en}: ${text.en}` } : { de: `${text.de} (${moved})`, en: `${text.en} (${moved})` });
  }

  /**
   * The board is used by hand: with the dashboard attached, a finger taps the popup
   * (its buttons send the commands); after a jump the result is applied directly.
   */
  private controlAction(action: Extract<StoryAction, { type: 'control' }>, at: number): void {
    if (action.kind === 'pc') {
      if (!this.cast.pcs.length) return;
      if (!this.seeking) this.hooks.control?.({ kind: 'pc' });
      return this.addLog('monitor', { de: 'Board: PC per langem Druck gestartet', en: 'Board: PC started with a long press' });
    }
    if (action.kind === 'tv') {
      if (!this.cast.tvRoutes.length) return;
      if (!this.seeking) this.hooks.control?.({ kind: 'tv', choice: action.choice });
      const name = action.choice === 'shield' ? 'SHIELD' : action.choice;
      return this.addLog('tv', { de: `Board: TV Dial → ${name}`, en: `Board: TV Dial → ${name}` });
    }
    if (action.kind === 'light') {
      // A lamp whose colour shows: pendants and ceiling lights first, strips behind furniture last.
      const score = (l: CastLight) => (this.hooks.getState(l.entityId)?.state === 'on' ? 0 : 4) + (/strip|leiste|band/i.test(l.label) ? 2 : 0)
        + (/decke|ceiling|pendel|h[aä]nge/i.test(l.label) ? 0 : 1) + action.rooms.indexOf(l.room) * .5;
      const lamps = this.cast.lights.filter(l => action.rooms.includes(l.room) && (action.kelvin !== undefined ? l.temp : l.color)).sort((a, b) => score(a) - score(b));
      const lamp = lamps[0];
      if (!lamp) return;
      // A fade still running on this lamp would overwrite the hand-picked colour.
      this.transitions.delete(`light:${lamp.entityId}`);
      if (!this.seeking && this.hooks.control) this.hooks.control({ kind: 'light', entityId: lamp.entityId, candidates: lamps.map(l => l.entityId), swatch: action.swatch, kelvin: action.kelvin, brightness: action.brightness });
      else this.hooks.setState(lamp.entityId, 'on', this.lightAttrs(lamp, action.brightness, action.kelvin, action.hue, action.hue !== undefined ? 70 : undefined));
      const what = action.swatch ?? `${action.kelvin} K`;
      return this.addLog('palette', { de: `Board: Lampe → ${what}, ${action.brightness} %`, en: `Board: lamp → ${what}, ${action.brightness} %` });
    }
    const blinds = this.cast.blinds.filter(b => action.rooms.includes(b.room));
    if (!blinds.length) return;
    if (!this.seeking && this.hooks.control) {
      this.hooks.control({ kind: 'blinds', entityId: blinds[0].entityId, position: action.position });
      // The popup moves the blinds of its HA area; others of the story's rooms follow a moment later.
      this.schedule(`blinds:control:${at}`, at + 5, at + 5, () => {
        for (const blind of blinds) {
          if (this.blindPosition(blind.entityId) !== action.position && !this.transitions.has(`blind:${blind.entityId}`)) this.moveBlind(blind.entityId, action.position, 4, false);
        }
      });
    } else this.blindAction({ type: 'blind', rooms: action.rooms, position: action.position, ramp: 4, stagger: .5 }, at);
    const rooms = this.roomsText(blinds);
    this.addLog('blinds', action.position === 0
      ? { de: `Board: Alle Rollos im ${rooms.de} schließen`, en: `Board: close all blinds in the ${rooms.en}` }
      : { de: `Board: Alle Rollos im ${rooms.de} öffnen`, en: `Board: open all blinds in the ${rooms.en}` });
  }

  /** A command sent from the board's popups (counts like the day's own updates). */
  noteCommand(entityId: string, before?: string, after?: string): void {
    if (this.seeking) return;
    this.stats.updates++;
    if (entityId.startsWith('light.') && (before === 'on') !== (after === 'on')) this.stats.lightSwitches++;
  }

  /** Current position of a blind (0 closed … 100 open). */
  blindPosition(entityId: string): number {
    return Number(this.hooks.getState(entityId)?.attributes.current_position ?? 0);
  }

  /** Moves one blind (camera shots: the blind at the window the viewer steps up to; board commands). */
  moveBlind(entityId: string, position: number, ramp = 2, log = true): number | undefined {
    const blind = this.cast.blinds.find(b => b.entityId === entityId);
    if (!blind) return undefined;
    const from = Number(this.hooks.getState(entityId)?.attributes.current_position ?? 0);
    if (from === position) return from;
    this.schedule(`blind:${entityId}`, this.virtual, this.virtual + ramp, (t, final) => {
      const current = Math.round(lerp(from, position, ease(t)));
      const state = !final ? (position > from ? 'opening' : 'closing') : current > 0 ? 'open' : 'closed';
      this.hooks.setState(entityId, state, this.blindAttrs(blind, current));
    }, BLIND_INTERVAL_MS);
    if (log) this.addLog('blinds', position > from
      ? { de: `${ROOM_NAMES[blind.room].de}: Rollo am Fenster fährt hoch (Bewegung erkannt)`, en: `${ROOM_NAMES[blind.room].en}: window blind opens (motion detected)` }
      : { de: `${ROOM_NAMES[blind.room].de}: Rollo fährt wieder herunter`, en: `${ROOM_NAMES[blind.room].en}: blind closes again` });
    return from;
  }

  // --- Transitions ---------------------------------------------------------------

  private schedule(key: string, startV: number, endV: number, apply: (t: number, final: boolean) => void, interval = EMIT_INTERVAL_MS): void {
    const transition: Transition = { startV, endV, lastReal: 0, apply, interval };
    this.transitions.set(key, transition);
    if (startV <= this.virtual && endV <= this.virtual && !this.seeking) {
      apply(1, true);
      this.transitions.delete(key);
    }
  }

  private updateTransitions(force: boolean): void {
    const now = this.now();
    for (const [key, tr] of this.transitions) {
      if (tr.startV > this.virtual) continue;
      const t = tr.endV > tr.startV ? Math.min(1, (this.virtual - tr.startV) / (tr.endV - tr.startV)) : 1;
      if (t >= 1) {
        this.transitions.delete(key);
        tr.apply(1, true);
      } else if (force || now - tr.lastReal >= tr.interval) {
        tr.lastReal = now;
        tr.apply(t, false);
      }
    }
  }

  // --- TV, PC, screens -------------------------------------------------------------

  private tv(mode: TVMode, title?: Text, at = this.virtual): void {
    const set = this.hooks.setState.bind(this.hooks);
    const on = mode !== 'off';
    const movieTitle = title ? pick(title, this.language) : '';
    for (const route of this.cast.tvRoutes) {
      if (route.screenshot) this.screens.delete(route.screenshot);
      if (route.pcScreenshot) this.screens.delete(route.pcScreenshot);
      set(route.television, on ? 'on' : 'off', {});
      const source = mode === 'pc' ? 'PC' : mode === 'game' ? 'PlayStation' : 'SHIELD Media';
      set(route.receiver, on ? 'on' : 'off', { source, source_list: ['SHIELD Media', 'PC', 'PlayStation'] });
      if (route.remote) set(route.remote, on ? 'on' : 'off', { app_name: mode === 'news' ? 'Mediathek' : 'Heimkino' });
      if (!on) {
        set(route.shield, 'off', {});
        if (route.screenshot) set(route.screenshot, 'off', {});
        if (route.pcScreenshot) set(route.pcScreenshot, 'off', {});
        continue;
      }
      if (mode === 'news' || mode === 'movie') {
        const media = mode === 'news'
          ? { app_name: 'Mediathek', media_title: pick({ de: 'Nachrichten', en: 'The News' }, this.language), media_series_title: pick({ de: 'Nachrichten', en: 'News' }, this.language), media_duration: 2700 }
          : { app_name: 'Heimkino', media_title: movieTitle || 'Nordlicht', media_series_title: pick({ de: 'Spielfilm', en: 'Feature film' }, this.language), media_duration: 7260 };
        set(route.shield, 'playing', { ...media, media_position: 0 });
        if (route.screenshot) this.addScreen({ entityId: route.screenshot, kind: mode, state: 'on', attributes: {}, title: media.media_title, startV: at, tv: { shield: route.shield, duration: media.media_duration } });
      } else if (mode === 'pc' && route.pcScreenshot) {
        this.addScreen({ entityId: route.pcScreenshot, kind: 'game', state: 'idle', attributes: {}, title: 'PC', startV: at });
      }
    }
    for (const player of this.cast.tvPlayers) {
      if (!on) { set(player, 'off', {}); continue; }
      set(player, 'playing', {
        app_name: mode === 'news' ? 'Mediathek' : 'Heimkino', source: mode === 'news' ? 'Mediathek' : 'Heimkino',
        media_title: mode === 'news' ? pick({ de: 'Nachrichten', en: 'The News' }, this.language) : movieTitle || 'Nordlicht',
        volume_level: 0.3,
      });
    }
  }

  private pc(statusEntityId: string, on: boolean, screen: ScreenKind = 'work', at = this.virtual): void {
    const pc = this.cast.pcs.find(p => p.device.statusEntityId === statusEntityId);
    if (!pc) return;
    const device = pc.device, set = this.hooks.setState.bind(this.hooks);
    const status = domain(statusEntityId) === 'device_tracker' ? (on ? 'home' : 'not_home') : on ? 'on' : 'off';
    set(statusEntityId, status, { friendly_name: device.label });
    for (const action of device.actions) if (action.entityId && action.kind !== 'button') set(action.entityId, on ? 'on' : 'off', {});
    if (on) this.pcOn.set(statusEntityId, screen); else this.pcOn.delete(statusEntityId);
    if (device.screenshotEntityId) {
      this.screens.delete(device.screenshotEntityId);
      if (on) this.addScreen({ entityId: device.screenshotEntityId, kind: screen, state: 'idle', attributes: {}, title: device.label, startV: at });
      else set(device.screenshotEntityId, 'idle', {});
    }
    this.lastMetrics = 0;
    this.updateMetrics(pc.device, on, screen);
  }

  private updateMetrics(device: CastPCDevice, on: boolean, screen?: ScreenKind): void {
    const load = screen === 'game' ? 1 : 0;
    const jitter = (range: number) => (this.random() - .5) * 2 * range;
    for (const metric of device.metrics) {
      if (!metric.entityId) continue;
      const text = `${metric.key} ${metric.label} ${metric.entityId}`.toLowerCase();
      if (metric.format === 'uptime' || /uptime|boot|laufzeit/.test(text)) {
        if (on && !this.hooks.getState(metric.entityId)?.state.includes('T')) this.hooks.setState(metric.entityId, new Date(this.now()).toISOString(), { device_class: 'timestamp' });
        if (!on) this.hooks.setState(metric.entityId, 'unknown', {});
        continue;
      }
      if (domain(metric.entityId) === 'binary_sensor') { this.hooks.setState(metric.entityId, on ? 'on' : 'off', {}); continue; }
      if (domain(metric.entityId) !== 'sensor') continue;
      let value: number, unit: string;
      if (/temp/.test(text)) { value = on ? lerp(46, 71, load) + jitter(3) : 31; unit = '°C'; }
      else if (/power|watt|leistung|verbrauch/.test(text)) { value = on ? lerp(110, 460, load) + jitter(25) : 2; unit = 'W'; }
      else if (/ram|memory|speicher|mem/.test(text)) { value = on ? lerp(41, 68, load) + jitter(3) : 0; unit = '%'; }
      else { value = on ? lerp(14, 86, load) + jitter(9) : 0; unit = '%'; }
      this.hooks.setState(metric.entityId, Math.max(0, value).toFixed(unit === '°C' ? 1 : 0), { unit_of_measurement: unit });
    }
  }

  private addScreen(screen: Screen): void {
    this.screens.set(screen.entityId, screen);
    this.lastScreen = 0;
  }

  private updatePeriodic(): void {
    const now = this.now();
    if (this.screens.size && now - this.lastScreen >= SCREEN_INTERVAL_MS) {
      this.lastScreen = now;
      this.screenFrame++;
      for (const screen of this.screens.values()) {
        const elapsed = (this.virtual - screen.startV) * 60;
        const progress = screen.tv ? Math.min(1, elapsed / screen.tv.duration) : 0;
        const url = this.hooks.screen?.(screen.kind, { frame: this.screenFrame, clock: virtualToClock(this.virtual), title: screen.title, language: this.language, progress });
        if (screen.tv) {
          const shield = this.hooks.getState(screen.tv.shield);
          if (shield?.state === 'playing') this.hooks.setState(screen.tv.shield, 'playing', { ...shield.attributes, media_position: Math.min(screen.tv.duration, Math.round(elapsed)) });
        }
        if (url) this.hooks.setState(screen.entityId, screen.state, { ...screen.attributes, entity_picture: url });
      }
    }
    if (this.pcOn.size && now - this.lastMetrics >= METRIC_INTERVAL_MS) {
      this.lastMetrics = now;
      for (const [statusEntityId, screen] of this.pcOn) {
        const pc = this.cast.pcs.find(p => p.device.statusEntityId === statusEntityId);
        if (pc) this.updateMetrics(pc.device, true, screen);
      }
    }
  }

  // --- Coffee, echo, appliances ------------------------------------------------------

  private coffeeAction(phase: 'on' | 'brew' | 'off', minutes: number, at: number): void {
    if (!this.cast.coffee.length) return;
    const set = this.hooks.setState.bind(this.hooks);
    for (const { entityId, ids } of this.cast.coffee) {
      if (phase === 'on') { set(entityId, 'on', {}); set(ids.statusEntityId, 'ready', {}); continue; }
      if (phase === 'off') {
        this.transitions.delete(`coffee:${entityId}`);
        set(entityId, 'off', {}); set(ids.statusEntityId, 'inactive', {});
        set(ids.activeProgramEntityId, 'unknown', { options: COFFEE_OPTIONS }); set(ids.progressEntityId, '0', { unit_of_measurement: '%' });
        continue;
      }
      set(entityId, 'on', {});
      set(ids.statusEntityId, 'run', {});
      set(ids.activeProgramEntityId, COFFEE_PROGRAM, { options: COFFEE_OPTIONS });
      this.schedule(`coffee:${entityId}`, at, at + minutes, (t, final) => {
        set(ids.progressEntityId, String(Math.round(t * 100)), { unit_of_measurement: '%' });
        const remainingMs = (1 - t) * minutes * this.realMsPerMinute;
        set(ids.remainingEntityId, final ? 'unknown' : new Date(this.now() + remainingMs).toISOString(), { device_class: 'timestamp' });
        if (final) {
          set(ids.statusEntityId, 'finished', {});
          this.addLog('coffee', { de: 'Caffè Latte fertig', en: 'Caffè latte ready' });
        }
      });
    }
    this.addLog('coffee', phase === 'on' ? { de: 'Kaffeemaschine heizt vor', en: 'Coffee machine preheating' }
      : phase === 'brew' ? { de: `Caffè Latte gestartet (${minutes} min)`, en: `Caffè latte started (${minutes} min)` }
        : { de: 'Kaffeemaschine aus', en: 'Coffee machine off' });
  }

  private echoAttrs(label: string, title?: string): Record<string, unknown> {
    return { friendly_name: label, volume_level: 0.32, supported_features: ECHO_FEATURES, available: true, ...(title ? { media_title: title } : {}) };
  }

  private echoAction(playing: boolean, rooms: RoomRole[] | undefined, title?: Text): void {
    if (!this.cast.echos.length) return;
    let echos = rooms ? this.cast.echos.filter(e => rooms.includes(e.room)) : this.cast.echos;
    if (!echos.length && playing) echos = this.cast.echos.slice(0, 1);
    if (!echos.length) return;
    const text = title ? pick(title, this.language) : undefined;
    let changed = 0;
    for (const echo of echos) {
      const current = this.hooks.getState(echo.entityId)?.state;
      if (!playing && current !== 'playing') continue;
      changed++;
      this.hooks.setState(echo.entityId, playing ? 'playing' : 'idle', this.echoAttrs(echo.label, playing ? text : undefined));
    }
    if (playing && title) this.addLog('speaker', { de: `Echo: „${title.de}“`, en: `Echo: “${title.en}”` });
    else if (!playing && changed) this.addLog('speaker', { de: 'Echo pausiert', en: 'Echo paused' });
  }

  /** What a device of the demo is doing right now (realistic power in the energy view). */
  deviceActivity(kind: string): 'off' | 'on' | 'busy' {
    const get = (id?: string) => id ? this.hooks.getState(id)?.state : undefined;
    switch (kind) {
      case 'pc': { const screens = [...this.pcOn.values()]; return !screens.length ? 'off' : screens.includes('game') ? 'busy' : 'on'; }
      case 'desk': return this.pcOn.size ? 'on' : 'off';
      case 'tv': return this.cast.tvRoutes.some(r => get(r.television) === 'on')
        || this.cast.tvPlayers.some(p => { const s = get(p); return !!s && !['off', 'standby', 'unavailable'].includes(s); }) ? 'on' : 'off';
      case 'washer': case 'dryer': return this.cast.appliances.filter(a => a.kind === kind).some(a => {
        const s = get(a.entityId); return a.power ? Number(s) > 5 : !!s && !['off', 'idle', '0'].includes(s);
      }) ? 'busy' : 'off';
      case 'coffee': return this.cast.coffee.some(c => get(c.ids.statusEntityId) === 'run') ? 'busy'
        : this.cast.coffee.some(c => get(c.entityId) === 'on') ? 'on' : 'off';
      default: return 'on';
    }
  }

  private appliance(entityId: string, running: boolean): void {
    const appliance = this.cast.appliances.find(a => a.entityId === entityId);
    if (!appliance) return;
    if (appliance.power) this.hooks.setState(entityId, running ? String(Math.round(420 + this.random() * 380)) : '0.4', { unit_of_measurement: 'W' });
    else this.hooks.setState(entityId, running ? appliance.runningState ?? 'running' : 'off', {});
    const countdown = appliance.remainingEntityId || appliance.displayEntityId;
    if (countdown && !running) this.hooks.setState(countdown, '0', { unit_of_measurement: 'min' });
  }

  private applianceAction(entityId: string, running: boolean, minutes: number, at: number): void {
    this.appliance(entityId, running);
    const appliance = this.cast.appliances.find(a => a.entityId === entityId);
    const countdown = appliance?.remainingEntityId || appliance?.displayEntityId;
    if (!appliance || !countdown) return;
    const key = `appliance:${entityId}`;
    if (!running) { this.transitions.delete(key); return; }
    this.schedule(key, at, at + minutes, t => {
      this.hooks.setState(countdown, String(Math.max(0, Math.round(minutes * (1 - t)))), { unit_of_measurement: 'min' });
      if (appliance.power && t < 1) this.hooks.setState(entityId, String(Math.round(380 + this.random() * 420)), { unit_of_measurement: 'W' });
    });
  }

}

type CastPCDevice = DayDemoCast['pcs'][number]['device'];

export { clockLabel };
