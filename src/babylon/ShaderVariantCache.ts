import { MaterialDefines } from '@babylonjs/core';

/**
 * Babylon builds the shader cache key from a material's #define lines in the
 * order their keys were first added to that sub-mesh's defines object. Light
 * defines (LIGHT3, SHADOW3, ...) are added as lights come and go, so the same
 * logical shader gets different keys on different surfaces and is compiled
 * again (each time a synchronous stall of several milliseconds).
 *
 * The order of #define lines has no effect on the shader: all of them precede
 * the code. Sorting the keys makes identical variants share one compiled effect.
 */
let installed = false;

export function shareIdenticalShaderVariants(): void {
  if (installed) return;
  installed = true;
  const prototype = MaterialDefines.prototype as MaterialDefines & { _keys: string[]; rebuild(): void };
  const rebuild = prototype.rebuild;
  prototype.rebuild = function (this: MaterialDefines & { _keys: string[] }) {
    rebuild.call(this);
    this._keys.sort();
  };
}
