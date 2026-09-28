import JSZip from 'jszip';
import { collectFloorplanBindings, exportFloorplanBindings, importFloorplanBindings, mergeFloorplan, readFloorplanManifest } from './floorplanImport';
import type { AppConfig, BlindConfig, DisplayConfig, LightConfig, LightGroup, ModelConfig, RoomConfig, ShadowWallConfig, SidePanelConfig, SmartDeviceConfig, TubeConfig } from '../types';
import {
  saveModel as dbSaveModel,
  getModel as dbGetModel,
  deleteModel as dbDeleteModel,
  saveObjectAsset as dbSaveObjectAsset,
  getObjectAsset as dbGetObjectAsset,
  deleteObjectAsset as dbDeleteObjectAsset,
  deleteObjectAssets as dbDeleteObjectAssets,
} from './storageApi';
import { getSettings, setAllSettings, type AppSettings } from './settingsStore';
import { isSimulationActive } from '../contexts/SimulationModeContext';
import { systemLocationWithNorthOffset } from '../constants/location';

const CONFIG_KEY = 'config';

const DEFAULT_CONFIG: AppConfig = {
  location: systemLocationWithNorthOffset(),
  lights: [],
  model: { scale: 1, objectOverrides: [] },
  onboarding: { completed: false },
};

function normalizeConfig(config: Partial<AppConfig>): AppConfig {
  return {
    ...DEFAULT_CONFIG,
    ...config,
    floorplanBindings: collectFloorplanBindings(config as AppConfig),
    location: systemLocationWithNorthOffset(config.location?.northOffset),
    lights: config.lights ?? [],
    smartDevices: config.smartDevices ?? [],
    rooms: config.rooms ?? [],
    model: {
      floorplan: config.model?.floorplan,
      scale: config.model?.scale ?? 1,
      objectOverrides: config.model?.objectOverrides ?? [],
      importedObjects: config.model?.importedObjects ?? [],
    },
  };
}

/** Returns true if a config has been saved to localStorage. */
export function hasConfig(): boolean {
  return localStorage.getItem(CONFIG_KEY) !== null;
}

/**
 * In-memory config override used by simulation mode.
 */
let simulationConfigOverride: AppConfig | null = null;

/** Set (or clear) the in-memory simulation config. */
export function setSimulationConfigOverride(c: AppConfig | null): void {
  simulationConfigOverride = c ? structuredClone(c) : null;
}

/** Read config from localStorage (or from the simulation override). */
export function getConfig(): AppConfig {
  if (simulationConfigOverride) return normalizeConfig(simulationConfigOverride);

  const raw = localStorage.getItem(CONFIG_KEY);
  if (!raw) return normalizeConfig(DEFAULT_CONFIG);
  try {
    return normalizeConfig(JSON.parse(raw) as AppConfig);
  } catch {
    return normalizeConfig(DEFAULT_CONFIG);
  }
}

/** Merge partial updates into the stored config and persist. */
export function updateConfig(data: {
  floorplanBindings?: AppConfig['floorplanBindings'];
  lights?: LightConfig[];
  blinds?: BlindConfig[];
  lightGroups?: LightGroup[];
  model?: ModelConfig;
  displays?: DisplayConfig[];
  shadowWalls?: ShadowWallConfig[];
  smartDevices?: SmartDeviceConfig[];
  rooms?: RoomConfig[];
  location?: { latitude: number; longitude: number; northOffset?: number };
  sidePanel?: SidePanelConfig;
  tubes?: TubeConfig[];
  onboarding?: { completed: boolean };
}): void {
  if (isSimulationActive()) {
    // Update in-memory override so the UI reacts, but never persist
    if (simulationConfigOverride) {
      Object.assign(simulationConfigOverride, data);
    }
    return;
  }
  const current = getConfig();
  const merged = { ...current, ...data };
  merged.floorplanBindings = collectFloorplanBindings(merged);
  localStorage.setItem(CONFIG_KEY, JSON.stringify(merged));
}

/** Store a GLB model in IndexedDB. Accepts Blob so a failed replacement can be rolled back. */
export async function uploadModel(model: Blob, importEntities = true): Promise<void> {
  const manifest = await readFloorplanManifest(model);
  const previous = getConfig();
  const next = importEntities ? mergeFloorplan(previous, manifest) : previous;
  const previousBlob = await dbGetModel();
  await dbSaveModel(model);
  try {
    if (importEntities) updateConfig(next);
  } catch (error) {
    if (previousBlob) await dbSaveModel(previousBlob);
    else await dbDeleteModel();
    throw error;
  }
}

