import { ShaderStore } from '@babylonjs/core/Engines/shaderStore.js';
import { Light } from '@babylonjs/core/Lights/light.js';
import type { Effect } from '@babylonjs/core/Materials/effect.js';
import type { Scene } from '@babylonjs/core/scene.js';
import '@babylonjs/core/Shaders/ShadersInclude/pbrClusteredLightingFunctions.js';
import '@babylonjs/core/ShadersWGSL/ShadersInclude/pbrClusteredLightingFunctions.js';

/**
 * Babylon 9.28: the clustered-lighting PBR function names its normal `N`, but
 * the sheen branch still refers to `normalW`, which is out of scope there. Any
 * sheen material (fabric: couch, chairs, bedding) lit by the clustered container
 * then fails to compile and is not drawn. The include is patched once, only
 * while the faulty call is present, so a fixed Babylon version is left alone.
 */
const FAULTY = 'computeSheenLighting(preInfo,normalW,';
const FIXED = 'computeSheenLighting(preInfo,N,';
let installed = false;

export function installShaderFixes(): void {
  if (installed) return;
  installed = true;
  // Both includes are imported above, so the stores hold them before any shader compiles.
  for (const store of [ShaderStore.IncludesShadersStore, ShaderStore.IncludesShadersStoreWGSL]) {
    const source = store?.pbrClusteredLightingFunctions;
    if (typeof source === 'string' && source.includes(FAULTY)) store.pbrClusteredLightingFunctions = source.split(FAULTY).join(FIXED);
  }
  keepShadowSamplersBound();
}

/**
 * Switching a light's shadows off (the sun at night, a lamp without receivers)
 * makes every material compile a shader without that shadow. Until it is ready
 * Babylon keeps drawing with the previous shader (shader hot swapping), which
 * still declares the light's shadow sampler, but Light._bindLight no longer
 * binds the shadow map. The sampler then reads whatever texture was left in its
 * unit; for a PCF shadow sampler WebGL rejects the draw call ("Mismatch between
 * texture format and sampler type") and the surface is missing for those frames.
 *
 * Binding the light's existing shadow map in that case keeps the previous shader
 * valid: it shows the last shadows until the new variant takes over.
 */
function keepShadowSamplersBound(): void {
  type Bind = (this: Light, lightIndex: number, scene: Scene, effect: Effect, useSpecular: boolean, receiveShadows?: boolean) => void;
  const prototype = Light.prototype as unknown as { _bindLight: Bind };
  const bind = prototype._bindLight;
  prototype._bindLight = function (lightIndex, scene, effect, useSpecular, receiveShadows = true) {
    bind.call(this, lightIndex, scene, effect, useSpecular, receiveShadows);
    // Babylon bound the shadow map itself.
    if (scene.shadowsEnabled && this.shadowEnabled && receiveShadows) return;
    const sampler = 'shadowTexture' + lightIndex;
    if (effect.getSamplers().indexOf(sampler) < 0) return;
    const generator = this.getShadowGenerator() as { getShadowMapForRendering?(): unknown; usePercentageCloserFiltering?: boolean; useContactHardeningShadow?: boolean } | null;
    const map = generator?.getShadowMapForRendering?.() as Parameters<Effect['setDepthStencilTexture']>[1] | undefined;
    if (!map) return;
    // PCF and PCSS sample the depth texture through a comparison sampler.
    if (generator!.usePercentageCloserFiltering || generator!.useContactHardeningShadow) effect.setDepthStencilTexture(sampler, map);
    else effect.setTexture(sampler, map);
  };
}
