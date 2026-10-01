import test from 'node:test';
import assert from 'node:assert/strict';
import { Mesh, NullEngine, Scene, VertexBuffer } from '@babylonjs/core';
import { MarkerVertexBuffers } from '../src/babylon/MarkerVertexBuffers';
import { MarkerLayer } from '../src/babylon/MarkerLayer';

test('marker lists are reused until groups change and retain registration order after removal', () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'MutationObserver');
  Object.defineProperty(globalThis, 'MutationObserver', { configurable: true, value: class { disconnect() {} } });
  const engine = new NullEngine(), scene = new Scene(engine), layer = new MarkerLayer(scene, 'dom');
  try {
    const spec = (id: string) => ({ id, element: () => null, anchor: () => null, display: 'block' });
    const first = layer.add([spec('one'), spec('two')]);
    const original = layer.markers();
    for (let i = 0; i < 120; i++) assert.equal(layer.markers(), original);
    const second = layer.add([spec('three')]);
    assert.deepEqual(layer.markers().map(m => m.spec.id), ['one', 'two', 'three']);
    assert.notEqual(layer.markers(), original);
    first.dispose();
    assert.deepEqual(layer.markers().map(m => m.spec.id), ['three']);
    const remaining = layer.markers();
    assert.equal(layer.markers(), remaining);
    second.dispose();
    assert.deepEqual(layer.markers(), []);
    layer.dispose();
    assert.deepEqual(layer.markers(), []);
  } finally {
    layer.dispose(); scene.dispose(); engine.dispose();
    if (descriptor) Object.defineProperty(globalThis, 'MutationObserver', descriptor);
    else Reflect.deleteProperty(globalThis, 'MutationObserver');
  }
});

test('marker GPU data follows movement, atlas changes and hiding while identical frames skip uploads', () => {
  const engine = new NullEngine(), scene = new Scene(engine), mesh = new Mesh('markers', scene);
  try {
    const buffers = new MarkerVertexBuffers();
    const values = new Map([
      [VertexBuffer.PositionKind, new Float32Array([-.5, .5, 0, .5, .5, 0])],
      [VertexBuffer.UVKind, new Float32Array([0, 0, .5, .5])],
      [VertexBuffer.ColorKind, new Float32Array([1, 1, 1, 1, 1, 1, 1, 1])],
    ]);
    for (const [kind, data] of values) mesh.setVerticesData(kind, new Float32Array(data.length), true);
    const upload = mesh.updateVerticesData.bind(mesh), counts = new Map<string, number>();
    mesh.updateVerticesData = (kind, data, ...args) => { counts.set(kind, (counts.get(kind) ?? 0) + 1); return upload(kind, data, ...args); };
    const frame = () => { for (const [kind, data] of values) buffers.upload(mesh, kind, data); };
    frame();
    for (let i = 0; i < 60; i++) frame();
    assert.deepEqual([...counts.values()], [1, 1, 1]);
    values.get(VertexBuffer.PositionKind)![0] = -.25;
    frame();
    assert.equal(counts.get(VertexBuffer.PositionKind), 2);
    assert.equal(counts.get(VertexBuffer.UVKind), 1);
    values.get(VertexBuffer.UVKind)![2] = .25;
    frame();
    assert.equal(counts.get(VertexBuffer.UVKind), 2);
    values.get(VertexBuffer.PositionKind)!.fill(0);
    frame();
    assert.deepEqual(Array.from(mesh.getVerticesData(VertexBuffer.PositionKind)!), [0, 0, 0, 0, 0, 0]);
    // A new allocation at the same size has no prior GPU content.
    for (const [kind, data] of values) mesh.setVerticesData(kind, new Float32Array(data.length), true);
    buffers.reset(); frame();
    for (const [kind, data] of values) assert.deepEqual(Array.from(mesh.getVerticesData(kind)!), Array.from(data));
    // Growing the marker capacity must retain every newly visible marker.
    const grown = new Float32Array([-.5, .5, 0, .5, .5, 0, -.25, .25, 0]);
    mesh.setVerticesData(VertexBuffer.PositionKind, new Float32Array(grown.length), true);
    buffers.reset(); buffers.upload(mesh, VertexBuffer.PositionKind, grown);
    assert.deepEqual(Array.from(mesh.getVerticesData(VertexBuffer.PositionKind)!), Array.from(grown));
  } finally { scene.dispose(); engine.dispose(); }
});
