import type { HASettings } from '../types';
import type { CameraControlsFlags } from '../contexts/CameraControlsContext';
import { isSimulationActive } from '../contexts/SimulationModeContext';

type ThemeMode = 'dark' | 'light' | 'auto' | 'system';
export type LanguageCode = 'de-DE' | 'en-GB';

/* ── Section interfaces ── */

export interface ConnectionSettings {
  mode: 'live' | 'demo';
  haSettings: HASettings;
}

export interface AppearanceSettings {
  theme: ThemeMode;
  bgColor: string;
  primaryAccent: string;
  statusAccent: string;
  panelOpacity: number;
  panelDots: boolean;
  panelBgColor: string;
  backdropObscure: boolean;
  backdropBlur: boolean;
  hudVisible: boolean;
  /** Wall/tablet display layout: auto-detected home-screen app, or forced on/off. */
  kioskMode?: 'auto' | 'on' | 'off';
  borderStyle: 'subtle' | 'large' | 'none';
  cornerRadius: 'sharp' | 'soft' | 'round';
}

export interface RenderSettings {
  edgeMode: 'classic' | 'enhanced';
  edgeWidth: number;
  groundGrid: boolean;
  perspective: boolean;
  sunShadowRes: number;
  pointShadowRes: number;
  showTextures: boolean;
  sketchColor: string;
  sketchSpecular: number;
  /** Energy flow over the sketch model (textures off). */
  energyView: boolean;
  /** Marker filter: main categories hidden on the plan (lights, blinds, ...). */
  hiddenMarkerCategories?: string[];
}

export interface EnvironmentSettings {
  sunLiveMode: boolean;
  weatherEnabled: boolean;
  /** Minimum brightness of the park/outdoor area in percent (0 = natural night). */
  parkMinBrightness: number;
  /** Optional cat and birds outside (costs some performance, off by default). */
  wildlifeEnabled?: boolean;
}

export interface HomeViewPose {
  alpha: number;
  beta: number;
  radius: number;
  target: { x: number; y: number; z: number };
}

export interface CameraSensitivity {
  /** Horizontal drag (turn around the plan). */
  rotate: number;
  /** Vertical drag (tilt the view). */
  tilt: number;
  /** Mouse wheel and pinch. */
  zoom: number;
  pan: number;
}

export interface ControlsSettings {
  cameraControls: {
    desktop: CameraControlsFlags;
    mobile: CameraControlsFlags;
  };
  homeView: HomeViewPose | null;
  /** Camera sensitivity in percent per gesture (100 = default). */
  sensitivity?: CameraSensitivity;
}

export const DEFAULT_CAMERA_SENSITIVITY: CameraSensitivity = { rotate: 100, tilt: 100, zoom: 100, pan: 100 };

export interface MiscSettings {
  panelRatio: number | null;
  /** Side panel folded away (kept across reloads, e.g. on the wall tablet). */
  panelCollapsed?: boolean;
  language: LanguageCode;
  /** Changed defaults already applied to this browser (see applyDefaultChanges). */
  defaultsVersion?: number;
}

/* ── Root interface ── */

export interface AppSettings {
  connection: ConnectionSettings;
  appearance: AppearanceSettings;
  render: RenderSettings;
  environment: EnvironmentSettings;
  controls: ControlsSettings;
  misc: MiscSettings;
}

/* ── Section type (for getSetting / updateSettings) ── */

export type SettingsSection = keyof AppSettings;

const STORAGE_KEY = 'settings';

function getDefaultLanguage(): LanguageCode {
  if (typeof navigator === 'undefined') return 'de-DE';
  return navigator.language.toLowerCase().startsWith('de') ? 'de-DE' : 'en-GB';
}

const DEFAULT_SETTINGS: AppSettings = {
  connection: {
    mode: 'live',
    haSettings: { url: '', port: 8123, token: '' },
  },
  appearance: {
    theme: 'dark',
    bgColor: '',
    primaryAccent: '',
    statusAccent: '',
    panelOpacity: 100,
    panelDots: false,
    panelBgColor: '',
    backdropObscure: true,
    backdropBlur: true,
    hudVisible: true,
    kioskMode: 'auto',
    borderStyle: 'subtle',
    cornerRadius: 'soft',
  },
  render: {
    edgeMode: 'enhanced',
    edgeWidth: 3,
    groundGrid: false,
    perspective: true,
    sunShadowRes: 512,
    pointShadowRes: 256,
    showTextures: true,
    sketchColor: '#ffffff',
    sketchSpecular: 0.1,
    energyView: true,
  },
  environment: {
    sunLiveMode: true,
    weatherEnabled: true,
    parkMinBrightness: 0,
    wildlifeEnabled: false,
  },
  controls: {
    cameraControls: {
      desktop: { zoom: true, rotate: true, pan: true },
      mobile: { zoom: true, rotate: true, pan: true },
    },
    homeView: null,
  },
  misc: {
    panelRatio: null,
    language: getDefaultLanguage(),
    defaultsVersion: 1,
  },
};

