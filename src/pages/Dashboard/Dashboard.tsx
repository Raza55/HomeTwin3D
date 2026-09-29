import { configureMarkerOcclusion } from '../../babylon/MarkerOcclusion';
import CoffeeMarkers from '../../components/CoffeeMarkers';
import ITMarkers from '../../components/ITMarkers';
import ITVisuals from '../../components/ITVisuals';
import TVDialControl from '../../components/TVDialControl';
import { itEntityIds } from '../../services/itState';
import EchoMarkers from '../../components/EchoMarkers';
import FanMarkers from '../../components/FanMarkers';
import WaterLeakMarkers from '../../components/WaterLeakMarkers';
import BatteryWarningMarkers from '../../components/BatteryWarningMarkers';
import { isBatteryState } from '../../services/batteryWarning';
import { isWaterLeakEntity } from '../../services/waterLeak';
import { displayStateDependencies } from '../../services/tvMedia';
import { createLivingRoomTVDisplay } from '../../babylon/LivingRoomTVDisplay';
import { hueSyncDisplayState, isHueSyncLocked, isHueSyncControl, HUE_SYNC_SWITCH } from '../../services/hueSync';
import ApplianceMarkers from '../../components/ApplianceMarkers';
import DoorStatus from '../../components/DoorStatus';
import DoorMarkers from '../../components/DoorMarkers';
import { lazy, Suspense, useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Crosshair, Footprints, Move3d, Orbit, Image as ImageIcon, ImageOff } from 'lucide-react';
import { WalkthroughCamera, nextNavigationMode, type NavigationMode } from '../../babylon/WalkthroughCamera';
import { Animation, Camera, Color3, Color4, CubicEase, EasingFunction, ShadowGenerator, Tools, Vector3, type AbstractMesh, type IPointerEvent, type Mesh, type PickingInfo, type Observer, type Scene, type TransformNode } from '@babylonjs/core';
import { createParkEnvironment } from '../../babylon/ParkEnvironment';
import { findFrontFacade } from '../../babylon/SiteLayout';
import { CAMERA_CONTROL_SENSITIVITY, createScene, createSceneAsync, prefersWebGPU, setupSunShadows, type SceneContext } from '../../babylon/SceneManager';
import { batchStaticRendering } from '../../babylon/RenderBatch';
import { setupGlowOccluders } from '../../babylon/GlowOccluder';
import { invalidateShadowsNear } from '../../babylon/ShadowRange';
import { batchStaticSunShadows } from '../../babylon/ShadowCasterBatch';
import { loadModel, createShadowWalls, setTexturesEnabled, setSketchAppearance } from '../../babylon/ModelLoader';
import { disposeImportedObject, loadImportedObject, type ImportedObjectLoadResult } from '../../babylon/ImportedObjectLoader';
import { createEdgeOutline, type EdgeOutlineControls } from '../../babylon/EdgeOutline';
import {
  createLightMesh,
  removeLightMesh,
  freezePointLightShadows,
  setLightTouchZoneHovered,
  updateLightInteractionVisual,
  type MeshMap,
  type StripConfig,
} from '../../babylon/LightMeshFactory';
import {
  createDisplayMesh,
  removeDisplayMesh,
  updateDisplayTexture,
  resolveDisplayAnimation,
  setDisplayAnimation,
  type DisplayMeshMap,
} from '../../babylon/DisplayMeshFactory';
import {
  createBlindMesh,
  removeBlindMesh,
  updateBlindState,
  type BlindMeshMap,
} from '../../babylon/BlindMeshFactory';
import { createSmartDeviceMesh, removeSmartDeviceMesh, updateSmartDeviceState, type SmartDeviceMeshMap } from '../../babylon/SmartDeviceMeshFactory';
import { getConfig, updateConfig, getModelBlob, getModelObjectBlob } from '../../services/configApi';
import { bindFloorplanMeshes } from '../../babylon/FloorplanBindings';
import { applyFloorplanLightState, configureFloorplanShadows, configureFloorplanLightInfluence, createLightVariantPrewarmer, createShadowMapPrewarmer, enableClusteredFloorplanLights, invalidateFloorplanShadows, prewarmFloorplanShadowShaders } from '../../babylon/FloorplanLighting';
import { getEntityCache, setEntityCache } from '../../services/entityCache';
import type { HAEntityOption } from '../../components/EntityPicker';
import { getSetting, updateSettings, type HomeViewPose } from '../../services/settingsStore';
import { HAConnection, type HAConnectionStatus, type HALike, setActiveHAConnection } from '../../services/haWebSocket';
import { DemoHAConnection } from '../../services/demoHAConnection';
import { useDemoMode } from '../../contexts/DemoModeContext';
import { useSimulationMode } from '../../contexts/SimulationModeContext';
import { useCameraControls } from '../../contexts/CameraControlsContext';
import { useTheme } from '../../contexts/ThemeContext';
import { useTranslation } from '../../contexts/LanguageContext';
import { miredToKelvin, kelvinToRGB } from '../../utils/color';
import { updateSunPosition, minutesToLabel } from '../../babylon/SunController';
import { createWeatherEffects, type WeatherEffectsContext } from '../../babylon/WeatherEffects';
import { fetchWeather, type WeatherData } from '../../services/weatherApi';
import { showGroundGrid, hideGroundGrid, syncGridColors, disposeGroundGrid, createModelShadow } from '../../babylon/GroundGrid';
import { createTubeMeshes, updateTubeEntryValue, disposeAllTubes, setTubeTheme, type TubeMap } from '../../babylon/TubeMeshFactory';
import { createSceneScaleRoot, getModelScale } from '../../babylon/SceneScale';
import { SYSTEM_LOCATION, systemLocationWithNorthOffset } from '../../constants/location';
import HUD from '../../components/HUD';
import LightModal from '../../components/LightModal';
import LightQuickControls from '../../components/LightQuickControls';
import LightClusterControls from '../../components/LightClusterControls';
import LightClusterMarkers from '../../components/LightClusterMarkers';
import { quickLightCluster, lightMappingTargets, isEnsis } from '../../services/lightClusters';
import RemoteModal from '../../components/RemoteModal';
import BlindModal from '../../components/BlindQuickControls';
import BlindMarkers from '../../components/BlindMarkers';
import DisplayModal from '../../components/DisplayModal';
import DebugPanel from '../../components/DebugPanel';
import SidePanel from '../../components/SidePanel/SidePanel';
import { dashboardTourSteps } from '../../components/GuidedTour/tourSteps';
import { SIMULATION_CONFIG, SIMULATION_MODEL_URL } from '../../data/simulationData';
import type { AppConfig, DisplayConfig, LightConfig, RemoteButton, HAState, LightSceneOption, CardLayout, SidePanelCard } from '../../types';
import './Dashboard.css';

// Rarely used dialogs load on demand to keep the dashboard chunk small.
const VisualMatchingGuide = lazy(() => import('../../components/VisualMatchingGuide'));
const SettingsModal = lazy(() => import('../../components/SettingsModal'));
const GuidedTour = lazy(() => import('../../components/GuidedTour/GuidedTour'));
const CardPropertiesPanel = lazy(() => import('../../components/SidePanel/CardPropertiesPanel'));

const LONG_PRESS_MS = 500;
const LIGHT_INTENSITY_BASE = 0.8;
const MIN_ON_LIGHT_FACTOR = 0.08;
const MIN_ON_BULB_GLOW = 0.22;

function sceneLabelFromState(state: HAState): string {
  const friendly = state.attributes.friendly_name;
  if (friendly) return friendly;
  return state.entity_id.replace(/^scene\./, '').replace(/_/g, ' ');
}

