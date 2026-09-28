import {
  Engine,
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
  type AbstractMesh,
} from '@babylonjs/core';
import { batchStaticSunShadows } from './ShadowCasterBatch';

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
  engine: Engine;
  scene: Scene;
  camera: ArcRotateCamera;
  hemiLight: HemisphericLight;
  sunLight: DirectionalLight;
  glowLayer: GlowLayer | null;
  highlightLayer: HighlightLayer | null;
  dispose: () => void;
}

export interface CreateSceneOptions {
  enableGlow?: boolean;
  maxDevicePixelRatio?: number;
  preserveDrawingBuffer?: boolean;
  stencil?: boolean;
}

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

export function createScene(
  canvas: HTMLCanvasElement,
  options?: CreateSceneOptions,
): SceneContext {
  // Suppress Draco normalized-flag warnings
  Logger.LogLevels = Logger.ErrorLogLevel;

  const coarsePointer = window.matchMedia?.('(pointer: coarse)').matches ?? false;
  const maxDevicePixelRatio = options?.maxDevicePixelRatio ?? (coarsePointer ? 1.5 : 2);

  const engine = new Engine(canvas, true, {
    preserveDrawingBuffer: options?.preserveDrawingBuffer ?? false,
    stencil: options?.stencil ?? !!options?.enableGlow,
  });
  engine.setHardwareScalingLevel(1 / Math.min(window.devicePixelRatio || 1, maxDevicePixelRatio));

  // Disable UBOs so lights use regular uniforms instead of uniform blocks.
  // WebGL2 limits uniform blocks to 12 per shader stage which caps lights at ~10.
  // Regular uniforms support many more lights (20+).
  engine.disableUniformBuffers = true;

  const scene = new Scene(engine);
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

    highlightLayer = new HighlightLayer('pendingHL', scene);
    highlightLayer.innerGlow = false;
    highlightLayer.outerGlow = true;
    highlightLayer.blurHorizontalSize = 1;
    highlightLayer.blurVerticalSize = 1;
  }

  const renderFrame = () => scene.render();
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

  const onResize = () => engine.resize();
  window.addEventListener('resize', onResize);

  const onVisibilityChange = () => {
    if (document.hidden) {
      stopRenderLoop();
    } else {
      engine.resize();
      startRenderLoop();
    }
  };
  document.addEventListener('visibilitychange', onVisibilityChange);

  function dispose() {
    window.removeEventListener('resize', onResize);
    document.removeEventListener('visibilitychange', onVisibilityChange);
    stopRenderLoop();
    scene.dispose();
    engine.dispose();
  }

  return { engine, scene, camera, hemiLight, sunLight, glowLayer, highlightLayer, dispose };
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

  return sg;
}
