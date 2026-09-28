import { type Mesh, type InstancedMesh } from '@babylonjs/core';

/** One geometry/material source for each identical decorative shape. */
export class ExteriorMeshPool {
  private sources = new Map<string, Mesh>();

  create(key: string, name: string, build: () => Mesh): Mesh | InstancedMesh {
    const source = this.sources.get(key);
    if (!source) {
      const mesh = build();
      this.sources.set(key, mesh);
      return mesh;
    }
    const instance = source.createInstance(name);
    // Instances otherwise inherit the first object's transform.
    instance.position.setAll(0);
    instance.rotation.setAll(0);
    instance.rotationQuaternion = null;
    instance.scaling.setAll(1);
    instance.parent = null;
    return instance;
  }
}
