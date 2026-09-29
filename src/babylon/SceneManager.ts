import {
  Engine,
  WebGPUEngine,
  Scene,
  ArcRotateCamera,
  HemisphericLight,
  DirectionalLight,
  ShadowGenerator,
  Vector3,
  Color3,
  Color4,
  Tools,
  Logger,
  GlowLayer,
  HighlightLayer,
  type AbstractEngine,
  type AbstractMesh,
} from '@babylonjs/core';
import { batchStaticSunShadows } from './ShadowCasterBatch';
import { refreshGlowOnChange } from './GlowRefresh';
import { createPerfOverlay } from './PerfOverlay';
import { SceneChangeMonitor } from './SceneChangeMonitor';
import { installUniformNameCache } from './UniformNameCache';
import { installShaderFixes } from './ShaderFixes';
import { shareIdenticalShaderVariants } from './ShaderVariantCache';

export const CAMERA_CONTROL_SENSITIVITY = {
  wheelPrecision: 32,
  wheelDeltaPercentage: 0.003,
  pinchPrecision: 44,
  angularSensibilityX: 1600,
  angularSensibilityY: 1600,
  panningSensibility: 1400,
  panningInertia: 0.88,
  inertia: 0.78,
} as const;

export interface SceneContext {
  engine: AbstractEngine;
  scene: Scene;
  camera: ArcRotateCamera;
  hemiLight: HemisphericLight;
  sunLight: DirectionalLight;
  glowLayer: GlowLayer | null;
  highlightLayer: HighlightLayer | null;
  /** Wake the render loop for external changes (e.g. Home Assistant events). */
  requestRender: () => void;
  /**
   * True after `quietMs` without input (and, unless `ignoreChanges`, without
   * visible changes). Used to schedule background work that may block a frame.
   */
  isStatic: (quietMs?: number, ignoreChanges?: boolean) => boolean;
  dispose: () => void;
}

export interface CreateSceneOptions {
  enableGlow?: boolean;
  maxDevicePixelRatio?: number;
  preserveDrawingBuffer?: boolean;
  stencil?: boolean;
  /** Frame-rate cap while there is no input and the camera is still; 0 renders every frame. */
  idleFrameRate?: number;
}

/** Input or camera movement keeps full frame rate for this long. */
const IDLE_AFTER_MS = 1500;
/**
 * A visible change keeps the idle frame rate for this long before dropping to
 * the floor rate. Continuous animations keep it up frame by frame anyway; one-off
 * changes (a sensor label, a light) only need a few follow-up frames.
 */
const CHANGE_HOLD_MS = 300;
/**
 * A change found by the scene monitor is already visible in the frame that
 * produced it (glow and shadow maps refresh within that frame). Two follow-up
 * frames cover anything settling one frame later; holding the full 300 ms
 * rendered ~9 identical frames for every ambient step (e.g. the RGB cycle).
 * Explicit requestRender() calls (HA updates, loading textures) keep the hold.
 */
const CHANGE_FOLLOW_UP_FRAMES = 2;
/** While nothing changes, render this often so a missed change shows up quickly. */
const STATIC_FRAME_INTERVAL_MS = 500;

export function applyCameraControlSensitivity(camera: ArcRotateCamera): void {
  camera.wheelPrecision = CAMERA_CONTROL_SENSITIVITY.wheelPrecision;
  camera.wheelDeltaPercentage = CAMERA_CONTROL_SENSITIVITY.wheelDeltaPercentage;
  camera.pinchPrecision = CAMERA_CONTROL_SENSITIVITY.pinchPrecision;
  camera.angularSensibilityX = CAMERA_CONTROL_SENSITIVITY.angularSensibilityX;
  camera.angularSensibilityY = CAMERA_CONTROL_SENSITIVITY.angularSensibilityY;
  camera.panningSensibility = CAMERA_CONTROL_SENSITIVITY.panningSensibility;
  camera.panningInertia = CAMERA_CONTROL_SENSITIVITY.panningInertia;
  camera.inertia = CAMERA_CONTROL_SENSITIVITY.inertia;
}

/**
 * Lights per material that fit the uniform-block limit, or 0 when uniform
 * buffers are off. WebGPU always uses uniform buffers; WebGL only with `?ubo=1`.
 */
