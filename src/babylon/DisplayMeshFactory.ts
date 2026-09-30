// Modified for HomeTwin3D: development media URL follows the Vite base. See ORIGIN.md.
import { tvMediaRoute, resolveTVScreen, mediaArtworkUrl } from '../services/tvMedia';
import { itCameraUrl } from '../services/itCamera';
import { getSetting } from '../services/settingsStore';
import { buildWsUrl } from '../services/haWebSocket';
import { drawTVMediaScreen } from './TVMediaScreen';
import {
  Scene,
  MeshBuilder,
  StandardMaterial,
  DynamicTexture,
  Vector3,
  Color3 as BABYLON_Color3,
  type Node,
  type Mesh,
} from '@babylonjs/core';
import { getLucideIconImage } from '../services/lucideIcons';
import type { DisplayAnimation, DisplayConfig, DisplayKind, HAState } from '../types';
import type { Observer } from '@babylonjs/core';

export interface DisplayMeshEntry {
  plane: Mesh;
  texture: DynamicTexture;
  material: StandardMaterial;
  config: DisplayConfig;
  /** Cache last drawn text to avoid unnecessary redraws. */
  lastText: string;
  /** Active animation state. */
  _anim?: {
    type: DisplayAnimation;
    observer: Observer<Scene>;
    t: number;
    baseScale: Vector3;
    baseAlpha: number;
  };
}

export type DisplayMeshMap = Record<string, DisplayMeshEntry>;

/**
 * Scene units per texture pixel.
 * At PX_TO_SCENE = 1/512, a 64px font ≈ 0.125 scene units tall.
 */
const PX_TO_SCENE = 1 / 512;
const LINE_SPACING = 1.4;
const H_PADDING = 0.6; // extra width factor (chars are ~0.6× their height)
const TV_TEXTURE_SIZE = { width: 1024, height: 576 };
const TV_SCENE_SIZE = { width: 1.9, height: 1.07 };

interface ScreenTheme {
  mark: string;
  accent: string;
  activeStart: string;
  activeEnd: string;
}

function isScreenKind(kind: DisplayKind | undefined): boolean {
  return !!kind && kind !== 'info';
}

function getScreenTheme(kind: DisplayKind | undefined): ScreenTheme {
  if (kind === 'pc') {
    return { mark: 'PC', accent: '#60a5fa', activeStart: '#0f2747', activeEnd: '#1e3a8a' };
  }
  if (kind === 'console') {
    return { mark: 'GAME', accent: '#a78bfa', activeStart: '#22103d', activeEnd: '#581c87' };
  }
  if (kind === 'qnap') {
    return { mark: 'NAS', accent: '#34d399', activeStart: '#052e25', activeEnd: '#065f46' };
  }
  return { mark: 'TV', accent: '#38bdf8', activeStart: '#0f2747', activeEnd: '#164e63' };
}

function getScreenSource(cfg: DisplayConfig) {
  if (cfg.kind === 'tv' || cfg.kind === 'console') {
    return cfg.sources.find((src) => src.entityId.startsWith('media_player.')) ?? cfg.sources[0];
  }
  return cfg.sources[0];
}

/**
 * Measure the texture size in pixels needed to fit all sources,
 * using an offscreen canvas for accurate text measurement.
 */
function measureTextureSize(
  cfg: DisplayConfig,
  mockTexts: string[],
): { texW: number; texH: number; sceneW: number; sceneH: number } {
  if (isScreenKind(cfg.kind)) {
    return {
      texW: TV_TEXTURE_SIZE.width,
      texH: TV_TEXTURE_SIZE.height,
      sceneW: TV_SCENE_SIZE.width,
      sceneH: TV_SCENE_SIZE.height,
    };
  }

  const sources = cfg.sources || [];
  const defaultFontSize = cfg.fontSize ?? 64;

  // Use an offscreen canvas to measure text widths
  const measure = document.createElement('canvas').getContext('2d')!;
  let maxTextWidth = 0;
  let totalH = 0;

  for (let i = 0; i < sources.length; i++) {
    const src = sources[i];
    const fs = src.fontSize ?? defaultFontSize;
    const fw = src.fontWeight ?? 'bold';
    const text = mockTexts[i] ?? '—';
    measure.font = `${fw} ${fs}px "DM Mono", monospace`;
    const w = measure.measureText(text).width;
    if (w > maxTextWidth) maxTextWidth = w;
    totalH += fs * LINE_SPACING;
  }

  if (sources.length === 0) {
    maxTextWidth = defaultFontSize * 4;
    totalH = defaultFontSize * LINE_SPACING;
  }

  // Add padding — more if there's a background panel
  const hasBg = !!(cfg.backgroundColor && cfg.backgroundColor !== 'transparent');
  const padX = hasBg ? defaultFontSize * 1.0 : defaultFontSize * H_PADDING;
  const padY = hasBg ? defaultFontSize * 0.7 : defaultFontSize * 0.3;
  const texW = Math.round(maxTextWidth + padX);
  const texH = Math.round(totalH + padY);

  return {
    texW: Math.max(texW, 64),
    texH: Math.max(texH, 32),
    sceneW: Math.max(texW, 64) * PX_TO_SCENE,
    sceneH: Math.max(texH, 32) * PX_TO_SCENE,
  };
}

