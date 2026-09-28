import { Color3, Scene, type ShaderMaterial, type StandardMaterial } from '@babylonjs/core';

/** Cache atmospheric calculations while still restoring fog after weather updates. */
export function createParkAtmosphereUpdater(
  scene: Scene,
  sky: ShaderMaterial,
  materials: StandardMaterial[],
  terrain: StandardMaterial[],
): () => void {
  const dryColors = terrain.map(material => material.diffuseColor.clone());
  const clearWeather = { clouds: 0, wet: 0, snow: 0, fog: 0 };
  let lastElevation = NaN, lastRoundedElevation = NaN;
  let lastClouds = NaN, lastWet = NaN, lastSnow = NaN, lastFog = NaN;
  let daylight = 0, cloudTint = Color3.Black(), horizon = Color3.Black();

  return () => {
    const elevation = Number(scene.metadata?.sunAltitudeDeg ?? -20);
    const weather = scene.metadata?.outdoorWeather ?? clearWeather;
    const { clouds, wet, snow, fog } = weather;
    const weatherChanged = clouds !== lastClouds || wet !== lastWet || snow !== lastSnow || fog !== lastFog;
    if (elevation !== lastElevation || clouds !== lastClouds || fog !== lastFog) {
      daylight = Math.max(0, Math.min(1, (elevation + 8) / 30));
      cloudTint = Color3.Lerp(new Color3(.025, .03, .045), new Color3(.42, .47, .51), daylight);
      horizon = Color3.Lerp(
        Color3.Lerp(new Color3(.045, .055, .10), new Color3(.78, .85, .89), daylight),
        cloudTint, Math.max(clouds * .55, fog),
      );
    }
    lastElevation = elevation;
    lastClouds = clouds; lastWet = wet; lastSnow = snow; lastFog = fog;

    // WeatherEffects can overwrite these independently. Reapply even on cache hits.
    scene.fogEnabled = true;
    scene.fogMode = Scene.FOGMODE_LINEAR;
    scene.fogStart = fog ? 18 : wet ? 55 : 85;
    scene.fogEnd = fog ? 110 : wet ? 210 : 230;
    scene.fogColor.copyFrom(horizon);
    scene.clearColor.set(horizon.r, horizon.g, horizon.b, 1);

    const roundedElevation = Math.round(elevation * 10);
    if (!weatherChanged && roundedElevation === lastRoundedElevation) return;
    lastRoundedElevation = roundedElevation;
    sky.setColor3('zenith', Color3.Lerp(
      Color3.Lerp(new Color3(.015, .024, .06), new Color3(.19, .43, .68), daylight),
      cloudTint, Math.max(clouds, fog),
    ));
    // Keep the original sky refresh granularity; horizon is replaced, never mutated.
    sky.setColor3('horizon', horizon);
    terrain.forEach((material, index) => {
      material.diffuseColor = Color3.Lerp(dryColors[index].scale(1 - wet * .3), new Color3(.82, .86, .89), snow);
      material.specularColor = new Color3(.18, .2, .22).scale(wet);
      material.specularPower = 48;
    });
    for (const material of materials) material.emissiveColor = material.diffuseColor.scale(.025 + .09 * daylight);
  };
}
