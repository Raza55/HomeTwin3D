import {
  ParticleSystem,
  Vector3,
  Color4,
  Color3,
  DynamicTexture,
  type Scene,
  type ShadowGenerator,
} from '@babylonjs/core';
import type { WeatherData } from '../services/weatherApi';
import { isRaining, isSnowing } from '../services/weatherApi';

const SPREAD = 30; // half-width of emitter box
const EMIT_HEIGHT = 15; // spawn height above ground

export interface WeatherEffectsContext {
  updateWeather(data: WeatherData): number;
  dispose(): void;
}

/** Procedural rain streak texture. */
function createRainTexture(scene: Scene): DynamicTexture {
  const dt = new DynamicTexture('rainTex', { width: 8, height: 64 }, scene, false);
  const ctx = dt.getContext();
  const grad = ctx.createLinearGradient(4, 0, 4, 64);
  grad.addColorStop(0, 'rgba(100,150,255,0)');
  grad.addColorStop(0.3, 'rgba(100,150,255,0.8)');
  grad.addColorStop(0.7, 'rgba(100,150,255,0.8)');
  grad.addColorStop(1, 'rgba(100,150,255,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(2, 0, 4, 64);
  dt.update();
  return dt;
}

/** Procedural snowflake (soft dot) texture. */
function createSnowTexture(scene: Scene): DynamicTexture {
  const size = 32;
  const dt = new DynamicTexture('snowTex', size, scene, false);
  const ctx = dt.getContext();
  const half = size / 2;
  const grad = ctx.createRadialGradient(half, half, 0, half, half, half);
  grad.addColorStop(0, 'rgba(255,255,255,0.9)');
  grad.addColorStop(0.5, 'rgba(255,255,255,0.5)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  dt.update();
  return dt;
}

export function createWeatherEffects(scene: Scene, shadowGen?: ShadowGenerator): WeatherEffectsContext {
  const emitter = Vector3.Zero();
  const originalFog={mode:scene.fogMode,start:scene.fogStart,end:scene.fogEnd,color:scene.fogColor.clone(),enabled:scene.fogEnabled};

  // --- Rain ---
  const rain = new ParticleSystem('rain', 4000, scene);
  const rainTex = createRainTexture(scene);
  rain.particleTexture = rainTex;
  rain.emitter = emitter;
  rain.minEmitBox = new Vector3(-SPREAD, EMIT_HEIGHT, -SPREAD);
  rain.maxEmitBox = new Vector3(SPREAD, EMIT_HEIGHT + 2, SPREAD);
  rain.minLifeTime = 1.0;
  rain.maxLifeTime = 1.5;
  rain.minSize = 0.015;
  rain.maxSize = 0.04;
  rain.minEmitPower = 0;
  rain.maxEmitPower = 0;
  rain.gravity = new Vector3(0, -30, 0);
  rain.direction1 = new Vector3(-0.5, -1, -0.5);
  rain.direction2 = new Vector3(0.5, -1, 0.5);
  rain.color1 = new Color4(0.5, 0.7, 1.0, 1.0);
  rain.color2 = new Color4(0.4, 0.6, 1.0, 0.9);
  rain.colorDead = new Color4(0.4, 0.6, 1.0, 0);
  rain.blendMode = ParticleSystem.BLENDMODE_STANDARD;
  rain.billboardMode = ParticleSystem.BILLBOARDMODE_STRETCHED;
  rain.emitRate = 0;
  rain.updateSpeed = 0.02;

  // --- Snow ---
  const snow = new ParticleSystem('snow', 1500, scene);
  const snowTex = createSnowTexture(scene);
  snow.particleTexture = snowTex;
  snow.emitter = emitter;
  snow.minEmitBox = new Vector3(-SPREAD, EMIT_HEIGHT, -SPREAD);
  snow.maxEmitBox = new Vector3(SPREAD, EMIT_HEIGHT + 2, SPREAD);
  snow.minLifeTime = 5;
  snow.maxLifeTime = 10;
  snow.minSize = 0.04;
  snow.maxSize = 0.12;
  snow.minEmitPower = 0.5;
  snow.maxEmitPower = 1.5;
  snow.gravity = new Vector3(0, -0.8, 0);
  snow.direction1 = new Vector3(-1, -0.5, -1);
  snow.direction2 = new Vector3(1, -0.5, 1);
  snow.color1 = new Color4(1, 1, 1, 0.8);
  snow.color2 = new Color4(0.95, 0.95, 1, 0.6);
  snow.colorDead = new Color4(1, 1, 1, 0);
  snow.blendMode = ParticleSystem.BLENDMODE_STANDARD;
  snow.emitRate = 0;
  snow.updateSpeed = 0.01;
  snow.minAngularSpeed = -0.5;
  snow.maxAngularSpeed = 0.5;
  // Keep precipitation out of the roofless apartment cutaway, including drift.
  for(const system of [rain,snow])system.startPositionFunction=(_matrix,position)=>{
    const bounds=scene.metadata?.weatherBounds;
    const cx=bounds?.x??0,cz=bounds?.z??0;
    let x=0,z=0;
    for(let attempt=0;attempt<30;attempt++){
      x=cx+(Math.random()-.5)*120;z=cz+(Math.random()-.5)*120;
      if(!bounds||Math.abs(x-cx)>bounds.halfX+10||Math.abs(z-cz)>bounds.halfZ+10)break;
      if(attempt===29)x=cx+bounds.halfX+12;
    }
    position.set(x,(bounds?.groundY??0)+EMIT_HEIGHT+Math.random()*2,z);
  };

  let rainActive = false;
  let snowActive = false;
  let rainStopTimer: ReturnType<typeof setTimeout> | null = null;
  let snowStopTimer: ReturnType<typeof setTimeout> | null = null;

  function updateWeather(data: WeatherData): number {
    const clouds=Math.max(0,Math.min(1,(Number.isFinite(data.cloud_cover)?data.cloud_cover:0)/100));
    const wet=isRaining(data.weather_code)?Math.min(1,Math.max(.25,data.rain/5)):0;
    const snowCover=isSnowing(data.weather_code)?.65:0;
    const fog=data.weather_code===45||data.weather_code===48?1:0;
    scene.metadata={...scene.metadata,outdoorWeather:{clouds,wet,snow:snowCover,fog}};
    if(fog||wet){scene.fogEnabled=true;scene.fogMode=3;scene.fogStart=fog?18:55;scene.fogEnd=fog?110:210;scene.fogColor=new Color3(.43,.49,.53);}
    else {scene.fogMode=originalFog.mode;scene.fogStart=originalFog.start;scene.fogEnd=originalFog.end;scene.fogColor.copyFrom(originalFog.color);scene.fogEnabled=originalFog.enabled;}
    // Adapt snow color to theme — detect from scene background brightness
    const bg = scene.clearColor;
    const isLight = (bg.r + bg.g + bg.b) / 3 > 0.5;
    if (isLight) {
      snow.color1 = new Color4(0.55, 0.6, 0.75, 0.9);
      snow.color2 = new Color4(0.5, 0.55, 0.7, 0.7);
      snow.colorDead = new Color4(0.5, 0.55, 0.7, 0);
    } else {
      snow.color1 = new Color4(1, 1, 1, 0.8);
      snow.color2 = new Color4(0.95, 0.95, 1, 0.6);
      snow.colorDead = new Color4(1, 1, 1, 0);
    }

    const wantRain = isRaining(data.weather_code);
    const wantSnow = isSnowing(data.weather_code);

    // --- Rain ---
    if (wantRain && !rainActive) {
      if (rainStopTimer) { clearTimeout(rainStopTimer); rainStopTimer = null; }
      rain.start();
      rainActive = true;
    }
    if (wantRain) {
      rain.emitRate = Math.min(Math.max(data.rain * 500, 500), 4000);
    }
    if (!wantRain && rainActive) {
      rain.emitRate = 0;
      if (rainStopTimer) clearTimeout(rainStopTimer);
      rainStopTimer = setTimeout(() => {
        rain.stop();
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
      snow.emitRate = Math.min(Math.max(data.snowfall * 300, 200), 1500);
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
    // 0% cloud → 1.0, 100% cloud → 0.6
    return 1 - clouds * 0.4;
  }

  function dispose() {
    if (rainStopTimer) clearTimeout(rainStopTimer);
    if (snowStopTimer) clearTimeout(snowStopTimer);
    rain.dispose();
    snow.dispose();
    rainTex.dispose();
    snowTex.dispose();
  }

  return { updateWeather, dispose };
}
