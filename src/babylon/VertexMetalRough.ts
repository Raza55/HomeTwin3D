import { MaterialPluginBase, PBRMaterial, ShaderLanguage, type Material, type MaterialDefines } from '@babylonjs/core';

/**
 * Per-vertex metallic and roughness for merged render batches.
 *
 * Untextured surfaces often share a material except for base color, metallic
 * and roughness. Base color already travels as vertex color; this plugin feeds
 * metallic and roughness from the `metalRough` vertex attribute into the one
 * place the PBR shader reads them (`reflectivityBlock(vReflectivityColor, ...)`),
 * keeping the material's IOR and F0 components. Every other part of the PBR
 * lighting is untouched, so the merged surfaces shade exactly like their sources.
 *
 * GLSL only (WebGL, the default engine); render batches do not merge across
 * metallic/roughness under WebGPU.
 */
export const METAL_ROUGH_KIND = 'metalRough';

class VertexMetalRoughPlugin extends MaterialPluginBase {
  constructor(material: PBRMaterial) {
    super(material, 'VertexMetalRough', 200, { VERTEX_METALROUGH: false });
    this._enable(true);
  }

  override prepareDefines(defines: MaterialDefines): void {
    defines.VERTEX_METALROUGH = true;
  }

  override getAttributes(attributes: string[]): void {
    attributes.push(METAL_ROUGH_KIND);
  }

  override getClassName(): string {
    return 'VertexMetalRoughPlugin';
  }

  override isCompatible(shaderLanguage: ShaderLanguage): boolean {
    return shaderLanguage === ShaderLanguage.GLSL;
  }

  override getCustomCode(shaderType: string, shaderLanguage = ShaderLanguage.GLSL): { [pointName: string]: string } | null {
    if (shaderLanguage !== ShaderLanguage.GLSL) return null;
    if (shaderType === 'vertex') {
      return {
        CUSTOM_VERTEX_DEFINITIONS: `attribute vec2 ${METAL_ROUGH_KIND};\nvarying vec2 vMetalRough;`,
        CUSTOM_VERTEX_MAIN_END: `vMetalRough = ${METAL_ROUGH_KIND};`,
      };
    }
    return {
      CUSTOM_FRAGMENT_DEFINITIONS: 'varying vec2 vMetalRough;',
      // The only read of the metallic/roughness uniform (metallic workflow: r, g).
      '!reflectivityBlock\\(\\s*vReflectivityColor': 'reflectivityBlock(vec4(vMetalRough, vReflectivityColor.zw)',
    };
  }
}

/** Adds the plugin to a batch proxy's own material copy. */
export function useVertexMetalRough(material: Material): void {
  if (material instanceof PBRMaterial && !material.pluginManager?.getPlugin('VertexMetalRough')) new VertexMetalRoughPlugin(material);
}

/** Metallic and roughness as the PBR metallic workflow resolves them (unset = 1). */
export function metalRoughOf(material: Material | null): [number, number] | null {
  if (!(material instanceof PBRMaterial) || (material.metallic == null && material.roughness == null)) return null;
  return [material.metallic ?? 1, material.roughness ?? 1];
}