export function createDisplayMesh(
  scene: Scene,
  cfg: DisplayConfig,
  parent?: Node,
): DisplayMeshEntry {
  // Pre-measure with placeholder texts to get initial size
  const sources = cfg.sources || [];
  const defaultFontSize = cfg.fontSize ?? 64;
  const placeholderTexts = sources.map((src) => {
    const label = src.label ? `${src.label} ` : '';
    const unit = src.unit ?? '';
    return `${label}00.0${unit}`;
  });
  const { texW, texH, sceneW, sceneH } = measureTextureSize(cfg, placeholderTexts);

  const w = cfg.width || sceneW;
  const h = cfg.height || sceneH;

  const plane = MeshBuilder.CreatePlane(`display_${cfg.id}`, { width: w, height: h }, scene);

  const normal = new Vector3(cfg.normal.x, cfg.normal.y, cfg.normal.z).normalize();
  plane.position = new Vector3(
    cfg.position.x + normal.x * 0.005,
    cfg.position.y + normal.y * 0.005,
    cfg.position.z + normal.z * 0.005,
  );

  const lookTarget = plane.position.add(normal);
  plane.lookAt(lookTarget);

  const texture = new DynamicTexture(`displayTex_${cfg.id}`, { width: texW, height: texH }, scene, true);
  texture.hasAlpha = true;

  const material = new StandardMaterial(`displayMat_${cfg.id}`, scene);

  const hasCondBg = cfg.sources?.some((s) => s.conditions?.some((c) => c.backgroundColor));
  const hasBg = !!(cfg.backgroundColor && cfg.backgroundColor !== 'transparent') || hasCondBg;
  if (hasBg) {
    // Panel mode: react to scene lighting for realism, slight emissive for readability
    material.disableLighting = false;
    material.diffuseTexture = texture;
    material.emissiveTexture = texture;
    material.emissiveColor = new BABYLON_Color3(0.15, 0.15, 0.15);
    material.specularColor = new BABYLON_Color3(0.03, 0.03, 0.03);
  } else {
    // Transparent mode: fully emissive (text painted on wall)
    material.disableLighting = true;
    material.emissiveTexture = texture;
  }
  material.opacityTexture = texture;
  material.useAlphaFromDiffuseTexture = true;
  material.backFaceCulling = false;
  material.alpha = cfg.opacity ?? 0.95;
  plane.material = material;

  plane.metadata = { displayId: cfg.id };
  plane.isPickable = false;
  plane.applyFog = false;
  if (parent) plane.parent = parent;

  return { plane, texture, material, config: cfg, lastText: '' };
}

/** Async image completion always redraws the latest HA state, never an old snapshot. */
const iconRedraws = new WeakMap<DisplayMeshEntry, () => void>();

/** Resolved per-source rendering info. */
interface SourceRenderInfo {
  text: string;
  icon?: string;
  color: string;
  fontSize: number;
  fontWeight: 'normal' | 'bold';
}

/**
 * Redraw display texture with current HA state values.
 * `states` is a map of entityId → HAState.
 */
