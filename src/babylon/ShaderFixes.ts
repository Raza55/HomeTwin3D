import { ShaderStore } from '@babylonjs/core';
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
}
