import { Frustum, Mesh, type AbstractMesh, type RenderTargetTexture, type Scene } from '@babylonjs/core';

const installed = new WeakSet<Scene>();

/** The glTF transmission helper uses an explicit list, bypassing normal frustum culling. */
export function optimizeTransmissionPass(scene: Scene): void {
  // Babylon 7's glTF loader attaches this helper without augmenting the Scene type.
  const target = (scene as Scene & { _transmissionHelper?: { getOpaqueTarget(): RenderTargetTexture | null } })._transmissionHelper?.getOpaqueTarget();
  if (!target || installed.has(scene) || target.getCustomRenderList) return;
  installed.add(scene);
  const planes = Frustum.GetPlanes(scene.getTransformMatrix());
  const visible: AbstractMesh[] = [];
  target.getCustomRenderList = (_face, list, length) => {
    if (!list || !scene.activeCamera) return null;
    Frustum.GetPlanesToRef(scene.getTransformMatrix(), planes);
    visible.length = 0;
    for (let i = 0; i < length; i++) {
      const mesh = list[i];
      // The loader's deferred mesh registration can retain already disposed
      // construction meshes (e.g. courtyard parts merged in the same task).
      if (!mesh || mesh.isDisposed() || !mesh.isEnabled() || !mesh.isVisible || !mesh.subMeshes?.length) continue;
      mesh.computeWorldMatrix();
      // Keep instance families together: their source bounds need not enclose instances.
      if (mesh.alwaysSelectAsActiveMesh || mesh.isAnInstance || (mesh instanceof Mesh && (mesh.instances.length || mesh.hasThinInstances))
        || mesh.isInFrustum(planes)) visible.push(mesh);
    }
    return visible;
  };
  target.onDisposeObservable.addOnce(() => installed.delete(scene));
}