function uniformBufferLights(engine: AbstractEngine): number {
  if (engine.isWebGPU) {
    const blocks = (engine as WebGPUEngine).currentLimits?.maxUniformBuffersPerShaderStage ?? 12;
    return Math.max(4, Math.min(8, blocks - 4));
  }
  const webgl = engine as Engine;
  if (new URLSearchParams(location.search).get('ubo') !== '1' || webgl.webGLVersion < 2) return 0;
  const gl = webgl._gl as WebGL2RenderingContext | null;
  const blocks = gl ? Math.min(gl.getParameter(gl.MAX_FRAGMENT_UNIFORM_BLOCKS), gl.getParameter(gl.MAX_VERTEX_UNIFORM_BLOCKS)) : 0;
  // Scene, material and mesh blocks plus one spare for effect-specific blocks.
  const lights = Math.min(8, blocks - 4);
  return lights >= 4 ? lights : 0;
}

/** Keep every material within the uniform-block budget, including ones created later. */
function capMaterialLights(scene: Scene, limit: number): void {
  let count = -1;
  scene.onBeforeRenderObservable.add(() => {
    // Cheap check each frame; materials may raise the value after construction.
    if (scene.materials.length === count && !scene.materials.some(m => (m as { maxSimultaneousLights?: number }).maxSimultaneousLights! > limit)) return;
    count = scene.materials.length;
    for (const material of scene.materials) {
      const m = material as { maxSimultaneousLights?: number };
      if (typeof m.maxSimultaneousLights === 'number' && m.maxSimultaneousLights > limit) m.maxSimultaneousLights = limit;
    }
  });
}

/** Texture size limit for this device, or 0 for none (see createScene). */
function maxTextureSizeFor(coarsePointer: boolean): number {
  const requested = new URLSearchParams(location.search).get('maxtex');
  if (requested !== null) return Math.max(0, Number(requested) || 0);
  return coarsePointer ? 2048 : 0;
}

/**
 * `?engine=webgpu` opts into WebGPU (falls back to WebGL when unavailable).
 * Experimental: measured on Chromium/Windows it is not faster than WebGL for
 * this scene, and snapshot rendering (its main advantage) does not pick up
 * light and material changes, so it stays off. Kept for device tests (iPad).
 */
export function prefersWebGPU(): boolean {
  return new URLSearchParams(location.search).get('engine') === 'webgpu';
}

/**
 * Creates a WebGPU engine when requested and supported, otherwise WebGL.
 * GLSL shaders on WebGPU would need Babylon's glslang/twgsl converters from
 * its CDN; they are deliberately not configured, so any remaining GLSL shader
 * fails visibly in the console instead of loading code from the internet.
 */
async function createEngine(canvas: HTMLCanvasElement, options?: CreateSceneOptions): Promise<AbstractEngine> {
  const stencil = options?.stencil ?? !!options?.enableGlow;
  if (prefersWebGPU() && await WebGPUEngine.IsSupportedAsync) {
    try {
      const engine = new WebGPUEngine(canvas, { antialias: true, stencil, adaptToDeviceRatio: false });
      await engine.initAsync({ jsPath: '', wasmPath: '' }, { jsPath: '', wasmPath: '' });
      return engine;
    } catch (error) {
      console.warn('[SceneManager] WebGPU unavailable, using WebGL:', error);
    }
  }
  return new Engine(canvas, true, {
    preserveDrawingBuffer: options?.preserveDrawingBuffer ?? false,
    stencil,
  });
}

/** Scene with the best available engine (WebGPU is asynchronous to start). */
export async function createSceneAsync(canvas: HTMLCanvasElement, options?: CreateSceneOptions): Promise<SceneContext> {
  return createScene(canvas, options, await createEngine(canvas, options));
}