export function updateDisplayTexture(
  entry: DisplayMeshEntry,
  states: Record<string, HAState>,
): void {
  const cfg = entry.config;
  iconRedraws.set(entry, () => {
    if (entry.plane.isDisposed()) return;
    entry.lastText = '';
    updateDisplayTexture(entry, states);
  });
  if (isScreenKind(cfg.kind)) {
    if (tvMediaRoute(cfg)) { updateRoutedTV(entry, states); return; }
    updateScreenDisplayTexture(entry, states);
    return;
  }

  const sources = cfg.sources || [];
  const defaultFontSize = cfg.fontSize ?? 64;
  const defaultFontWeight = cfg.fontWeight ?? 'bold';
  const defaultColor = cfg.color ?? '#38bdf8';
  const align = cfg.textAlign ?? 'center';

  // Build per-source render info
  const items: SourceRenderInfo[] = [];
  let conditionalBg: string | undefined;
  for (const src of sources) {
    const ha = states[src.entityId];
    let valueStr: string;
    if (!ha) {
      valueStr = '—';
    } else {
      const num = parseFloat(ha.state);
      if (isNaN(num)) {
        valueStr = ha.state;
      } else {
        valueStr = num.toFixed(src.precision ?? 0);
      }
    }

    // Evaluate conditions against entity state or attribute
    let condColor: string | undefined;
    let condLabel: string | undefined;
    let condIcon: string | undefined;
    if (ha && src.conditions?.length) {
      // Check attribute-based conditions first (more specific), then state-based
      const sorted = [...src.conditions].sort((a, b) => (a.attribute ? 0 : 1) - (b.attribute ? 0 : 1));
      const match = sorted.find((c) => {
        const actual = c.attribute
          ? String(ha.attributes[c.attribute] ?? '')
          : ha.state;
        return actual === c.state;
      });
      if (match) {
        condColor = match.color;
        condLabel = match.label;
        condIcon = match.icon;
        if (match.backgroundColor) conditionalBg = match.backgroundColor;
      }
    }

    const hasOverride = condLabel != null || condIcon != null;
    const label = condLabel ?? (src.label ? `${src.label} ` : '');
    const unit = hasOverride ? '' : (src.unit ?? '');
    const text = condIcon ? '' : (hasOverride ? (condLabel ?? '') : `${label}${valueStr}${unit}`);
    items.push({
      text,
      icon: condIcon,
      color: condColor ?? src.color ?? defaultColor,
      fontSize: src.fontSize ?? defaultFontSize,
      fontWeight: src.fontWeight ?? defaultFontWeight,
    });
  }

  // Build a cache key from all rendered text + styles
  const cacheKey = items.map((it) => `${it.text}|${it.icon ?? ''}|${it.color}|${it.fontSize}|${it.fontWeight}`).join('||') + `||bg:${conditionalBg ?? ''}`;
  if (cacheKey === entry.lastText) return;
  entry.lastText = cacheKey;

  const ctx = entry.texture.getContext() as unknown as CanvasRenderingContext2D;
  const texW = entry.texture.getSize().width;
  const texH = entry.texture.getSize().height;

  // Clear
  ctx.clearRect(0, 0, texW, texH);

  // Draw background panel if configured (conditional bg overrides)
  const bgColor = conditionalBg ?? cfg.backgroundColor;
  if (bgColor && bgColor !== 'transparent') {
    const radius = Math.min(texW, texH) * 0.08; // rounded corners
    ctx.fillStyle = bgColor;
    ctx.beginPath();
    ctx.moveTo(radius, 0);
    ctx.lineTo(texW - radius, 0);
    ctx.quadraticCurveTo(texW, 0, texW, radius);
    ctx.lineTo(texW, texH - radius);
    ctx.quadraticCurveTo(texW, texH, texW - radius, texH);
    ctx.lineTo(radius, texH);
    ctx.quadraticCurveTo(0, texH, 0, texH - radius);
    ctx.lineTo(0, radius);
    ctx.quadraticCurveTo(0, 0, radius, 0);
    ctx.closePath();
    ctx.fill();
  }

  // Apply mirror transforms
  const mH = cfg.mirrorH ?? false;
  const mV = cfg.mirrorV ?? false;
  if (mH || mV) {
    ctx.save();
    ctx.translate(mH ? texW : 0, mV ? texH : 0);
    ctx.scale(mH ? -1 : 1, mV ? -1 : 1);
  }

  // Compute text X position based on alignment
  const padding = 12;
  let textX: number;
  if (align === 'left') textX = padding;
  else if (align === 'right') textX = texW - padding;
  else textX = texW / 2;

  ctx.textAlign = align;
  ctx.textBaseline = 'middle';

  // Helper to draw text with a subtle shadow for depth
  const drawText = (text: string, x: number, y: number, color: string) => {
    // Soft shadow
    ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
    ctx.shadowBlur = 4;
    ctx.shadowOffsetX = 1;
    ctx.shadowOffsetY = 1;
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
    // Reset shadow
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
  };

  // Helper to draw a Lucide icon centered at (cx, cy)
  const drawIcon = (iconName: string, cx: number, cy: number, color: string, size: number) => {
    const img = getLucideIconImage(iconName, color, size, entry, () => iconRedraws.get(entry)?.());
    if (!img) return;
    ctx.drawImage(img, cx - size / 2, cy - size / 2, size, size);
  };

  // Draw item (text or icon) at position
  const drawItem = (it: SourceRenderInfo, x: number, y: number) => {
    if (it.icon) {
      drawIcon(it.icon, x, y, it.color, it.fontSize);
    } else {
      ctx.font = `${it.fontWeight} ${it.fontSize}px "DM Mono", monospace`;
      drawText(it.text, x, y, it.color);
    }
  };

  // For icon items, use center alignment for x positioning
  const itemX = (it: SourceRenderInfo) => it.icon ? texW / 2 : textX;

  if (items.length === 0) {
    ctx.font = `${defaultFontWeight} ${defaultFontSize}px "DM Mono", monospace`;
    drawText('—', textX, texH / 2, defaultColor);
  } else if (items.length === 1) {
    const it = items[0];
    drawItem(it, itemX(it), texH / 2);
  } else {
    // Multiple sources — stack vertically, each with own style
    const lineHeights = items.map((it) => it.fontSize * LINE_SPACING);
    const totalHeight = lineHeights.reduce((a, b) => a + b, 0);
    let y = (texH - totalHeight) / 2 + lineHeights[0] / 2;
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      drawItem(it, itemX(it), y);
      if (i < items.length - 1) {
        y += lineHeights[i] / 2 + lineHeights[i + 1] / 2;
      }
    }
  }

  if (mH || mV) ctx.restore();

  entry.texture.update();
}

