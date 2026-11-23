/**
 * Babylon modules that only register behaviour (prototype methods, scene
 * components, engine extensions).
 *
 * The app imports Babylon per module so the bundler can drop unused parts
 * (the `@babylonjs/core` barrel pulls in everything, several MB). Per-module
 * imports do not run these registrations on their own: without them a call
 * such as `scene.beginAnimation` or `new DynamicTexture` fails at runtime
 * while TypeScript still accepts it. SceneManager imports this file before it
 * creates an engine.
 *
 * When code starts to use another Babylon feature that is registered this way
 * (Babylon reports "... needs to be imported before as it contains a
 * side-effect required by your code"), add its module here.
 */

// Scene.beginAnimation / stopAnimation, per-frame animation step.
import '@babylonjs/core/Animations/animatable.js';
// Scene.pick and picking rays (also used by Babylon's pointer handling).
import '@babylonjs/core/Culling/ray.js';

// Engine extensions (WebGL) that the texture and renderer classes call into.
import '@babylonjs/core/Engines/Extensions/engine.dynamicTexture.js';
import '@babylonjs/core/Engines/Extensions/engine.multiRender.js';
import '@babylonjs/core/Engines/WebGPU/Extensions/engine.multiRender.js';
import '@babylonjs/core/Engines/AbstractEngine/abstractEngine.cubeTexture.js';

// Scene components behind GlowLayer/HighlightLayer, clustered lights and particles.
import '@babylonjs/core/Layers/effectLayerSceneComponent.js';
import '@babylonjs/core/Lights/Clustered/clusteredLightingSceneComponent.js';
import '@babylonjs/core/Particles/particleSystemComponent.js';

// Scene.enableDepthRenderer / enableGeometryBufferRenderer, edges, outlines.
import '@babylonjs/core/Rendering/depthRendererSceneComponent.js';
import '@babylonjs/core/Rendering/geometryBufferRendererSceneComponent.js';
import '@babylonjs/core/Rendering/edgesRenderer.js';
import '@babylonjs/core/Rendering/outlineRenderer.js';
// AbstractMesh.showBoundingBox (object selection in the editor).
import '@babylonjs/core/Rendering/boundingBoxRenderer.js';

// Image based lighting: irradiance (spherical harmonics) of reflection textures for PBR.
import '@babylonjs/core/Materials/Textures/baseTexture.polynomial.js';
// Image processing colour curves (bound by materials when enabled).
import '@babylonjs/core/Materials/colorCurves.js';
// Texture rescaling on WebGL 1 (non power of two textures with mipmaps).
import '@babylonjs/core/PostProcesses/passPostProcess.js';
// Loading screen shown by SceneLoader while a model loads.
import '@babylonjs/core/Loading/loadingScreen.js';
