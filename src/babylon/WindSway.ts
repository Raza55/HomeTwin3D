import type { Material } from '@babylonjs/core/Materials/material.js';
import type { MaterialDefines } from '@babylonjs/core/Materials/materialDefines.js';
import { MaterialPluginBase } from '@babylonjs/core/Materials/materialPluginBase.js';
import { ShaderLanguage } from '@babylonjs/core/Materials/shaderLanguage.js';
import type { UniformBuffer } from '@babylonjs/core/Materials/uniformBuffer.js';

/**
 * Wind sway for merged foliage: displaces vertices in the vertex shader, so the
 * statically merged park trees can move without being split up again.
 * Neighbouring vertices get slightly different phases, so crowns flex instead
 * of sliding as a block. GLSL for WebGL, WGSL for WebGPU.
 */
class WindSwayPlugin extends MaterialPluginBase {
  constructor(material: Material, private readonly state: WindState) {
    super(material, 'HomeTwinWindSway', 210, { HT_WIND_SWAY: false });
    this._enable(true);
  }

  override prepareDefines(defines: MaterialDefines): void { defines.HT_WIND_SWAY = true; }
  override getClassName(): string { return 'HomeTwinWindSwayPlugin'; }
  override isCompatible(shaderLanguage: ShaderLanguage): boolean { return shaderLanguage === ShaderLanguage.GLSL || shaderLanguage === ShaderLanguage.WGSL; }

  override getUniforms(shaderLanguage = ShaderLanguage.GLSL) {
    // WGSL reads the value from the material's uniform block; the GLSL line serves engines without uniform buffers.
    const ubo = [{ name: 'htWind', size: 4, type: 'vec4' }];
    return shaderLanguage === ShaderLanguage.WGSL ? { ubo } : { ubo, vertex: '#ifdef HT_WIND_SWAY\nuniform vec4 htWind;\n#endif' };
  }

  override bindForSubMesh(uniformBuffer: UniformBuffer): void {
    const s = this.state;
    uniformBuffer.updateFloat4('htWind', s.time, s.amplitude, s.dirX, s.dirZ);
  }

  override getCustomCode(shaderType: string, shaderLanguage = ShaderLanguage.GLSL): { [pointName: string]: string } | null {
    if (shaderType !== 'vertex') return null;
    // Same motion as the GLSL code below.
    if (shaderLanguage === ShaderLanguage.WGSL) return {
      CUSTOM_VERTEX_UPDATE_POSITION: `#ifdef HT_WIND_SWAY
        {
          let htWind = uniforms.htWind;
          let htPhase = positionUpdated.x * 0.35 + positionUpdated.z * 0.27 + positionUpdated.y * 0.6;
          let htGust = sin(htWind.x * 1.6 + htPhase) + 0.45 * sin(htWind.x * 3.3 + htPhase * 1.9) + 0.25 * sin(htWind.x * 0.7);
          let htSway = htGust * htWind.y;
          positionUpdated.x += htWind.z * htSway;
          positionUpdated.z += htWind.w * htSway;
          positionUpdated.y -= abs(htSway) * 0.12;
        }
        #endif`,
    };
    return {
      CUSTOM_VERTEX_UPDATE_POSITION: `#ifdef HT_WIND_SWAY
        {
          float htPhase = positionUpdated.x * .35 + positionUpdated.z * .27 + positionUpdated.y * .6;
          float htGust = sin(htWind.x * 1.6 + htPhase) + .45 * sin(htWind.x * 3.3 + htPhase * 1.9) + .25 * sin(htWind.x * .7);
          float htSway = htGust * htWind.y;
          positionUpdated.x += htWind.z * htSway;
          positionUpdated.z += htWind.w * htSway;
          positionUpdated.y -= abs(htSway) * .12;
        }
        #endif`,
    };
  }
}

export interface WindState { time: number; amplitude: number; dirX: number; dirZ: number }

/** Shared, mutable wind for every foliage material that gets the plugin. */
export function attachWindSway(materials: Material[], state: WindState): void {
  for (const material of materials) {
    if (!material.pluginManager?.getPlugin('HomeTwinWindSway')) new WindSwayPlugin(material, state);
  }
}