interface TVRuntime {
  states: Record<string, HAState>;
  artworkUrl?: string;
  artworkSource?: string;
  image?: HTMLImageElement;
  loaded?: HTMLImageElement;
  timer?: ReturnType<typeof setInterval>;
}
const tvRuntimes = new WeakMap<DisplayMeshEntry, TVRuntime>();

function updateRoutedTV(entry: DisplayMeshEntry, states: Record<string, HAState>): void {
  const route = tvMediaRoute(entry.config)!;
  let runtime = tvRuntimes.get(entry);
  if (!runtime) {
    runtime = { states };
    tvRuntimes.set(entry, runtime);
    const owned = runtime;
    entry.plane.onDisposeObservable.addOnce(() => {
      clearInterval(owned.timer);
      if (owned.image) { owned.image.onload = null; owned.image.onerror = null; owned.image.src = ''; }
      tvRuntimes.delete(entry);
    });
  }
  runtime.states = states;
  const content = resolveTVScreen(states, route);
  const settings = getSetting('connection').haSettings;
  const base = settings.url ? buildWsUrl(settings.url, settings.port).replace(/^ws/, 'http') : '';
  // PC desktop stills come from the HA camera proxy; everything else from the media proxy.
  let url = content.camera ? itCameraUrl(content.artwork, content.camera, base) : mediaArtworkUrl(content.artwork, base);
  // The HA add-on serves media from its own origin so WebGL can use the image.
  if (url && (import.meta.env.MODE === 'addon' || import.meta.env.DEV)) {
    const mediaUrl = new URL(url);
    const route = content.camera ? 'ha-camera/' : 'ha-media/', upstream = content.camera ? '/api/camera_proxy/' : '/api/media_player_proxy/';
    const prefix = import.meta.env.DEV ? `${import.meta.env.BASE_URL}${route}` : `/${route}`;
    url = `${location.origin}${prefix}${mediaUrl.pathname.slice(upstream.length)}${mediaUrl.search}`;
  }
  // ADB snapshots can change without a state change or new image URL; the PC helper sends every 30 s.
  if (url && content.artworkKind === 'screenshot') {
    const refreshUrl = new URL(url);
    refreshUrl.searchParams.set('_preview', String(Math.floor(Date.now() / (content.camera ? 30000 : 10000))));
    url = refreshUrl.href;
  }
  // Camera access tokens rotate; the entity, not the tokenised path, identifies the source.
  const artworkSource = content.camera ?? content.artwork;
  if (runtime.artworkUrl !== url) {
    if (runtime.image) { runtime.image.onload = null; runtime.image.onerror = null; runtime.image.src = ''; }
    // Retain the last snapshot during refresh, but clear it immediately on input/image changes.
    if (runtime.artworkSource !== artworkSource || !url) runtime.loaded = undefined;
    runtime.artworkSource = artworkSource;
    runtime.artworkUrl = url; runtime.image = undefined;
    if (url) {
      const image = new Image(), owned = runtime;
      image.crossOrigin = 'anonymous'; image.referrerPolicy = 'no-referrer';
      owned.image = image;
      image.onload = () => {
        if (entry.plane.isDisposed() || owned.image !== image) return;
        owned.loaded = image; entry.lastText = '';
        updateRoutedTV(entry, owned.states);
      };
      image.onerror = () => {
        if (entry.plane.isDisposed() || owned.image !== image) return;
        owned.loaded = undefined; entry.lastText = '';
        updateRoutedTV(entry, owned.states);
      };
      image.src = url;
    }
  }
  const needsTimer = content.ticking || (content.artworkKind === 'screenshot' && !!url);
  if (needsTimer && !runtime.timer) {
    const owned = runtime;
    runtime.timer = setInterval(() => {
      if (!entry.plane.isDisposed()) updateRoutedTV(entry, owned.states);
    }, 1000);
  } else if (!needsTimer && runtime.timer) {
    clearInterval(runtime.timer); runtime.timer = undefined;
  }
  const key = JSON.stringify({ ...content, position: content.position===undefined ? undefined : Math.floor(content.position), loaded: !!runtime.loaded });
  if (key === entry.lastText) return;
  entry.lastText = key;
  drawTVMediaScreen(entry.texture.getContext() as unknown as CanvasRenderingContext2D, content, runtime.loaded);
  entry.material.disableLighting = true;
  // StandardMaterial adds emissiveColor to the texture; white would wash it out.
  entry.material.emissiveColor.set(0,0,0);
  entry.material.diffuseColor.set(0,0,0);
  entry.material.specularColor.set(0,0,0);
  entry.material.alpha = entry.config.opacity ?? 1;
  entry.texture.update();
}

