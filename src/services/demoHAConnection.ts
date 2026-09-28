import type { BlindConfig, HAState, LightConfig, LightType } from '../types';
import type { HACallbacks } from './haWebSocket';
import { isSimulationActive } from '../contexts/SimulationModeContext';

const STORAGE_KEY = 'demoLightStates';

function loadPersistedStates(): Record<string, HAState> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function persistStates(states: Map<string, HAState>): void {
  const obj: Record<string, HAState> = {};
  for (const [id, s] of states) {
    // Only persist light/switch entities, not sensors
    if (id.startsWith('light.') || id.startsWith('switch.') || id.startsWith('cover.') || id.startsWith('media_player.')) {
      obj[id] = s;
    }
  }
  if (!isSimulationActive()) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
  }
}

/** Random RGB in the blue-to-red range, with even visual distribution. */
function randomBlueToRed(): [number, number, number] {
  // Equal-probability zones so blue and red aren't drowned out by pink/purple
  const zone = Math.random();
  let hue: number;
  if (zone < 0.33)      hue = 240 + Math.random() * 30;  // 240-270: blues
  else if (zone < 0.66) hue = 280 + Math.random() * 40;  // 280-320: purples
  else                  hue = 330 + Math.random() * 30;  // 330-360: reds

  const s = 0.8 + Math.random() * 0.2; // 80-100% saturation
  // HSL to RGB (lightness fixed at 50%)
  const c = s;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = 0.5 - c / 2;
  let r = 0, g = 0, b = 0;
  if (hue < 300)      { r = x; g = 0; b = c; }
  else                { r = c; g = 0; b = x; }
  return [
    Math.round((r + m) * 255),
    Math.round((g + m) * 255),
    Math.round((b + m) * 255),
  ];
}

function hsToRgbTuple(hue: number, saturation: number): [number, number, number] {
  const h = ((hue % 360) + 360) % 360;
  const s = Math.max(0, Math.min(100, saturation)) / 100;
  const c = s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = 0.5 - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;
  if (h < 60)       { r = c; g = x; b = 0; }
  else if (h < 120) { r = x; g = c; b = 0; }
  else if (h < 180) { r = 0; g = c; b = x; }
  else if (h < 240) { r = 0; g = x; b = c; }
  else if (h < 300) { r = x; g = 0; b = c; }
  else              { r = c; g = 0; b = x; }
  return [
    Math.round((r + m) * 255),
    Math.round((g + m) * 255),
    Math.round((b + m) * 255),
  ];
}

function defaultLightAttributes(config: LightConfig): Record<string, unknown> {
  const base = {
    friendly_name: config.label || config.entityId,
    brightness: 0,
  };
  if (config.type === 'rgbw') {
    return {
      ...base,
      supported_color_modes: ['rgbw', 'hs', 'color_temp'],
      min_color_temp_kelvin: 2000,
      max_color_temp_kelvin: 6500,
      effect_list: ['none', 'colorloop'],
    };
  }
  if (config.type === 'rgb') {
    return {
      ...base,
      supported_color_modes: ['hs', 'color_temp'],
      min_color_temp_kelvin: 2000,
      max_color_temp_kelvin: 6500,
      effect_list: ['none', 'colorloop'],
    };
  }
  if (config.type === 'nanoleafShapes') {
    return {
      ...base,
      supported_color_modes: ['hs', 'color_temp'],
      min_color_temp_kelvin: 2000,
      max_color_temp_kelvin: 6500,
      effect_list: ['none', 'Color Burst', 'Northern Lights', 'Pop Rocks', 'Rhythm'],
    };
  }
  if (config.type === 'warmCold') {
    return {
      ...base,
      supported_color_modes: ['color_temp'],
      min_color_temp_kelvin: 2000,
      max_color_temp_kelvin: 6500,
    };
  }
  if (config.type === 'dimmeable') {
    return { ...base, supported_color_modes: ['brightness'] };
  }
  return { ...base, supported_color_modes: ['onoff'] };
}

