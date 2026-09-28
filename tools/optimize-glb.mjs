/** Lossless GLB repacking. Keeps nodes, materials, extras and animation channels intact. */
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

const widths = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
const components = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };
export function readGlb(bytes) {
  if (bytes.readUInt32LE(0) !== 0x46546c67 || bytes.readUInt32LE(4) !== 2 || bytes.readUInt32LE(8) !== bytes.length) throw new Error('Invalid GLB');
  const jsonLength = bytes.readUInt32LE(12);
  if (bytes.readUInt32LE(16) !== 0x4e4f534a || bytes.readUInt32LE(24 + jsonLength) !== 0x004e4942) throw new Error('Expected JSON and BIN chunks');
  if (28 + jsonLength + bytes.readUInt32LE(20 + jsonLength) !== bytes.length) throw new Error('Unexpected trailing GLB chunks');
  return { json: JSON.parse(bytes.subarray(20, 20 + jsonLength).toString()), bin: bytes.subarray(28 + jsonLength, 28 + jsonLength + bytes.readUInt32LE(20 + jsonLength)) };
}
export function writeGlb(json, bin) {
  const raw = Buffer.from(JSON.stringify(json));
  const j = Buffer.alloc((raw.length + 3) & ~3, 0x20); raw.copy(j);
  const b = Buffer.alloc((bin.length + 3) & ~3); bin.copy(b);
  const result = Buffer.alloc(28 + j.length + b.length);
  result.writeUInt32LE(0x46546c67, 0); result.writeUInt32LE(2, 4); result.writeUInt32LE(result.length, 8);
  result.writeUInt32LE(j.length, 12); result.writeUInt32LE(0x4e4f534a, 16); j.copy(result, 20);
  result.writeUInt32LE(b.length, 20 + j.length); result.writeUInt32LE(0x004e4942, 24 + j.length); b.copy(result, 28 + j.length);
  return result;
}
export function accessorBytes(json, bin, index) {
  const a = json.accessors[index], v = json.bufferViews[a.bufferView];
  if (a.sparse || !v || v.buffer !== 0 || !components[a.type] || !widths[a.componentType]) throw new Error('Unsupported accessor layout');
  const width = components[a.type] * widths[a.componentType];
  const stride = v.byteStride || width, start = (v.byteOffset || 0) + (a.byteOffset || 0);
  if (stride < width || start + (a.count - 1) * stride + width > bin.length) throw new Error('Accessor out of bounds');
  const data = Buffer.alloc(a.count * width);
  for (let i = 0; i < a.count; i++) bin.copy(data, i * width, start + i * stride, start + i * stride + width);
  return { data, width, accessor: a };
}
export function optimizeGlb(bytes) {
  const { json, bin } = readGlb(bytes);
  // Fail closed for extensions with their own binary references (Draco, meshopt, etc.).
  if ((json.extensionsUsed || []).some(x => !x.startsWith('KHR_materials_') && !['KHR_texture_transform', 'KHR_lights_punctual'].includes(x))) throw new Error('Unsupported GLB extension; original retained');
  if (json.buffers.length !== 1 || json.buffers[0].uri || json.skins?.length || json.meshes.some(m => m.primitives.some(p => p.targets))) throw new Error('Only self-contained non-skinned GLBs are supported');
  const oldAccessors = json.accessors, oldViews = json.bufferViews;
  const accessors = [], views = [], chunks = [], viewCache = new Map(), copiedAccessors = new Map();
  let length = 0, verticesBefore = 0, verticesAfter = 0;
  function addView(data, properties = {}) {
    const key = JSON.stringify(properties) + ':' + createHash('sha256').update(data).digest('hex');
    if (viewCache.has(key)) return viewCache.get(key);
    const index = views.length;
    views.push({ ...properties, buffer: 0, byteOffset: length, byteLength: data.length });
    chunks.push(data); length += data.length;
    const padding = (4 - length % 4) % 4;
    if (padding) { chunks.push(Buffer.alloc(padding)); length += padding; }
    viewCache.set(key, index); return index;
  }
  function addAccessor(a, data, target) {
    const next = { ...a, bufferView: addView(data, target ? { target } : {}), byteOffset: 0 };
    const index = accessors.length; accessors.push(next); return index;
  }
  function copyAccessor(index) {
    if (!copiedAccessors.has(index)) {
      const { data, accessor } = accessorBytes(json, bin, index);
      copiedAccessors.set(index, addAccessor(accessor, data, oldViews[accessor.bufferView].target));
    }
    return copiedAccessors.get(index);
  }
  for (const mesh of json.meshes) for (const p of mesh.primitives) {
    if (p.extensions) throw new Error('Unsupported primitive extension');
    const attributes = Object.entries(p.attributes).map(([key, index]) => ({ key, ...accessorBytes(json, bin, index) }));
    const count = attributes[0].accessor.count;
    if (attributes.some(a => a.accessor.count !== count)) throw new Error('Attribute count mismatch');
    verticesBefore += count;
    if (p.indices === undefined) {
      for (const key of Object.keys(p.attributes)) p.attributes[key] = copyAccessor(p.attributes[key]);
      verticesAfter += count; continue;
    }
    const indices = accessorBytes(json, bin, p.indices);
    const readIndex = indices.accessor.componentType === 5125 ? i => indices.data.readUInt32LE(i * 4) : indices.accessor.componentType === 5123 ? i => indices.data.readUInt16LE(i * 2) : indices.accessor.componentType === 5121 ? i => indices.data[i] : null;
    if (!readIndex) throw new Error('Unsupported index type');
    const unique = new Map(), representatives = [], remap = new Uint32Array(count);
    const vertexWidth = attributes.reduce((n, a) => n + a.width, 0), vertex = Buffer.alloc(vertexWidth);
    for (let i = 0; i < count; i++) {
      let offset = 0;
      for (const a of attributes) { a.data.copy(vertex, offset, i * a.width, (i + 1) * a.width); offset += a.width; }
      const key = vertex.toString('base64');
      let mapped = unique.get(key);
      if (mapped === undefined) { mapped = representatives.length; unique.set(key, mapped); representatives.push(i); }
      remap[i] = mapped;
    }
    verticesAfter += representatives.length;
    for (const a of attributes) {
      const data = Buffer.alloc(representatives.length * a.width);
      representatives.forEach((old, i) => a.data.copy(data, i * a.width, old * a.width, (old + 1) * a.width));
      p.attributes[a.key] = addAccessor({ ...a.accessor, count: representatives.length }, data, 34962);
    }
    // 65535 is reserved for primitive restart in WebGL2; use uint32 above 65535 vertices.
    const short = representatives.length <= 65535;
    const data = Buffer.alloc(indices.accessor.count * (short ? 2 : 4));
    let max = 0, min = Infinity;
    for (let i = 0; i < indices.accessor.count; i++) {
      const old = readIndex(i); if (old >= count) throw new Error('Index out of bounds');
      const value = remap[old]; max = Math.max(max, value); min = Math.min(min, value);
      if (short) data.writeUInt16LE(value, i * 2); else data.writeUInt32LE(value, i * 4);
    }
    const a = { ...indices.accessor, componentType: short ? 5123 : 5125 };
    if (a.min) a.min = [min]; if (a.max) a.max = [max];
    p.indices = addAccessor(a, data, 34963);
  }
  for (const animation of json.animations || []) for (const sampler of animation.samplers) {
    sampler.input = copyAccessor(sampler.input); sampler.output = copyAccessor(sampler.output);
  }
  for (const image of json.images || []) if (image.bufferView !== undefined) {
    const v = oldViews[image.bufferView];
    const { buffer, byteOffset, byteLength, ...properties } = v;
    image.bufferView = addView(bin.subarray(byteOffset || 0, (byteOffset || 0) + byteLength), properties);
  }
  json.accessors = accessors; json.bufferViews = views; json.buffers = [{ ...json.buffers[0], byteLength: length }];
  const result = writeGlb(json, Buffer.concat(chunks));
  return { bytes: result, report: { beforeBytes: bytes.length, afterBytes: result.length, verticesBefore, verticesAfter, trianglesChanged: 0, nodes: json.nodes.length, animations: json.animations?.length || 0 } };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [input, output] = process.argv.slice(2);
  if (!input || !output || input === output) throw new Error('Usage: node tools/optimize-glb.mjs INPUT.glb NEW-OUTPUT.glb');
  const { bytes, report } = optimizeGlb(await readFile(input));
  await writeFile(output, bytes, { flag: 'wx' });
  await writeFile(output + '.report.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}