/** Get the GLB model blob from IndexedDB. */
export async function getModelBlob(): Promise<Blob | null> {
  return dbGetModel();
}

export async function restoreModel(model: Blob | null, config: AppConfig): Promise<void> {
  if (model) await dbSaveModel(model);
  else await dbDeleteModel();
  updateConfig(config);
}

export async function uploadModelObject(id: string, file: File): Promise<void> {
  await dbSaveObjectAsset(id, file);
}

export async function getModelObjectBlob(id: string): Promise<Blob | null> {
  return dbGetObjectAsset(id);
}

export async function deleteModelObjectAsset(id: string): Promise<void> {
  await dbDeleteObjectAsset(id);
}

/** Remove config from localStorage and model from IndexedDB. */
export async function resetConfig(): Promise<void> {
  const config = getConfig();
  localStorage.removeItem(CONFIG_KEY);
  await dbDeleteModel();
  await dbDeleteObjectAssets(config.model?.importedObjects?.map((obj) => obj.id) ?? []);
}

/** Export config + settings + model as a downloadable ZIP. */
export async function exportBackup(): Promise<void> {
  const zip = new JSZip();

  // Config
  const config = getConfig();
  zip.file('config.json', JSON.stringify(config, null, 2));
  zip.file('floorplan-bindings.json', exportFloorplanBindings(config));

  // Settings (includes HA settings, theme, camera controls, etc.)
  const settings = getSettings();
  zip.file('settings.json', JSON.stringify(settings, null, 2));

  // Model from IndexedDB
  const modelBlob = await dbGetModel();
  if (modelBlob) {
    zip.file('apartment.glb', modelBlob);
  }

  for (const object of config.model?.importedObjects ?? []) {
    const objectBlob = await dbGetObjectAsset(object.id);
    if (objectBlob) {
      zip.file(`objects/${object.id}.${object.format}`, objectBlob);
    }
  }

  const blob = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `appart3d-backup-${new Date().toISOString().slice(0, 10)}.zip`;
  a.click();
  URL.revokeObjectURL(url);
}

/** Import a ZIP backup. Preserves existing HA token. Returns whether a model was included. */
export async function importBackup(file: File): Promise<{ ok: boolean; hasModel: boolean; hasSettings: boolean }> {
  const zip = await JSZip.loadAsync(file);

  // Config
  const configFile = zip.file('config.json');
  if (!configFile) throw new Error('No config.json found in backup');
  const configJson = await configFile.async('string');
  let importedConfig = normalizeConfig(JSON.parse(configJson) as AppConfig);
  const bindingsFile = zip.file('floorplan-bindings.json');
  if (bindingsFile) importedConfig = importFloorplanBindings(importedConfig, JSON.parse(await bindingsFile.async('string')));

  localStorage.setItem(CONFIG_KEY, JSON.stringify(importedConfig));

  // Settings (if present in backup)
  let hasSettings = false;
  const settingsFile = zip.file('settings.json');
  if (settingsFile) {
    hasSettings = true;
    const settingsJson = await settingsFile.async('string');
    const importedSettings = JSON.parse(settingsJson) as AppSettings;
    // Preserve existing HA token (the export strips it for security)
    const currentSettings = getSettings();
    if (!importedSettings.connection?.haSettings?.token && currentSettings.connection.haSettings.token) {
      importedSettings.connection = {
        ...importedSettings.connection,
        haSettings: {
          ...importedSettings.connection.haSettings,
          token: currentSettings.connection.haSettings.token,
        },
      };
    }
    setAllSettings(importedSettings);
  }

  // Model
  const modelFile = zip.file('apartment.glb');
  let hasModel = false;
  if (modelFile) {
    const modelBlob = await modelFile.async('blob');
    await dbSaveModel(modelBlob);
    hasModel = true;
  }

  for (const object of importedConfig.model?.importedObjects ?? []) {
    const objectFile = zip.file(`objects/${object.id}.${object.format}`);
    if (!objectFile) continue;
    const objectBlob = await objectFile.async('blob');
    await dbSaveObjectAsset(object.id, objectBlob);
  }

  return { ok: true, hasModel, hasSettings };
}