const DEMO_SCENES: Array<{ entityId: string; label: string; brightness: number; hs?: [number, number]; kelvin?: number }> = [
  { entityId: 'scene.demo_relax', label: 'Relax', brightness: 120, kelvin: 2400 },
  { entityId: 'scene.demo_read', label: 'Read', brightness: 210, kelvin: 3600 },
  { entityId: 'scene.demo_concentrate', label: 'Concentrate', brightness: 255, kelvin: 5000 },
  { entityId: 'scene.demo_neon', label: 'Neon', brightness: 190, hs: [285, 88] },
];

/** Fluctuation config: base value ± range, with optional decimal places. */
const SENSOR_FLUCTUATION: Record<string, { base: number; range: number; decimals?: number }> = {
  'sensor.temp_hum_sensor_temperature': { base: 21.3, range: 0.4, decimals: 1 },
  'sensor.temp_hum_sensor_humidity': { base: 54, range: 3 },
  'sensor.indoor_temperature': { base: 21.3, range: 0.4, decimals: 1 },
  'sensor.indoor_humidity': { base: 54, range: 3 },
  'sensor.home_power': { base: 1842, range: 200 },
  'sensor.indoor_co2': { base: 623, range: 40 },
  'sensor.download_speed': { base: 45, range: 30, decimals: 1 },
  'sensor.upload_speed': { base: 13, range: 8, decimals: 1 },
  'sensor.water_flow': { base: 3.4, range: 2, decimals: 1 },
};

/**
 * Fake HA connection for demo mode.
 * Maintains light states in localStorage so they survive page reloads.
 */
export class DemoHAConnection {
  private callbacks: HACallbacks;
  private states = new Map<string, HAState>();
  private lightTypes = new Map<string, LightType>();
  private disposed = false;
  private sensorInterval: number | null = null;

  constructor(callbacks: HACallbacks) {
    this.callbacks = callbacks;
  }

  /** Bootstrap demo states from the loaded config entity IDs. */
  start(lightConfigs: LightConfig[], sensorEntityIds: string[], blindConfigs: BlindConfig[] = []): void {
    if (this.disposed) return;

    const persisted = loadPersistedStates();

    // Store light types and restore persisted states or default to "off"
    for (const lc of lightConfigs) {
      this.lightTypes.set(lc.entityId, lc.type);
      const defaults = defaultLightAttributes(lc);
      const saved = persisted[lc.entityId];
      this.states.set(lc.entityId, saved ? {
        ...saved,
        attributes: { ...defaults, ...saved.attributes },
      } : {
        entity_id: lc.entityId,
        state: 'off',
        attributes: defaults,
      });
    }

    for (const scene of DEMO_SCENES) {
      this.states.set(scene.entityId, {
        entity_id: scene.entityId,
        state: 'unknown',
        attributes: { friendly_name: scene.label },
      });
    }

    for (const bc of blindConfigs) {
      this.states.set(bc.entityId, persisted[bc.entityId] ?? {
        entity_id: bc.entityId,
        state: 'closed',
        attributes: { current_position: 0, current_cover_position: 0 },
      });
    }

    // Demo sensor values — realistic defaults for common entity IDs
    const sensorDefaults: Record<string, { state: string; attributes: Record<string, unknown> }> = {
      'sensor.temp_hum_sensor_temperature': { state: '21.3', attributes: {} },
      'sensor.temp_hum_sensor_humidity': { state: '54', attributes: {} },
      'sensor.indoor_temperature': { state: '21.3', attributes: {} },
      'sensor.indoor_humidity': { state: '54', attributes: {} },
      'sensor.home_power': { state: '1842', attributes: {} },
      'sensor.indoor_co2': { state: '623', attributes: {} },
      'sensor.download_speed': { state: '45.2', attributes: {} },
      'sensor.upload_speed': { state: '12.8', attributes: {} },
      'sensor.water_flow': { state: '3.4', attributes: {} },
      'climate.thermostat': {
        state: 'heat',
        attributes: {
          temperature: 20,
          current_temperature: 21.3,
          hvac_mode: 'heat',
          min_temp: 7,
          max_temp: 30,
        },
      },
    };
    for (const id of sensorEntityIds) {
      const defaults = sensorDefaults[id];
      if (id.startsWith('media_player.')) {
        this.states.set(id, persisted[id] ?? {
          entity_id: id,
          state: 'playing',
          attributes: {
            app_name: 'Netflix',
            media_title: 'Demo Movie',
            media_artist: 'Living Room TV',
            source: 'Netflix',
            source_list: ['HDMI 1', 'Netflix', 'YouTube', 'Spotify'],
            volume_level: 0.36,
          },
        });
        continue;
      }
      this.states.set(id, {
        entity_id: id,
        state: defaults?.state ?? '0',
        attributes: defaults?.attributes ?? {},
      });
    }

    // Periodically fluctuate sensor values so the demo feels alive
    this.sensorInterval = window.setInterval(() => {
      if (this.disposed) return;
      for (const id of sensorEntityIds) {
        const current = this.states.get(id);
        if (!current || id.startsWith('climate.')) continue;
        const cfg = SENSOR_FLUCTUATION[id];
        if (!cfg) continue;
        const base = cfg.base;
        const jitter = (Math.random() - 0.5) * 2 * cfg.range;
        const value = Math.max(0, base + jitter);
        const formatted = cfg.decimals != null
          ? value.toFixed(cfg.decimals)
          : String(Math.round(value));
        this.updateState(id, formatted, current.attributes);
      }
    }, 3000);

    this.callbacks.onStatusChanged?.('connected');
    this.callbacks.onInitialStates?.([...this.states.values()]);
  }