export function createScene(
  canvas: HTMLCanvasElement,
  options?: CreateSceneOptions,
  existingEngine?: AbstractEngine,
): SceneContext {
  // Suppress Draco normalized-flag warnings
  Logger.LogLevels = Logger.ErrorLogLevel;
  shareIdenticalShaderVariants();
  installUniformNameCache();
  installShaderFixes();

  const coarsePointer = window.matchMedia?.('(pointer: coarse)').matches ?? false;
  const maxDevicePixelRatio = options?.maxDevicePixelRatio ?? (coarsePointer ? 1.5 : 2);

  const engine = existingEngine ?? new Engine(canvas, true, {
    preserveDrawingBuffer: options?.preserveDrawingBuffer ?? false,
    stencil: options?.stencil ?? !!options?.enableGlow,
  });
  engine.setHardwareScalingLevel(1 / Math.min(window.devicePixelRatio || 1, maxDevicePixelRatio));
  // Tablets (Safari/iPadOS) reload a tab under memory pressure. Textures above
  // 2048 px are scaled down on upload there; on an 11-13" screen this is not
  // visible. PCs keep full resolution. `?maxtex=<px>` (0 = unlimited) overrides.
  const textureLimit = maxTextureSizeFor(coarsePointer);
  if (textureLimit && !engine.isWebGPU) {
    const caps = engine.getCaps();
    caps.maxTextureSize = Math.min(caps.maxTextureSize, textureLimit);
  }
  // WebGPU keeps its multisample target at the pre-scaling size unless forced.
  if (engine.isWebGPU) engine.resize(true);

  // Uniform buffers stay off: measured on Chromium/ANGLE (D3D11) they cost
  // 2-3 ms more per frame in this scene than individual uniforms, and WebKit
  // emulates them on Metal. `?ubo=1` enables them for device measurements; each
  // light then needs its own block (WebGL2 guarantees 12 per stage), so the
  // per-material light count is capped while they are in use (see below).
  const uniformBufferLightLimit = uniformBufferLights(engine);
  if (!engine.isWebGPU) (engine as Engine).disableUniformBuffers = uniformBufferLightLimit === 0;

  const scene = new Scene(engine);
  if (uniformBufferLightLimit) capMaterialLights(scene, uniformBufferLightLimit);
  scene.clearColor = new Color4(0.04, 0.055, 0.1, 1);

  // Linear fog to fade the ground grid edges into the background
  scene.fogMode = Scene.FOGMODE_LINEAR;
  scene.fogColor = new Color3(0.04, 0.055, 0.1);
  scene.fogStart = 70;
  scene.fogEnd = 85;

  // Camera
  const camera = new ArcRotateCamera(
    'cam',
    Tools.ToRadians(0),
    Tools.ToRadians(0.5),
    22,
    Vector3.Zero(),
    scene,
  );
  camera.fov = 0.6;
  camera.minZ = 0.1;
  camera.maxZ = 100;
  camera.inputs.clear();
  camera.inputs.addMouseWheel();
  camera.inputs.addPointers();
  camera.panningAxis = new Vector3(1, 1, 1);
  camera.lowerRadiusLimit = 5;
  camera.upperRadiusLimit = 60;
  applyCameraControlSensitivity(camera);
  camera.attachControl(canvas, true);

  // Ambient fill light — gentle fill so HA lights stand out
  const hemiLight = new HemisphericLight('hemi', new Vector3(0, 1, 0), scene);
  hemiLight.intensity = 0.4;
  hemiLight.diffuse = new Color3(1.0, 1.0, 1.0);
  hemiLight.groundColor = new Color3(0.4, 0.4, 0.4);

  // Directional sun light
  const sunLight = new DirectionalLight('sun', new Vector3(-1, -2, -1), scene);
  sunLight.intensity = 0.6;
  sunLight.diffuse = new Color3(1.0, 0.95, 0.85);
  sunLight.autoCalcShadowZBounds = true;

  // Glow layer for emissive bloom (dashboard only)
  let glowLayer: GlowLayer | null = null;
  let highlightLayer: HighlightLayer | null = null;
  if (options?.enableGlow) {
    glowLayer = new GlowLayer('glow', scene);
    glowLayer.intensity = 0.8;
    refreshGlowOnChange(scene, glowLayer);

    highlightLayer = new HighlightLayer('pendingHL', scene);
    highlightLayer.innerGlow = false;
    highlightLayer.outerGlow = true;
    highlightLayer.blurHorizontalSize = 1;
    highlightLayer.blurVerticalSize = 1;
  }

  // A wall-mounted dashboard spends most time without input. Then only
  // ambient animations change, which look fine at a reduced frame rate.
  const idleFrameRate = options?.idleFrameRate ?? 30;
  const idleFrameInterval = idleFrameRate > 0 ? 1000 / idleFrameRate : 0;
  let lastActivity = performance.now();
  let lastChange = performance.now();
  let lastRequest = performance.now();
  let followUpFrames = 0;
  let lastRender = 0;
  const changeMonitor = new SceneChangeMonitor(scene);
  const requestRender = () => { lastChange = lastRequest = performance.now(); };
  const isStatic = (quietMs = 3000, ignoreChanges = false) => {
    const now = performance.now();
    return !document.hidden && now - lastActivity > quietMs && (ignoreChanges || now - lastChange > quietMs);
  };
  const lastView = new Float64Array(16);
  const reportedRenderErrors = new Set<string>();
  const markActive = () => { lastActivity = performance.now(); };
  const activityEvents = ['pointerdown', 'pointermove', 'pointerup', 'wheel', 'keydown', 'touchstart'] as const;
  activityEvents.forEach(type => window.addEventListener(type, markActive, { passive: true, capture: true }));
  window.addEventListener('resize', markActive);

  const renderFrame = () => {
    if (document.hidden) return;
    const now = performance.now();
    if (idleFrameInterval && now - lastActivity > IDLE_AFTER_MS) {
      // Without input: idle frame rate while something changes (animations,
      // HA updates), otherwise only a low floor rate. Frames that would be
      // identical are skipped. A little jitter allowance lets a 60 Hz display
      // settle at every 2nd frame for 30 fps.
      const interval = followUpFrames > 0 || now - lastRequest < CHANGE_HOLD_MS ? idleFrameInterval : STATIC_FRAME_INTERVAL_MS;
      if (now - lastRender < interval - 4) return;
    }
    lastRender = now;
    try {
      scene.render();
    } catch (error) {
      // An exception inside requestAnimationFrame would end Babylon's loop for
      // good (frozen dashboard). Log it once and keep rendering later frames.
      const message = String((error as Error)?.message ?? error);
      if (!reportedRenderErrors.has(message)) {
        reportedRenderErrors.add(message);
        console.error('[SceneManager] Frame failed, continuing:', error);
      }
    }
    // Inertia, camera flights and walkthrough movement count as activity.
    const view = scene.activeCamera?.getViewMatrix().m;
    if (view) {
      let moved = false;
      for (let i = 0; i < 16; i++) if (view[i] !== lastView[i]) { moved = true; lastView[i] = view[i]; }
      if (moved) lastActivity = now;
    }
    if (followUpFrames > 0) followUpFrames--;
    if (changeMonitor.check()) { lastChange = now; followUpFrames = CHANGE_FOLLOW_UP_FRAMES; }
  };
  let renderLoopRunning = false;
  const startRenderLoop = () => {
    if (renderLoopRunning) return;
    engine.runRenderLoop(renderFrame);
    renderLoopRunning = true;
  };
  const stopRenderLoop = () => {
    if (!renderLoopRunning) return;
    engine.stopRenderLoop(renderFrame);
    renderLoopRunning = false;
  };

  startRenderLoop();
  const disposePerfOverlay = new URLSearchParams(location.search).has('perf') ? createPerfOverlay(engine, scene) : null;

  const onResize = () => engine.resize();
  window.addEventListener('resize', onResize);

  // The loop keeps running while the page is hidden and simply skips frames
  // (browsers pause requestAnimationFrame there anyway). Stopping and
  // restarting it could leave the WebGPU engine without a queued frame.
  const onVisibilityChange = () => {
    if (document.hidden) return;
    engine.resize();
    markActive();
    requestRender();
  };
  document.addEventListener('visibilitychange', onVisibilityChange);

  function dispose() {
    window.removeEventListener('resize', onResize);
    activityEvents.forEach(type => window.removeEventListener(type, markActive, { capture: true }));
    window.removeEventListener('resize', markActive);
    document.removeEventListener('visibilitychange', onVisibilityChange);
    stopRenderLoop();
    disposePerfOverlay?.();
    scene.dispose();
    engine.dispose();
  }

  return { engine, scene, camera, hemiLight, sunLight, glowLayer, highlightLayer, requestRender, isStatic, dispose };
}

