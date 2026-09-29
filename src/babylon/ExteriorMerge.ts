import { InstancedMesh, Mesh, VertexData, type AbstractMesh, type Material, type Node } from '@babylonjs/core';

/**
 * Bakes the static decorative exterior (paths, neighbouring houses, parapets,
 * park trees) into one mesh per material. The exterior never moves and is not
 * pickable, so the ~100 individual meshes and instances only cost per-mesh CPU
 * work (culling, world matrices, draw setup) every frame. Geometry, materials
 * and render settings stay identical; the atmosphere updater keeps changing the
 * same material objects.
 */
export function mergeStaticExterior(roots: Node[], parent: Mesh, skip: (mesh: AbstractMesh) => boolean): { before: number; after: number } {
  const groups = new Map<string, { material: Material; receiveShadows: boolean; parts: VertexData[]; name: string }>();
  const consumed: AbstractMesh[] = [];
  for (const root of roots) {
    for (const mesh of root.getChildMeshes(false)) {
      if (skip(mesh) || !mesh.material || !mesh.isEnabled() || !mesh.isVisible) continue;
      const source = mesh instanceof InstancedMesh ? mesh.sourceMesh : mesh instanceof Mesh ? mesh : null;
      if (!source || !source.getTotalIndices()) continue;
      if (source.morphTargetManager || source.skeleton || mesh.hasThinInstances) continue;
      const data = VertexData.ExtractFromMesh(source, true, true);
      // Keep only the attributes every exterior mesh shares; colours/tangents are never used here.
      const part = new VertexData();
      part.positions = data.positions; part.indices = data.indices; part.normals = data.normals;
      if (data.uvs) part.uvs = data.uvs;
      if (!part.normals) {
        const normals: number[] = [];
        VertexData.ComputeNormals(part.positions!, part.indices!, normals);
        part.normals = normals;
      }
      part.transform(mesh.computeWorldMatrix(true));
      const key = `${mesh.material.uniqueId}|${mesh.receiveShadows}|${part.uvs ? 'uv' : ''}|${mesh.material.name}`;
      const group = groups.get(key) ?? { material: mesh.material, receiveShadows: mesh.receiveShadows, parts: [], name: mesh.material.name };
      group.parts.push(part);
      groups.set(key, group);
      consumed.push(mesh);
    }
  }
  const before = consumed.length;
  let after = 0;
  for (const group of groups.values()) {
    const [first, ...rest] = group.parts;
    if (rest.length) first.merge(rest, true);
    const merged = new Mesh(group.name + '-static', parent.getScene());
    first.applyToMesh(merged, false);
    merged.material = group.material;
    merged.parent = parent;
    merged.isPickable = false;
    merged.receiveShadows = group.receiveShadows;
    merged.freezeWorldMatrix();
    merged.doNotSyncBoundingInfo = true;
    after++;
  }
  // Instances first, then their sources.
  for (const mesh of consumed) if (mesh instanceof InstancedMesh) mesh.dispose();
  for (const mesh of consumed) if (!mesh.isDisposed() && !(mesh instanceof InstancedMesh) && !(mesh as Mesh).instances?.length) mesh.dispose(false, false);
  return { before, after };
}