/**
 * Changed defaults that also reach browsers which stored the old value (every
 * browser stores its whole settings). Each applies once; afterwards the choice
 * is the user's again.
 * 1: textured model instead of the sketch look.
 */
function applyDefaultChanges(parsed: Record<string, Record<string, unknown>>): boolean {
  const misc = (parsed.misc ??= {});
  const version = typeof misc.defaultsVersion === 'number' ? misc.defaultsVersion : 0;
  if (version >= 1) return false;
  (parsed.render ??= {}).showTextures = true;
  misc.defaultsVersion = 1;
  return true;
}

/** Migrate old flat localStorage structure into the new sectioned format. Runs once. */
function migrate(): void {
  const raw = localStorage.getItem(STORAGE_KEY);

  // Already migrated to sectioned format
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed.connection) { // already sectioned
        if (applyDefaultChanges(parsed)) localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
        return;
      }
      // Flat format → convert to sectioned
      migrateFlatToSectioned(parsed);
      return;
    } catch { /* fall through */ }
  }

  // Migrate from individual keys (oldest format)
  const partial: Record<string, unknown> = {};

  const demoMode = localStorage.getItem('demoMode');
  if (demoMode !== null) partial.mode = demoMode === 'true' ? 'demo' : 'live';

  const haSettings = localStorage.getItem('haSettings');
  if (haSettings) {
    try { partial.haSettings = JSON.parse(haSettings); } catch { /* ignore */ }
  }

  const theme = localStorage.getItem('theme');
  if (theme) partial.theme = theme;

  const edgeMode = localStorage.getItem('edgeMode');
  if (edgeMode) partial.edgeMode = edgeMode;

  const edgeWidth = localStorage.getItem('edgeWidth');
  if (edgeWidth !== null) partial.edgeWidth = parseFloat(edgeWidth);

  const groundGrid = localStorage.getItem('groundGrid');
  if (groundGrid !== null) partial.groundGrid = groundGrid === 'true';

  const weatherEnabled = localStorage.getItem('weatherEnabled');
  if (weatherEnabled !== null) partial.weatherEnabled = weatherEnabled !== 'false';

  const perspective = localStorage.getItem('perspective');
  if (perspective !== null) partial.perspective = perspective !== 'false';

  const cameraControls = localStorage.getItem('cameraControls');
  if (cameraControls) {
    try { partial.cameraControls = JSON.parse(cameraControls); } catch { /* ignore */ }
  }

  if (Object.keys(partial).length > 0) {
    migrateFlatToSectioned(partial);
    ['demoMode', 'haSettings', 'theme', 'edgeMode', 'edgeWidth',
     'groundGrid', 'weatherEnabled', 'perspective', 'cameraControls',
    ].forEach(k => localStorage.removeItem(k));
  }

  // Migrate panelRatio from standalone key
  const panelRatio = localStorage.getItem('panelRatio');
  if (panelRatio !== null) {
    const current = getSettings();
    current.misc.panelRatio = parseFloat(panelRatio);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
    localStorage.removeItem('panelRatio');
  }
}