/**
 * Create a shadow generator for the sun (directional) light.
 * Call after model is loaded, passing all meshes that should cast shadows.
 */
export function setupSunShadows(
  ctx: SceneContext,
  casters: AbstractMesh[],
  modelDiagonal?: number,
  resolution = 512,
): ShadowGenerator | null {
  // Fixed shadow frustum covering the whole model. The light's position
  // is set in updateSunPosition() so the frustum is centered correctly.
  if (modelDiagonal) {
    ctx.sunLight.shadowFrustumSize = modelDiagonal * 1.5;
    ctx.sunLight.shadowMinZ = 0.1;
    ctx.sunLight.shadowMaxZ = 200;
  }

  if (resolution === 0) return null; // shadows off

  const sg = new ShadowGenerator(resolution, ctx.sunLight);
  sg.usePercentageCloserFiltering = true;
  sg.filteringQuality = ShadowGenerator.QUALITY_MEDIUM;
  sg.bias = 0.001;
  sg.normalBias = 0.02;

  for (const mesh of casters) {
    sg.addShadowCaster(mesh, false);
  }

  batchStaticSunShadows(sg);
  renderSunShadowsOnChange(sg);

  return sg;
}

/**
 * The sun moves once per minute, so re-rendering its shadow map every frame is
 * wasted GPU time. Render once, then only when the light or a caster changes.
 * Static batches invalidate themselves (ShadowCasterBatch); remaining casters
 * are tracked via their world-matrix update flag, visibility and material.
 */
