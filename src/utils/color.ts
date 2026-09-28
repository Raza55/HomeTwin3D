export function miredToKelvin(mired: number): number {
  return Math.round(1000000 / mired);
}

export function kelvinToRGB(kelvin: number): { r: number; g: number; b: number } {
  const temp = kelvin / 100;
  let r: number, g: number, b: number;

  r = temp <= 66
    ? 255
    : Math.min(255, Math.max(0, 329.698727446 * Math.pow(temp - 60, -0.1332047592)));

  g = temp <= 66
    ? Math.min(255, Math.max(0, 99.4708025861 * Math.log(temp) - 161.1195681661))
    : Math.min(255, Math.max(0, 288.1221695283 * Math.pow(temp - 60, -0.0755148492)));

  b = temp >= 66
    ? 255
    : temp <= 19
      ? 0
      : Math.min(255, Math.max(0, 138.5177312231 * Math.log(temp - 10) - 305.0447927307));

  return { r: r / 255, g: g / 255, b: b / 255 };
}

export function rgbToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
}