function updateScreenDisplayTexture(entry: DisplayMeshEntry, states: Record<string, HAState>): void {
  const cfg = entry.config;
  const source = getScreenSource(cfg);
  const ha = source ? states[source.entityId] : undefined;
  const state = ha?.state ?? 'unknown';
  const attrs = ha?.attributes ?? {};
  const theme = getScreenTheme(cfg.kind);
  const isActive = !['off', 'unavailable', 'unknown'].includes(state);
  const isPlaying = state === 'playing' || state === 'buffering';
  const app = String(attrs.app_name ?? attrs.source ?? attrs.media_channel ?? '').trim();
  const friendly = String(attrs.friendly_name ?? '').trim();
  const rawTitle = String(attrs.media_title ?? attrs.media_series_title ?? friendly ?? '').trim();
  const title = rawTitle || (isActive ? cfg.label : 'OFF');
  const artist = String(attrs.media_artist ?? attrs.media_album_name ?? '').trim();
  const volume = typeof attrs.volume_level === 'number' ? attrs.volume_level : undefined;
  const statusLine = isActive
    ? [app, artist, source?.label].filter(Boolean).join('  |  ') || source?.entityId || state.toUpperCase()
    : cfg.label;
  const cacheKey = [
    cfg.kind ?? 'screen',
    state,
    app,
    title,
    artist,
    source?.entityId ?? '',
    source?.label ?? '',
    volume?.toFixed(2) ?? '',
    attrs.is_volume_muted ? 'muted' : '',
  ].join('|');
  if (cacheKey === entry.lastText) return;
  entry.lastText = cacheKey;

  const ctx = entry.texture.getContext() as unknown as CanvasRenderingContext2D;
  const texW = entry.texture.getSize().width;
  const texH = entry.texture.getSize().height;
  ctx.clearRect(0, 0, texW, texH);

  const bg = ctx.createLinearGradient(0, 0, texW, texH);
  if (isActive) {
    bg.addColorStop(0, isPlaying ? theme.activeStart : '#111827');
    bg.addColorStop(0.55, '#05070b');
    bg.addColorStop(1, isPlaying ? theme.activeEnd : '#111827');
  } else {
    bg.addColorStop(0, '#020305');
    bg.addColorStop(1, '#09090b');
  }
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, texW, texH);

  if (isActive) {
    const glow = ctx.createRadialGradient(texW * 0.5, texH * 0.5, 20, texW * 0.5, texH * 0.5, texW * 0.6);
    glow.addColorStop(0, `${theme.accent}38`);
    glow.addColorStop(1, `${theme.accent}00`);
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, texW, texH);
  }

  ctx.fillStyle = isActive ? '#e2e8f0' : '#334155';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = isActive ? 'rgba(56, 189, 248, 0.55)' : 'transparent';
  ctx.shadowBlur = isActive ? 18 : 0;

  ctx.font = '700 56px "DM Mono", monospace';
  ctx.fillText(isActive ? title.slice(0, 32) : 'OFF', texW / 2, texH * 0.46);

  ctx.shadowBlur = 0;
  ctx.fillStyle = isActive ? theme.accent : '#475569';
  ctx.font = '500 25px "DM Mono", monospace';
  ctx.fillText(statusLine.slice(0, 54), texW / 2, texH * 0.58);

  ctx.fillStyle = isPlaying ? '#22c55e' : isActive ? theme.accent : '#1f2937';
  ctx.font = '600 20px "DM Mono", monospace';
  ctx.fillText(state.toUpperCase(), texW / 2, texH * 0.22);

  ctx.fillStyle = isActive ? `${theme.accent}cc` : '#334155';
  ctx.font = '700 22px "DM Mono", monospace';
  ctx.textAlign = 'left';
  ctx.fillText(theme.mark, 36, 44);
  ctx.textAlign = 'center';

  if (volume !== undefined) {
    const barW = texW * 0.36;
    const barH = 10;
    const x = (texW - barW) / 2;
    const y = texH * 0.75;
    ctx.fillStyle = 'rgba(148, 163, 184, 0.22)';
    ctx.fillRect(x, y, barW, barH);
    ctx.fillStyle = attrs.is_volume_muted ? '#64748b' : theme.accent;
    ctx.fillRect(x, y, barW * Math.max(0, Math.min(1, volume)), barH);
  }

  entry.material.alpha = cfg.opacity ?? 0.98;
  entry.material.emissiveColor = isActive
    ? BABYLON_Color3.FromHexString(theme.accent).scale(0.65)
    : new BABYLON_Color3(0.02, 0.02, 0.025);
  entry.material.diffuseColor = isActive
    ? new BABYLON_Color3(0.7, 0.8, 0.9)
    : new BABYLON_Color3(0.05, 0.05, 0.06);
  entry.texture.update();
}

