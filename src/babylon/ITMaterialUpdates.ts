import { Color3, PBRMaterial, StandardMaterial } from '@babylonjs/core';

/** Dedicated IT materials: only active RGB needs per-frame color changes. */
export function createITMaterialUpdater(material: PBRMaterial | StandardMaterial, rgb: boolean, color: Color3, zone: number) {
  const hue = new Color3(), black = Color3.Black();
  const diffuse = material instanceof PBRMaterial ? material.albedoColor : material.diffuseColor;
  let previousOn: boolean | undefined, previousScreen: boolean | undefined;
  return (on: boolean, elapsed: number, screen?: boolean): void => {
    if (on === previousOn && screen === previousScreen && !(on && rgb && screen === undefined)) return;
    previousOn = on; previousScreen = screen;
    if (screen !== undefined) {
      const visible = on && screen;
      diffuse.set(visible ? 1 : 0, visible ? 1 : 0, visible ? 1 : 0);
      material.emissiveColor.copyFrom(diffuse);
      return;
    }
    if (on && rgb) Color3.HSVtoRGBToRef((275 + elapsed / 220 + zone) % 360, .9, .85, hue);
    diffuse.copyFrom(on ? (rgb ? hue : color) : black);
    if (on && rgb) {
      material.emissiveColor.copyFrom(hue);
      if (material instanceof PBRMaterial) material.emissiveIntensity = 1.8;
    } else if (on) material.emissiveColor.set(.35, .5, .65);
    else material.emissiveColor.copyFrom(black);
  };
}
