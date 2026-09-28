import { Color3, Vector3 } from '@babylonjs/core';
import { createScene } from '../src/babylon/SceneManager';
import { loadModel } from '../src/babylon/ModelLoader';
import { bindFloorplanMeshes, floorplanId } from '../src/babylon/FloorplanBindings';
import { createLightMesh, type MeshMap } from '../src/babylon/LightMeshFactory';
import { createBlindMesh, updateBlindPosition, updateBlindState } from '../src/babylon/BlindMeshFactory';
import { readFloorplanManifest, mergeFloorplan } from '../src/services/floorplanImport';
import { applyFloorplanLightState, configureFloorplanLightInfluence, invalidateFloorplanShadows } from '../src/babylon/FloorplanLighting';
import { uploadModel, updateConfig } from '../src/services/configApi';

const status = document.querySelector('#status')!;
const report = document.querySelector('#report')!;
const check = (value: unknown, message: string) => { if (!value) throw new Error(message); };
try {
  const blob = await (await fetch('../.qa/v75.glb')).blob();
  const manifest = (await readFloorplanManifest(blob))!;
  check(manifest?.objects.length, 'Manifest fehlt');
  const ctx = createScene(document.querySelector('canvas')!, { enableGlow: true, preserveDrawingBuffer: true });
  const result = await loadModel(ctx.scene, blob, undefined, { showTextures: true, edgeRendering: false });
  check(result.diagonal < 30 && result.diagonal > 5, 'Modellmaßstab falsch: ' + result.diagonal);
  const ids = new Set(result.meshes.map(floorplanId).filter(Boolean));
  for (const object of manifest.objects) {
    check(ids.has(object.id), 'Geometrie fehlt für ' + object.label);
    const meshes = result.meshes.filter(m => floorplanId(m) === object.id && m.getTotalVertices());
    let lo = new Vector3(Infinity, Infinity, Infinity), hi = lo.negate();
    meshes.forEach(m => { const box = m.getBoundingInfo().boundingBox; lo = Vector3.Minimize(lo, box.minimumWorld); hi = Vector3.Maximize(hi, box.maximumWorld); });
    const center = lo.add(hi).scale(.5);
    check(Vector3.Distance(center, new Vector3(object.position.x, object.position.y, object.position.z)) < .15, 'Positionsabweichung: ' + object.label);
  }
  // Test IDs exist only in this in-memory QA scene, never in user storage or HA.
  manifest.objects.forEach((o, i) => { o.entityId = `${o.domain}.qa_${i}`; });
  const config = mergeFloorplan({ location: { latitude: 0, longitude: 0 }, lights: [] }, manifest);
  const lights: MeshMap = {};
  const covers = (config.blinds ?? []).map(b => createBlindMesh(ctx.scene, b, 50));
  const casters = [...result.shadowCasters, ...covers.map(c => c.panel)];
  for (const light of config.lights) {
    const entry = createLightMesh(ctx.scene, light, light.entityId, { withPointLight: true, shadowCasters: casters, shadowResolution: 256 });
    lights[light.entityId] = entry;
    check(entry.floorplanRig?.lights.length, 'Lichtquellen fehlen: ' + light.label);
    const rig = entry.floorplanRig!;
    for (const brightness of [255,128,1,0]) {
      applyFloorplanLightState(rig, light, { entity_id: light.entityId, state: 'on', attributes: { brightness, rgb_color: [255,0,0] } });
      const actual = rig.lights.reduce((n,l) => n+l.intensity,0);
      const expected = rig.sources.reduce((n,s) => n+s.lumens,0)*brightness/255;
      check(Math.abs(actual-expected) < .001, 'Lichtleistung nicht erhalten: ' + light.label);
    }
    applyFloorplanLightState(rig, light, { entity_id: light.entityId, state: 'unavailable', attributes: {} });
    check(rig.lights.every(l => !l.isEnabled() && l.intensity === 0), 'Nicht verfügbare Leuchte strahlt');
  }
  bindFloorplanMeshes(ctx.scene, result.meshes, config, lights);
  configureFloorplanLightInfluence(ctx.scene, Object.values(lights).map(e => e.floorplanRig!), casters);
  check(result.meshes.filter(m => m.metadata?.blindId && !m.isEnabled()).length >= 5, 'Rollo-Originale nicht ersetzt');
  for (const cover of covers) {
    updateBlindPosition(cover, 0); check(Math.abs(cover.panel.scaling.y - 1) < .001, 'Rollo geschlossen falsch');
    updateBlindPosition(cover, 100); check(cover.panel.scaling.y < .05, 'Rollo geöffnet falsch');
    updateBlindPosition(cover, 50);
    updateBlindState(cover, {entity_id:cover.config.entityId,state:'unavailable',attributes:{}});
    check(Math.abs(cover.panel.scaling.y - .5)<.001,'Unbekanntes Rollo verändert Position');
    updateBlindState(cover, {entity_id:cover.config.entityId,state:'opening',attributes:{}});
    check(Math.abs(cover.panel.scaling.y - .5)<.001,'Bewegung ohne Messwert verändert Position');
  }
  let colored = true, open = false, night = false;
  const select = document.createElement('select'); select.setAttribute('aria-label','Einzelne Leuchte prüfen');
  select.add(new Option('Alle Leuchten','all'));
  config.lights.forEach(l => select.add(new Option(l.label,l.entityId)));
  const dimmer = document.createElement('input'); dimmer.type='range'; dimmer.min='0'; dimmer.max='255'; dimmer.value='170'; dimmer.setAttribute('aria-label','Testhelligkeit');
  document.querySelector('header')!.append(select,dimmer);
  const colorize = () => config.lights.forEach(config => {
    const entry = lights[config.entityId];
    entry.mat.emissiveColor.copyFrom(applyFloorplanLightState(entry.floorplanRig!, config, { entity_id: config.entityId, state: select.value === 'all' || select.value === config.entityId ? 'on' : 'off', attributes: { brightness: Number(dimmer.value), rgb_color: colored ? [255,190,110] : [70,130,255] } }));
  });
  select.addEventListener('change',()=>{colorize(); status.textContent='Prüfung bestanden · '+select.selectedOptions[0].text;});
  dimmer.addEventListener('input',colorize);
  colorize();
  document.querySelector('#lights')!.addEventListener('click', () => { colored = !colored; colorize(); });
  document.querySelector('#covers')!.addEventListener('click', () => { open = !open; covers.forEach(b => updateBlindPosition(b, open ? 100 : 0)); Object.values(lights).forEach(l => invalidateFloorplanShadows(l.floorplanRig)); status.textContent = open ? 'Prüfung bestanden · Rollos 100 % offen' : 'Prüfung bestanden · Rollos geschlossen'; });
  document.querySelector('#night')!.addEventListener('click', () => { night = !night; ctx.hemiLight.intensity = night ? .025 : .6; ctx.sunLight.intensity = night ? 0 : 1; });
  document.querySelector('#import')!.addEventListener('click', async () => {
    await uploadModel(blob); updateConfig({ onboarding: { completed: true } });
    location.href = '../';
  });
  document.querySelector('#reload')!.addEventListener('click', () => location.reload());
  const positions = manifest.objects.map(o => new Vector3(o.position.x,o.position.y,o.position.z));
  const focusMin = positions.reduce((a,b) => Vector3.Minimize(a,b)), focusMax = positions.reduce((a,b) => Vector3.Maximize(a,b));
  ctx.camera.setTarget(focusMin.add(focusMax).scale(.5)); ctx.camera.alpha = -Math.PI / 2; ctx.camera.beta = .40;
  ctx.camera.radius = Vector3.Distance(focusMin,focusMax) * 1.8;
  ctx.camera.attachControl(document.querySelector('canvas')!, true);
  ctx.scene.fogEnabled = false;
  ctx.hemiLight.intensity = .6;
  ctx.engine.runRenderLoop(() => ctx.scene.render());
  window.addEventListener('resize', () => ctx.engine.resize());
  status.textContent = 'Prüfung bestanden';
  report.textContent = JSON.stringify({ objects: manifest.objects.length, lights: config.lights.length, covers: covers.length,
    meshes: result.meshes.length, sizeMeters: result.size.asArray(), center: result.center.asArray(), cutawayMeshes: result.meshes.filter(m => m.layerMask === 0x10000000).length,
    physicalSources: Object.values(lights).reduce((n,l) => n+l.floorplanRig!.lights.length,0),
    checks: ['Manifest', 'Metermaßstab', 'alle Objektkennungen', 'Geometrie/Entity-Koordinaten', 'Rollo 0/50/100 %', 'Klick-Metadaten', 'Lichtleistung 0/1/128/255', 'unavailable = aus', 'Schattenaktualisierung'] }, null, 2);
} catch (error) { status.textContent = 'Prüfung fehlgeschlagen'; report.textContent = String(error); console.error(error); }