function buildSceneOptions(states: Iterable<HAState>): LightSceneOption[] {
  return Array.from(states)
    .filter((state) => state.entity_id.startsWith('scene.'))
    .map((state) => ({
      entityId: state.entity_id,
      label: sceneLabelFromState(state),
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

function hsToColor3(hue: number, saturation: number): Color3 {
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
  return new Color3(r + m, g + m, b + m);
}

/** Every entity id string anywhere in the configuration (lights, displays, tubes, floorplan bindings...). */
function collectEntityIds(config: AppConfig | null): Set<string> {
  const ids = new Set<string>();
  const visit = (value: unknown): void => {
    if (typeof value === 'string') { if (/^[a-z_]+\.[a-z0-9_]+$/.test(value)) ids.add(value); }
    else if (Array.isArray(value)) value.forEach(visit);
    else if (value && typeof value === 'object') Object.values(value).forEach(visit);
  };
  visit(config);
  return ids;
}

export default function Dashboard() {
  const { demoMode } = useDemoMode();
  const { simulationMode, setSimulationMode } = useSimulationMode();
  const camControls = useCameraControls();
  const { resolved: theme, updateAutoTheme } = useTheme();
  const t = useTranslation();
  const navigate = useNavigate();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneCtxRef = useRef<SceneContext | null>(null);
  const meshMapRef = useRef<MeshMap>({});
  const blindMeshMapRef = useRef<BlindMeshMap>({});
  const smartDeviceMeshMapRef = useRef<SmartDeviceMeshMap>({});
  const displayMeshMapRef = useRef<DisplayMeshMap>({});
  const tubeMapRef = useRef<TubeMap>({});
  const panelEntityIdsRef = useRef<Set<string>>(new Set());
  /** Entities referenced by the 3D configuration; only their events need a new frame. */
  const sceneEntityIdsRef = useRef<Set<string>>(new Set());
  const displayIdsByEntityRef = useRef<Map<string, string[]>>(new Map());
  const tubeIdsBySensorRef = useRef<Map<string, string[]>>(new Map());
  const entityScaleRootRef = useRef<TransformNode | null>(null);
  const haRef = useRef<HALike | null>(null);
  const configRef = useRef<AppConfig | null>(null);
  const lastStatesRef = useRef<Record<string, HAState>>({});
  const pendingRef = useRef<Map<string, {
    observer: Observer<Scene>;
    meshes: Mesh[];
    state: { error: boolean };
    timer?: ReturnType<typeof setTimeout>;
  }>>(new Map());
  const [sceneReady, setSceneReady] = useState(false);
  const [matchingOpen, setMatchingOpen] = useState(false);
  const [matchingCategory,setMatchingCategory] = useState<'light'|'other'>('light');
  const [matchingObjectIds,setMatchingObjectIds] = useState<string[] | undefined>();
  const [matchingObjectId,setMatchingObjectId] = useState<string | undefined>();
  const matchingRef = useRef(false); matchingRef.current = matchingOpen;
  const matchingChanged = useRef(false);

  const [lightsOnCount, setLightsOnCount] = useState(0);
  const [coffeeOpen, setCoffeeOpen] = useState<string | null>(null);
  const [itOpen, setITOpen] = useState<string | null>(null);
  const [echoOpen, setEchoOpen] = useState<string | null>(null);
  const [fanOpen, setFanOpen] = useState<string | null>(null);
  const [haStatus, setHaStatus] = useState<HAConnectionStatus>('disconnected');
  const [haSettingsVersion, setHaSettingsVersion] = useState(0);
  const [modelStatus, setModelStatus] = useState('loading');
  const [modelStatusColor, setModelStatusColor] = useState<string | undefined>(undefined);
  const [modelReloadVersion, setModelReloadVersion] = useState(0);

  const handleReloadModel = useCallback(() => {
    setSceneReady(false);
    setModelStatus('loading');
    setModelStatusColor('var(--yellow)');
    setModelReloadVersion((version) => version + 1);
  }, []);

  const [modalVisible, setModalVisible] = useState(false);
  const [modalEntityId, setModalEntityId] = useState<string | null>(null);
  const [quickLight, setQuickLight] = useState<{ entityId: string; x: number; y: number; pinned: boolean } | null>(null);
  const [, refreshQuickStates] = useState(0);
  const quickMembers = quickLight ? quickLightCluster(configRef.current?.lights ?? [], quickLight.entityId) : [];
  const quickRef = useRef(quickLight); quickRef.current = quickLight;
  const quickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelQuickTimer = useCallback(() => { if (quickTimer.current) clearTimeout(quickTimer.current); quickTimer.current = null; }, []);
  const closeQuick = useCallback(() => { cancelQuickTimer(); setQuickLight(null); }, [cancelQuickTimer]);
  const quickMappingIds = lightMappingTargets(configRef.current?.model?.floorplan?.objects ?? [], quickMembers);
  const editQuickMapping = quickMappingIds.length ? () => {
    closeQuick(); setMatchingCategory('light'); setMatchingObjectId(undefined);
    setMatchingObjectIds(quickMappingIds); setMatchingOpen(true);
  } : undefined;

  const leaveQuick = useCallback(() => { cancelQuickTimer(); quickTimer.current = setTimeout(() => { if (!quickRef.current?.pinned) setQuickLight(null); }, 320); }, [cancelQuickTimer]);
  const showQuick = useCallback((entityId: string, x: number, y: number, pinned: boolean) => {
    if (matchingRef.current || !configRef.current?.lights.some(l => l.entityId === entityId)) return;
    if (!pinned && quickRef.current?.pinned) return;
    cancelQuickTimer();
    const show = () => {
      setModalEntityId(entityId); setModalState(lastStatesRef.current[entityId] ?? null);
      setQuickLight({ entityId, x, y, pinned });
    };
    if (pinned) show(); else quickTimer.current = setTimeout(show, 220);
  }, [cancelQuickTimer]);
  useEffect(() => () => cancelQuickTimer(), [cancelQuickTimer]);

  const [modalLabel, setModalLabel] = useState('');
  const [modalState, setModalState] = useState<HAState | null>(null);
  const [modalDoubleTapEntityId, setModalDoubleTapEntityId] = useState<string | undefined>();
  const [modalDoubleTapState, setModalDoubleTapState] = useState<HAState | null>(null);
  const [lightSceneOptions, setLightSceneOptions] = useState<LightSceneOption[]>([]);

  const [remoteModalVisible, setRemoteModalVisible] = useState(false);
  const [remoteModalEntityId, setRemoteModalEntityId] = useState<string | null>(null);
  const [remoteModalLabel, setRemoteModalLabel] = useState('');
  const [remoteModalButtons, setRemoteModalButtons] = useState<RemoteButton[]>([]);
  const [remoteModalState, setRemoteModalState] = useState<HAState | null>(null);

  const [blindAnchor, setBlindAnchor] = useState<{x:number;y:number}|null>(null);
  const [blindModalVisible, setBlindModalVisible] = useState(false);
  const [blindModalEntityId, setBlindModalEntityId] = useState<string | null>(null);
  const [blindModalLabel, setBlindModalLabel] = useState('');
  const [blindModalState, setBlindModalState] = useState<HAState | null>(null);

  const [displayModalVisible, setDisplayModalVisible] = useState(false);
  const [displayModalConfig, setDisplayModalConfig] = useState<DisplayConfig | null>(null);
  const [displayModalStates, setDisplayModalStates] = useState<Record<string, HAState>>({});

  const [defaultTarget, setDefaultTarget] = useState<{ x: number; y: number; z: number } | null>(null);
  const modelSizeRef = useRef<{ x: number; z: number } | null>(null);
  const walkthroughRef = useRef<WalkthroughCamera | null>(null);
  const walkthroughBoundsRef = useRef<{ center: Vector3; size: Vector3; scale: number } | null>(null);
  const [navigationMode, setNavigationMode] = useState<NavigationMode>('normal');
  const changeNavigationMode = useCallback((mode: NavigationMode) => {
    if (!walkthroughRef.current) return;
    homingRef.current = false;
    walkthroughRef.current.setMode(mode);
    setNavigationMode(mode);
    closeQuick();
  }, [closeQuick]);
  const modelDiagonalRef = useRef(1);
  const [debugOpen, setDebugOpen] = useState(false);
  const [homeViewSetting, setHomeViewSetting] = useState(false);
  const [panelSize, setPanelSize] = useState(() => {
    const mobile = window.matchMedia('(max-width: 768px)').matches;
    const saved = getSetting('misc').panelRatio;
    if (saved !== null) {
      return mobile ? window.innerHeight * saved : window.innerWidth * saved;
    }
    return mobile ? 280 : 350;
  });

  const handlePanelResize = useCallback((size: number) => {
    setPanelSize(size);
    const mobile = window.matchMedia('(max-width: 768px)').matches;
    const ratio = mobile ? size / window.innerHeight : size / window.innerWidth;
    updateSettings('misc', { panelRatio: ratio });
  }, []);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [cardStates, setCardStates] = useState<Record<string, HAState>>({});
  const [gridEditMode, setGridEditMode] = useState(false);
  const [panelCollapsed,setPanelCollapsed]=useState(false);
  const [cardPanelOpen, setCardPanelOpen] = useState(false);
  const [editingCard, setEditingCard] = useState<SidePanelCard | null>(null);
  // Snapshot the entity list when the card panel opens — keeps a stable ref for EntityPicker memoization.
  const cardPanelEntities = useMemo<HAEntityOption[]>(
    () => (cardPanelOpen ? getEntityCache() : []),
    [cardPanelOpen],
  );
  const [sidePanelConfig, setSidePanelConfig] = useState<import('../../types').SidePanelConfig | undefined>(undefined);
  const [settingsMounted, setSettingsMounted] = useState(false);
  useEffect(() => { if (settingsOpen) setSettingsMounted(true); }, [settingsOpen]);
  const [showTour, setShowTour] = useState(
    () => localStorage.getItem('showTour') === 'true',
  );

  // Entities shown by floorplan status/Echo/IT/coffee markers, rebuilt only when the object list changes.
  const floorplanMarkerIdsRef = useRef<{ objects?: unknown; ids: Set<string> }>({ ids: new Set() });
  const floorplanMarkerEntityIds = () => {
    const objects = configRef.current?.model?.floorplan?.objects;
    const cache = floorplanMarkerIdsRef.current;
    if (cache.objects === objects) return cache.ids;
    const ids = new Set<string>();
    for (const o of objects ?? []) {
      if ((o.statusIndicator || o.echo) && o.entityId) ids.add(o.entityId);
      if (o.it) itEntityIds(o.it).forEach(id => ids.add(id));
      if (o.coffee) {
        if (o.entityId) ids.add(o.entityId);
        Object.values(o.coffee).forEach(id => { if (typeof id === 'string') ids.add(id); });
      }
    }
    floorplanMarkerIdsRef.current = { objects, ids };
    return ids;
  };

  const rebuildEntityIndexes = useCallback((config: AppConfig | null) => {
    const panelEntityIds = new Set<string>();
    const displayIdsByEntity = new Map<string, string[]>();
    const tubeIdsBySensor = new Map<string, string[]>();

    const addToIndex = (map: Map<string, string[]>, entityId: string, id: string) => {
      const ids = map.get(entityId);
      if (ids) ids.push(id);
      else map.set(entityId, [id]);
    };

    for (const card of config?.sidePanel?.cards ?? []) {
      panelEntityIds.add(card.entityId);
      if (card.type === 'indicator' && card.climateEntityId) {
        panelEntityIds.add(card.climateEntityId);
      }
    }

    for (const display of [...(config?.displays ?? []), ...Object.values(displayMeshMapRef.current).map(e=>e.config)]) {
      for (const entityId of displayStateDependencies(display)) {
        if (displayIdsByEntity.get(entityId)?.includes(display.id)) continue;
        addToIndex(displayIdsByEntity, entityId, display.id);
      }
    }

    for (const tube of config?.tubes ?? []) {
      for (const line of tube.lines) {
        addToIndex(tubeIdsBySensor, line.sensorId, tube.id);
      }
    }

    panelEntityIdsRef.current = panelEntityIds;
    sceneEntityIdsRef.current = collectEntityIds(config);
    displayIdsByEntityRef.current = displayIdsByEntity;
    tubeIdsBySensorRef.current = tubeIdsBySensor;
  }, []);

  useEffect(() => {
    if (showTour) localStorage.removeItem('showTour');
  }, [showTour]);
  const modelMeshesRef = useRef<AbstractMesh[]>([]);
  const shadowCastersRef = useRef<AbstractMesh[]>([]);
  const importedObjectResultsRef = useRef<Record<string, ImportedObjectLoadResult>>({});
  const edgeOutlineRef = useRef<EdgeOutlineControls | null>(null);
  const weatherRef = useRef<WeatherEffectsContext | null>(null);
  const pollWeatherRef = useRef<() => void>(() => {});
  const cloudCoverFactorRef = useRef(1);
  const [cloudCoverFactor, setCloudCoverFactor] = useState(1);
  const [currentWeather, setCurrentWeather] = useState<WeatherData | null>(null);

  // Sun / edge state (lifted here so both HUD and SettingsModal can use it)
  const [sunLiveMode, setSunLiveMode] = useState(true);
  const [sliderValue, setSliderValue] = useState(720);
  const [scrubberTime, setScrubberTime] = useState('12:00');
  const [edgeWidth, setEdgeWidth] = useState(() => getSetting('render').edgeWidth);
  const [edgeMode, setEdgeMode] = useState<'classic' | 'enhanced'>(() => getSetting('render').edgeMode);
  const [northOffset, setNorthOffset] = useState(0);
  const [groundGrid, setGroundGrid] = useState(() => getSetting('render').groundGrid);
  const [weatherEnabled, setWeatherEnabled] = useState(() => getSetting('environment').weatherEnabled);
  const weatherEnabledRef = useRef(weatherEnabled);
  weatherEnabledRef.current = weatherEnabled;
  const [perspective, setPerspective] = useState(() => getSetting('render').perspective);
  const [sunShadowRes, setSunShadowRes] = useState(() => getSetting('render').sunShadowRes);
  const [pointShadowRes, setPointShadowRes] = useState(() => getSetting('render').pointShadowRes);
  const [showTextures, setShowTextures] = useState(() => getSetting('render').showTextures);
  const [sketchColor, setSketchColor] = useState(() => getSetting('render').sketchColor);
  const [sketchSpecular, setSketchSpecular] = useState(() => getSetting('render').sketchSpecular);

  // Sync 3D background with theme (respects custom bgColor)
  const syncSceneBg = useCallback(() => {
    const scene = sceneCtxRef.current?.scene;
    if (!scene) return;
    const customBg = getSetting('appearance').bgColor;
    if (customBg) {
      const n = parseInt(customBg.replace('#', ''), 16);
      scene.clearColor = new Color4(
        ((n >> 16) & 255) / 255,
        ((n >> 8) & 255) / 255,
        (n & 255) / 255,
        1,
      );
    } else {
      scene.clearColor = theme === 'light'
        ? new Color4(0.94, 0.95, 0.96, 1)
        : new Color4(0.04, 0.055, 0.1, 1);
    }
  }, [theme]);

  useEffect(() => {
    syncSceneBg();
    setTubeTheme(tubeMapRef.current, theme);
  }, [theme, sceneReady, syncSceneBg]);

  // Listen for real-time appearance changes (e.g. bgColor picker)
  useEffect(() => {
    const handler = () => syncSceneBg();
    window.addEventListener('appearance-changed', handler);
    return () => window.removeEventListener('appearance-changed', handler);
  }, [syncSceneBg]);

  // Sync ground grid colors when theme changes
  useEffect(() => {
    const scene = sceneCtxRef.current?.scene;
    if (!scene || !groundGrid) return;
    syncGridColors(scene);
  }, [theme, sceneReady, groundGrid]);

  // Show/hide ground grid
  const handleGroundGridChange = useCallback((enabled: boolean) => {
    setGroundGrid(enabled);
    updateSettings('render', { groundGrid: enabled });
    const scene = sceneCtxRef.current?.scene;
    if (!scene) return;
    if (enabled) showGroundGrid(scene);
    else hideGroundGrid();
  }, []);

  const handleWeatherEnabledChange = useCallback((enabled: boolean) => {
    setWeatherEnabled(enabled);
    weatherEnabledRef.current = enabled;
    updateSettings('environment', { weatherEnabled: enabled });
    if (enabled) {
      // Immediately fetch and apply weather
      pollWeatherRef.current();
    } else {
      // Stop particles and reset cloud cover
      weatherRef.current?.updateWeather(
        { weather_code: 0, cloud_cover: 0, rain: 0, snowfall: 0 },
      );
      cloudCoverFactorRef.current = 1;
      setCloudCoverFactor(1);
      // Re-apply sun without cloud dimming
      const ctx = sceneCtxRef.current;
      if (ctx?.sunLight && ctx?.hemiLight) {
        const mins = sunLiveMode ? undefined : sliderValue;
        updateSunPosition(ctx.sunLight, ctx.hemiLight, (configRef.current?.location.latitude ?? SYSTEM_LOCATION.latitude), (configRef.current?.location.longitude ?? SYSTEM_LOCATION.longitude), mins, northOffsetRef.current, 1);
      }
    }
  }, [sunLiveMode, sliderValue]);

  // Toggle perspective / orthographic camera mode
  const handlePerspectiveChange = useCallback((enabled: boolean) => {
    setPerspective(enabled);
    updateSettings('render', { perspective: enabled });
  }, []);

  const handleSunShadowResChange = useCallback((res: number) => {
    setSunShadowRes(res);
    updateSettings('render', { sunShadowRes: res });
    const ctx = sceneCtxRef.current;
    const casters = shadowCastersRef.current;
    if (!ctx || !casters) return;
    const oldSg = ctx.sunLight.getShadowGenerator();
    if (oldSg) oldSg.dispose();
    if (res === 0) return;
    const sg = new ShadowGenerator(res, ctx.sunLight);
    sg.usePercentageCloserFiltering = true;
    sg.filteringQuality = ShadowGenerator.QUALITY_MEDIUM;
    sg.bias = 0.001;
    sg.normalBias = 0.02;
    for (const mesh of casters) sg.addShadowCaster(mesh, false);
    batchStaticSunShadows(sg);
  }, []);

  const handlePointShadowResChange = useCallback((res: number) => {
    setPointShadowRes(res);
    updateSettings('render', { pointShadowRes: res });
    const map = meshMapRef.current;
    const casters = shadowCastersRef.current;
    if (!casters) return;
    for (const key of Object.keys(map)) {
      const entry = map[key];
      if (entry.floorplanRig) {
        configureFloorplanShadows(entry.floorplanRig, casters, res);
        continue;
      }
      if (!entry.shadowGen) continue;
      const light = entry.shadowGen.getLight();
      entry.shadowGen.dispose();
      if (res === 0) { entry.shadowGen = undefined; continue; }
      const sg = new ShadowGenerator(res, light);
      sg.usePercentageCloserFiltering = true;
      sg.filteringQuality = ShadowGenerator.QUALITY_MEDIUM;
      sg.bias = 0;
      sg.normalBias = 0.05;
      for (const mesh of casters) sg.addShadowCaster(mesh, false);
      entry.shadowGen = sg;
    }
    // Re-freeze shadow maps
    freezePointLightShadows(meshMapRef.current);
  }, []);

  // Apply perspective mode to the camera
  useEffect(() => {
    const camera = sceneCtxRef.current?.camera;
    const engine = sceneCtxRef.current?.engine;
    const scene = sceneCtxRef.current?.scene;
    if (!camera || !engine || !scene || navigationMode !== 'normal') return;

    if (perspective) {
      camera.mode = Camera.PERSPECTIVE_CAMERA;
    } else {
      camera.mode = Camera.ORTHOGRAPHIC_CAMERA;
      const updateOrtho = () => {
        const aspect = engine.getAspectRatio(camera);
        const halfHeight = camera.radius * Math.tan(camera.fov / 2);
        camera.orthoTop = halfHeight;
        camera.orthoBottom = -halfHeight;
        camera.orthoLeft = -halfHeight * aspect;
        camera.orthoRight = halfHeight * aspect;
      };
      updateOrtho();
      const obs = scene.onBeforeRenderObservable.add(updateOrtho);
      return () => { scene.onBeforeRenderObservable.remove(obs); };
    }
  }, [perspective, sceneReady, navigationMode]);

  // Compute camera radius so the model fills 90% of the smallest canvas dimension.
  // At alpha=270° top-down: model Z → screen height, model X → screen width.
  const computeIdealRadius = useCallback(() => {
    const canvas = canvasRef.current;
    const ms = modelSizeRef.current;
    const camera = sceneCtxRef.current?.camera;
    if (!canvas || !ms || !camera) return modelDiagonalRef.current * 1.6;

    const fov = camera.fov; // vertical FOV in radians
    const aspect = canvas.clientWidth / canvas.clientHeight;

    // Visible extents at target plane:
    //   visibleHeight = 2 * radius * tan(fov/2)
    //   visibleWidth  = visibleHeight * aspect
    const radiusForHeight = (ms.z / 2) / (Math.tan(fov / 2) * 0.75);
    const radiusForWidth = (ms.x / 2) / (Math.tan(fov / 2) * aspect * 0.75);

    return Math.max(radiusForHeight, radiusForWidth);
  }, []);

  const northOffsetRef = useRef(northOffset);
  northOffsetRef.current = northOffset;

  const handleSliderChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const mins = parseInt(e.target.value);
      setSunLiveMode(false);
      setSliderValue(mins);
      setScrubberTime(minutesToLabel(mins));
      const ctx = sceneCtxRef.current;
      if (ctx?.sunLight && ctx?.hemiLight) {
        updateSunPosition(ctx.sunLight, ctx.hemiLight, (configRef.current?.location.latitude ?? SYSTEM_LOCATION.latitude), (configRef.current?.location.longitude ?? SYSTEM_LOCATION.longitude), mins, northOffsetRef.current, cloudCoverFactorRef.current);
      }
      updateAutoTheme(mins);
    },
    [updateAutoTheme],
  );

  const handleLiveClick = useCallback(() => {
    setSunLiveMode(true);
    const ctx = sceneCtxRef.current;
    if (ctx?.sunLight && ctx?.hemiLight) {
      const now = new Date();
      const liveMin = now.getHours() * 60 + now.getMinutes();
      setSliderValue(liveMin);
      setScrubberTime(minutesToLabel(liveMin));
      updateSunPosition(ctx.sunLight, ctx.hemiLight, (configRef.current?.location.latitude ?? SYSTEM_LOCATION.latitude), (configRef.current?.location.longitude ?? SYSTEM_LOCATION.longitude), undefined, northOffsetRef.current, cloudCoverFactorRef.current);
    }
  }, []);

  const northSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleNorthOffsetChange = useCallback((degrees: number) => {
    setNorthOffset(degrees);
    northOffsetRef.current = degrees;
    // Immediately update sun
    const ctx = sceneCtxRef.current;
    if (ctx?.sunLight && ctx?.hemiLight) {
      const mins = sunLiveMode ? undefined : sliderValue;
      updateSunPosition(ctx.sunLight, ctx.hemiLight, (configRef.current?.location.latitude ?? SYSTEM_LOCATION.latitude), (configRef.current?.location.longitude ?? SYSTEM_LOCATION.longitude), mins, degrees, cloudCoverFactorRef.current);
    }
    // Debounced save to config
    if (northSaveTimerRef.current) clearTimeout(northSaveTimerRef.current);
    northSaveTimerRef.current = setTimeout(() => {
      const loc = configRef.current?.location;
      if (loc) {
        const updatedLocation = systemLocationWithNorthOffset(degrees);
        if (configRef.current) configRef.current.location = updatedLocation;
        try { updateConfig({ location: updatedLocation }); } catch (err) {
          console.warn('[Config] Failed to save north offset:', err);
        }
      }
    }, 400);
  }, [sunLiveMode, sliderValue]);

  /** Re-merge static meshes after their materials or edge renderers changed. */
  const rebuildRenderBatches = useCallback(() => {
    const scene = sceneCtxRef.current?.scene;
    if (!scene || !modelMeshesRef.current.length) return;
    batchStaticRendering(scene, modelMeshesRef.current,
      Object.values(meshMapRef.current).flatMap(e => e.floorplanRig?.lights ?? []));
  }, []);

  const handleEdgeModeChange = useCallback((mode: 'classic' | 'enhanced') => {
    setEdgeMode(mode);
    updateSettings('render', { edgeMode: mode });
    edgeOutlineRef.current?.setEnabled(mode === 'enhanced' && !showTextures);
    if (!showTextures) {
      for (const mesh of modelMeshesRef.current) {
        if (mode === 'classic') {
          mesh.enableEdgesRendering();
          mesh.edgesWidth = edgeWidth;
        } else {
          mesh.disableEdgesRendering();
        }
      }
    }
    rebuildRenderBatches();
  }, [edgeWidth, showTextures, rebuildRenderBatches]);

  const handleEdgeWidthChange = useCallback((width: number) => {
    setEdgeWidth(width);
    updateSettings('render', { edgeWidth: width });
    for (const mesh of modelMeshesRef.current) {
      mesh.edgesWidth = width;
    }
  }, []);

  const handleShowTexturesChange = useCallback((enabled: boolean) => {
    setShowTextures(enabled);
    updateSettings('render', { showTextures: enabled });
    const scene = sceneCtxRef.current?.scene;
    if (!scene) return;
    setTexturesEnabled(scene, modelMeshesRef.current, enabled, edgeWidth, edgeMode === 'classic');
    edgeOutlineRef.current?.setEnabled(!enabled && edgeMode === 'enhanced');
    rebuildRenderBatches();
  }, [edgeWidth, edgeMode, rebuildRenderBatches]);

  const handleSketchColorChange = useCallback((color: string) => {
    setSketchColor(color);
    updateSettings('render', { sketchColor: color });
    const scene = sceneCtxRef.current?.scene;
    if (!scene) return;
    setSketchAppearance(scene, color, getSetting('render').sketchSpecular);
  }, []);

  const handleSketchSpecularChange = useCallback((value: number) => {
    setSketchSpecular(value);
    updateSettings('render', { sketchSpecular: value });
    const scene = sceneCtxRef.current?.scene;
    if (!scene) return;
    setSketchAppearance(scene, getSetting('render').sketchColor, value);
  }, []);

  // Count lights that are on
  const updateLightsOnCount = useCallback(() => {
    const meshMap = meshMapRef.current;
    let count = 0;
    for (const key of Object.keys(meshMap)) {
      if (meshMap[key].light && meshMap[key].light!.intensity > 0) count++;
    }
    setLightsOnCount(count);
  }, []);

  // Parse hex color string to Color3
  const hexToColor3 = useCallback((hex: string) => {
    const h = hex.replace('#', '');
    const r = parseInt(h.substring(0, 2), 16) / 255;
    const g = parseInt(h.substring(2, 4), 16) / 255;
    const b = parseInt(h.substring(4, 6), 16) / 255;
    return new Color3(r, g, b);
  }, []);

  // Apply a remote mode color to a light mesh (called when mode sensor changes)
  const applyRemoteMode = useCallback(
    (lightEntityId: string, mode: string) => {
      const entry = meshMapRef.current[lightEntityId];
      if (!entry || !entry.light) return;

      const cfg = configRef.current?.lights.find((l) => l.entityId === lightEntityId);
      if (!cfg?.remoteButtons) return;

      // Find the button whose entityId ends with _<mode>
      const modeLower = mode.toLowerCase();
      const btn = cfg.remoteButtons.find((b) =>
        b.entityId.endsWith('_' + modeLower),
      );
      if (!btn?.color) return;

      // Only apply color if the light is currently on
      const switchState = lastStatesRef.current[lightEntityId];
      if (!switchState || switchState.state !== 'on') return;

      const col = hexToColor3(btn.color);
      const multiplier = cfg.brightness ?? 1;
      const { stripLights } = entry;
      const allLights = stripLights.length > 0 ? stripLights : (entry.light ? [entry.light] : []);

      for (const pl of allLights) {
        pl.diffuse = col;
      }
      entry.mat.emissiveColor = new Color3(
        col.r * multiplier,
        col.g * multiplier,
        col.b * multiplier,
      ).clampToRef(0, 1, entry.mat.emissiveColor);
      updateLightInteractionVisual(entry, col, true);
    },
    [hexToColor3],
  );

  // Apply HA state to a light mesh (handles single lights and strip sub-lights)
  const applyLightState = useCallback(
    (entityId: string, state: HAState) => {
      lastStatesRef.current[entityId] = state;
      state = hueSyncDisplayState(state, lastStatesRef.current);
      const entry = meshMapRef.current[entityId];
      if (!entry || !entry.light) return;

      if (entry.floorplanRig) {
        const config = configRef.current?.lights.find(l => l.entityId === entityId);
        if (!config) return;
        const color = applyFloorplanLightState(entry.floorplanRig, config, state);
        entry.mat.emissiveColor.copyFrom(color);
        updateLightInteractionVisual(entry, color, state.state === 'on');
        updateLightsOnCount();
        return;
      }

      const { mat, stripLights } = entry;
      const isOn = state.state === 'on';
      const attrs = state.attributes || {};

      // Collect all point lights for this entry (primary + strip sub-lights)
      const allLights = stripLights.length > 0 ? stripLights : (entry.light ? [entry.light] : []);
      const isStrip = stripLights.length > 0;

      if (!isOn) {
        for (const pl of allLights) {
          pl.intensity = 0;
          if (pl.isEnabled(false)) pl.setEnabled(false);
        }
        mat.emissiveColor = new Color3(0, 0, 0);
        updateLightInteractionVisual(entry, new Color3(0.22, 0.42, 0.58), false);
        updateLightsOnCount();
        return;
      }

      for (const pl of allLights) if (!pl.isEnabled(false)) pl.setEnabled(true);

      const cfg = configRef.current?.lights.find((l) => l.entityId === entityId);
      const haBrightness = Math.max(0, Math.min(1, (attrs.brightness ?? 255) / 255));
      const lightBrightness = Math.max(haBrightness, MIN_ON_LIGHT_FACTOR);
      const bulbGlow = Math.max(haBrightness, MIN_ON_BULB_GLOW);
      const multiplier = cfg?.brightness ?? 1;
      // Strip sub-lights share the total intensity; single lights get full intensity
      const perLightIntensity = isStrip
        ? (lightBrightness * LIGHT_INTENSITY_BASE * multiplier) / allLights.length
        : lightBrightness * LIGHT_INTENSITY_BASE * multiplier;

      // Determine color: remote mode > HA color > HA color_temp > config warmth > default warm white
      let col = new Color3(1, 0.9, 0.7);

      // For remote lights, check the mode sensor for current color
      let usedRemoteColor = false;
      if (cfg?.type === 'remote' && cfg.modeEntityId) {
        const modeState = lastStatesRef.current[cfg.modeEntityId];
        if (modeState?.state && modeState.state !== 'unknown' && modeState.state !== 'unavailable') {
          const modeLower = modeState.state.toLowerCase();
          const btn = cfg.remoteButtons?.find((b) =>
            b.entityId.endsWith('_' + modeLower),
          );
          if (btn?.color) {
            col = hexToColor3(btn.color);
            usedRemoteColor = true;
          }
        }
      }

      if (!usedRemoteColor) {
        if (attrs.rgb_color) {
          const [r, g, b] = attrs.rgb_color;
          col = new Color3(r / 255, g / 255, b / 255);
        } else if (attrs.hs_color) {
          col = hsToColor3(attrs.hs_color[0], attrs.hs_color[1]);
        } else if (attrs.color_temp_kelvin) {
          const rgb = kelvinToRGB(attrs.color_temp_kelvin);
          col = new Color3(rgb.r, rgb.g, rgb.b);
        } else if (attrs.color_temp) {
          const rgb = kelvinToRGB(miredToKelvin(attrs.color_temp));
          col = new Color3(rgb.r, rgb.g, rgb.b);
        } else if (cfg?.warmth) {
          const rgb = kelvinToRGB(cfg.warmth);
          col = new Color3(rgb.r, rgb.g, rgb.b);
        }
      }

      for (const pl of allLights) {
        pl.intensity = perLightIntensity;
        pl.diffuse = col;
      }

      new Color3(
        col.r * bulbGlow,
        col.g * bulbGlow,
        col.b * bulbGlow,
      ).clampToRef(0, 1, mat.emissiveColor);
      updateLightInteractionVisual(entry, col, true);

      updateLightsOnCount();
    },
    [updateLightsOnCount],
  );

  // ── Pending-command highlight feedback ──────────────────────────
  const PENDING_COLOR = new Color3(0, 0.8, 1);   // cyan
  const ERROR_COLOR = new Color3(1, 0.15, 0.1);  // red
  const PULSE_SPEED = 0.06;
  const ERROR_BLINK_SPEED = 0.15;
  const ERROR_DISPLAY_MS = 1500;
  const PENDING_TIMEOUT_MS = 5000; // safety: auto-error if no state change

  const stopPendingFeedback = useCallback((entityId: string) => {
    const ctx = sceneCtxRef.current;
    const hl = ctx?.highlightLayer;
    const pending = pendingRef.current.get(entityId);
    if (!hl || !pending) return;

    if (pending.timer) clearTimeout(pending.timer);
    for (const m of pending.meshes) hl.removeMesh(m);
    ctx.scene.onBeforeRenderObservable.remove(pending.observer);
    pendingRef.current.delete(entityId);

    // Reset blur if no more pending
    if (pendingRef.current.size === 0) {
      hl.blurHorizontalSize = 1;
      hl.blurVerticalSize = 1;
    }
  }, []);

  const showErrorFeedback = useCallback((entityId: string) => {
    const ctx = sceneCtxRef.current;
    const hl = ctx?.highlightLayer;
    const pending = pendingRef.current.get(entityId);
    if (!hl || !pending) return;

    // Switch color to red and flag error mode
    if (pending.timer) clearTimeout(pending.timer);
    pending.state.error = true;
    for (const m of pending.meshes) {
      hl.removeMesh(m);
      hl.addMesh(m, ERROR_COLOR);
    }

    // Auto-clear after a short delay
    pending.timer = setTimeout(() => stopPendingFeedback(entityId), ERROR_DISPLAY_MS);
  }, [stopPendingFeedback]);

  const startPendingFeedback = useCallback((entityId: string) => {
    const ctx = sceneCtxRef.current;
    const hl = ctx?.highlightLayer;
    if (!hl) return;
    // Already pending — skip
    if (pendingRef.current.has(entityId)) return;

    const entry = meshMapRef.current[entityId];
    if (!entry) return;

    const meshes = [entry.bulb, ...entry.extraBulbs, ...entry.fixtureMeshes].filter(Boolean) as Mesh[];
    for (const m of meshes) hl.addMesh(m, PENDING_COLOR);

    let t = 0;
    const state = { error: false };
    const observer = ctx.scene.onBeforeRenderObservable.add(() => {
      t += state.error ? ERROR_BLINK_SPEED : PULSE_SPEED;
      if (state.error) {
        // Hard on/off blink for error
        const on = Math.sin(t) > 0;
        hl.blurHorizontalSize = on ? 1.5 : 0.2;
        hl.blurVerticalSize = on ? 1.5 : 0.2;
      } else {
        const v = 0.4 + 1.0 * Math.abs(Math.sin(t));
        hl.blurHorizontalSize = v;
        hl.blurVerticalSize = v;
      }
    });

    // Safety timeout: if no state change arrives, show error
    const timer = setTimeout(() => showErrorFeedback(entityId), PENDING_TIMEOUT_MS);

    pendingRef.current.set(entityId, { observer: observer!, meshes, state, timer });
  }, [showErrorFeedback]);

  // Initialize everything
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let disposed = false;
    let weatherIntervalRef: ReturnType<typeof setInterval> | null = null;
    let prewarmTimerRef: ReturnType<typeof setInterval> | null = null;
    // WebGL starts synchronously as before; WebGPU (opt-in) needs an async engine start.
    const sceneOptions = { enableGlow: true };
    let ctx: SceneContext;
    let ctxPromise: Promise<SceneContext>;
    if (prefersWebGPU()) {
      ctxPromise = createSceneAsync(canvas, sceneOptions);
    } else {
      ctx = createScene(canvas, sceneOptions);
      sceneCtxRef.current = ctx;
      ctxPromise = Promise.resolve(ctx);
    }

    let pressTimer: ReturnType<typeof setTimeout> | null = null;
    let pressedEntity: string | null = null;
    let pressStartX = 0;
    let pressStartY = 0;
    const MOVE_THRESHOLD = 10; // px – ignore small finger jitter on touch



    async function init() {
      if (sceneCtxRef.current !== ctx) {
        ctx = await ctxPromise;
        if (disposed) return;
        sceneCtxRef.current = ctx;
      }
      // Load config
      if (simulationMode) {
        configRef.current = SIMULATION_CONFIG;
        setSidePanelConfig(SIMULATION_CONFIG.sidePanel);
        rebuildEntityIndexes(SIMULATION_CONFIG);
      } else {
        try {
          const config = await getConfig();
          if (disposed) return;
          configRef.current = config;
          setSidePanelConfig(config.sidePanel);
          rebuildEntityIndexes(config);
          if (config.location.northOffset !== undefined) setNorthOffset(config.location.northOffset);
        } catch (e) {
          console.warn('[Config] Failed to load:', e);
          configRef.current = { location: systemLocationWithNorthOffset(), lights: [] };
          rebuildEntityIndexes(configRef.current);
        }
      }
      // HA settings now live exclusively in the settings store
      if (disposed) return;
      const modelScale = getModelScale(configRef.current?.model);
      entityScaleRootRef.current = createSceneScaleRoot(ctx.scene, modelScale);

      // Load 3D model
      let modelBlob: Blob | null;
      if (simulationMode) {
        try {
          const resp = await fetch(SIMULATION_MODEL_URL);
          if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
          modelBlob = await resp.blob();
        } catch (e) {
          console.error('[Simulation] Failed to load model:', e);
          setModelStatus('failed');
          setModelStatusColor('var(--red)');
          return;
        }
      } else {
        modelBlob = await getModelBlob();
      }
      if (!modelBlob) {
        navigate('/onboarding');
        return;
      }
      try {
        const renderAtLoad = getSetting('render');
        const showTexturesAtLoad = renderAtLoad.showTextures;
        const result = await loadModel(ctx.scene, modelBlob, undefined, {
          showTextures: showTexturesAtLoad,
          sketchColor: renderAtLoad.sketchColor,
          sketchSpecular: renderAtLoad.sketchSpecular,
          edgeRendering: renderAtLoad.edgeMode === 'classic',
          modelScale,
          objectOverrides: configRef.current?.model?.objectOverrides ?? [],
        });
        if (disposed) return;

        ctx.camera.lowerRadiusLimit = result.diagonal * 0.27;
        ctx.camera.upperRadiusLimit = result.diagonal * 5;

        modelSizeRef.current = { x: result.size.x, z: result.size.z };
        walkthroughBoundsRef.current = { center: result.center.clone(), size: result.size.clone(), scale: modelScale };
        modelDiagonalRef.current = result.diagonal;

        const savedPose = getSetting('controls').homeView;
        if (savedPose) {
          ctx.camera.target = new Vector3(savedPose.target.x, savedPose.target.y, savedPose.target.z);
          ctx.camera.alpha = savedPose.alpha;
          ctx.camera.beta = savedPose.beta;
          ctx.camera.radius = savedPose.radius;
        } else {
          // Default: center at floor level, top-down view
          const target = result.center.clone();
          target.y = 0;
          ctx.camera.target = target;
          ctx.camera.alpha = Tools.ToRadians(270);
          ctx.camera.beta = Tools.ToRadians(0.5);
          ctx.camera.radius = computeIdealRadius();
        }

        createModelShadow(ctx.scene, result.center, result.size);

        setDefaultTarget({ x: result.center.x, y: 0, z: result.center.z });

        modelMeshesRef.current = result.meshes.filter(
          (m) => m.getTotalVertices?.() > 0,
        );

        // Apply persisted edge width to model meshes (ModelLoader defaults to 3)
        {
          const w = getSetting('render').edgeWidth;
          for (const mesh of modelMeshesRef.current) mesh.edgesWidth = w;
        }

        // Screen-space edge detection for inner corners (only on model meshes, not lights)
        edgeOutlineRef.current = createEdgeOutline(ctx.scene, ctx.camera, {
          meshes: modelMeshesRef.current,
          enabled: getSetting('render').edgeMode !== 'classic' && !showTexturesAtLoad,
        });

        setModelStatus('ready');
        setModelStatusColor('var(--green)');

        // Load user-added model objects into the same scaled scene space.
        const importedShadowCasters: AbstractMesh[] = [];
        for (const object of configRef.current?.model?.importedObjects ?? []) {
          const blob = await getModelObjectBlob(object.id);
          if (!blob) continue;
          try {
            const loaded = await loadImportedObject(ctx.scene, blob, object, {
              parent: entityScaleRootRef.current ?? undefined,
              editor: false,
            });
            if (disposed) {
              disposeImportedObject(loaded);
              return;
            }
            importedObjectResultsRef.current[object.id] = loaded;
            importedShadowCasters.push(...loaded.shadowCasters);
          } catch (error) {
            console.warn('[Dashboard] Failed to load imported object:', object.fileName, error);
          }
        }

        // Create invisible shadow wall meshes from config
        const wallMeshes = createShadowWalls(ctx.scene, configRef.current?.shadowWalls || [], entityScaleRootRef.current ?? undefined);
        const facadeCovers=configRef.current?.model?.floorplan?.objects.filter(o=>o.domain==='cover')??[];
        createParkEnvironment(ctx.scene,result.center,result.size,facadeCovers.length?Math.min(...facadeCovers.map(o=>o.position.x))*modelScale-.12*modelScale:undefined,findFrontFacade(facadeCovers,modelScale));
        const modelCasters = [...result.shadowCasters, ...importedShadowCasters];
        const allCasters = [...modelCasters, ...wallMeshes];

        shadowCastersRef.current = allCasters;

        // Setup sun shadows with model geometry + shadow walls
        const sunShadowGen = setupSunShadows(ctx, allCasters, result.diagonal, getSetting('render').sunShadowRes);

        // Create light meshes with shadow-casting PointLights
        // Cap point-light shadow generators to avoid VRAM exhaustion
        // (each cube shadow map = 6 × 2048² ≈ 100 MB)
        const MAX_POINT_SHADOWS = 4;
        let shadowCount = 0;
        const config = configRef.current!;
        const coverCasters = (config.blinds ?? []).flatMap(cfg => {
          const entry = createBlindMesh(ctx.scene, cfg, 0, entityScaleRootRef.current ?? undefined);
          blindMeshMapRef.current[cfg.entityId] = entry;
          sunShadowGen?.addShadowCaster(entry.panel, false);
          return [entry.panel];
        });
        shadowCastersRef.current = [...allCasters, ...coverCasters];
        config.lights.forEach((cfg) => {
          const canShadow = shadowCount < MAX_POINT_SHADOWS;
          const entry = createLightMesh(ctx.scene, cfg, cfg.entityId, {
            withPointLight: true,
            shadowCasters: cfg.emitters?.length ? [...allCasters, ...coverCasters] : canShadow ? [...modelCasters, ...coverCasters] : undefined,
            shadowResolution: getSetting('render').pointShadowRes,
            parent: entityScaleRootRef.current ?? undefined,
            sceneScale: modelScale,
          });
          if (entry.shadowGen) shadowCount++;
          meshMapRef.current[cfg.entityId] = entry;
        });

        for (const configDevice of config.smartDevices || []) {
          smartDeviceMeshMapRef.current[configDevice.id] = createSmartDeviceMesh(ctx.scene, configDevice, entityScaleRootRef.current ?? undefined);
        }
        bindFloorplanMeshes(ctx.scene, result.meshes, config, meshMapRef.current);
        // Multi-emitter fixtures share one clustered light (GPU-binned); single lamps keep shadows.
        enableClusteredFloorplanLights(ctx.scene, Object.values(meshMapRef.current).flatMap(e => e.floorplanRig ? [e.floorplanRig] : []));
        configureFloorplanLightInfluence(ctx.scene, Object.values(meshMapRef.current).flatMap(e => e.floorplanRig ? [e.floorplanRig] : []), [...allCasters, ...coverCasters]);

        // Freeze PointLight shadow maps after first render (static geometry)
        ctx.scene.onAfterRenderObservable.addOnce(() => {
          freezePointLightShadows(meshMapRef.current);
        });

        // Create wall display meshes
        const displayConfigs = config.displays || [];
        for (const dc of displayConfigs) {
          const entry = createDisplayMesh(ctx.scene, dc, entityScaleRootRef.current ?? undefined);
          if (dc.clickable) {
            entry.plane.isPickable = true;
            entry.plane.metadata = { displayId: dc.id };
          } else {
            entry.plane.isPickable = false;
          }
          displayMeshMapRef.current[dc.id] = entry;
        }

        // Bind the imported living-room screen even when no manually placed TV display exists.
        if (!displayConfigs.some(dc => dc.kind === 'tv' && displayStateDependencies(dc).includes('media_player.living_room_receiver'))) {
          const tv = createLivingRoomTVDisplay(ctx.scene, result.meshes);
          if (tv) displayMeshMapRef.current[tv.config.id] = tv;
        }
        rebuildEntityIndexes(config);

        // Create tube meshes
        const tubeConfigs = config.tubes || [];
        for (const tc of tubeConfigs) {
          tubeMapRef.current[tc.id] = createTubeMeshes(ctx.scene, tc, ctx.glowLayer, entityScaleRootRef.current ?? undefined);
        }

        // Compile lamp shadow shaders in the background so switching a lamp on does not stall.
        const floorplanRigs = Object.values(meshMapRef.current).flatMap(e => e.floorplanRig ? [e.floorplanRig] : []);
        void prewarmFloorplanShadowShaders(floorplanRigs, () => disposed);
        // Prepare lighting shader variants one circuit at a time while nobody interacts.
        // A step may hold one frame briefly; that is better than a stall while a
        // user switches the lamp. Running animations (RGB) do not block it.
        const prewarmNextCircuit = createLightVariantPrewarmer(ctx.scene, floorplanRigs);
        const prewarmNextShadowMap = createShadowMapPrewarmer(ctx.scene, floorplanRigs);
        const prewarmTimer = window.setInterval(() => {
          if (disposed || !ctx.isStatic(10_000, true)) return;
          // Shader variants first, then the shadow maps of switched-off lamps.
          if (!prewarmNextCircuit() && !prewarmNextShadowMap()) window.clearInterval(prewarmTimer);
        }, 3000);
        prewarmTimerRef = prewarmTimer;

        // Merge static model meshes into render-only batches (fewer draw calls).
        // Runs last so display/TV material swaps above are already in place.
        batchStaticRendering(ctx.scene, result.meshes,
          Object.values(meshMapRef.current).flatMap(e => e.floorplanRig?.lights ?? []));
        // Glow pass: emissive meshes plus merged static occluders instead of the whole scene.
        if (ctx.glowLayer) setupGlowOccluders(ctx.scene, ctx.glowLayer, result.meshes, modelScale);

        // Weather effects (rain/snow particles + cloud cover)
        weatherRef.current = createWeatherEffects(ctx.scene, sunShadowGen ?? undefined);
        const pollWeather = async () => {
          if (!weatherEnabledRef.current) return;
          try {
            const data = await fetchWeather((configRef.current?.location.latitude ?? SYSTEM_LOCATION.latitude), (configRef.current?.location.longitude ?? SYSTEM_LOCATION.longitude));
            if (disposed || !weatherRef.current) return;
            setCurrentWeather(data);
            const ccf = weatherRef.current.updateWeather(data);
            cloudCoverFactorRef.current = ccf;
            setCloudCoverFactor(ccf);
          } catch (err) {
            console.warn('[Weather] Poll failed:', err);
          }
        };
        pollWeatherRef.current = pollWeather;
        pollWeather();
        const weatherInterval = setInterval(pollWeather, 600_000);
        weatherIntervalRef = weatherInterval;
      } catch (e) {
        console.error('[Model] Load error:', e);
        setModelStatus('failed');
        setModelStatusColor('var(--red)');
        return;
      }

      // Pointer handlers: short click = toggle, long press = modal
      // Also handles clickable display, blind, and tube meshes.
      let pressedFloorplanId: string | null = null;
      let pressedITId: string | null = null;
      let pressedDisplayId: string | null = null;
      let pressedBlindId: string | null = null;
      let pressedTubeId: string | null = null;
      let pressedSmartDeviceId: string | null = null;
      let hoveredLightEntityId: string | null = null;

      ctx.scene.onPointerDown = (evt, pickResult) => {
        if (walkthroughRef.current?.mode !== 'normal' && walkthroughRef.current) return;
        if (matchingRef.current) return;
        if (evt.button > 0) return;
        if (!pickResult.hit || !pickResult.pickedMesh) return;
        const meta = pickResult.pickedMesh.metadata as { itFloorplanId?: string; entityId?: string; unassignedFloorplanId?: string; displayId?: string; blindId?: string; tubeId?: string; smartDeviceId?: string } | null;
        if(meta?.itFloorplanId){pressedITId=meta.itFloorplanId;pressStartX=evt.clientX;pressStartY=evt.clientY;return;}

        if(meta?.unassignedFloorplanId){pressedFloorplanId=meta.unassignedFloorplanId;pressStartX=evt.clientX;pressStartY=evt.clientY;return;}
        if (meta?.smartDeviceId) {
          pressedSmartDeviceId = meta.smartDeviceId;
          pressStartX = evt.clientX;
          pressStartY = evt.clientY;
          return;
        }

        // Display click — immediate open, no long-press
        if (meta?.displayId) {
          pressedDisplayId = meta.displayId;
          pressStartX = evt.clientX;
          pressStartY = evt.clientY;
          return;
        }

        // Blind click — immediate open, no long-press
        if (meta?.blindId) {
          pressedBlindId = meta.blindId;
          pressStartX = evt.clientX;
          pressStartY = evt.clientY;
          return;
        }

        // Tube click — immediate open, no long-press
        if (meta?.tubeId) {
          pressedTubeId = meta.tubeId;
          pressStartX = evt.clientX;
          pressStartY = evt.clientY;
          return;
        }

        if (!meta?.entityId) return;

        pressedEntity = meta.entityId;
        pressStartX = evt.clientX;
        pressStartY = evt.clientY;
        pressTimer = setTimeout(() => {
          pressTimer = null;
          if (pressedEntity) showQuick(pressedEntity, pressStartX, pressStartY, true);
        }, LONG_PRESS_MS);
      };

      ctx.scene.onPointerUp = (_evt) => {
        if(pressedITId){const id=pressedITId;pressedITId=null;if(Math.hypot(_evt.clientX-pressStartX,_evt.clientY-pressStartY)<=MOVE_THRESHOLD){closeQuick();setITOpen(id);}return;}
        if (walkthroughRef.current?.mode !== 'normal' && walkthroughRef.current) return;
        if (matchingRef.current) return;
        if(pressedFloorplanId){const id=pressedFloorplanId;pressedFloorplanId=null;if(Math.hypot(_evt.clientX-pressStartX,_evt.clientY-pressStartY)<=MOVE_THRESHOLD){closeQuick();setMatchingCategory(configRef.current?.model?.floorplan?.objects.find(o=>o.id===id)?.domain==='light'?'light':'other');setMatchingObjectId(id);setMatchingOpen(true);}return;}
        if (pressedSmartDeviceId) {
          const dx = _evt.clientX - pressStartX;
          const dy = _evt.clientY - pressStartY;
          if (dx * dx + dy * dy <= MOVE_THRESHOLD * MOVE_THRESHOLD) {
            const device = configRef.current?.smartDevices?.find((candidate) => candidate.id === pressedSmartDeviceId);
            const coffeeObject = device && configRef.current?.model?.floorplan?.objects.find(o => o.coffee && o.entityId === device.entityId);
            if (coffeeObject) { closeQuick(); setCoffeeOpen(coffeeObject.id); pressedSmartDeviceId = null; return; }
            const echoObject = device && configRef.current?.model?.floorplan?.objects.find(o => o.echo && o.entityId === device.entityId);
            if (echoObject) { closeQuick(); setEchoOpen(echoObject.id); pressedSmartDeviceId = null; return; }
            const fanObject = device && configRef.current?.model?.floorplan?.objects.find(o => o.domain === 'fan' && o.entityId === device.entityId);
            if (fanObject) {
              closeQuick(); setFanOpen(fanObject.id); pressedSmartDeviceId = null; return;
            }
            if (device && haRef.current && device.action !== 'none') {
              const domain = device.entityId.split('.')[0];
              const service = device.action === 'start' ? (domain === 'vacuum' ? 'start' : 'turn_on')
                : device.action === 'returnHome' ? 'return_to_base'
                : device.action === 'press' ? (domain === 'button' ? 'press' : 'turn_on')
                : 'toggle';
              haRef.current.callService(domain, service, device.entityId).catch((error) => {
                console.warn('[SmartDevice] Action failed:', error);
              });
            }
          }
          pressedSmartDeviceId = null;
          return;
        }

        // Handle display tap
        if (pressedDisplayId) {
          const dx = _evt.clientX - pressStartX;
          const dy = _evt.clientY - pressStartY;
          if (dx * dx + dy * dy <= MOVE_THRESHOLD * MOVE_THRESHOLD) {
            openDisplayModal(pressedDisplayId);
          }
          pressedDisplayId = null;
          return;
        }

        // Handle blind tap
        if (pressedBlindId) {
          const dx = _evt.clientX - pressStartX;
          const dy = _evt.clientY - pressStartY;
          if (dx * dx + dy * dy <= MOVE_THRESHOLD * MOVE_THRESHOLD) {
            openBlindModal(pressedBlindId, _evt.clientX, _evt.clientY);
          }
          pressedBlindId = null;
          return;
        }

        // Handle tube tap
        if (pressedTubeId) {
          const dx = _evt.clientX - pressStartX;
          const dy = _evt.clientY - pressStartY;
          if (dx * dx + dy * dy <= MOVE_THRESHOLD * MOVE_THRESHOLD) {
            openTubeModal(pressedTubeId);
          }
          pressedTubeId = null;
          return;
        }

        if (pressTimer !== null) {
          clearTimeout(pressTimer);
          pressTimer = null;
          if (pressedEntity) showQuick(pressedEntity, _evt.clientX, _evt.clientY, true);
        }
        pressedEntity = null;
      };

      // Babylon would ray-pick the whole model on every pointermove event (~1.7 ms
      // each, often several per frame). Hover only needs the latest position, so
      // it is picked at most once per rendered frame with Babylon's own predicate.
      ctx.scene.skipPointerMovePicking = true;
      let pendingHover: IPointerEvent | null = null;
      const hoverPredicate = (mesh: AbstractMesh) => mesh.isPickable && mesh.isVisible && mesh.isReady() && mesh.isEnabled();
      const updateHover = (evt: IPointerEvent, pickResult: PickingInfo) => {
        const meshMeta = pickResult.pickedMesh?.metadata as { entityId?: string; unassignedFloorplanId?: string; displayId?: string; blindId?: string; tubeId?: string; smartDeviceId?: string } | null;
        const nextHoveredLight = (!evt.buttons || evt.pointerType === 'touch') && pickResult.hit && meshMeta?.entityId && meshMapRef.current[meshMeta.entityId] && !meshMeta.blindId && !meshMeta.smartDeviceId ? meshMeta.entityId : null;
        if (nextHoveredLight !== hoveredLightEntityId) {
          if (hoveredLightEntityId) {
            const previous = meshMapRef.current[hoveredLightEntityId];
            if (previous) setLightTouchZoneHovered(previous, false);
          }
          hoveredLightEntityId = nextHoveredLight;
          if (nextHoveredLight && evt.pointerType !== 'touch') showQuick(nextHoveredLight, evt.clientX, evt.clientY, false);
          else leaveQuick();
        }
        if (nextHoveredLight) setLightTouchZoneHovered(meshMapRef.current[nextHoveredLight], true);
        if (pickResult.hit && (meshMeta?.unassignedFloorplanId || meshMeta?.entityId || meshMeta?.displayId || meshMeta?.blindId || meshMeta?.tubeId || meshMeta?.smartDeviceId)) {
          canvas!.style.cursor = 'pointer';
        } else {
          canvas!.style.cursor = 'default';
        }
      };
      ctx.scene.onBeforeRenderObservable.add(() => {
        if (!pendingHover) return;
        const evt = pendingHover;
        pendingHover = null;
        if (walkthroughRef.current?.mode !== 'normal' && walkthroughRef.current) return;
        if (matchingRef.current) return;
        const pick = ctx.scene.pick(ctx.scene.pointerX, ctx.scene.pointerY, hoverPredicate, false);
        if (pick) updateHover(evt, pick);
      });

      ctx.scene.onPointerMove = (_evt, _pickResult) => {
        if (walkthroughRef.current?.mode !== 'normal' && walkthroughRef.current) return;
        if (matchingRef.current) return;
        if (pressedSmartDeviceId) {
          const dx = _evt.clientX - pressStartX;
          const dy = _evt.clientY - pressStartY;
          if (dx * dx + dy * dy > MOVE_THRESHOLD * MOVE_THRESHOLD) pressedSmartDeviceId = null;
        }
        if (pressedDisplayId) {
          const dx = _evt.clientX - pressStartX;
          const dy = _evt.clientY - pressStartY;
          if (dx * dx + dy * dy > MOVE_THRESHOLD * MOVE_THRESHOLD) {
            pressedDisplayId = null;
          }
        }
        if (pressedBlindId) {
          const dx = _evt.clientX - pressStartX;
          const dy = _evt.clientY - pressStartY;
          if (dx * dx + dy * dy > MOVE_THRESHOLD * MOVE_THRESHOLD) {
            pressedBlindId = null;
          }
        }
        if (pressedTubeId) {
          const dx = _evt.clientX - pressStartX;
          const dy = _evt.clientY - pressStartY;
          if (dx * dx + dy * dy > MOVE_THRESHOLD * MOVE_THRESHOLD) {
            pressedTubeId = null;
          }
        }
        if (pressTimer !== null) {
          const dx = _evt.clientX - pressStartX;
          const dy = _evt.clientY - pressStartY;
          if (dx * dx + dy * dy > MOVE_THRESHOLD * MOVE_THRESHOLD) {
            clearTimeout(pressTimer);
            pressTimer = null;
            pressedEntity = null;
          }
        }
        // Hover picking is deferred to the next frame (see below).
        pendingHover = _evt;
      };

      if (disposed) return;
      const bounds = walkthroughBoundsRef.current;
      if (bounds && canvas) {
        walkthroughRef.current?.dispose();
        walkthroughRef.current = new WalkthroughCamera(ctx.scene, ctx.camera, canvas, bounds.center, bounds.size,
          modelMeshesRef.current, () => changeNavigationMode('normal'), bounds.scale);
        setNavigationMode('normal');
      }
      configureMarkerOcclusion(ctx.scene, [...new Set([...modelMeshesRef.current, ...shadowCastersRef.current])], bounds?.scale ?? 1);
      setSceneReady(true);
    }

    init();

    return () => {
      disposed = true;
      walkthroughRef.current?.dispose();
      walkthroughRef.current = null;
      cancelQuickTimer();
      // Clear all pending highlights
      for (const entityId of pendingRef.current.keys()) stopPendingFeedback(entityId);
      Object.keys(meshMapRef.current).forEach((id) =>
        removeLightMesh(meshMapRef.current, id),
      );
      Object.keys(blindMeshMapRef.current).forEach((id) =>
        removeBlindMesh(blindMeshMapRef.current, id),
      );
      Object.keys(displayMeshMapRef.current).forEach((id) =>
        removeDisplayMesh(displayMeshMapRef.current, id),
      );
      Object.keys(smartDeviceMeshMapRef.current).forEach((id) =>
        removeSmartDeviceMesh(smartDeviceMeshMapRef.current, id),
      );
      disposeAllTubes(tubeMapRef.current);
      for (const result of Object.values(importedObjectResultsRef.current)) {
        disposeImportedObject(result);
      }
      importedObjectResultsRef.current = {};
      if (weatherIntervalRef) clearInterval(weatherIntervalRef);
      if (prewarmTimerRef) clearInterval(prewarmTimerRef);
      weatherRef.current?.dispose();
      weatherRef.current = null;
      disposeGroundGrid();
      void ctxPromise.then(scene => scene.dispose());
    };
  }, [modelReloadVersion]); // eslint-disable-line react-hooks/exhaustive-deps

  // Restore ground grid from localStorage once scene is ready
  useEffect(() => {
    if (!sceneReady || !groundGrid) return;
    const scene = sceneCtxRef.current?.scene;
    if (scene) showGroundGrid(scene);
  }, [sceneReady]); // eslint-disable-line react-hooks/exhaustive-deps

  // Connect to Home Assistant (or demo adapter) — re-runs when demoMode changes
  useEffect(() => {
    if (!sceneReady) return;

    const config = configRef.current;
    if (!config) return;

    // Build lookup: modeEntityId → light entityId (for remote lights)
    const modeSensorToLight: Record<string, string> = {};
    for (const l of config.lights) {
      if (l.type === 'remote' && l.modeEntityId) {
        modeSensorToLight[l.modeEntityId] = l.entityId;
      }
    }

    const callbacks = {
      onStatusChanged: (status: HAConnectionStatus) => {
        setHaStatus(status);
        if(status==='connected' && !demoMode && !simulationMode) {
          const connection=haRef.current;
          void connection?.request({type:'get_config'}).then(raw=>{
            if(haRef.current!==connection)return;
            const data=raw as {latitude?:number;longitude?:number};
            if(typeof data.latitude!=='number'||typeof data.longitude!=='number'||!Number.isFinite(data.latitude)||!Number.isFinite(data.longitude)||Math.abs(data.latitude)>90||Math.abs(data.longitude)>180)return;
            const current=configRef.current;if(!current)return;
            const location={...current.location,latitude:data.latitude,longitude:data.longitude};
            configRef.current={...current,location};updateConfig({location});refreshQuickStates(n=>n+1);
          }).catch(()=>{/* Keep the last configured location when HA config is unavailable. */});
        }
        if (status !== 'connected') {
          delete lastStatesRef.current[HUE_SYNC_SWITCH];
          for (const entry of Object.values(displayMeshMapRef.current)) updateDisplayTexture(entry, {});
          refreshQuickStates(n=>n+1);
          Object.values(smartDeviceMeshMapRef.current).filter(e=>e.config.appliance).forEach(e=>updateSmartDeviceState(e,null));
          for (const [entityId, entry] of Object.entries(meshMapRef.current)) {
            if (entry.floorplanRig) applyLightState(entityId, { entity_id: entityId, state: 'unavailable', attributes: {} });
          }
          for (const entry of Object.values(blindMeshMapRef.current)) {
            updateBlindState(entry, { entity_id: entry.config.entityId, state: 'unavailable', attributes: {} });
          }
        }
      },
      onStateChanged: (entityId: string, state: HAState) => {
        // Scene-bound entities render promptly instead of at the static floor rate;
        // other sensors only affect DOM overlays or the side panel.
        if (sceneEntityIdsRef.current.has(entityId) || /^(light|cover|fan|media_player)\./.test(entityId) || isHueSyncControl(entityId)) {
          sceneCtxRef.current?.requestRender();
        }
        stopPendingFeedback(entityId);
        const wasBattery = lastStatesRef.current[entityId] && isBatteryState(lastStatesRef.current[entityId]);
        lastStatesRef.current[entityId] = state;
        if (isWaterLeakEntity(entityId)) refreshQuickStates(n=>n+1);
        if (wasBattery || isBatteryState(state) || /battery|batterie/.test(entityId)) refreshQuickStates(n=>n+1);
        if (isHueSyncControl(entityId)) {
          for (const id of Object.keys(meshMapRef.current)) {
            const cached = lastStatesRef.current[id];
            if (cached) applyLightState(id, cached);
          }
        }
        if (entityId.startsWith('fan.') || floorplanMarkerEntityIds().has(entityId)) refreshQuickStates(n=>n+1);
        if (entityId.startsWith('light.') || isHueSyncControl(entityId) || ['automation.tv_dial_hdmi1','media_player.living_room_receiver','media_player.living_room_tv'].includes(entityId)) refreshQuickStates(n=>n+1);
        if (entityId.startsWith('scene.')) {
          setLightSceneOptions(buildSceneOptions(Object.values(lastStatesRef.current)));
        }
        if (meshMapRef.current[entityId]) applyLightState(entityId, state);
        if (blindMeshMapRef.current[entityId]) {
          const blind = blindMeshMapRef.current[entityId];
          // The frame spans every position the panel can take, old and new.
          if (updateBlindState(blind, state) && sceneCtxRef.current) invalidateShadowsNear(sceneCtxRef.current.scene, [blind.frame, blind.panel]);
        }
        for (const entry of Object.values(smartDeviceMeshMapRef.current)) {
          if (entry.config.entityId === entityId) updateSmartDeviceState(entry, state);
        }
        if (entityId === modalEntityIdRef.current) setModalState(state);
        if (quickRef.current && quickLightCluster(configRef.current?.lights ?? [], quickRef.current.entityId).some(l => l.entityId === entityId)) refreshQuickStates(n=>n+1);
        if (entityId === modalDoubleTapEntityIdRef.current) setModalDoubleTapState(state);
        if (entityId === remoteModalEntityIdRef.current) setRemoteModalState(state);
        if (entityId.startsWith('cover.') && blindModalEntityIdRef.current) setBlindModalState(lastStatesRef.current[blindModalEntityIdRef.current] ? { ...lastStatesRef.current[blindModalEntityIdRef.current] } : null);

        // Mode sensor changed → re-apply color to the associated remote light
        if (modeSensorToLight[entityId]) {
          const lightId = modeSensorToLight[entityId];
          applyRemoteMode(lightId, state.state);
        }

        if (panelEntityIdsRef.current.has(entityId)) {
          setCardStates(prev => ({ ...prev, [entityId]: state }));
        }

        // Update tube labels referencing this sensor.
        for (const tubeId of tubeIdsBySensorRef.current.get(entityId) ?? []) {
          const entry = tubeMapRef.current[tubeId];
          if (entry) updateTubeEntryValue(entry, entityId, state.state);
        }
        // Update wall displays referencing this entity.
        for (const displayId of displayIdsByEntityRef.current.get(entityId) ?? []) {
          const entry = displayMeshMapRef.current[displayId];
          if (entry) {
            updateDisplayTexture(entry, lastStatesRef.current);
            setDisplayAnimation(entry, resolveDisplayAnimation(entry.config, lastStatesRef.current));
          }
        }
        // Keep display modal states in sync
        setDisplayModalStates(prev => {
          if (!prev[entityId] && !Object.keys(prev).length) return prev;
          return { ...prev, [entityId]: state };
        });
      },
      onInitialStates: (states: HAState[]) => {
        sceneCtxRef.current?.requestRender();
        setEntityCache(
          states
            .map(s => ({ entity_id: s.entity_id, friendly_name: s.attributes.friendly_name as string | undefined }))
            .sort((a, b) => a.entity_id.localeCompare(b.entity_id)),
        );
        setLightSceneOptions(buildSceneOptions(states));
        lastStatesRef.current = Object.fromEntries(states.map(state => [state.entity_id, state]));
        refreshQuickStates(n=>n+1);
        refreshQuickStates(n=>n+1);
        const newCardStates: Record<string, HAState> = {};
        states.forEach((state) => {
          lastStatesRef.current[state.entity_id] = state;
          if (state.entity_id === modalEntityIdRef.current) setModalState(state);
          if (meshMapRef.current[state.entity_id]) applyLightState(state.entity_id, state);
          if (blindMeshMapRef.current[state.entity_id]) {
            const blind = blindMeshMapRef.current[state.entity_id];
            if (updateBlindState(blind, state) && sceneCtxRef.current) invalidateShadowsNear(sceneCtxRef.current.scene, [blind.frame, blind.panel]);
          }
          for (const entry of Object.values(smartDeviceMeshMapRef.current)) {
            if (entry.config.entityId === state.entity_id) updateSmartDeviceState(entry, state);
          }
          if (panelEntityIdsRef.current.has(state.entity_id)) newCardStates[state.entity_id] = state;
        });
        if (Object.keys(newCardStates).length > 0) {
          setCardStates(prev => ({ ...prev, ...newCardStates }));
        }
        // Apply initial remote mode colors (mode sensor states are now in lastStatesRef)
        for (const [modeEntityId, lightId] of Object.entries(modeSensorToLight)) {
          const modeState = lastStatesRef.current[modeEntityId];
          if (modeState?.state && modeState.state !== 'unknown' && modeState.state !== 'unavailable') {
            applyRemoteMode(lightId, modeState.state);
          }
        }
        // Update all tube labels with initial state
        for (const state of states) {
          for (const tubeId of tubeIdsBySensorRef.current.get(state.entity_id) ?? []) {
            const entry = tubeMapRef.current[tubeId];
            if (entry) updateTubeEntryValue(entry, state.entity_id, state.state);
          }
        }
        // Update all wall display textures with initial state
        for (const entry of Object.values(displayMeshMapRef.current)) {
          updateDisplayTexture(entry, lastStatesRef.current);
          setDisplayAnimation(entry, resolveDisplayAnimation(entry.config, lastStatesRef.current));
        }
      },
    };

    if (demoMode || simulationMode) {
      const demo = new DemoHAConnection(callbacks);
      haRef.current = demo;
      setActiveHAConnection(demo);
      const sensorIds: string[] = [];
      for (const c of config.sidePanel?.cards ?? []) {
        if (c.type !== 'script') sensorIds.push(c.entityId);
        if (c.type === 'indicator' && c.climateEntityId) sensorIds.push(c.climateEntityId);
      }
      // Include display source entity IDs in demo mode
      for (const d of config.displays ?? []) {
        for (const s of d.sources) {
          if (!sensorIds.includes(s.entityId)) sensorIds.push(s.entityId);
        }
      }
      // Include tube sensor entity IDs in demo mode
      for (const t of config.tubes ?? []) {
        for (const line of t.lines) {
          if (!sensorIds.includes(line.sensorId)) sensorIds.push(line.sensorId);
        }
      }
      demo.start(config.lights, sensorIds, config.blinds || []);
    } else {
      const haSettings = getSetting('connection').haSettings;
      const ha = new HAConnection(
        { url: haSettings.url, port: haSettings.port, token: haSettings.token },
        callbacks,
      );
      haRef.current = ha;
      setActiveHAConnection(ha);
      ha.connect();
    }

    // When the app returns to the foreground (e.g. after the WebView was
    // suspended in the background for a long time), the socket may be a dead
    // "zombie" that still reports OPEN. Force a fresh connection so the next
    // entity tap works without needing to relaunch the app.
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') haRef.current?.forceReconnect();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      haRef.current?.dispose();
      haRef.current = null;
      setActiveHAConnection(null);
    };
  }, [demoMode, simulationMode, sceneReady, applyLightState, applyRemoteMode, haSettingsVersion]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep refs to modal entity IDs for use in callbacks
  const modalEntityIdRef = useRef<string | null>(null);
  modalEntityIdRef.current = modalEntityId;
  const modalDoubleTapEntityIdRef = useRef<string | undefined>();
  modalDoubleTapEntityIdRef.current = modalDoubleTapEntityId;
  const remoteModalEntityIdRef = useRef<string | null>(null);
  remoteModalEntityIdRef.current = remoteModalEntityId;
  const blindModalEntityIdRef = useRef<string | null>(null);
  blindModalEntityIdRef.current = blindModalEntityId;

  const openModal = useCallback((entityId: string) => {
    closeQuick();
    const config = configRef.current;
    if (!config) return;
    const cfg = config.lights.find((l) => l.entityId === entityId);
    if (!cfg) return;

    const lbl = cfg.label || entityId.split('.')[1].replace(/_/g, ' ');

    if (cfg.type === 'remote') {
      setRemoteModalEntityId(entityId);
      setRemoteModalLabel(lbl);
      setRemoteModalButtons(cfg.remoteButtons ?? []);
      setRemoteModalState(lastStatesRef.current[entityId] || null);
      setRemoteModalVisible(true);
      return;
    }

    setModalEntityId(entityId);
    setModalLabel(lbl);
    setModalState(lastStatesRef.current[entityId] || null);
    setModalDoubleTapEntityId(cfg.doubleTapEntityId);
    setModalDoubleTapState(cfg.doubleTapEntityId ? lastStatesRef.current[cfg.doubleTapEntityId] || null : null);
    setModalVisible(true);
  }, []);

  const handleModalClose = useCallback(() => {
    setModalVisible(false);
    setModalEntityId(null);
  }, []);

  const openDisplayModal = useCallback((displayId: string) => {
    const config = configRef.current;
    if (!config) return;
    const dc = config.displays?.find((d) => d.id === displayId);
    if (!dc) return;
    setDisplayModalConfig(dc);
    setDisplayModalStates({ ...lastStatesRef.current });
    setDisplayModalVisible(true);
  }, []);

  const openTubeModal = useCallback((tubeId: string) => {
    const config = configRef.current;
    if (!config) return;
    const tc = config.tubes?.find((t) => t.id === tubeId);
    if (!tc) return;
    // Synthesize a DisplayConfig so we can reuse DisplayModal for sensor graphs
    const syntheticDisplay: DisplayConfig = {
      id: tc.id,
      label: tc.label,
      sources: tc.lines.map((line) => ({
        entityId: line.sensorId,
        color: line.color,
      })),
      position: { x: 0, y: 0, z: 0 },
      normal: { x: 0, y: 0, z: 1 },
      width: 1,
      height: 1,
    };
    setDisplayModalConfig(syntheticDisplay);
    setDisplayModalStates({ ...lastStatesRef.current });
    setDisplayModalVisible(true);
  }, []);

  const handleDisplayModalClose = useCallback(() => {
    setDisplayModalVisible(false);
    setDisplayModalConfig(null);
    // An empty map lets onStateChanged skip the per-event copy while the modal is closed.
    setDisplayModalStates({});
  }, []);

  const handleRemoteModalClose = useCallback(() => {
    setRemoteModalVisible(false);
    setRemoteModalEntityId(null);
  }, []);

  const openBlindModal = useCallback((blindId: string, x?: number, y?: number) => {
    const config = configRef.current;
    if (!config) return;
    const cfg = (config.blinds || []).find((b) => b.id === blindId || b.entityId === blindId);
    if (!cfg) return;
    closeQuick();
    setBlindAnchor(x === undefined || y === undefined ? null : {x,y});
    setBlindModalEntityId(cfg.entityId);
    setBlindModalLabel(cfg.label || cfg.entityId.split('.')[1]?.replace(/_/g, ' ') || cfg.entityId);
    setBlindModalState(lastStatesRef.current[cfg.entityId] || null);
    setBlindModalVisible(true);
  }, []);

  const handleBlindModalClose = useCallback(() => {
    setBlindModalVisible(false);
    setBlindModalEntityId(null);
  }, []);

  const handleBlindOpen = useCallback((entityId: string) => {
    return haRef.current?.callService('cover', 'open_cover', entityId) ?? Promise.reject(new Error('Nicht verbunden'));
  }, []);

  const handleBlindClose = useCallback((entityId: string) => {
    return haRef.current?.callService('cover', 'close_cover', entityId) ?? Promise.reject(new Error('Nicht verbunden'));
  }, []);

  const handleBlindStop = useCallback((entityId: string) => {
    return haRef.current?.callService('cover', 'stop_cover', entityId) ?? Promise.reject(new Error('Nicht verbunden'));
  }, []);

  const handleBlindSetPosition = useCallback((entityId: string, position: number) => {
    return haRef.current?.callService('cover', 'set_cover_position', entityId, { position }) ?? Promise.reject(new Error('Nicht verbunden'));
  }, []);

  const handleMediaTurnOn = useCallback((entityId: string) => {
    haRef.current?.callService('media_player', 'turn_on', entityId);
  }, []);

  const handleMediaTurnOff = useCallback((entityId: string) => {
    haRef.current?.callService('media_player', 'turn_off', entityId);
  }, []);

  const handleMediaPlayPause = useCallback((entityId: string) => {
    haRef.current?.callService('media_player', 'media_play_pause', entityId);
  }, []);

  const handleMediaStop = useCallback((entityId: string) => {
    haRef.current?.callService('media_player', 'media_stop', entityId);
  }, []);

  const handleMediaSetVolume = useCallback((entityId: string, volume: number) => {
    haRef.current?.callService('media_player', 'volume_set', entityId, { volume_level: volume });
  }, []);

  const handleMediaSelectSource = useCallback((entityId: string, source: string) => {
    haRef.current?.callService('media_player', 'select_source', entityId, { source });
  }, []);

  const handleRemoteButtonPress = useCallback((entityId: string) => {
    const ha = haRef.current;
    if (!ha?.isConnected) return;
    const domain = entityId.split('.')[0];
    ha.callService(domain, 'press', entityId);
  }, []);

  const handleToggle = useCallback((entityId: string) => {
    const ha = haRef.current;
    if (!ha?.isConnected || isHueSyncLocked(entityId,lastStatesRef.current)) return;
    const domain = entityId.split('.')[0];
    ha.callService(domain, 'toggle', entityId);
  }, []);

  const handleBrightness = useCallback((entityId: string, brightness: number) => {
    const ha = haRef.current;
    if (!ha?.isConnected || isHueSyncLocked(entityId,lastStatesRef.current)) return;
    ha.callService('light', 'turn_on', entityId, { brightness });
  }, []);

  const handleColorTemp = useCallback((entityId: string, colorTempKelvin: number) => {
    const ha = haRef.current;
    if (!ha?.isConnected || isHueSyncLocked(entityId,lastStatesRef.current)) return;
    ha.callService('light', 'turn_on', entityId, { color_temp_kelvin: colorTempKelvin });
  }, []);

  const handleColor = useCallback(
    (entityId: string, color: { r: number; g: number; b: number }, brightness: number, hsColor?: { h: number; s: number }) => {
      const ha = haRef.current;
      if (!ha?.isConnected || isHueSyncLocked(entityId,lastStatesRef.current)) return;
      ha.callService('light', 'turn_on', entityId, {
        ...(hsColor ? { hs_color: [hsColor.h, hsColor.s] } : { rgb_color: [color.r, color.g, color.b] }),
        brightness,
      });
    },
    [],
  );

  const handleWhiteChannel = useCallback((entityId: string, white: number) => {
    const ha = haRef.current;
    if (!ha?.isConnected || isHueSyncLocked(entityId,lastStatesRef.current)) return;
    ha.callService('light', 'turn_on', entityId, { white_value: white });
  }, []);

  const handleEffect = useCallback((entityId: string, effect: string) => {
    const ha = haRef.current;
    if (!ha?.isConnected || isHueSyncLocked(entityId,lastStatesRef.current)) return;
    ha.callService('light', 'turn_on', entityId, { effect });
  }, []);

  const handleActivateScene = useCallback((entityId: string) => {
    const ha = haRef.current;
    if (!ha?.isConnected) return;
    ha.callService('scene', 'turn_on', entityId);
  }, []);

  const handleRebuildLights = useCallback((stripConfig: StripConfig, singleRange: number) => {
    const ctx = sceneCtxRef.current;
    const config = configRef.current;
    const casters = shadowCastersRef.current;
    if (!ctx || !config || !casters.length) return;

    // Dispose all existing light meshes
    Object.keys(meshMapRef.current).forEach((id) =>
      removeLightMesh(meshMapRef.current, id),
    );

    // Recreate with new strip config (cap shadows like initial creation)
    const MAX_POINT_SHADOWS = 4;
    let shadowCount = 0;
    config.lights.forEach((cfg) => {
      const canShadow = shadowCount < MAX_POINT_SHADOWS;
      const entry = createLightMesh(ctx.scene, cfg, cfg.entityId, {
        withPointLight: true,
        shadowCasters: cfg.emitters?.length || canShadow ? casters : undefined,
        stripConfig,
        singleRange,
        shadowResolution: getSetting('render').pointShadowRes,
        parent: entityScaleRootRef.current ?? undefined,
        sceneScale: getModelScale(config.model),
      });
      if (entry.shadowGen) shadowCount++;
      meshMapRef.current[cfg.entityId] = entry;
    });

    // Re-apply current HA states
    enableClusteredFloorplanLights(ctx.scene, Object.values(meshMapRef.current).flatMap(e => e.floorplanRig ? [e.floorplanRig] : []));
    configureFloorplanLightInfluence(ctx.scene, Object.values(meshMapRef.current).flatMap(e => e.floorplanRig ? [e.floorplanRig] : []), casters);
    for (const entityId of Object.keys(lastStatesRef.current)) {
      if (meshMapRef.current[entityId]) {
        applyLightState(entityId, lastStatesRef.current[entityId]);
      }
    }
  }, [applyLightState]);

  // Save current camera pose as the home view
  const saveHomeView = useCallback(() => {
    const ctx = sceneCtxRef.current;
    if (!ctx) return;
    const { camera } = ctx;
    const pose: HomeViewPose = {
      alpha: camera.alpha,
      beta: camera.beta,
      radius: camera.radius,
      target: { x: camera.target.x, y: camera.target.y, z: camera.target.z },
    };
    updateSettings('controls', { homeView: pose });
    setHomeViewSetting(false);
  }, []);

  // Reset camera to home view with smooth animation
  const homingRef = useRef(false);
  const resetView = useCallback(() => {
    if (walkthroughRef.current && walkthroughRef.current.mode !== 'normal') { walkthroughRef.current.recenter(); return; }
    const ctx = sceneCtxRef.current;
    if (!ctx || !defaultTarget || homingRef.current) return;
    const { camera, scene } = ctx;
    const fps = 60;
    const frames = 45; // ~750ms

    // Lock user input during animation
    homingRef.current = true;
    camera.detachControl();

    const ease = new CubicEase();
    ease.setEasingMode(EasingFunction.EASINGMODE_EASEINOUT);

    const makeAnim = (prop: string, from: number, to: number) => {
      const a = new Animation(`home_${prop}`, prop, fps, Animation.ANIMATIONTYPE_FLOAT, Animation.ANIMATIONLOOPMODE_CONSTANT);
      a.setKeys([{ frame: 0, value: from }, { frame: frames, value: to }]);
      a.setEasingFunction(ease);
      return a;
    };

    const saved = getSetting('controls').homeView;
    const targetRadius = saved ? saved.radius : computeIdealRadius();
    const targetAlpha = saved ? saved.alpha : Tools.ToRadians(270);
    const targetBeta = saved ? saved.beta : Tools.ToRadians(0.5);
    const targetPos = saved
      ? new Vector3(saved.target.x, saved.target.y, saved.target.z)
      : new Vector3(defaultTarget.x, defaultTarget.y, defaultTarget.z);

    // Skip if already at home — avoids detach/reattach glitch
    const EPS = 0.002;
    if (
      Math.abs(camera.radius - targetRadius) < EPS &&
      Math.abs(camera.alpha - targetAlpha) < EPS &&
      Math.abs(camera.beta - targetBeta) < EPS &&
      Vector3.Distance(camera.target, targetPos) < EPS
    ) {
      homingRef.current = false;
      camera.attachControl(true);
      return;
    }

    // Animate target (Vector3) separately
    const targetAnim = new Animation('home_target', 'target', fps, Animation.ANIMATIONTYPE_VECTOR3, Animation.ANIMATIONLOOPMODE_CONSTANT);
    targetAnim.setKeys([{ frame: 0, value: camera.target.clone() }, { frame: frames, value: targetPos }]);
    targetAnim.setEasingFunction(ease);

    camera.animations = [
      makeAnim('radius', camera.radius, targetRadius),
      makeAnim('alpha', camera.alpha, targetAlpha),
      makeAnim('beta', camera.beta, targetBeta),
      targetAnim,
    ];

    scene.beginAnimation(camera, 0, frames, false, 1, () => {
      // Re-enable user input
      camera.attachControl(true);
      homingRef.current = false;
    });
  }, [defaultTarget, computeIdealRadius]);

  const recenterModelView = useCallback(() => {
    if (walkthroughRef.current && walkthroughRef.current.mode !== 'normal') { walkthroughRef.current.recenter(); return; }
    const ctx = sceneCtxRef.current;
    if (!ctx || !defaultTarget || homingRef.current) return;
    const { camera, scene } = ctx;
    const fps = 60;
    const frames = 45;

    homingRef.current = true;
    camera.detachControl();

    const ease = new CubicEase();
    ease.setEasingMode(EasingFunction.EASINGMODE_EASEINOUT);

    const makeAnim = (prop: string, from: number, to: number) => {
      const a = new Animation(`recenter_${prop}`, prop, fps, Animation.ANIMATIONTYPE_FLOAT, Animation.ANIMATIONLOOPMODE_CONSTANT);
      a.setKeys([{ frame: 0, value: from }, { frame: frames, value: to }]);
      a.setEasingFunction(ease);
      return a;
    };

    const targetRadius = computeIdealRadius();
    const targetAlpha = Tools.ToRadians(270);
    const targetBeta = Tools.ToRadians(0.5);
    const targetPos = new Vector3(defaultTarget.x, defaultTarget.y, defaultTarget.z);

    const EPS = 0.002;
    if (
      Math.abs(camera.radius - targetRadius) < EPS &&
      Math.abs(camera.alpha - targetAlpha) < EPS &&
      Math.abs(camera.beta - targetBeta) < EPS &&
      Vector3.Distance(camera.target, targetPos) < EPS
    ) {
      homingRef.current = false;
      camera.attachControl(true);
      return;
    }

    const targetAnim = new Animation('recenter_target', 'target', fps, Animation.ANIMATIONTYPE_VECTOR3, Animation.ANIMATIONLOOPMODE_CONSTANT);
    targetAnim.setKeys([{ frame: 0, value: camera.target.clone() }, { frame: frames, value: targetPos }]);
    targetAnim.setEasingFunction(ease);

    camera.animations = [
      makeAnim('radius', camera.radius, targetRadius),
      makeAnim('alpha', camera.alpha, targetAlpha),
      makeAnim('beta', camera.beta, targetBeta),
      targetAnim,
    ];

    scene.beginAnimation(camera, 0, frames, false, 1, () => {
      camera.attachControl(true);
      homingRef.current = false;
    });
  }, [defaultTarget, computeIdealRadius]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (matchingRef.current) return;
      // Skip shortcuts when typing in an input
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (e.target as HTMLElement)?.isContentEditable) return;

      // Skip shortcuts when a modifier key is held (allow native Ctrl+C, etc.)
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      if (walkthroughRef.current && walkthroughRef.current.mode !== 'normal') {
        if (e.key === 'Escape') changeNavigationMode('normal');
        return;
      }

      if (e.key === 'Escape') {
        if (homeViewSetting) setHomeViewSetting(false);
        else if (settingsOpen) setSettingsOpen(false);
        else if (remoteModalVisible) handleRemoteModalClose();
        else if (blindModalVisible) handleBlindModalClose();
        else handleModalClose();
      } else if (e.key === ' ' && !settingsOpen && !modalVisible && !remoteModalVisible && !blindModalVisible) {
        e.preventDefault();
        if (homeViewSetting) saveHomeView();
        else resetView();
      } else if (e.key === 'd') {
        setDebugOpen(v => !v);
      } else if (e.key === 's') {
        setSettingsOpen(v => !v);
      } else if (e.key === 'c') {
        navigate('/editor');
      } else if (e.key === 'g') {
        setGridEditMode(v => !v);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [handleModalClose, handleRemoteModalClose, handleBlindModalClose, settingsOpen, modalVisible, remoteModalVisible, blindModalVisible, resetView, navigate, homeViewSetting, saveHomeView, changeNavigationMode]);

  // 3-finger touch to reset view (mobile)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const handler = (e: TouchEvent) => {
      if (e.touches.length === 3) {
        e.preventDefault();
        if (homeViewSetting) saveHomeView();
        else resetView();
      }
    };
    canvas.addEventListener('touchstart', handler, { passive: false });
    return () => canvas.removeEventListener('touchstart', handler);
  }, [resetView, homeViewSetting, saveHomeView]);

  // Grid edit mode: save layout changes to server
  const handleGridLayoutChange = useCallback((layouts: Record<string, CardLayout>) => {
    const config = configRef.current;
    if (!config?.sidePanel) return;
    const updatedCards = config.sidePanel.cards.map(card => {
      const newLayout = layouts[card.id];
      return newLayout ? { ...card, layout: newLayout } : card;
    });
    const updatedPanel = { ...config.sidePanel, cards: updatedCards };
    configRef.current = { ...config, sidePanel: updatedPanel };
    rebuildEntityIndexes(configRef.current);
    setSidePanelConfig(updatedPanel);
    // Sync editing card layout if properties panel is open
    setEditingCard(prev => {
      if (!prev) return prev;
      const newLayout = layouts[prev.id];
      return newLayout ? { ...prev, layout: newLayout } : prev;
    });
    try { updateConfig({ sidePanel: updatedPanel }); } catch (err) {
      console.warn('[Config] Failed to save grid layout:', err);
    }
  }, [rebuildEntityIndexes]);

  const handleEditGridDone = useCallback(() => {
    setGridEditMode(false);
  }, []);

  const handleCardAdd = useCallback(() => {
    setEditingCard(null);
    setCardPanelOpen(true);
  }, []);

  const handleCardEdit = useCallback((card: SidePanelCard) => {
    // Read the latest version from config (layout may have changed via drag/resize)
    const latest = configRef.current?.sidePanel?.cards.find(c => c.id === card.id);
    setEditingCard(latest ?? card);
    setCardPanelOpen(true);
  }, []);

  const handleCardDelete = useCallback((cardId: string) => {
    const config = configRef.current;
    if (!config?.sidePanel) return;
    const updatedCards = config.sidePanel.cards.filter(c => c.id !== cardId);
    const updatedPanel = { ...config.sidePanel, cards: updatedCards };
    configRef.current = { ...config, sidePanel: updatedPanel };
    rebuildEntityIndexes(configRef.current);
    updateConfig({ sidePanel: updatedPanel });
    setSidePanelConfig(updatedPanel);
  }, [rebuildEntityIndexes]);

  const handleCardSave = useCallback((card: SidePanelCard) => {
    const config = configRef.current;
    if (!config) return;
    const panel = config.sidePanel ?? { cards: [] };
    const exists = panel.cards.some(c => c.id === card.id);
    const updatedCards = exists
      ? panel.cards.map(c => c.id === card.id ? card : c)
      : [...panel.cards, card];
    const updatedPanel = { ...panel, cards: updatedCards };
    configRef.current = { ...config, sidePanel: updatedPanel };
    rebuildEntityIndexes(configRef.current);
    updateConfig({ sidePanel: updatedPanel });
    setSidePanelConfig(updatedPanel);
    setCardPanelOpen(false);
    setEditingCard(null);
  }, [rebuildEntityIndexes]);

  // Live preview: update the grid as the user edits fields (no persist)
  const handleCardPreview = useCallback((card: SidePanelCard) => {
    const config = configRef.current;
    if (!config?.sidePanel) return;
    const updatedCards = config.sidePanel.cards.map(c => c.id === card.id ? card : c);
    const updatedPanel = { ...config.sidePanel, cards: updatedCards };
    // Update state for live render, but don't persist yet
    rebuildEntityIndexes({ ...config, sidePanel: updatedPanel });
    setSidePanelConfig(updatedPanel);
  }, [rebuildEntityIndexes]);

  // Apply camera controls based on device type
  useEffect(() => {
    const camera = sceneCtxRef.current?.camera;
    const scene = sceneCtxRef.current?.scene;
    if (!camera || !scene) return;
    const isMobile = window.matchMedia('(pointer: coarse)').matches;
    const flags = isMobile ? camControls.mobile : camControls.desktop;

    // Zoom: wheelDeltaPercentage keeps mouse and trackpad zoom smooth across distances.
    camera.wheelPrecision = flags.zoom ? CAMERA_CONTROL_SENSITIVITY.wheelPrecision : 99999;
    camera.wheelDeltaPercentage = flags.zoom ? CAMERA_CONTROL_SENSITIVITY.wheelDeltaPercentage : 0;
    camera.pinchPrecision = flags.zoom ? CAMERA_CONTROL_SENSITIVITY.pinchPrecision : 99999;

    // Rotate: angular sensibility (higher = less sensitive, huge = disabled)
    camera.angularSensibilityX = flags.rotate ? CAMERA_CONTROL_SENSITIVITY.angularSensibilityX : 99999;
    camera.angularSensibilityY = flags.rotate ? CAMERA_CONTROL_SENSITIVITY.angularSensibilityY : 99999;
    camera.inertia = CAMERA_CONTROL_SENSITIVITY.inertia;

    // Pan: scale sensibility with radius so panning stays consistent at any zoom level
    camera.panningInertia = CAMERA_CONTROL_SENSITIVITY.panningInertia;
    const BASE_PAN = CAMERA_CONTROL_SENSITIVITY.panningSensibility;
    const refRadius = computeIdealRadius();
    if (!flags.pan) {
      camera.panningSensibility = 0;
    } else {
      camera.panningSensibility = BASE_PAN * (refRadius / camera.radius);
    }

    // Keep panning sensibility in sync as the user zooms in/out
    const observer = scene.onBeforeRenderObservable.add(() => {
      if (!flags.pan) return;
      camera.panningSensibility = BASE_PAN * (refRadius / camera.radius);
    });

    return () => {
      scene.onBeforeRenderObservable.remove(observer);
    };
  }, [camControls.desktop, camControls.mobile, sceneReady, computeIdealRadius]);

  // Resize Babylon engine when canvas container changes size (e.g. side panel open/close)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const observer = new ResizeObserver(() => {
      sceneCtxRef.current?.engine.resize();
    });
    observer.observe(canvas);
    return () => observer.disconnect();
  }, []);


  return (
    <div className="dashboard-wrapper" style={{ '--panel-size': `${panelCollapsed?0:panelSize}px` } as React.CSSProperties}>
      <SidePanel
        config={sidePanelConfig}
        ha={haRef.current}
        cardStates={cardStates}
        onSettingsOpen={() => setSettingsOpen(true)}
        panelSize={panelSize}
        collapsed={panelCollapsed}
        onToggleCollapsed={()=>setPanelCollapsed(value=>!value)}
        onMatchLights={sceneReady && configRef.current?.model?.floorplan?.objects.some(o=>o.domain==='light') && !matchingOpen ? ()=>{closeQuick();setSettingsOpen(false);setMatchingCategory('light');setMatchingObjectId(undefined);setMatchingObjectIds(undefined);setMatchingOpen(true);} : undefined}
        onPanelResize={size=>{setPanelCollapsed(false);handlePanelResize(size);}}
        editMode={gridEditMode}
        onEditDone={handleEditGridDone}
        onLayoutChange={handleGridLayoutChange}
        onSetTemperature={(entityId, temperature) => {
          haRef.current?.callService('climate', 'set_temperature', entityId, { temperature });
        }}
        onSetHvacMode={(entityId, mode) => {
          haRef.current?.callService('climate', 'set_hvac_mode', entityId, { hvac_mode: mode });
        }}
        onCardAdd={handleCardAdd}
        onCardEdit={handleCardEdit}
        onCardDelete={handleCardDelete}
        onExitSimulation={simulationMode ? () => {
          setSimulationMode(false);
          navigate('/onboarding');
        } : undefined}
      />
      {cardPanelOpen && (
        <Suspense fallback={null}>
          <CardPropertiesPanel
            card={editingCard}
            haEntities={cardPanelEntities}
            onSave={handleCardSave}
            onCancel={() => { setCardPanelOpen(false); setEditingCard(null); }}
            onPreview={handleCardPreview}
          />
        </Suspense>
      )}
      <div className="dashboard">
        <canvas ref={canvasRef} tabIndex={0} aria-label="3D-Wohnung" onPointerLeave={leaveQuick} onWheel={closeQuick} />
        {!matchingOpen && sceneReady && sceneCtxRef.current && configRef.current && <LightClusterMarkers scene={sceneCtxRef.current.scene} config={configRef.current} meshes={meshMapRef.current} states={lastStatesRef.current} onOpen={showQuick} onLeave={leaveQuick} onAssign={id=>{closeQuick();setMatchingCategory(configRef.current?.model?.floorplan?.objects.find(o=>o.id===id)?.domain==='light'?'light':'other');setMatchingObjectId(id);setMatchingOpen(true);}}/>}


        {matchingOpen && sceneReady && sceneCtxRef.current && configRef.current && <Suspense fallback={null}><VisualMatchingGuide scene={sceneCtxRef.current.scene} initialConfig={configRef.current} objectId={matchingObjectId} objectIds={matchingObjectIds} category={matchingCategory}
          onSave={next => { updateConfig(next); matchingChanged.current = true; }}
          onClose={() => { setMatchingOpen(false); setMatchingObjectIds(undefined); if (matchingChanged.current) { matchingChanged.current = false; handleReloadModel(); } }} /></Suspense>}

        <HUD
          latitude={(configRef.current?.location.latitude ?? SYSTEM_LOCATION.latitude)}
          longitude={(configRef.current?.location.longitude ?? SYSTEM_LOCATION.longitude)}
          northOffset={northOffset}
          sunLight={sceneCtxRef.current?.sunLight ?? null}
          hemiLight={sceneCtxRef.current?.hemiLight ?? null}
          sunLiveMode={sunLiveMode}
          sliderValue={sliderValue}
          scrubberTime={scrubberTime}
          onSunLiveModeChange={setSunLiveMode}
          onSliderValueChange={setSliderValue}
          onScrubberTimeChange={setScrubberTime}
          cloudCoverFactor={cloudCoverFactor}
          currentWeather={currentWeather}
        />

        <div className="dashboard-render-toggle">
          <button
            className={`dashboard-icon-btn dashboard-texture-btn${showTextures ? ' active' : ''}`}
            onClick={() => handleShowTexturesChange(!showTextures)}
            aria-label={`${t('settings.textures')} ${showTextures ? t('common.on') : t('common.off')}`}
            aria-pressed={showTextures}
            title={`${t('settings.textures')} ${showTextures ? t('common.on') : t('common.off')}`}
          >
            {showTextures
              ? <ImageIcon size={14} strokeWidth={1.8} aria-hidden="true" />
              : <ImageOff size={14} strokeWidth={1.8} aria-hidden="true" />}
          </button>
          <button
            className="dashboard-icon-btn dashboard-recenter-btn"
            onClick={resetView}
            aria-label={t('common.recenter')}
            title={t('common.recenter')}
          >
            <Crosshair size={12} strokeWidth={1.8} aria-hidden="true" />
          </button>
          <button
            className={`dashboard-icon-btn${navigationMode !== 'normal' ? ' active' : ''}`}
            disabled={!sceneReady || homeViewSetting}
            onClick={() => changeNavigationMode(nextNavigationMode(navigationMode))}
            aria-label={`Ansicht: ${navigationMode === 'normal' ? 'Normal' : navigationMode === 'walk' ? 'Walk' : 'Fly'}. Wechsel zu ${nextNavigationMode(navigationMode)}`}
            title={`${navigationMode === 'normal' ? 'Normal' : navigationMode === 'walk' ? 'Walk' : 'Fly'} → ${nextNavigationMode(navigationMode)}`}
          >
            {navigationMode === 'normal' ? <Orbit size={15} aria-hidden="true" /> : navigationMode === 'walk' ? <Footprints size={15} aria-hidden="true" /> : <Move3d size={15} aria-hidden="true" />}
          </button>
        </div>

        {navigationMode !== 'normal' && <div className="walkthrough-controls" aria-label="Rundgang-Steuerung">
          <span><strong>{navigationMode === 'walk' ? 'Walk' : 'Fly'}</strong> · WASD / Pfeiltasten · Rechts ziehen: umsehen{navigationMode === 'fly' ? ' · Q/E: ab/auf' : ' · Tür anklicken: öffnen/schließen'} · Esc: Normal</span>
          <div className="walkthrough-buttons">
            {([['KeyA', '←', 'Links'], ['KeyW', '↑', 'Vorwärts'], ['KeyS', '↓', 'Rückwärts'], ['KeyD', '→', 'Rechts'], ...(navigationMode === 'fly' ? [['KeyQ', '−', 'Abwärts'], ['KeyE', '+', 'Aufwärts']] : [])]).map(([key, icon, label]) => <button key={key} aria-label={label}
              onPointerDown={e => { e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); canvasRef.current?.focus({ preventScroll: true }); walkthroughRef.current?.keys.add(key); }}
              onPointerUp={() => walkthroughRef.current?.keys.delete(key)} onPointerCancel={() => walkthroughRef.current?.keys.delete(key)} onLostPointerCapture={() => walkthroughRef.current?.keys.delete(key)}>{icon}</button>)}
            <button onClick={() => changeNavigationMode('normal')} aria-label="Rundgang beenden">×</button>
          </div>
        </div>}

        <DebugPanel
          open={debugOpen}
          onClose={() => setDebugOpen(false)}
          sceneCtxRef={sceneCtxRef}
          meshMapRef={meshMapRef}
          shadowCastersRef={shadowCastersRef}
          onRebuildLights={handleRebuildLights}
          weatherRef={weatherRef}
          onCloudCoverFactorChange={(ccf) => {
            cloudCoverFactorRef.current = ccf;
            setCloudCoverFactor(ccf);
          }}
          currentWeather={currentWeather}
        />

        {quickLight && quickMembers.length > 1 && <LightClusterControls key={quickMembers.map(l=>l.entityId).join('|')}
          label={isEnsis(quickMembers[0].label) ? 'Ensis · Tisch & Decke' : quickMembers[0].group ? configRef.current?.lightGroups?.find(g=>g.id===quickMembers[0].group)?.name ?? 'Leuchtengruppe' : /kueche|küche/i.test(quickMembers[0].label) ? 'Küchenspots' : 'Spotgruppe'}
          syncLocked={quickMembers.some(l=>isHueSyncLocked(l.entityId,lastStatesRef.current))}
          members={quickMembers.map(l=>({entityId:l.entityId,label:l.label,state:lastStatesRef.current[l.entityId]??null}))}
          connected={haStatus === 'connected'} anchor={quickLight} onEdit={editQuickMapping}
          onClose={closeQuick} onEnter={cancelQuickTimer} onLeave={leaveQuick}
          onPin={() => setQuickLight(q => q ? { ...q, pinned: true } : q)} onMore={openModal}
          onCommand={async (entityId,service,data) => {
            if(isHueSyncLocked(entityId,lastStatesRef.current)) return;
            const ha=haRef.current; if(!ha?.isConnected) throw new Error('Not connected');
            await ha.callService(entityId.split('.')[0],service,entityId,data);
          }}/>}
        {quickLight && quickMembers.length <= 1 && <LightQuickControls key={quickLight.entityId}
          label={configRef.current?.lights.find(l => l.entityId === quickLight.entityId)?.label || quickLight.entityId}
          syncLocked={isHueSyncLocked(quickLight.entityId,lastStatesRef.current)}
          state={modalState} connected={haStatus === 'connected'} anchor={quickLight} onEdit={editQuickMapping}
          onClose={closeQuick} onEnter={cancelQuickTimer} onLeave={leaveQuick}
          onPin={() => setQuickLight(q => q ? { ...q, pinned: true } : q)}
          onMore={() => openModal(quickLight.entityId)}
          onCommand={async (service, data) => {
            if(isHueSyncLocked(quickLight.entityId,lastStatesRef.current)) return;
            const ha = haRef.current;
            if (!ha?.isConnected) throw new Error('Not connected');
            await ha.callService(quickLight.entityId.split('.')[0], service, quickLight.entityId, data);
          }} />}

        <LightModal
          visible={modalVisible && !isHueSyncLocked(modalEntityId ?? '',lastStatesRef.current)}
          entityId={modalEntityId}
          label={modalLabel}
          state={modalState}
          onClose={handleModalClose}
          onToggle={handleToggle}
          onBrightness={handleBrightness}
          onColorTemp={handleColorTemp}
          onColor={handleColor}
          onWhiteChannel={handleWhiteChannel}
          onEffect={handleEffect}
          onActivateScene={handleActivateScene}
          sceneOptions={lightSceneOptions}
          doubleTapEntityId={modalDoubleTapEntityId}
          doubleTapState={modalDoubleTapState}
        />

        <RemoteModal
          visible={remoteModalVisible}
          label={remoteModalLabel}
          toggleEntityId={remoteModalEntityId}
          state={remoteModalState}
          buttons={remoteModalButtons}
          onClose={handleRemoteModalClose}
          onToggle={handleToggle}
          onPressButton={handleRemoteButtonPress}
        />

        {sceneReady && sceneCtxRef.current && configRef.current && <DoorStatus scene={sceneCtxRef.current.scene} config={configRef.current} states={lastStatesRef.current} connected={haStatus==='connected'} />}
        {!matchingOpen && sceneReady && sceneCtxRef.current && configRef.current && <DoorMarkers scene={sceneCtxRef.current.scene} config={configRef.current} states={lastStatesRef.current} connected={haStatus==='connected'} onAssign={id=>{closeQuick();setMatchingCategory('other');setMatchingObjectId(id);setMatchingObjectIds(undefined);setMatchingOpen(true);}} />}
        {sceneReady && sceneCtxRef.current && configRef.current && <ITVisuals scene={sceneCtxRef.current.scene} config={configRef.current} states={lastStatesRef.current} connected={haStatus==='connected'}/>}
        {!matchingOpen && sceneReady && sceneCtxRef.current && <TVDialControl scene={sceneCtxRef.current.scene} states={lastStatesRef.current} connected={haStatus==='connected'}/>}
        {!matchingOpen && sceneReady && sceneCtxRef.current && configRef.current && <ITMarkers scene={sceneCtxRef.current.scene} config={configRef.current} states={lastStatesRef.current} connected={haStatus==='connected'} open={itOpen} onOpen={setITOpen} onSave={(id,it)=>{const next=structuredClone(configRef.current!);const object=next.model?.floorplan?.objects.find(o=>o.id===id);if(object){object.it=it;updateConfig(next);handleReloadModel();}}}/>}
        {!matchingOpen && sceneReady && sceneCtxRef.current && configRef.current && <CoffeeMarkers scene={sceneCtxRef.current.scene} config={configRef.current} states={lastStatesRef.current} connected={haStatus==='connected'} open={coffeeOpen} onOpen={setCoffeeOpen} onAssign={id=>{setCoffeeOpen(null);closeQuick();setMatchingCategory('other');setMatchingObjectId(id);setMatchingObjectIds(undefined);setMatchingOpen(true);}}/>}
        {!matchingOpen && sceneReady && sceneCtxRef.current && configRef.current && <EchoMarkers scene={sceneCtxRef.current.scene} config={configRef.current} states={lastStatesRef.current} connected={haStatus==='connected'} open={echoOpen} onOpen={setEchoOpen} onAssign={id=>{setEchoOpen(null);closeQuick();setMatchingCategory('other');setMatchingObjectId(id);setMatchingObjectIds(undefined);setMatchingOpen(true);}}/>}
        {!matchingOpen && sceneReady && sceneCtxRef.current && configRef.current && <BatteryWarningMarkers scene={sceneCtxRef.current.scene} config={configRef.current} states={lastStatesRef.current} connected={haStatus==='connected'}/>}
        {!matchingOpen && sceneReady && sceneCtxRef.current && configRef.current && <WaterLeakMarkers scene={sceneCtxRef.current.scene} config={configRef.current} states={lastStatesRef.current} connected={haStatus==='connected'}/>}
        {!matchingOpen && sceneReady && sceneCtxRef.current && configRef.current && <FanMarkers scene={sceneCtxRef.current.scene} config={configRef.current} states={lastStatesRef.current} connected={haStatus==='connected'} open={fanOpen} onOpen={setFanOpen} onAssign={id=>{setFanOpen(null);closeQuick();setMatchingCategory('other');setMatchingObjectId(id);setMatchingObjectIds(undefined);setMatchingOpen(true);}}/>}
        {!matchingOpen && sceneReady && sceneCtxRef.current && configRef.current && <ApplianceMarkers scene={sceneCtxRef.current.scene} config={configRef.current} states={lastStatesRef.current} connected={haStatus==='connected'} onAssign={id=>{closeQuick();setMatchingCategory('other');setMatchingObjectId(id);setMatchingOpen(true);}}/>}
        {!matchingOpen && sceneReady && sceneCtxRef.current && <BlindMarkers scene={sceneCtxRef.current.scene} meshes={blindMeshMapRef.current} config={configRef.current!} states={lastStatesRef.current} onAssign={id=>{handleBlindModalClose();closeQuick();setMatchingCategory('other');setMatchingObjectId(id);setMatchingOpen(true);}} onOpen={openBlindModal}/>}
        <BlindModal
          anchor={blindAnchor} connected={haStatus === 'connected'} config={configRef.current!} states={lastStatesRef.current}
          visible={blindModalVisible}
          entityId={blindModalEntityId}
          label={blindModalLabel}
          state={blindModalState}
          onClose={handleBlindModalClose}
          onOpenCover={handleBlindOpen}
          onCloseCover={handleBlindClose}
          onStopCover={handleBlindStop}
          onSetPosition={handleBlindSetPosition}
        />

        <DisplayModal
          display={displayModalConfig}
          states={displayModalStates}
          visible={displayModalVisible}
          onClose={handleDisplayModalClose}
          onSetTemperature={(entityId, temperature) => {
            haRef.current?.callService('climate', 'set_temperature', entityId, { temperature });
          }}
          onSetHvacMode={(entityId, mode) => {
            haRef.current?.callService('climate', 'set_hvac_mode', entityId, { hvac_mode: mode });
          }}
          onMediaTurnOn={handleMediaTurnOn}
          onMediaTurnOff={handleMediaTurnOff}
          onMediaPlayPause={handleMediaPlayPause}
          onMediaStop={handleMediaStop}
          onMediaSetVolume={handleMediaSetVolume}
          onMediaSelectSource={handleMediaSelectSource}
          onToggle={handleToggle}
        />

        {/* Mounted on first open and kept, so its state behaves as before. */}
        {(settingsMounted || settingsOpen) && (
          <Suspense fallback={null}>
            <SettingsModal
              open={settingsOpen}
              onClose={() => setSettingsOpen(false)}
              sliderValue={sliderValue}
              scrubberTime={scrubberTime}
              sunLiveMode={sunLiveMode}
              onSliderChange={handleSliderChange}
              onLiveClick={handleLiveClick}
              northOffset={northOffset}
              onNorthOffsetChange={handleNorthOffsetChange}
              edgeWidth={edgeWidth}
              onEdgeWidthChange={handleEdgeWidthChange}
              edgeMode={edgeMode}
              onEdgeModeChange={handleEdgeModeChange}
              groundGrid={groundGrid}
              onGroundGridChange={handleGroundGridChange}
              weatherEnabled={weatherEnabled}
              onWeatherEnabledChange={handleWeatherEnabledChange}
              perspective={perspective}
              onPerspectiveChange={handlePerspectiveChange}
              sunShadowRes={sunShadowRes}
              onSunShadowResChange={handleSunShadowResChange}
              pointShadowRes={pointShadowRes}
              onPointShadowResChange={handlePointShadowResChange}
              showTextures={showTextures}
              onShowTexturesChange={handleShowTexturesChange}
              onRecenterView={recenterModelView}
              sketchColor={sketchColor}
              onSketchColorChange={handleSketchColorChange}
              sketchSpecular={sketchSpecular}
              onSketchSpecularChange={handleSketchSpecularChange}
              onDebugToggle={() => setDebugOpen((v) => !v)}
              onEditGrid={() => setGridEditMode(true)}
              onChangeHomeView={() => { changeNavigationMode('normal'); setHomeViewSetting(true); }}
              haSettings={getSetting('connection').haSettings}
              onHASettingsSave={(settings) => {
                updateSettings('connection', { haSettings: settings });
                setHaSettingsVersion(v => v + 1);
              }}
              lightsOnCount={lightsOnCount}
              haStatus={haStatus}
              modelStatus={modelStatus}
              modelStatusColor={modelStatusColor}
              onStartVisualMatching={(category='light') => { closeQuick(); setSettingsOpen(false); setMatchingCategory(category); setMatchingObjectId(undefined); setMatchingOpen(true); }}
              onReloadModel={handleReloadModel}
            />
          </Suspense>
        )}

        {homeViewSetting && (
          <div className="home-view-overlay">
            <div className="home-view-overlay-box">
              <p>{t('dashboard.positionHomeView')}</p>
              <p
                className="home-view-overlay-hint"
                dangerouslySetInnerHTML={{ __html: t('dashboard.validateHomeView') }}
              />
              <button className="home-view-overlay-cancel" onClick={() => setHomeViewSetting(false)}>
                {t('common.cancel')}
              </button>
            </div>
          </div>
        )}

        {showTour && (
          <Suspense fallback={null}>
            <GuidedTour
              steps={dashboardTourSteps}
              onComplete={() => {
                setShowTour(false);
                navigate('/editor?guided=true');
              }}
            />
          </Suspense>
        )}

      </div>
    </div>
  );
}