/** Convert a flat settings object to the new sectioned format. */
function migrateFlatToSectioned(flat: Record<string, unknown>): void {
  const sectioned: AppSettings = structuredClone(DEFAULT_SETTINGS);

  // Connection
  if (flat.mode) sectioned.connection.mode = flat.mode as ConnectionSettings['mode'];
  if (flat.haSettings) sectioned.connection.haSettings = flat.haSettings as HASettings;

  // Appearance
  if (flat.theme) sectioned.appearance.theme = flat.theme as AppearanceSettings['theme'];
  if (flat.bgColor !== undefined) sectioned.appearance.bgColor = flat.bgColor as string;
  if (flat.primaryAccent !== undefined) sectioned.appearance.primaryAccent = flat.primaryAccent as string;
  if (flat.statusAccent !== undefined) sectioned.appearance.statusAccent = flat.statusAccent as string;
  if (flat.panelOpacity !== undefined) sectioned.appearance.panelOpacity = flat.panelOpacity as number;
  if (flat.panelDots !== undefined) sectioned.appearance.panelDots = flat.panelDots as boolean;
  if (flat.panelBgColor !== undefined) sectioned.appearance.panelBgColor = flat.panelBgColor as string;
  if (flat.backdropObscure !== undefined) sectioned.appearance.backdropObscure = flat.backdropObscure as boolean;
  if (flat.backdropBlur !== undefined) sectioned.appearance.backdropBlur = flat.backdropBlur as boolean;
  if (flat.hudVisible !== undefined) sectioned.appearance.hudVisible = flat.hudVisible as boolean;
  if (flat.borderStyle !== undefined) sectioned.appearance.borderStyle = flat.borderStyle as AppearanceSettings['borderStyle'];
  if (flat.cornerRadius !== undefined) sectioned.appearance.cornerRadius = flat.cornerRadius as AppearanceSettings['cornerRadius'];

  // Render
  if (flat.edgeMode) sectioned.render.edgeMode = flat.edgeMode as RenderSettings['edgeMode'];
  if (flat.edgeWidth !== undefined) sectioned.render.edgeWidth = flat.edgeWidth as number;
  if (flat.groundGrid !== undefined) sectioned.render.groundGrid = flat.groundGrid as boolean;
  if (flat.perspective !== undefined) sectioned.render.perspective = flat.perspective as boolean;

  // Environment
  if (flat.sunLiveMode !== undefined) sectioned.environment.sunLiveMode = flat.sunLiveMode as boolean;
  if (flat.weatherEnabled !== undefined) sectioned.environment.weatherEnabled = flat.weatherEnabled as boolean;

  // Controls
  if (flat.cameraControls) sectioned.controls.cameraControls = flat.cameraControls as ControlsSettings['cameraControls'];

  localStorage.setItem(STORAGE_KEY, JSON.stringify(sectioned));
}

// Run migration on module load
migrate();

/**
 * In-memory settings override used by simulation mode.
 * When set, getSettings() returns this instead of reading localStorage.
 */
let simulationSettingsOverride: AppSettings | null = null;

/** Set (or clear) the in-memory simulation settings. */
export function setSimulationSettingsOverride(s: AppSettings | null): void {
  simulationSettingsOverride = s ? structuredClone(s) : null;
}

/** Read all settings from localStorage (or from the simulation override). */
export function getSettings(): AppSettings {
  if (simulationSettingsOverride) return structuredClone(simulationSettingsOverride);

  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return structuredClone(DEFAULT_SETTINGS);
  try {
    const parsed = JSON.parse(raw);
    return {
      connection: { ...DEFAULT_SETTINGS.connection, ...parsed.connection },
      appearance: { ...DEFAULT_SETTINGS.appearance, ...parsed.appearance },
      render: { ...DEFAULT_SETTINGS.render, ...parsed.render },
      environment: { ...DEFAULT_SETTINGS.environment, ...parsed.environment },
      controls: { ...DEFAULT_SETTINGS.controls, ...parsed.controls },
      misc: { ...DEFAULT_SETTINGS.misc, ...parsed.misc },
    };
  } catch {
    return structuredClone(DEFAULT_SETTINGS);
  }
}

/** Get a single section's settings. */
export function getSetting<K extends SettingsSection>(section: K): AppSettings[K] {
  return getSettings()[section];
}

/** Update one or more keys within a specific section. */
export function updateSettings<K extends SettingsSection>(
  section: K,
  patch: Partial<AppSettings[K]>,
): void {
  if (isSimulationActive()) {
    // Update the in-memory override so the UI reacts, but never persist
    if (simulationSettingsOverride) {
      simulationSettingsOverride[section] = { ...simulationSettingsOverride[section], ...patch };
    }
    return;
  }
  const current = getSettings();
  current[section] = { ...current[section], ...patch };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
}

/** Replace all settings at once (used by backup import). */
export function setAllSettings(settings: AppSettings): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

/** Clear all settings (used on reset). */
export function clearSettings(): void {
  localStorage.removeItem(STORAGE_KEY);
}