  async callService(
    domain: string,
    service: string,
    entityId: string,
    data?: Record<string, unknown>,
  ): Promise<void> {
    if (this.disposed) return;

    // Script calls: simulate 1.5s delay
    if (domain === 'script') {
      await new Promise((r) => setTimeout(r, 1500));
      return;
    }

    if (domain === 'scene' && service === 'turn_on') {
      const scene = DEMO_SCENES.find((item) => item.entityId === entityId);
      if (scene) {
        for (const [lightId, current] of this.states.entries()) {
          if (!lightId.startsWith('light.')) continue;
          const attrs = { ...current.attributes, brightness: scene.brightness };
          if (scene.hs) {
            attrs.hs_color = scene.hs;
            attrs.rgb_color = hsToRgbTuple(scene.hs[0], scene.hs[1]);
            attrs.color_mode = 'hs';
          } else if (scene.kelvin) {
            attrs.color_temp_kelvin = scene.kelvin;
            attrs.color_mode = 'color_temp';
          }
          this.updateState(lightId, 'on', attrs);
        }
      }
      this.updateState(entityId, new Date().toISOString(), {
        ...(this.states.get(entityId)?.attributes ?? {}),
      });
      return;
    }

    // Climate service calls
    if (domain === 'climate') {
      const current = this.states.get(entityId);
      const attrs = { ...(current?.attributes ?? {}) };
      if (service === 'set_temperature' && data?.temperature !== undefined) {
        attrs.temperature = data.temperature;
        this.updateState(entityId, current?.state ?? 'heat', attrs);
      } else if (service === 'set_hvac_mode' && data?.hvac_mode !== undefined) {
        attrs.hvac_mode = data.hvac_mode;
        this.updateState(entityId, data.hvac_mode as string, attrs);
      }
      return;
    }

    if (domain === 'cover') {
      const current = this.states.get(entityId);
      const attrs = { ...(current?.attributes ?? {}) };
      if (service === 'open_cover') {
        this.updateState(entityId, 'open', { ...attrs, current_position: 100, current_cover_position: 100 });
      } else if (service === 'close_cover') {
        this.updateState(entityId, 'closed', { ...attrs, current_position: 0, current_cover_position: 0 });
      } else if (service === 'set_cover_position') {
        const next = Math.max(0, Math.min(100, Number(data?.position ?? 0)));
        this.updateState(entityId, next > 0 ? 'open' : 'closed', { ...attrs, current_position: next, current_cover_position: next });
      } else if (service === 'stop_cover') {
        this.updateState(entityId, current?.state ?? 'open', attrs);
      }
      return;
    }

    if (domain === 'media_player') {
      const current = this.states.get(entityId);
      const attrs = { ...(current?.attributes ?? {}) };
      if (service === 'turn_on') {
        this.updateState(entityId, 'playing', {
          ...attrs,
          app_name: attrs.app_name ?? 'Netflix',
          media_title: attrs.media_title ?? 'Demo Movie',
          source: attrs.source ?? 'Netflix',
          source_list: attrs.source_list ?? ['HDMI 1', 'Netflix', 'YouTube', 'Spotify'],
          volume_level: attrs.volume_level ?? 0.36,
        });
      } else if (service === 'turn_off') {
        this.updateState(entityId, 'off', attrs);
      } else if (service === 'media_play_pause') {
        this.updateState(entityId, current?.state === 'playing' ? 'paused' : 'playing', attrs);
      } else if (service === 'media_stop') {
        this.updateState(entityId, 'idle', attrs);
      } else if (service === 'volume_set') {
        const volume = Math.max(0, Math.min(1, Number(data?.volume_level ?? attrs.volume_level ?? 0)));
        this.updateState(entityId, current?.state ?? 'playing', { ...attrs, volume_level: volume });
      } else if (service === 'select_source') {
        this.updateState(entityId, current?.state ?? 'playing', { ...attrs, source: data?.source });
      }
      return;
    }

    const current = this.states.get(entityId);
    const attrs = { ...(current?.attributes ?? {}) };

    if (service === 'toggle') {
      const wasOn = current?.state === 'on';
      if (wasOn) {
        this.updateState(entityId, 'off', { ...attrs, brightness: 0 });
      } else {
        const onAttrs = { ...attrs, brightness: attrs.brightness || 255 };
        const lt = this.lightTypes.get(entityId);
        if (lt === 'rgb' || lt === 'rgbw' || lt === 'nanoleafShapes') {
          onAttrs.rgb_color = randomBlueToRed();
        }
        this.updateState(entityId, 'on', onAttrs);
      }
      return;
    }

    if (service === 'turn_on') {
      if (data?.brightness !== undefined) attrs.brightness = data.brightness as number;
      if (!attrs.brightness) attrs.brightness = 255;
      if (data?.hs_color !== undefined) {
        attrs.hs_color = data.hs_color as [number, number];
        const [h, s] = attrs.hs_color as [number, number];
        attrs.rgb_color = hsToRgbTuple(h, s);
        attrs.color_mode = 'hs';
      }
      if (data?.rgb_color !== undefined) attrs.rgb_color = data.rgb_color as [number, number, number];
      if (data?.color_temp !== undefined) attrs.color_temp = data.color_temp as number;
      if (data?.color_temp_kelvin !== undefined) {
        attrs.color_temp_kelvin = data.color_temp_kelvin as number;
        attrs.color_mode = 'color_temp';
      }
      if (data?.white_value !== undefined) attrs.white_value = data.white_value as number;
      if (data?.effect !== undefined) attrs.effect = data.effect as string;
      this.updateState(entityId, 'on', attrs);
      return;
    }

    if (service === 'turn_off') {
      this.updateState(entityId, 'off', { ...attrs, brightness: 0 });
      return;
    }
  }

  private updateState(entityId: string, state: string, attributes: Record<string, unknown>): void {
    const newState: HAState = { entity_id: entityId, state, attributes };
    this.states.set(entityId, newState);
    persistStates(this.states);
    this.callbacks.onStateChanged?.(entityId, newState);
  }

  async request(_msg: Record<string, unknown>): Promise<unknown> {
    // Demo mode doesn't support arbitrary WS requests (e.g. history)
    return {};
  }

  get isConnected(): boolean {
    return !this.disposed;
  }

  /** No-op: the demo adapter has no real socket to reconnect. */
  forceReconnect(): void {}

  dispose(): void {
    this.disposed = true;
    if (this.sensorInterval != null) {
      clearInterval(this.sensorInterval);
      this.sensorInterval = null;
    }
    this.states.clear();
  }
}
