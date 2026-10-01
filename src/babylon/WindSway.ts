import { MaterialPluginBase, ShaderLanguage, type Material, type MaterialDefines, type UniformBuffer } from '@babylonjs/core';

/**
 * Wind sway for merged foliage: displaces vertices in the vertex shader, so the
 * statically merged park trees can move without being split up again.
 * Neighbouring vertices get slightly different phases, so crowns flex instead
 * of sliding as a block. GLSL only; under WebGPU the trees simply stand still.
 */
class WindSwayPlugin extends MaterialPluginBase {
  constructor(material: Material, private readonly state: WindState) {
    super(material, 'HomeTwinWindSway', 210, { HT_WIND_SWAY: false });
    this._enable(true);
  }

  override prepareDefines(defines: MaterialDefines): void { defines.HT_WIND_SWAY = true; }
  override getClassName(): string { return 'HomeTwinWindSwayPlugin'; }
  override isCompatible(shaderLanguage: ShaderLanguage): boolean { return shaderLanguage === ShaderLanguage.GLSL; }

  override getUniforms() {
    return { ubo: [{ name: 'htWind', size: 4, type: 'vec4' }], vertex: '#ifdef HT_WIND_SWAY\nuniform vec4 htWind;\n#endif' };
  }

  override bindForSubMesh(uniformBuffer: UniformBuffer): void {
    const s = this.state;
    uniformBuffer.updateFloat4('htWind', s.time, s.amplitude, s.dirX, s.dirZ);
  }

  override getCustomCode(shaderType: string, shaderLanguage = ShaderLanguage.GLSL): { [pointName: string]: string } | null {
    if (shaderType !== 'vertex' || shaderLanguage !== ShaderLanguage.GLSL) return null;
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