function sameMatrix(a: Float64Array, b: ArrayLike<number>): boolean {
  for (let i = 0; i < 16; i++) if (a[i] !== b[i]) return false;
  return true;
}

function renderSunShadowsOnChange(sg: ShadowGenerator): void {
  const map = sg.getShadowMap();
  if (!map) return;
  const sun = sg.getLight();
  const scene = sun.getScene();
  map.refreshRate = 0;

  const lastDirection = sun.direction.clone();
  const lastPosition = sun.position.clone();
  const casters = new Map<AbstractMesh, { matrix: Float64Array; visible: boolean; material: unknown }>();
  // Materials/textures may still be compiling during the first frames.
  let warmupFrames = 120;
  scene.executeWhenReady(() => map.resetRefreshCounter());

  const observer = scene.onBeforeRenderObservable.add(() => {
    if (!sun.shadowEnabled) return;
    let dirty = warmupFrames > 0;
    if (warmupFrames > 0) warmupFrames--;
    if (!sun.direction.equals(lastDirection) || !sun.position.equals(lastPosition)) {
      lastDirection.copyFrom(sun.direction);
      lastPosition.copyFrom(sun.position);
      dirty = true;
    }
    let animationsPlaying: boolean | undefined;
    const renderList = map.renderList ?? [];
    for (const mesh of renderList) {
      if (mesh.metadata?.shadowBatch) continue;
      // Parents may recompute identical matrices, so compare values, not update flags.
      const matrix = mesh.computeWorldMatrix().m;
      const visible = mesh.isEnabled() && mesh.isVisible;
      const previous = casters.get(mesh);
      if (!previous || previous.visible !== visible || previous.material !== mesh.material || !sameMatrix(previous.matrix, matrix)) {
        if (previous) { previous.matrix.set(matrix); previous.visible = visible; previous.material = mesh.material; }
        else casters.set(mesh, { matrix: Float64Array.from(matrix), visible, material: mesh.material });
        dirty = true;
      } else if ((mesh.skeleton || mesh.morphTargetManager) && visible) {
        animationsPlaying ??= scene.animationGroups.some(group => group.isPlaying);
        if (animationsPlaying) dirty = true;
      }
    }
    if (casters.size > renderList.length) {
      const current = new Set(renderList);
      for (const mesh of casters.keys()) if (!current.has(mesh)) { casters.delete(mesh); dirty = true; }
    }
    if (dirty) map.resetRefreshCounter();
  });
  map.onDisposeObservable.addOnce(() => scene.onBeforeRenderObservable.remove(observer));
}
