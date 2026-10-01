import {
  ParticleSystem,
  Vector3,
  Color4,
  Color3,
  DynamicTexture,
  MeshBuilder,
  StandardMaterial,
  HemisphericLight,
  DirectionalLight,
  Mesh,
  Texture,
  type Scene,
  type ShadowGenerator,
  type Observer,
} from '@babylonjs/core';
import type { WeatherData } from '../services/weatherApi';
import { isRaining, isSnowing, isThunderstorm } from '../services/weatherApi';
import { attachWindSway, type WindState } from './WindSway';

const EMIT_HEIGHT = 15; // spawn height above ground
/** Precipitation falls in a ring around the building, densest close to it. */
const PRECIP_RADIUS = 48;

export interface WeatherEffectsContext {
  updateWeather(data: WeatherData): number;
  /** Size multiplier for rain and snow, e.g. so a zoomed-out demo camera still sees the drops. */
  setParticleScale(scale: number): void;
  dispose(): void;
}

/** Procedural rain streak texture: pale, so drops read against grass and asphalt. */
function createRainTexture(scene: Scene): DynamicTexture {
  const dt = new DynamicTexture('rainTex', { width: 8, height: 64 }, scene, false);
  const ctx = dt.getContext();
  const grad = ctx.createLinearGradient(4, 0, 4, 64);
  grad.addColorStop(0, 'rgba(220,232,255,0)');
  grad.addColorStop(0.35, 'rgba(220,232,255,0.9)');
  grad.addColorStop(0.75, 'rgba(235,242,255,1)');
  grad.addColorStop(1, 'rgba(220,232,255,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(2, 0, 4, 64);
  dt.hasAlpha = true;
  dt.update();
  return dt;
}

/** Soft round dot: snowflakes and rain splashes. */
function createDotTexture(scene: Scene, name: string, ring = false): DynamicTexture {
  const size = 32;
  const dt = new DynamicTexture(name, size, scene, false);
  const ctx = dt.getContext();
  const half = size / 2;
  const grad = ctx.createRadialGradient(half, half, 0, half, half, half);
  if (ring) {
    grad.addColorStop(0, 'rgba(255,255,255,0)');
    grad.addColorStop(0.55, 'rgba(255,255,255,0.15)');
    grad.addColorStop(0.8, 'rgba(255,255,255,0.85)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
  } else {
    grad.addColorStop(0, 'rgba(255,255,255,0.95)');
    grad.addColorStop(0.5, 'rgba(255,255,255,0.55)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
  }
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  dt.hasAlpha = true;
  dt.update();
  return dt;
}

/** Tileable blotches for cloud shadows drifting over the park. */
function createCloudShadowTexture(scene: Scene): DynamicTexture {
  const size = 512;
  const dt = new DynamicTexture('cloudShadowTex', size, scene, true);
  const ctx = dt.getContext() as unknown as CanvasRenderingContext2D;
  ctx.clearRect(0, 0, size, size);
  let seed = 17;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let cloud = 0; cloud < 9; cloud++) {
    const cx = rnd() * size, cy = rnd() * size;
    for (let puff = 0; puff < 9; puff++) {
      const x = cx + (rnd() - .5) * 150, y = cy + (rnd() - .5) * 90, r = 30 + rnd() * 55;
      // Draw wrapped copies so the texture tiles without seams.
      for (const ox of [-size, 0, size]) for (const oy of [-size, 0, size]) {
        const g = ctx.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
        g.addColorStop(0, 'rgba(0,0,0,0.55)'); g.addColorStop(.6, 'rgba(0,0,0,0.35)'); g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x + ox, y + oy, r, 0, Math.PI * 2); ctx.fill();
      }
    }
  }
  dt.hasAlpha = true;
  dt.wrapU = dt.wrapV = Texture.WRAP_ADDRESSMODE;
  dt.update();
  return dt;
}

/** A cumulus made of overlapping puffs, for the horizon ring. */
function createCloudTexture(scene: Scene, seedValue: number): DynamicTexture {
  const w = 256, h = 128;
  const dt = new DynamicTexture('cloudTex' + seedValue, { width: w, height: h }, scene, true);
  const ctx = dt.getContext() as unknown as CanvasRenderingContext2D;
  ctx.clearRect(0, 0, w, h);
  let seed = seedValue;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let i = 0; i < 16; i++) {
    const x = 40 + rnd() * 176, y = 58 + (rnd() - .3) * 36, r = 20 + rnd() * 30;
    const g = ctx.createRadialGradient(x, y - r * .3, 0, x, y, r);
    g.addColorStop(0, 'rgba(255,255,255,0.95)'); g.addColorStop(.7, 'rgba(240,244,250,0.6)'); g.addColorStop(1, 'rgba(230,236,245,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }
  dt.hasAlpha = true;
  dt.update();
  return dt;
}

function createSunTexture(scene: Scene): DynamicTexture {
  const size = 128;
  const dt = new DynamicTexture('sunDiscTex', size, scene, true);
  const ctx = dt.getContext();
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,250,1)'); g.addColorStop(.16, 'rgba(255,248,220,1)');
  g.addColorStop(.24, 'rgba(255,225,160,.55)'); g.addColorStop(.55, 'rgba(255,200,120,.16)'); g.addColorStop(1, 'rgba(255,190,110,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, size, size);
  dt.hasAlpha = true;
  dt.update();
  return dt;
}

/** Thunderstorms and heavy rain are far darker than cloud cover alone suggests. */
export function weatherGloom(data: WeatherData): number {
  if (isThunderstorm(data.weather_code)) return .4;
  if (isRaining(data.weather_code) && data.rain > 3) return .55;
  if (isRaining(data.weather_code)) return .78;
  if (isSnowing(data.weather_code)) return .72;
  if (data.weather_code === 45 || data.weather_code === 48) return .85;
  return 1;
}

export function createWeatherEffects(scene: Scene, shadowGen?: ShadowGenerator): WeatherEffectsContext {
  const emitter = Vector3.Zero();
  const originalFog={mode:scene.fogMode,start:scene.fogStart,end:scene.fogEnd,color:scene.fogColor.clone(),enabled:scene.fogEnabled};
  const bounds = () => scene.metadata?.weatherBounds as { x: number; z: number; halfX: number; halfZ: number; groundY: number } | undefined;

  // --- Wind (shared by particles, clouds and foliage) ---
  const wind: WindState = { time: 0, amplitude: 0, dirX: 1, dirZ: 0 };
  let windSpeed = 0; // m/s
  const windVector = new Vector3();
  const foliage = () => scene.materials.filter(m => /^(park-leaves-|courtyard-leaf-)/.test(m.name));
  let foliageAttached = 0;

  /** A point in the ring around the building (outside the roofless cutaway, including drift). */
  const ringPoint = (position: Vector3, height: number, spread = 1) => {
    const b = bounds();
    const cx = b?.x ?? 0, cz = b?.z ?? 0;
    // Drops start upwind (below) and land on the picked spot, so only a small safety margin is needed.
    const margin = 1.2 + windSpeed * .2;
    let x = cx, z = cz;
    for (let attempt = 0; attempt < 30; attempt++) {
      const angle = Math.random() * Math.PI * 2;
      const radius = Math.pow(Math.random(), 2) * PRECIP_RADIUS * spread;
      x = cx + Math.cos(angle) * radius; z = cz + Math.sin(angle) * radius;
      if (!b || Math.abs(x - cx) > b.halfX + margin || Math.abs(z - cz) > b.halfZ + margin) break;
      if (attempt === 29) x = cx + (b.halfX + margin + 2) * Math.sign(Math.cos(angle) || 1);
    }
    // Drift upwind, so wind carries the drops over the ground spot that was picked.
    // Sideways drift while falling ~0.85 s: ½·(1.4·wind)·t² ≈ 0.5 s²·wind.
    position.set(x - windVector.x * .5, (b?.groundY ?? 0) + height, z - windVector.z * .5);
  };

  // --- Rain ---
  const rain = new ParticleSystem('rain', 7000, scene);
  const rainTex = createRainTexture(scene);
  rain.particleTexture = rainTex;
  rain.emitter = emitter;
  rain.minLifeTime = 0.9;
  rain.maxLifeTime = 1.2;
  rain.minSize = 0.06;
  rain.maxSize = 0.11;
  rain.minScaleY = 4;
  rain.maxScaleY = 7;
  rain.minEmitPower = 0;
  rain.maxEmitPower = 0;
  rain.gravity = new Vector3(0, -30, 0);
  rain.direction1 = new Vector3(-0.05, -1, -0.05);
  rain.direction2 = new Vector3(0.05, -1, 0.05);
  // Additive: pale streaks stand out against wet, dark ground in daylight and at night.
  rain.color1 = new Color4(0.55, 0.6, 0.7, 1);
  rain.color2 = new Color4(0.42, 0.48, 0.58, 1);
  rain.colorDead = new Color4(0.42, 0.48, 0.58, 0);
  rain.blendMode = ParticleSystem.BLENDMODE_ADD;
  rain.billboardMode = ParticleSystem.BILLBOARDMODE_STRETCHED;
  rain.emitRate = 0;
  rain.updateSpeed = 0.02;
  rain.startPositionFunction = (_m, position) => ringPoint(position, EMIT_HEIGHT * .75 + Math.random() * 2);

  // --- Splashes: rings on the ground make rain visible even from straight above ---
  const splash = new ParticleSystem('rain-splash', 2500, scene);
  const splashTex = createDotTexture(scene, 'splashTex', true);
  splash.particleTexture = splashTex;
  splash.emitter = emitter;
  splash.minLifeTime = .18; splash.maxLifeTime = .32;
  splash.minSize = .12; splash.maxSize = .32;
  splash.minEmitPower = 0; splash.maxEmitPower = 0;
  splash.gravity = Vector3.Zero();
  splash.color1 = new Color4(.6, .64, .72, 1); splash.color2 = new Color4(.5, .55, .62, 1); splash.colorDead = new Color4(.5, .55, .62, 0);
  splash.addSizeGradient(0, .08); splash.addSizeGradient(1, .45);
  splash.blendMode = ParticleSystem.BLENDMODE_ADD;
  splash.emitRate = 0;
  splash.startPositionFunction = (_m, position) => { ringPoint(position, .06, .7); position.x += windVector.x * .5; position.z += windVector.z * .5; };
  splash.startDirectionFunction = (_m, direction) => direction.set(0, 0, 0);

  // --- Snow ---
  const snow = new ParticleSystem('snow', 3000, scene);
  const snowTex = createDotTexture(scene, 'snowTex');
  snow.particleTexture = snowTex;
  snow.emitter = emitter;
  snow.minLifeTime = 5;
  snow.maxLifeTime = 9;
  snow.minSize = 0.08;
  snow.maxSize = 0.2;
  snow.minEmitPower = 0.3;
  snow.maxEmitPower = 1;
  snow.gravity = new Vector3(0, -1.4, 0);
  snow.direction1 = new Vector3(-1, -0.5, -1);
  snow.direction2 = new Vector3(1, -0.5, 1);
  snow.color1 = new Color4(1, 1, 1, 0.9);
  snow.color2 = new Color4(0.95, 0.95, 1, 0.75);
  snow.colorDead = new Color4(1, 1, 1, 0);
  snow.blendMode = ParticleSystem.BLENDMODE_STANDARD;
  snow.emitRate = 0;
  snow.updateSpeed = 0.01;
  snow.minAngularSpeed = -0.5;
  snow.maxAngularSpeed = 0.5;
  snow.startPositionFunction = (_m, position) => ringPoint(position, EMIT_HEIGHT * .6 + Math.random() * 4);

  // --- Cloud shadows on the ground ---
  const cloudShadowTex = createCloudShadowTexture(scene);
  cloudShadowTex.uScale = cloudShadowTex.vScale = 2.4;
  const cloudShadowMat = new StandardMaterial('cloud-shadow', scene);
  cloudShadowMat.diffuseTexture = cloudShadowTex;
  cloudShadowMat.useAlphaFromDiffuseTexture = true;
  cloudShadowMat.diffuseColor = Color3.Black();
  cloudShadowMat.specularColor = Color3.Black();
  cloudShadowMat.emissiveColor = Color3.Black();
  cloudShadowMat.disableLighting = true;
  cloudShadowMat.backFaceCulling = true;
  cloudShadowMat.alpha = 0;
  const cloudShadow = MeshBuilder.CreateGround('cloud-shadow', { width: 360, height: 360 }, scene);
  cloudShadow.material = cloudShadowMat;
  cloudShadow.isPickable = false;
  cloudShadow.receiveShadows = false;
  cloudShadow.setEnabled(false);

  // --- Horizon clouds and sun disc (seen when the camera tilts towards the sky) ---
  const cloudTextures = [createCloudTexture(scene, 11), createCloudTexture(scene, 29), createCloudTexture(scene, 47)];
  const cloudMaterials = cloudTextures.map((tex, i) => {
    const m = new StandardMaterial('sky-cloud-' + i, scene);
    m.diffuseTexture = tex; m.useAlphaFromDiffuseTexture = true; m.disableLighting = true;
    m.emissiveColor = Color3.White(); m.diffuseColor = Color3.Black(); m.specularColor = Color3.Black();
    m.backFaceCulling = false; m.alpha = 0; m.fogEnabled = false;
    return m;
  });
  const skyClouds: { mesh: Mesh; angle: number; radius: number; height: number; scale: number; order: number }[] = [];
  for (let i = 0; i < 18; i++) {
    const mesh = MeshBuilder.CreatePlane('sky-cloud', { width: 1, height: .5 }, scene);
    mesh.material = cloudMaterials[i % cloudMaterials.length];
    mesh.billboardMode = Mesh.BILLBOARDMODE_ALL;
    mesh.isPickable = false; mesh.applyFog = false; mesh.setEnabled(false);
    skyClouds.push({ mesh, angle: i / 18 * Math.PI * 2 + (i % 3) * .2, radius: 120 + (i * 37) % 70, height: 38 + (i * 13) % 28, scale: 46 + (i * 17) % 34, order: (i * 7) % 18 / 18 });
  }
  const sunTex = createSunTexture(scene);
  const sunMat = new StandardMaterial('sun-disc', scene);
  sunMat.diffuseTexture = sunTex; sunMat.useAlphaFromDiffuseTexture = true; sunMat.disableLighting = true;
  sunMat.emissiveColor = Color3.White(); sunMat.diffuseColor = Color3.Black(); sunMat.backFaceCulling = false; sunMat.fogEnabled = false;
  const sunDisc = MeshBuilder.CreatePlane('sun-disc', { size: 1 }, scene);
  sunDisc.material = sunMat; sunDisc.billboardMode = Mesh.BILLBOARDMODE_ALL; sunDisc.isPickable = false; sunDisc.applyFog = false;
  sunDisc.setEnabled(false);

  // --- Lightning ---
  const boltMat = new StandardMaterial('lightning-bolt', scene);
  boltMat.disableLighting = true; boltMat.emissiveColor = new Color3(.88, .92, 1); boltMat.diffuseColor = Color3.Black();
  boltMat.fogEnabled = false;
  let bolt: Mesh | null = null;
  let flashStart = -1, nextFlash = 0, flashAdded = 0;
  const hemi = () => scene.lights.find(l => l instanceof HemisphericLight) as HemisphericLight | undefined;
  const sun = () => scene.lights.find(l => l instanceof DirectionalLight) as DirectionalLight | undefined;
  const strike = () => {
    bolt?.dispose(); bolt = null;
    const b = bounds();
    const cx = b?.x ?? 0, cz = b?.z ?? 0, ground = b?.groundY ?? 0;
    const angle = Math.random() * Math.PI * 2, radius = 45 + Math.random() * 70;
    let x = cx + Math.cos(angle) * radius, z = cz + Math.sin(angle) * radius, y = ground + 70;
    const path = [new Vector3(x, y, z)];
    while (y > ground + 1) {
      y -= 3 + Math.random() * 5; x += (Math.random() - .5) * 6; z += (Math.random() - .5) * 6;
      path.push(new Vector3(x, Math.max(ground, y), z));
    }
    bolt = MeshBuilder.CreateTube('lightning-bolt', { path, radius: .22, tessellation: 4 }, scene);
    bolt.material = boltMat; bolt.isPickable = false; bolt.applyFog = false;
  };

  let thunder = false;
  let particleScale = 1;
  let cloudCover = 0, overcast = 0;
  let lastTime = performance.now();
  let rainActive = false;
  let snowActive = false;
  let rainStopTimer: ReturnType<typeof setTimeout> | null = null;
  let snowStopTimer: ReturnType<typeof setTimeout> | null = null;

  const animate = () => {
    const now = performance.now();
    const dt = Math.min(.1, (now - lastTime) / 1000);
    lastTime = now;
    wind.time += dt;
    const b = bounds();
    if (foliageAttached !== scene.materials.length) {
      foliageAttached = scene.materials.length;
      attachWindSway(foliage(), wind);
    }
    // Cloud shadows travel with the wind (at least a slow drift).
    const drift = Math.max(1.2, windSpeed) * dt / 360 / cloudShadowTex.uScale;
    cloudShadowTex.uOffset = (cloudShadowTex.uOffset + drift * wind.dirX + 1) % 1;
    cloudShadowTex.vOffset = (cloudShadowTex.vOffset + drift * wind.dirZ + 1) % 1;
    const altitude = Number(scene.metadata?.sunAltitudeDeg ?? -20);
    const daylight = Math.max(0, Math.min(1, (altitude + 6) / 20));
    // Distinct shadows need sunshine between the clouds.
    const shadowAlpha = Math.pow(Math.sin(Math.PI * Math.min(1, cloudCover * 1.1)), .7) * .75 * Math.min(1, daylight * 1.6) * (1 - overcast);
    cloudShadowMat.alpha = shadowAlpha;
    cloudShadow.setEnabled(shadowAlpha > .02);
    if (b) cloudShadow.position.set(b.x, b.groundY + .03, b.z);
    // Horizon clouds: colour follows daylight and storm darkness.
    const tint = Color3.Lerp(new Color3(.12, .14, .2), new Color3(1, 1, 1), daylight).scale(1 - overcast * .45);
    const visibleClouds = Math.round(skyClouds.length * Math.min(1, cloudCover * 1.25));
    cloudMaterials.forEach(m => { m.emissiveColor.copyFrom(tint); m.alpha = Math.min(.95, .35 + cloudCover * .6); });
    for (const cloud of skyClouds) {
      const on = cloud.order < visibleClouds / skyClouds.length;
      cloud.mesh.setEnabled(on);
      if (!on) continue;
      cloud.angle += dt * (.004 + windSpeed * .0012);
      cloud.mesh.position.set((b?.x ?? 0) + Math.cos(cloud.angle) * cloud.radius, (b?.groundY ?? 0) + cloud.height, (b?.z ?? 0) + Math.sin(cloud.angle) * cloud.radius);
      cloud.mesh.scaling.set(cloud.scale * (1 + overcast * .6), cloud.scale * (1 + overcast * .6), 1);
    }
    // Sun disc along the light direction.
    const sunLight = sun();
    const camera = scene.activeCamera;
    const sunVisible = !!sunLight && altitude > -3 && cloudCover < .9 && !!camera;
    sunDisc.setEnabled(sunVisible);
    if (sunVisible && sunLight && camera) {
      const dir = sunLight.direction.normalizeToNew();
      sunDisc.position.copyFrom(camera.globalPosition).subtractInPlace(dir.scale(250));
      const low = 1 - Math.min(1, Math.max(0, altitude) / 25);
      sunDisc.scaling.setAll(46 + low * 18);
      sunMat.emissiveColor.set(1, 1 - low * .25, 1 - low * .55);
      sunMat.alpha = Math.max(0, 1 - cloudCover * 1.05);
    }
    // Lightning: a bright stroke, a dim pause, a weaker re-strike.
    if (flashStart < 0 && thunder && now >= nextFlash) {
      if (nextFlash) { flashStart = now; strike(); }
      nextFlash = now + 1800 + Math.random() * 5200;
    }
    let flash = 0;
    if (flashStart >= 0) {
      const t = now - flashStart;
      flash = t < 70 ? 1 : t < 140 ? .15 : t < 210 ? .6 : t < 320 ? .2 * (1 - (t - 210) / 110) : 0;
      if (bolt) bolt.setEnabled(t < 90 || (t > 140 && t < 220));
      if (t >= 320) { flashStart = -1; bolt?.dispose(); bolt = null; }
    }
    const h = hemi();
    if (h) { flashAdded = flash * 1.9; h.intensity += flashAdded; }
    scene.metadata = { ...scene.metadata, weatherAnimating: wind.amplitude > .02 || thunder || flashStart >= 0 };
  };
  // The flash is added before each frame and removed afterwards, so the sun controller stays in charge.
  const before: Observer<Scene> = scene.onBeforeRenderObservable.add(animate);
  const after: Observer<Scene> = scene.onAfterRenderObservable.add(() => {
    const h = hemi();
    if (h && flashAdded) h.intensity -= flashAdded;
    flashAdded = 0;
  });

  function applyWind(data: WeatherData) {
    const kmh = Number.isFinite(data.wind_speed_10m) ? data.wind_speed_10m! : 0;
    const gusts = Number.isFinite(data.wind_gusts_10m) ? data.wind_gusts_10m! : kmh * 1.5;
    windSpeed = Math.max(0, kmh) / 3.6;
    // Meteorological direction is where the wind comes from; it blows towards the opposite side.
    const towards = ((data.wind_direction_10m ?? 250) + 180) * Math.PI / 180;
    wind.dirX = Math.sin(towards); wind.dirZ = Math.cos(towards);
    wind.amplitude = Math.min(.55, .02 + Math.max(kmh, gusts * .7) / 60 * .35);
    windVector.set(wind.dirX * windSpeed, 0, wind.dirZ * windSpeed);
    // Rain slants with the wind; snow drifts sideways.
    const slant = Math.min(.6, windSpeed / 22);
    rain.direction1.set(wind.dirX * slant - .04, -1, wind.dirZ * slant - .04);
    rain.direction2.set(wind.dirX * slant + .04, -1, wind.dirZ * slant + .04);
    rain.gravity.set(wind.dirX * windSpeed * 1.4, -30, wind.dirZ * windSpeed * 1.4);
    // Snow drifts at a steady sideways speed (an acceleration would carry it across the whole park).
    const drift = windSpeed * .3;
    snow.direction1.set(wind.dirX * drift - .6, -.5, wind.dirZ * drift - .6);
    snow.direction2.set(wind.dirX * drift + .6, -.3, wind.dirZ * drift + .6);
  }

  function updateWeather(data: WeatherData): number {
    const clouds=Math.max(0,Math.min(1,(Number.isFinite(data.cloud_cover)?data.cloud_cover:0)/100));
    cloudCover = clouds;
    const wet=isRaining(data.weather_code)?Math.min(1,Math.max(.25,data.rain/5)):0;
    const snowCover=isSnowing(data.weather_code)?.65:0;
    const fog=data.weather_code===45||data.weather_code===48?1:0;
    thunder = isThunderstorm(data.weather_code);
    if (!thunder) nextFlash = 0;
    overcast = Math.max(wet * .8, thunder ? 1 : 0, clouds > .85 ? (clouds - .85) / .15 * .6 : 0);
    scene.metadata={...scene.metadata,outdoorWeather:{clouds,wet,snow:snowCover,fog}};
    if(fog||wet){scene.fogEnabled=true;scene.fogMode=3;scene.fogStart=fog?18:55;scene.fogEnd=fog?110:210;scene.fogColor=new Color3(.43,.49,.53);}
    else {scene.fogMode=originalFog.mode;scene.fogStart=originalFog.start;scene.fogEnd=originalFog.end;scene.fogColor.copyFrom(originalFog.color);scene.fogEnabled=originalFog.enabled;}
    applyWind(data);
    // Adapt snow color to theme — detect from scene background brightness
    const bg = scene.clearColor;
    const isLight = (bg.r + bg.g + bg.b) / 3 > 0.5;
    if (isLight) {
      snow.color1 = new Color4(0.55, 0.6, 0.75, 0.9);
      snow.color2 = new Color4(0.5, 0.55, 0.7, 0.7);
      snow.colorDead = new Color4(0.5, 0.55, 0.7, 0);
    } else {
      snow.color1 = new Color4(1, 1, 1, 0.9);
      snow.color2 = new Color4(0.95, 0.95, 1, 0.75);
      snow.colorDead = new Color4(1, 1, 1, 0);
    }

    const wantRain = isRaining(data.weather_code);
    const wantSnow = isSnowing(data.weather_code);

    // --- Rain ---
    if (wantRain && !rainActive) {
      if (rainStopTimer) { clearTimeout(rainStopTimer); rainStopTimer = null; }
      rain.start();
      splash.start();
      rainActive = true;
    }
    if (wantRain) {
      const amount = Math.max(data.rain, thunder ? 4 : .3);
      rain.emitRate = Math.min(Math.max(amount * 750, 900), 7000);
      splash.emitRate = Math.min(Math.max(amount * 260, 250), 2500);
    }
    if (!wantRain && rainActive) {
      rain.emitRate = 0;
      splash.emitRate = 0;
      if (rainStopTimer) clearTimeout(rainStopTimer);
      rainStopTimer = setTimeout(() => {
        rain.stop();
        splash.stop();
        rainStopTimer = null;
      }, 2000);
      rainActive = false;
    }

    // --- Snow ---
    if (wantSnow && !snowActive) {
      if (snowStopTimer) { clearTimeout(snowStopTimer); snowStopTimer = null; }
      snow.start();
      snowActive = true;
    }
    if (wantSnow) {
      snow.emitRate = Math.min(Math.max(data.snowfall * 600, 400), 3000);
    }
    if (!wantSnow && snowActive) {
      snow.emitRate = 0;
      if (snowStopTimer) clearTimeout(snowStopTimer);
      snowStopTimer = setTimeout(() => {
        snow.stop();
        snowStopTimer = null;
      }, 5000);
      snowActive = false;
    }

    // --- Shadow softening when cloudy ---
    if (shadowGen) {
      shadowGen.darkness = clouds * 0.7;
      shadowGen.normalBias = 0.02 + clouds * 0.08;
    }

    // --- Cloud cover factor ---
    // 0% cloud → 1.0, 100% cloud → 0.55; storms and heavy rain darken further.
    return (1 - clouds * 0.45) * weatherGloom(data);
  }

  const baseSizes = [rain, snow].map(system => [system.minSize, system.maxSize, system.minScaleY, system.maxScaleY]);
  function setParticleScale(scale: number) {
    particleScale = Math.max(.25, Math.min(6, scale));
    [rain, snow].forEach((system, i) => {
      const [min, max, minY, maxY] = baseSizes[i];
      const k = particleScale;
      system.minSize = min * k; system.maxSize = max * k;
      // Longer streaks rather than fatter drops for rain.
      if (system === rain) { system.minScaleY = minY * Math.sqrt(k); system.maxScaleY = maxY * Math.sqrt(k); }
    });
  }

  function dispose() {
    if (rainStopTimer) clearTimeout(rainStopTimer);
    if (snowStopTimer) clearTimeout(snowStopTimer);
    scene.onBeforeRenderObservable.remove(before);
    scene.onAfterRenderObservable.remove(after);
    rain.dispose();
    splash.dispose();
    snow.dispose();
    rainTex.dispose();
    splashTex.dispose();
    snowTex.dispose();
    bolt?.dispose();
    boltMat.dispose();
    cloudShadow.dispose(); cloudShadowMat.dispose(); cloudShadowTex.dispose();
    skyClouds.forEach(c => c.mesh.dispose()); cloudMaterials.forEach(m => m.dispose()); cloudTextures.forEach(t => t.dispose());
    sunDisc.dispose(); sunMat.dispose(); sunTex.dispose();
    scene.metadata = { ...scene.metadata, weatherAnimating: false };
  }

  return { updateWeather, setParticleScale, dispose };
}
