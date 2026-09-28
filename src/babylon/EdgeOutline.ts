import {
  type Scene,
  type Camera,
  type AbstractMesh,
  PostProcess,
  Effect,
  GeometryBufferRenderer,
  type DepthRenderer,
  Constants,
} from '@babylonjs/core';

const SHADER_NAME = 'edgeOutline';

// Fragment shader: edge detection via normal discontinuity (dot-product).
// Uses GBR (model-only) depth+normals for edge detection, plus the full-scene
// depth renderer to suppress edges where a non-model mesh (light) occludes the model.
const FRAGMENT_SHADER = `
precision highp float;

varying vec2 vUV;

uniform sampler2D textureSampler;   // scene color
uniform sampler2D normalSampler;    // view-space normals from GBR (model meshes only)
uniform sampler2D depthSampler;     // view-space depth from GBR (model meshes only)
uniform sampler2D sceneDepthSampler; // full-scene depth (all meshes) from DepthRenderer
uniform vec2 texelSize;             // 1/resolution
uniform float normalThreshold;      // dot product threshold (lower = more edges)
uniform float cameraNear;
uniform float cameraFar;
uniform vec4 edgeColor;

vec3 sampleNormal(vec2 uv) {
  return texture2D(normalSampler, uv).rgb;
}

float sampleGbrDepth(vec2 uv) {
  return texture2D(depthSampler, uv).r;
}

// DepthRenderer stores depth as linear [0,1] mapped from near..far
// Convert to view-space depth to compare with GBR
float sampleSceneDepth(vec2 uv) {
  float d = texture2D(sceneDepthSampler, uv).r;
  return cameraNear + d * (cameraFar - cameraNear);
}

// Detect edge at a given UV by comparing its normal to 4 cardinal neighbours.
// Returns 0.0 (no edge) to 1.0 (strong edge) with smooth falloff.
float detectEdge(vec2 uv, vec2 step, float threshold) {
  vec3 nc = sampleNormal(uv);
  if (dot(nc, nc) < 0.0001) return 0.0;
  nc = normalize(nc);
  float dc = sampleGbrDepth(uv);

  float maxEdge = 0.0;
  vec3 n;
  float dn;

  n = sampleNormal(uv + vec2(0.0, step.y));
  if (dot(n, n) < 0.0001) maxEdge = max(maxEdge, 1.0);
  else {
    dn = sampleGbrDepth(uv + vec2(0.0, step.y));
    maxEdge = max(maxEdge, 1.0 - smoothstep(threshold - 0.15, threshold, dot(nc, normalize(n))));
    maxEdge = max(maxEdge, smoothstep(0.015, 0.06, abs(dc - dn)));
  }

  n = sampleNormal(uv + vec2(0.0, -step.y));
  if (dot(n, n) < 0.0001) maxEdge = max(maxEdge, 1.0);
  else {
    dn = sampleGbrDepth(uv + vec2(0.0, -step.y));
    maxEdge = max(maxEdge, 1.0 - smoothstep(threshold - 0.15, threshold, dot(nc, normalize(n))));
    maxEdge = max(maxEdge, smoothstep(0.015, 0.06, abs(dc - dn)));
  }

  n = sampleNormal(uv + vec2(-step.x, 0.0));
  if (dot(n, n) < 0.0001) maxEdge = max(maxEdge, 1.0);
  else {
    dn = sampleGbrDepth(uv + vec2(-step.x, 0.0));
    maxEdge = max(maxEdge, 1.0 - smoothstep(threshold - 0.15, threshold, dot(nc, normalize(n))));
    maxEdge = max(maxEdge, smoothstep(0.015, 0.06, abs(dc - dn)));
  }

  n = sampleNormal(uv + vec2(step.x, 0.0));
  if (dot(n, n) < 0.0001) maxEdge = max(maxEdge, 1.0);
  else {
    dn = sampleGbrDepth(uv + vec2(step.x, 0.0));
    maxEdge = max(maxEdge, 1.0 - smoothstep(threshold - 0.15, threshold, dot(nc, normalize(n))));
    maxEdge = max(maxEdge, smoothstep(0.015, 0.06, abs(dc - dn)));
  }

  return maxEdge;
}

void main(void) {
  vec4 baseColor = texture2D(textureSampler, vUV);
  vec2 step = texelSize;

  // Quick background / occlusion check at center
  vec3 nc = sampleNormal(vUV);
  if (dot(nc, nc) < 0.0001) {
    gl_FragColor = baseColor;
    return;
  }
  float gbrDepth = sampleGbrDepth(vUV);
  float sceneDepth = sampleSceneDepth(vUV);
  if (sceneDepth < gbrDepth * 0.95) {
    gl_FragColor = baseColor;
    return;
  }

  // 4x MSAA: evaluate edge detection at 4 sub-pixel offsets (rotated grid)
  // and average for smooth anti-aliased edges
  vec2 o1 = vec2( 0.125, 0.375) * texelSize;
  vec2 o2 = vec2(-0.375, 0.125) * texelSize;
  vec2 o3 = vec2( 0.375,-0.125) * texelSize;
  vec2 o4 = vec2(-0.125,-0.375) * texelSize;

  float edge = (
    detectEdge(vUV + o1, step, normalThreshold) +
    detectEdge(vUV + o2, step, normalThreshold) +
    detectEdge(vUV + o3, step, normalThreshold) +
    detectEdge(vUV + o4, step, normalThreshold)
  ) * 0.25;

  gl_FragColor = mix(baseColor, edgeColor, edge * edgeColor.a);
}
`;