export function removeDisplayMesh(map: DisplayMeshMap, id: string): void {
  const entry = map[id];
  if (!entry) return;
  entry.texture.dispose();
  entry.material.dispose();
  entry.plane.dispose();
  delete map[id];
}

export function rebuildAllDisplayMeshes(
  scene: Scene,
  map: DisplayMeshMap,
  configs: DisplayConfig[],
  parent?: Node,
): void {
  Object.keys(map).forEach((id) => removeDisplayMesh(map, id));
  for (const cfg of configs) {
    map[cfg.id] = createDisplayMesh(scene, cfg, parent);
  }
}

/** Well-known mockup values for common sensor types. */
const MOCKUP_VALUES: Record<string, string> = {
  temperature: '21.3',
  humidity: '54',
  pressure: '1013',
  co2: '420',
  illuminance: '350',
  battery: '87',
  power: '145',
  energy: '3.2',
  voltage: '230',
  current: '0.63',
};

/** Well-known mockup values for non-sensor entity domains. */
const DOMAIN_MOCKUP_VALUES: Record<string, string> = {
  climate: 'heat',
  switch: 'on',
  binary_sensor: 'on',
  light: 'on',
  fan: 'on',
  cover: 'open',
  lock: 'locked',
  media_player: 'playing',
};

/**
 * Build fake HAState records for editor preview so displays show
 * realistic placeholder values instead of "—".
 */
