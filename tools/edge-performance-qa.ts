import { Engine, Scene, ArcRotateCamera, Vector3, HemisphericLight, MeshBuilder, StandardMaterial, Color3 } from '@babylonjs/core';
import { createEdgeOutline } from '../src/babylon/EdgeOutline';

const output = document.querySelector<HTMLPreElement>('#result')!;
const engine = new Engine(document.querySelector<HTMLCanvasElement>('#scene')!, true, { preserveDrawingBuffer: true });
const scene = new Scene(engine);
const assert = (condition: unknown, message: string) => { if (!condition) throw new Error(message); };
const frame = async () => { scene.render(); await new Promise(resolve => setTimeout(resolve, 20)); };
const settle = async () => { for (let i = 0; i < 20; i++) await frame(); };
const depthCount = () => Object.keys(scene._depthRenderer ?? {}).length;
try {
  const camera = new ArcRotateCamera('qa-camera', -.8, 1, 9, Vector3.Zero(), scene);
  new HemisphericLight('qa-light', new Vector3(0, 1, 0), scene);
  const box = MeshBuilder.CreateBox('model', { size: 2 }, scene);
  const floor = MeshBuilder.CreateGround('floor', { width: 8, height: 8 }, scene);
  floor.position.y = -1;
  const material = new StandardMaterial('surface', scene);
  material.diffuseColor = new Color3(.7, .8, .9); box.material = material;
  // Non-model occluder must still participate in full-scene depth.
  const occluder = MeshBuilder.CreateSphere('occluder', { diameter: .8 }, scene);
  occluder.position.set(1.3, .2, -1.3);
  const model = [box, floor];
  const outline = createEdgeOutline(scene, camera, { meshes: model, enabled: false });
  assert(!scene.geometryBufferRenderer && depthCount() === 0, 'Hidden startup allocated auxiliary targets');
  await settle();
  const plain = await engine.readPixels(0, 0, 640, 400);
  outline.setEnabled(true);
  const gbr = scene.geometryBufferRenderer!;
  assert(gbr.getGBuffer().renderList === model && depthCount() === 1, 'Enabled targets lost mesh configuration');
  let geometryPasses = 0, depthPasses = 0;
  gbr.getGBuffer().onBeforeRenderObservable.add(() => geometryPasses++);
  scene._depthRenderer[camera.id].getDepthMap().onBeforeRenderObservable.add(() => depthPasses++);
  await settle();
  assert(geometryPasses > 0 && depthPasses > 0, 'Enabled auxiliary passes did not render');
  const active = await engine.readPixels(0, 0, 640, 400);
  assert(active.some((value, i) => value !== plain[i]), 'Outline did not change the rendered image');
  outline.setEnabled(false);
  assert(!scene.geometryBufferRenderer && depthCount() === 0, 'Disabled targets still registered');
  const before = [geometryPasses, depthPasses];
  await settle();
  assert(geometryPasses === before[0] && depthPasses === before[1], 'Hidden effect still renders');
  const hidden = await engine.readPixels(0, 0, 640, 400);
  assert(hidden.every((value, i) => value === plain[i]), 'Hidden effect changed the plain image');
  for (let cycle = 0; cycle < 3; cycle++) {
    outline.setEnabled(true); outline.setEnabled(true);
    assert(scene.geometryBufferRenderer !== gbr && depthCount() === 1, 'Toggle failed to recreate targets');
    await settle();
    const restored = await engine.readPixels(0, 0, 640, 400);
    assert(restored.every((value, i) => value === active[i]), 'Re-enabled outline changed pixels');
    outline.setEnabled(false); outline.setEnabled(false);
    assert(!scene.geometryBufferRenderer && depthCount() === 0, 'Repeated toggle leaked targets');
  }
  outline.setEnabled(true);
  outline.dispose(); outline.dispose(); outline.setEnabled(true);
  assert(!scene.geometryBufferRenderer && depthCount() === 0, 'Dispose leaked or recreated targets');
  await frame();
  output.textContent = 'PASS: WebGL render check\nHidden startup: 0 auxiliary targets\nHidden effect: 0 depth/normal passes\n3 toggle cycles: pixel-identical outline\nDisabled image: pixel-identical to plain rendering\nDispose: all auxiliary targets released';
} catch (error) {
  output.textContent = `FAIL: ${error instanceof Error ? error.stack : error}`;
} finally {
  scene.dispose(); engine.dispose();
}
