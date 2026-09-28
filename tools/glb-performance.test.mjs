import test from 'node:test';
import assert from 'node:assert/strict';
import { optimizeGlb, readGlb, writeGlb } from './optimize-glb.mjs';
import { verifyGlb } from './verify-glb.mjs';

function fixture(seam = false) {
  const chunks = [new Float32Array([0,0,0, 1,0,0, 0,1,0, 0,0,0]), new Float32Array([0,0, 1,0, 0,1, seam ? .5 : 0,0]),
    new Uint32Array([0,1,2, 3,1,2]), new Float32Array([0,1]), new Float32Array([0,0,0, 1,0,0]), new Uint8Array([1,2,3,4]), new Uint8Array(256)];
  let offset = 0;
  const views = chunks.map(a => { const view = { buffer: 0, byteOffset: offset, byteLength: a.byteLength }; offset += a.byteLength; return view; });
  const json = { asset: { version: '2.0' }, buffers: [{ byteLength: offset }], bufferViews: views,
    accessors: [{ bufferView: 0, componentType: 5126, count: 4, type: 'VEC3', min: [0,0,0], max: [1,1,0] },
      { bufferView: 1, componentType: 5126, count: 4, type: 'VEC2' }, { bufferView: 2, componentType: 5125, count: 6, type: 'SCALAR', min: [0], max: [3] },
      { bufferView: 3, componentType: 5126, count: 2, type: 'SCALAR' }, { bufferView: 4, componentType: 5126, count: 2, type: 'VEC3' },
      { bufferView: 6, componentType: 5126, count: 64, type: 'SCALAR' }],
    meshes: [{ name: 'preserve-name', primitives: [{ attributes: { POSITION: 0, TEXCOORD_0: 1 }, indices: 2, material: 0 }] }],
    nodes: [{ mesh: 0, extras: { ha_id: 'device-id', ha_door: { hinge: [0,0,0] } } }],
    materials: [{ name: 'original-material' }], images: [{ bufferView: 5, mimeType: 'image/png' }],
    animations: [{ name: 'original-animation', samplers: [{ input: 3, output: 4, interpolation: 'LINEAR' }], channels: [{ sampler: 0, target: { node: 0, path: 'translation' } }] }],
    scenes: [{ nodes: [0], extras: { '3dash_manifest': 'unchanged' } }], scene: 0 };
  return writeGlb(json, Buffer.concat(chunks.map(a => Buffer.from(a.buffer))));
}
test('lossless export removes dead data and exact duplicate vertices, preserving animation and metadata', () => {
  const source = fixture(); const result = optimizeGlb(source);
  assert.equal(result.report.verticesBefore, 4); assert.equal(result.report.verticesAfter, 3);
  assert.ok(result.bytes.length < source.length); assert.equal(verifyGlb(source, result.bytes).bitExact, true);
  const { json } = readGlb(result.bytes); assert.equal(json.accessors[json.meshes[0].primitives[0].indices].componentType, 5123);
});
test('texture seams remain separate even when positions are identical', () => {
  const source = fixture(true); const result = optimizeGlb(source);
  assert.equal(result.report.verticesAfter, 4); verifyGlb(source, result.bytes);
});
test('binary verification detects a changed vertex', () => {
  const source = fixture(); const result = optimizeGlb(source); const { json, bin } = readGlb(result.bytes);
  const changed = Buffer.from(bin); changed.writeFloatLE(99, json.bufferViews[json.accessors[json.meshes[0].primitives[0].attributes.POSITION].bufferView].byteOffset);
  assert.throws(() => verifyGlb(source, writeGlb(json, changed)), /Changed mesh/);
});
test('unknown binary extensions fail closed', () => {
  const { json, bin } = readGlb(fixture()); json.extensionsUsed = ['KHR_draco_mesh_compression'];
  assert.throws(() => optimizeGlb(writeGlb(json, bin)), /Unsupported GLB extension/);
});