export function buildMockupStates(configs: DisplayConfig[]): Record<string, HAState> {
  const states: Record<string, HAState> = {};
  for (const cfg of configs) {
    for (const src of cfg.sources) {
      if (states[src.entityId]) continue;
      // Try to guess a sensible value from the entity ID
      const lower = src.entityId.toLowerCase();
      const domain = lower.split('.')[0];
      let value = '42';
      // Check domain-level mockups first (climate, switch, etc.)
      if (DOMAIN_MOCKUP_VALUES[domain]) {
        // If source has conditions, use the first condition's state for preview
        value = src.conditions?.length ? src.conditions[0].state : DOMAIN_MOCKUP_VALUES[domain];
      } else {
        for (const [key, val] of Object.entries(MOCKUP_VALUES)) {
          if (lower.includes(key)) { value = val; break; }
        }
      }
      if (isScreenKind(cfg.kind) && domain !== 'media_player') {
        value = cfg.kind === 'qnap' ? 'online' : 'on';
      }
      const attributes = domain === 'media_player'
        ? {
            app_name: 'Netflix',
            media_title: 'Demo Movie',
            media_artist: 'Living Room TV',
            source: 'HDMI 1',
            source_list: ['HDMI 1', 'Netflix', 'YouTube'],
            volume_level: 0.36,
          }
        : isScreenKind(cfg.kind)
          ? { friendly_name: cfg.label }
          : {};
      states[src.entityId] = { entity_id: src.entityId, state: value, attributes };
    }
  }
  return states;
}

/* ─── Display Animation Engine ─── */

const ANIM_SPEED = 0.04;

export function clearDisplayAnimation(entry: DisplayMeshEntry): void {
  if (!entry._anim) return;
  const scene = entry.plane.getScene();
  scene.onBeforeRenderObservable.remove(entry._anim.observer);
  // Reset to base values
  entry.plane.scaling.copyFrom(entry._anim.baseScale);
  entry.material.alpha = entry._anim.baseAlpha;
  entry._anim = undefined;
}

export function setDisplayAnimation(
  entry: DisplayMeshEntry,
  animation: DisplayAnimation | undefined,
): void {
  // Same animation already running — skip
  if (entry._anim?.type === animation) return;
  clearDisplayAnimation(entry);
  if (!animation) return;

  const scene = entry.plane.getScene();
  const baseScale = entry.plane.scaling.clone();
  const baseAlpha = entry.material.alpha;
  let t = 0;

  const observer = scene.onBeforeRenderObservable.add(() => {
    t += ANIM_SPEED;
    const sin = Math.sin(t);
    const abs = Math.abs(sin);

    switch (animation) {
      case 'spin':
        entry.plane.rotation.z += 0.02;
        break;
      case 'pulse': {
        const s = 1 + 0.08 * sin;
        entry.plane.scaling.set(baseScale.x * s, baseScale.y * s, baseScale.z * s);
        break;
      }
      case 'glow':
        entry.material.alpha = baseAlpha * (0.5 + 0.5 * abs);
        entry.material.emissiveColor = new BABYLON_Color3(
          0.15 + 0.35 * abs,
          0.15 + 0.35 * abs,
          0.15 + 0.35 * abs,
        );
        break;
      case 'bounce': {
        const offset = 0.03 * sin;
        // Bounce along the plane's local up (Y in world for wall-mounted)
        entry.plane.position.y = (entry.config.position.y + entry.config.normal.y * 0.005) + offset;
        break;
      }
      case 'flash':
        entry.material.alpha = sin > 0 ? baseAlpha : 0.1;
        break;
    }
  });

  entry._anim = { type: animation, observer, t, baseScale, baseAlpha };
}

/**
 * Resolve which animation should be active for a display given current HA states.
 * Condition animations override the display-level default.
 */
export function resolveDisplayAnimation(
  cfg: DisplayConfig,
  states: Record<string, HAState>,
): DisplayAnimation | undefined {
  // Check conditions for animation overrides
  for (const src of cfg.sources) {
    const ha = states[src.entityId];
    if (!ha || !src.conditions?.length) continue;
    const sorted = [...src.conditions].sort((a, b) => (a.attribute ? 0 : 1) - (b.attribute ? 0 : 1));
    const match = sorted.find((c) => {
      const actual = c.attribute
        ? String(ha.attributes[c.attribute] ?? '')
        : ha.state;
      return actual === c.state;
    });
    if (match?.animation) return match.animation;
  }
  return cfg.animation;
}
