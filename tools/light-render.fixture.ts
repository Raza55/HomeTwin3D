import { Engine, Scene, FreeCamera, Vector3, Color3, Color4, MeshBuilder, StandardMaterial, PointLight, ShadowGenerator } from '@babylonjs/core';
import { batchStaticRendering } from '../src/babylon/RenderBatch';
import { configureFloorplanLightInfluence, type FloorplanLightRig } from '../src/babylon/FloorplanLighting';

export async function compareLighting() {
  const canvas = document.createElement('canvas'); canvas.width = 320; canvas.height = 160; document.body.append(canvas);
  const engine = new Engine(canvas, false, { preserveDrawingBuffer: true, stencil: true });
  async function capture(batched: boolean, bothOn: boolean) {
    const scene = new Scene(engine);
    try {
      scene.clearColor = new Color4(0, 0, 0, 1);
      const camera = new FreeCamera('camera', new Vector3(2, 4, -9), scene); camera.setTarget(new Vector3(2, 0, 0));
      const material = new StandardMaterial('surface', scene); material.diffuseColor = Color3.White(); material.specularColor = Color3.Black();
      const surfaces = [0, 4].map(x => { const mesh = MeshBuilder.CreateBox('surface', { size: 1.7 }, scene); mesh.position.x = x; mesh.material = material; return mesh; });
      const lamps = [0, 4].map(x => {
        const lamp = new PointLight('lamp', new Vector3(x, 2, -2), scene); lamp.range = 20; lamp.intensity = 1;
        const shadow = new ShadowGenerator(64, lamp); shadow.getShadowMap()!.renderList = [];
        return lamp;
      });
      if (!bothOn) lamps[1].setEnabled(false);
      if (batched) batchStaticRendering(scene, surfaces, lamps);
      configureFloorplanLightInfluence(scene, [{ lights: lamps, sources: [], shadows: [] } as FloorplanLightRig], surfaces, 1);
      await scene.whenReadyAsync();
      for (let i = 0; i < 4; i++) { scene.render(); await new Promise(resolve => setTimeout(resolve, 30)); }
      return new Uint8Array(await engine.readPixels(0, 0, 320, 160));
    } finally { scene.dispose(); }
  }
  try {
    const results = [];
    for (const bothOn of [true, false]) {
      const reference = await capture(false, bothOn), optimized = await capture(true, bothOn);
      let maxError = 0, changed = 0, lit = 0;
      for (let i = 0; i < reference.length; i++) {
        if (i % 4 === 3) continue;
        const error = Math.abs(reference[i] - optimized[i]); maxError = Math.max(maxError, error);
        if (error > 2) changed++;
        if (reference[i] > 20) lit++;
      }
      if (lit < 1000 || changed > 10) throw new Error(`Lighting differs: bothOn=${bothOn}, lit=${lit}, changed=${changed}, maxError=${maxError}`);
      results.push({ bothOn, lit, changed, maxError });
    }
    return results;
  } finally { engine.dispose(); canvas.remove(); }
}
