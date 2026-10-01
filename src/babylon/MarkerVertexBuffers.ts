import type { Mesh } from '@babylonjs/core';

/** Keep the last uploaded Float32 values; layout and hit testing still run every frame. */
export class MarkerVertexBuffers {
  private uploaded = new Map<string, Float32Array>();

  /** Newly allocated GPU buffers must receive their data even if it matches the old allocation. */
  reset(): void { this.uploaded.clear(); }

  upload(mesh: Pick<Mesh, 'updateVerticesData'>, kind: string, values: Float32Array): void {
    let previous = this.uploaded.get(kind);
    if (previous?.length === values.length) {
      let unchanged = true;
      for (let i = 0; i < values.length; i++) {
        if (!Object.is(values[i], previous[i])) { unchanged = false; break; }
      }
      if (unchanged) return;
    }
    mesh.updateVerticesData(kind, values);
    if (!previous || previous.length !== values.length) {
      previous = new Float32Array(values.length);
      this.uploaded.set(kind, previous);
    }
    previous.set(values);
  }
}
