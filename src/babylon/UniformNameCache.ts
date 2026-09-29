import { UniformBuffer, type Effect } from '@babylonjs/core';

/**
 * Uniform buffers stay off on WebGL (see SceneManager). Babylon then sets light
 * and shadow uniforms individually, building the name as `name + suffix`
 * ("vLightData" + "3") on every bind: for ~900 draws with up to six lights about
 * 50 000 new strings per frame (~2 MB of garbage). The composed names are cached
 * here instead; the uniform calls themselves are unchanged.
 *
 * Only the no-UBO update methods that take a light-index suffix are replaced, and
 * only while their Babylon counterparts exist, so an upgrade that renames them
 * simply keeps Babylon's own implementation.
 */
const names = new Map<string, Map<string, string>>();

function uniformName(name: string, suffix: string): string {
  if (!suffix) return name;
  let bySuffix = names.get(suffix);
  if (!bySuffix) { bySuffix = new Map(); names.set(suffix, bySuffix); }
  let full = bySuffix.get(name);
  if (full === undefined) { full = name + suffix; bySuffix.set(name, full); }
  return full;
}

type Color = { r: number; g: number; b: number };
type NoUboBuffer = { _currentEffect: Effect };
type Methods = Record<string, (this: NoUboBuffer, ...args: never[]) => void>;

const replacements: Methods = {
  _updateFloat2ForEffect(this: NoUboBuffer, name: string, x: number, y: number, suffix = '') { this._currentEffect.setFloat2(uniformName(name, suffix), x, y); },
  _updateFloat3ForEffect(this: NoUboBuffer, name: string, x: number, y: number, z: number, suffix = '') { this._currentEffect.setFloat3(uniformName(name, suffix), x, y, z); },
  _updateFloat4ForEffect(this: NoUboBuffer, name: string, x: number, y: number, z: number, w: number, suffix = '') { this._currentEffect.setFloat4(uniformName(name, suffix), x, y, z, w); },
  _updateColor3ForEffect(this: NoUboBuffer, name: string, color: Color, suffix = '') { this._currentEffect.setColor3(uniformName(name, suffix), color as never); },
  _updateColor4ForEffect(this: NoUboBuffer, name: string, color: Color, alpha: number, suffix = '') { this._currentEffect.setColor4(uniformName(name, suffix), color as never, alpha); },
} as unknown as Methods;

let installed = false;

/** Install once, before lights and materials create their uniform buffers. */
export function installUniformNameCache(): void {
  if (installed) return;
  installed = true;
  const prototype = UniformBuffer.prototype as unknown as Methods;
  for (const [key, method] of Object.entries(replacements)) {
    if (typeof prototype[key] === 'function') prototype[key] = method;
  }
}

/** For tests: the same composed-name instance is returned on every call. */
export const cachedUniformName = uniformName;
