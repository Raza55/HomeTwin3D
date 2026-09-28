import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { readGlb, accessorBytes } from './optimize-glb.mjs';

/** Compare every rendered vertex, in triangle order, plus all non-geometry semantics. */
export function verifyGlb(original, optimized) {
  const a = readGlb(original), b = readGlb(optimized);
  for (const key of Object.keys(a.json)) {
    if (['accessors', 'bufferViews', 'buffers', 'meshes', 'images', 'animations'].includes(key)) continue;
    assert.deepEqual(b.json[key], a.json[key], `Changed ${key}`);
  }
  const indices = (file, p) => {
    if (p.indices === undefined) return Array.from({ length: file.json.accessors[p.attributes.POSITION].count }, (_, i) => i);
    const { data, accessor } = accessorBytes(file.json, file.bin, p.indices);
    return Array.from({ length: accessor.count }, (_, i) => accessor.componentType === 5125 ? data.readUInt32LE(i * 4) : accessor.componentType === 5123 ? data.readUInt16LE(i * 2) : data[i]);
  };
  assert.equal(a.json.meshes.length, b.json.meshes.length);
  let corners = 0;
  for (let mi = 0; mi < a.json.meshes.length; mi++) {
    const { primitives: ap, ...am } = a.json.meshes[mi], { primitives: bp, ...bm } = b.json.meshes[mi];
    assert.deepEqual(bm, am); assert.equal(bp.length, ap.length);
    for (let pi = 0; pi < ap.length; pi++) {
      const { attributes: aa, indices: ai, ...ar } = ap[pi], { attributes: ba, indices: bi, ...br } = bp[pi];
      assert.deepEqual(br, ar); assert.deepEqual(Object.keys(ba), Object.keys(aa));
      const ia = indices(a, ap[pi]), ib = indices(b, bp[pi]); assert.equal(ia.length, ib.length); corners += ia.length;
      for (const name of Object.keys(aa)) {
        const x = accessorBytes(a.json, a.bin, aa[name]), y = accessorBytes(b.json, b.bin, ba[name]);
        const { bufferView: av, byteOffset: ao, count: ac, ...ax } = x.accessor;
        const { bufferView: bv, byteOffset: bo, count: bc, ...bx } = y.accessor;
        assert.deepEqual(bx, ax); assert.equal(x.width, y.width);
        for (let i = 0; i < ia.length; i++) {
          if (!x.data.subarray(ia[i] * x.width, (ia[i] + 1) * x.width).equals(y.data.subarray(ib[i] * y.width, (ib[i] + 1) * y.width))) {
            throw new Error(`Changed mesh ${mi}, primitive ${pi}, ${name}, corner ${i}`);
          }
        }
      }
    }
  }
  assert.equal(a.json.images?.length, b.json.images?.length);
  for (let i = 0; i < (a.json.images?.length || 0); i++) {
    const { bufferView: av, ...ar } = a.json.images[i], { bufferView: bv, ...br } = b.json.images[i]; assert.deepEqual(br, ar);
    if (av === undefined) continue;
    const x = a.json.bufferViews[av], y = b.json.bufferViews[bv];
    assert.ok(a.bin.subarray(x.byteOffset || 0, (x.byteOffset || 0) + x.byteLength).equals(b.bin.subarray(y.byteOffset || 0, (y.byteOffset || 0) + y.byteLength)), 'Changed image');
  }
  assert.equal(a.json.animations?.length, b.json.animations?.length);
  for (let i = 0; i < (a.json.animations?.length || 0); i++) {
    const { samplers: as, ...ar } = a.json.animations[i], { samplers: bs, ...br } = b.json.animations[i]; assert.deepEqual(br, ar); assert.equal(bs.length, as.length);
    for (let j = 0; j < as.length; j++) {
      const { input: ai, output: ao, ...ax } = as[j], { input: bi, output: bo, ...bx } = bs[j]; assert.deepEqual(bx, ax);
      for (const [x, y] of [[ai, bi], [ao, bo]]) assert.ok(accessorBytes(a.json, a.bin, x).data.equals(accessorBytes(b.json, b.bin, y).data), 'Changed animation');
    }
  }
  return { verifiedCorners: corners, nodes: a.json.nodes.length, images: a.json.images?.length || 0, animations: a.json.animations?.length || 0, bitExact: true };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log(verifyGlb(await readFile(process.argv[2]), await readFile(process.argv[3])));
}