// Register the shader once
Effect.ShadersStore[SHADER_NAME + 'FragmentShader'] = FRAGMENT_SHADER;

export interface EdgeOutlineOptions {
  /** Avoid allocating auxiliary render targets when the effect starts hidden. */
  enabled?: boolean;
  /** Dot-product threshold for normal edges. Lower = more edges. Default 0.9 (catches ~25° corners). */
  normalThreshold?: number;
  edgeColor?: [number, number, number, number]; // RGBA 0-1
  /** Meshes to include in the GBR. If set, only these meshes produce edges. */
  meshes?: AbstractMesh[];
}

export interface EdgeOutlineControls {
  postProcess: PostProcess;
  /** Enable or disable the post-process edge detection. */
  setEnabled: (enabled: boolean) => void;
  dispose: () => void;
}

/**
 * Create a screen-space edge detection post-process using normal + depth buffers.
 * Focuses on inner corners (normal discontinuities) that the built-in
 * enableEdgesRendering() cannot detect across mesh boundaries.
 */
export function createEdgeOutline(
  scene: Scene,
  camera: Camera,
  options?: EdgeOutlineOptions,
): EdgeOutlineControls {
  const normalThreshold = options?.normalThreshold ?? 0.9;
  const edgeColor = options?.edgeColor ?? [0, 0, 0, 1];

  // These auxiliary renderers are owned exclusively by the outline in this scene.
  // Detaching the post-process alone does not stop Babylon's auxiliary passes.
  let gbr: GeometryBufferRenderer | null = null;
  let depthRenderer: DepthRenderer | null = null;
  let depthIndex = 0, normalIndex = 0;
  const enableTargets = () => {
    gbr = scene.enableGeometryBufferRenderer();
    if (!gbr) throw new Error('GeometryBufferRenderer not supported');
    gbr.enablePosition = false;
    gbr.renderTransparentMeshes = false;
    if (options?.meshes) gbr.getGBuffer().renderList = options.meshes;
    depthRenderer = scene.enableDepthRenderer(camera);
    depthIndex = gbr.getTextureIndex(GeometryBufferRenderer.DEPTH_TEXTURE_TYPE);
    normalIndex = gbr.getTextureIndex(GeometryBufferRenderer.NORMAL_TEXTURE_TYPE);
  };
  const disableTargets = () => {
    if (gbr) scene.disableGeometryBufferRenderer();
    if (depthRenderer) scene.disableDepthRenderer(camera);
    gbr = null;
    depthRenderer = null;
  };
  let enabled = options?.enabled ?? true;
  let disposed = false;
  if (enabled) enableTargets();

  const postProcess = new PostProcess(
    'edgeOutlinePost',
    SHADER_NAME,
    ['texelSize', 'normalThreshold', 'edgeColor', 'cameraNear', 'cameraFar'],
    ['depthSampler', 'normalSampler', 'sceneDepthSampler'],
    1.0,
    camera,
    Constants.TEXTURE_BILINEAR_SAMPLINGMODE,
    scene.getEngine(),
  );
  if (!enabled) camera.detachPostProcess(postProcess);

  postProcess.onApply = (effect) => {
    if (!gbr || !depthRenderer) return;
    const w = postProcess.width;
    const h = postProcess.height;
    effect.setFloat2('texelSize', 1 / w, 1 / h);
    effect.setFloat('normalThreshold', normalThreshold);
    effect.setFloat4('edgeColor', edgeColor[0], edgeColor[1], edgeColor[2], edgeColor[3]);
    effect.setFloat('cameraNear', camera.minZ);
    effect.setFloat('cameraFar', camera.maxZ);

    const textures = gbr.getGBuffer().textures;
    effect.setTexture('depthSampler', textures[depthIndex]);
    effect.setTexture('normalSampler', textures[normalIndex]);
    effect.setTexture('sceneDepthSampler', depthRenderer.getDepthMap());
  };

  return {
    postProcess,
    setEnabled(nextEnabled: boolean) {
      if (disposed || enabled === nextEnabled) return;
      if (nextEnabled) {
        enableTargets();
        camera.attachPostProcess(postProcess);
      } else {
        camera.detachPostProcess(postProcess);
        disableTargets();
      }
      enabled = nextEnabled;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      if (enabled) camera.detachPostProcess(postProcess);
      postProcess.dispose(camera);
      disableTargets();
    },
  };
}
