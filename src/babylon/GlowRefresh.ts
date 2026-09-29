import { type AbstractMesh, type GlowLayer, type Material, type RenderTargetTexture, type Scene } from '@babylonjs/core';
import { MATERIAL_STATE_SIZE, getDynamicTextureVersion, readMaterialState } from './SceneChangeMonitor';

/**
 * The glow texture only depends on the camera, the drawn meshes (transform,
 * visibility, material) and the emissive inputs of their materials. When none
 * of these changed since the last glow render, re-rendering it would produce
 * the identical texture, so the previous one (already blurred) is reused.
 *
 * On a still dashboard this removes the glow pass from most frames; while the
 * camera moves, every frame is rendered as before.
 */

interface MeshState {
  matrix: Float64Array;
  visible: boolean;
  material: Material | null;
}

/** Emissive and alpha inputs per material, compared numerically once per glow check. */
interface MaterialState { values: Float64Array; stamp: number }

export function refreshGlowOnChange(scene: Scene, glow: GlowLayer): () => void {
  const states = new Map<AbstractMesh, MeshState>();
  const materials = new WeakMap<Material, MaterialState>();
  const scratch = new Float64Array(MATERIAL_STATE_SIZE);
  let stamp = 0;
  const materialChanged = (material: Material): boolean => {
    let state = materials.get(material);
    if (!state) {
      state = { values: new Float64Array(MATERIAL_STATE_SIZE), stamp };
      readMaterialState(material, state.values);
      materials.set(material, state);
      return true;
    }
    if (state.stamp === stamp) return false;
    state.stamp = stamp;
    readMaterialState(material, scratch);
    for (let k = 0; k < MATERIAL_STATE_SIZE; k++) if (scratch[k] !== state.values[k]) { state.values.set(scratch); return true; }
    return false;
  };
  const lastTransform = new Float64Array(16);
  let lastTexture: RenderTargetTexture | null = null;
  let lastActive: AbstractMesh[] = [];
  let lastDynamicVersion = -1;
  let lastWidth = 0, lastHeight = 0;
  let animationsPlaying = false;
  // Materials/textures may still be compiling or loading during the first frames.
  let warmupFrames = 120;
  scene.executeWhenReady(() => { warmupFrames = Math.max(warmupFrames, 10); });

  const observer = scene.onAfterActiveMeshesEvaluationObservable.add(() => {
    const texture = (glow as unknown as { _mainTexture?: RenderTargetTexture })._mainTexture;
    if (!texture) return;
    let dirty = warmupFrames > 0;
    stamp++;
    if (warmupFrames > 0) warmupFrames--;
    if (texture !== lastTexture) { lastTexture = texture; texture.refreshRate = 0; dirty = true; }
    const size = texture.getSize();
    if (size.width !== lastWidth || size.height !== lastHeight) { lastWidth = size.width; lastHeight = size.height; dirty = true; }
    const dynamicTextureVersion = getDynamicTextureVersion();
    if (dynamicTextureVersion !== lastDynamicVersion) { lastDynamicVersion = dynamicTextureVersion; dirty = true; }

    const transform = scene.getTransformMatrix().m;
    for (let i = 0; i < 16; i++) if (transform[i] !== lastTransform[i]) { lastTransform[i] = transform[i]; dirty = true; }

    const active = scene.getActiveMeshes();
    if (active.length !== lastActive.length) dirty = true;
    animationsPlaying = scene.animationGroups.some(group => group.isPlaying);
    for (let i = 0; i < active.length; i++) {
      const mesh = active.data[i];
      if (lastActive[i] !== mesh) { lastActive[i] = mesh; dirty = true; }
      // Only a moving camera skips this per-mesh check (it already forces a render).
      if (dirty && states.has(mesh)) continue;
      if ((mesh.skeleton || mesh.morphTargetManager) && animationsPlaying) dirty = true;
      const matrix = mesh.getWorldMatrix().m;
      const visible = mesh.isVisible && mesh.visibility === 1;
      const material = mesh.material;
      if (material && materialChanged(material)) dirty = true;
      const state = states.get(mesh);
      if (!state) {
        states.set(mesh, { matrix: Float64Array.from(matrix), visible, material });
        dirty = true;
        continue;
      }
      if (state.visible !== visible || state.material !== material) {
        state.visible = visible; state.material = material; dirty = true;
      }
      for (let k = 0; k < 16; k++) if (matrix[k] !== state.matrix[k]) { state.matrix.set(matrix); dirty = true; break; }
      if ((mesh as AbstractMesh & { hasThinInstances?: boolean }).hasThinInstances) dirty = true;
    }
    lastActive.length = active.length;
    if (states.size > active.length * 4 + 256) {
      // Forget meshes that left the view long ago (keeps the map bounded).
      const current = new Set(lastActive);
      for (const mesh of states.keys()) if (!current.has(mesh)) states.delete(mesh);
    }
    if (dirty) texture.resetRefreshCounter();
  });
  return () => {
    scene.onAfterActiveMeshesEvaluationObservable.remove(observer);
    if (lastTexture) lastTexture.refreshRate = 1;
  };
}
