import { Material, Mesh, PBRMaterial, StandardMaterial, VertexBuffer, VertexData, type AbstractMesh, type Node, type ShadowGenerator } from '@babylonjs/core';

/** Shadow-only batches: original meshes, picking, materials and animations stay intact. */
export function batchStaticSunShadows(generator: ShadowGenerator): (() => void) | undefined {
  const map = generator.getShadowMap();
  if (!map?.renderList) return;
  const scene = generator.getLight().getScene();
  const animated = new Set(scene.animationGroups.flatMap(g => g.targetedAnimations.map(a => a.target)));
  const groups = new Map<string, Mesh[]>();
  function eligible(mesh: AbstractMesh): mesh is Mesh {
    if (!(mesh instanceof Mesh) || mesh.skeleton || mesh.morphTargetManager || mesh.instances.length || mesh.hasThinInstances
      || mesh.isAnInstance || mesh.subMeshes?.length !== 1 || !mesh.isEnabled() || !mesh.isVisible || mesh.visibility !== 1
      || mesh.nonUniformScaling || mesh.bakedVertexAnimationManager || !mesh.isVerticesDataPresent(VertexBuffer.NormalKind)
      || mesh.getVertexBuffer(VertexBuffer.PositionKind)?.isUpdatable() || mesh.getVertexBuffer(VertexBuffer.NormalKind)?.isUpdatable()) return false;
    const mat = mesh.material;
    if (!(mat instanceof PBRMaterial || mat instanceof StandardMaterial) || mat.shadowDepthWrapper
      || mat.clipPlane || mat.clipPlane2 || mat.clipPlane3 || mat.clipPlane4 || mat.clipPlane5 || mat.clipPlane6
      || mat.fillMode !== Material.TriangleFillMode || mat.needAlphaTestingForMesh(mesh) || mat.needAlphaBlendingForMesh(mesh)) return false;
    for (let node: Node | null = mesh; node; node = node.parent) {
      const extras = node.metadata?.gltf?.extras;
      if (extras?.ha_id || extras?.ha_door || extras?.ha_room_door || extras?.ha_appliance || animated.has(node) || node.animations.length) return false;
    }
    return mesh.getTotalIndices() > 0 && mesh.getTotalIndices() % 3 === 0;
  }
  for (const mesh of map.renderList) {
    mesh.computeWorldMatrix(true);
    if (!eligible(mesh)) continue;
    const mat = mesh.material!;
    // Keep the exact GPU transformation. Baking world-space positions on the CPU
    // changes float rounding and can shift shadow edges even without simplification.
    const key = [mat.backFaceCulling, mat.cullBackFaces, mat.sideOrientation ?? mesh.sideOrientation,
      ...mesh.getWorldMatrix().m].join(':');
    const group = groups.get(key) ?? []; group.push(mesh); groups.set(key, group);
  }
  const batches: Array<{ proxy: Mesh; sources: Mesh[]; valid: () => boolean }> = [];
  for (const sources of groups.values()) {
    if (sources.length < 3) continue;
    const snapshots = sources.map(mesh => ({ mesh, matrix: mesh.getWorldMatrix().clone(), material: mesh.material,
      geometry: mesh.geometry, orientation: mesh.material!.sideOrientation ?? mesh.sideOrientation,
      backFaceCulling: mesh.material!.backFaceCulling, cullBackFaces: mesh.material!.cullBackFaces }));
    const vertices = sources.reduce((n, m) => n + m.getTotalVertices(), 0);
    const positions = new Float32Array(vertices * 3), normals = new Float32Array(vertices * 3);
    const indices = new Uint32Array(sources.reduce((n, m) => n + m.getTotalIndices(), 0));
    let vertexOffset = 0, indexOffset = 0;
    for (const mesh of sources) {
      const p = mesh.getVerticesData(VertexBuffer.PositionKind)!, n = mesh.getVerticesData(VertexBuffer.NormalKind)!;
      positions.set(p, vertexOffset * 3); normals.set(n, vertexOffset * 3);
      const sourceIndices = mesh.getIndices()!;
      for (let i = 0; i < sourceIndices.length; i++) indices[indexOffset++] = sourceIndices[i] + vertexOffset;
      vertexOffset += mesh.getTotalVertices();
    }
    const proxy = new Mesh(`sun-shadow-batch:${batches.length}`, scene);
    const data = new VertexData(); data.positions = positions; data.normals = normals; data.indices = indices; data.applyToMesh(proxy);
    const material = new StandardMaterial(`${proxy.name}:material`, scene);
    material.backFaceCulling = snapshots[0].backFaceCulling; material.cullBackFaces = snapshots[0].cullBackFaces;
    material.sideOrientation = snapshots[0].orientation;
    proxy.material = material; proxy.layerMask = 0; proxy.isVisible = false; proxy.isPickable = false; proxy.freezeWorldMatrix(snapshots[0].matrix);
    proxy.metadata = { shadowBatch: true };
    const valid = () => snapshots.every(s => !s.mesh.isDisposed() && eligible(s.mesh) && s.mesh.geometry === s.geometry
      && s.mesh.material === s.material && s.mesh.computeWorldMatrix().equals(s.matrix)
      && (s.mesh.material!.sideOrientation ?? s.mesh.sideOrientation) === s.orientation
      && s.mesh.material!.backFaceCulling === s.backFaceCulling && s.mesh.material!.cullBackFaces === s.cullBackFaces);
    batches.push({ proxy, sources, valid });
  }
  const replace = new Map<Mesh, Mesh>();
  for (const batch of batches) for (const source of batch.sources) replace.set(source, batch.proxy);
  map.renderList = [...new Set(map.renderList.map(m => replace.get(m as Mesh) ?? m))];
  // Explicit render lists (notably glTF glass refraction) can ignore layer masks.
  // Proxies must be visible exclusively while this shadow target renders.
  const beforeBind = map.onBeforeBindObservable.add(() => batches.forEach(b => { b.proxy.isVisible = true; }));
  const afterUnbind = map.onAfterUnbindObservable.add(() => batches.forEach(b => { b.proxy.isVisible = false; }));
  // If a previously static object changes, immediately fall back to its originals.
  // This also handles switching between textured and sketch materials.
  const observer = scene.onBeforeRenderObservable.add(() => {
    for (let i = batches.length - 1; i >= 0; i--) {
      const batch = batches[i];
      if (batch.valid()) continue;
      const index = map.renderList?.indexOf(batch.proxy) ?? -1;
      if (index >= 0) map.renderList!.splice(index, 1, ...batch.sources.filter(m => !m.isDisposed()));
      batch.proxy.dispose(false, true); batches.splice(i, 1); map.resetRefreshCounter();
    }
  });
  const dispose = () => {
    scene.onBeforeRenderObservable.remove(observer);
    map.onBeforeBindObservable.remove(beforeBind); map.onAfterUnbindObservable.remove(afterUnbind);
    for (const batch of batches) {
      const index = map.renderList?.indexOf(batch.proxy) ?? -1;
      if (index >= 0) map.renderList!.splice(index, 1, ...batch.sources.filter(m => !m.isDisposed()));
      batch.proxy.dispose(false, true);
    }
    batches.length = 0;
  };
  map.onDisposeObservable.addOnce(dispose);
  return dispose;
}
