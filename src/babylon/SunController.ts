import { DirectionalLight, HemisphericLight, Vector3, Color3 } from '@babylonjs/core';

/**
 * Equation of time in minutes — correction for Earth's elliptical orbit
 * and axial tilt. Positive means solar noon is later than clock noon.
 */
function equationOfTime(dayOfYear: number): number {
  const b = (360 / 365) * (dayOfYear - 81) * Math.PI / 180;
  return 9.87 * Math.sin(2 * b) - 7.53 * Math.cos(b) - 1.5 * Math.sin(b);
}

/**
 * Convert local clock minutes to local solar time minutes.
 * Accounts for longitude offset within timezone and equation of time.
 */
function toSolarTime(clockMinutes: number, longitude: number, dayOfYear: number): number {
  // Timezone offset in minutes (e.g. UTC+1 → -60, UTC+2 → -120)
  const tzOffsetMin = new Date().getTimezoneOffset(); // negative for east of UTC
  // Standard meridian for the timezone (degrees east)
  const stdMeridian = -tzOffsetMin / 60 * 15;
  // Longitude correction: 4 minutes per degree of difference
  const longitudeCorrection = 4 * (longitude - stdMeridian);
  const eot = equationOfTime(dayOfYear);
  return clockMinutes + longitudeCorrection + eot;
}

export interface SunPosition {
  altitude: number;
  azimuth: number;
  altitudeDeg: number;
  azimuthDeg: number;
  isDay: boolean;
}

/** Calendar day for sun calculations; the day demo pins one so its story fits the daylight. */
let dateOverride: Date | null = null;
export function setSunDateOverride(date: Date | null): void {
  dateOverride = date;
}

export function getSunPosition(
  latitude: number,
  longitude: number,
  minutes?: number,
  northOffset?: number,
): SunPosition {
  const now = dateOverride ?? new Date();
  const clockMins = minutes !== undefined
    ? minutes
    : now.getHours() * 60 + now.getMinutes();

  const lat = latitude * Math.PI / 180;
  const dayOfYear = Math.floor(
    (now.getTime() - new Date(now.getFullYear(), 0, 0).getTime()) / 86400000,
  );
  const declination =
    -23.45 * Math.cos(((360 / 365) * (dayOfYear + 10) * Math.PI) / 180) *
    (Math.PI / 180);
  const solarMins = toSolarTime(clockMins, longitude, dayOfYear);
  const hourAngle = ((solarMins / 60 - 12) * 15 * Math.PI) / 180;

  const altitude = Math.asin(
    Math.sin(lat) * Math.sin(declination) +
    Math.cos(lat) * Math.cos(declination) * Math.cos(hourAngle),
  );
  const rawAzimuth = Math.atan2(
    -Math.cos(declination) * Math.sin(hourAngle),
    Math.sin(declination) * Math.cos(lat) -
    Math.cos(declination) * Math.cos(hourAngle) * Math.sin(lat),
  );
  const azimuth = rawAzimuth + (northOffset ?? 0) * Math.PI / 180;
  const altitudeDeg = altitude * 180 / Math.PI;
  const azimuthDeg = ((azimuth * 180 / Math.PI) % 360 + 360) % 360;

  return {
    altitude,
    azimuth,
    altitudeDeg,
    azimuthDeg,
    isDay: altitude > 0,
  };
}

export function updateSunPosition(
  sun: DirectionalLight,
  hemi: HemisphericLight,
  latitude: number,
  longitude: number,
  minutes?: number,
  northOffset?: number,
  cloudCoverFactor?: number,
): void {
  const ccf = cloudCoverFactor ?? 1;
  const { altitude, azimuth, isDay } = getSunPosition(latitude, longitude, minutes, northOffset);

  sun.getScene().metadata={...sun.getScene().metadata,sunAltitudeDeg:altitude*180/Math.PI};
  // Babylon still renders shadow maps for enabled lights with zero intensity.
  if (sun.shadowEnabled !== isDay) {
    sun.shadowEnabled = isDay;
    if (isDay) sun.getShadowGenerator()?.getShadowMap()?.resetRefreshCounter();
  }
  if (isDay) {
    const dir = new Vector3(
      -Math.cos(altitude) * Math.sin(azimuth),
      -Math.sin(altitude),
      -Math.cos(altitude) * Math.cos(azimuth),
    );
    sun.direction = dir;
    // Place the light far behind the direction so the shadow camera
    // is positioned correctly to cover the whole scene.
    sun.position = dir.scale(-50);
    const t = Math.min(altitude / (Math.PI / 6), 1);
    sun.diffuse = new Color3(1.0, 0.7 + 0.25 * t, 0.5 + 0.35 * t);
    sun.intensity = (0.45 + 0.65 * t) * ccf;
    hemi.intensity = (HORIZON_AMBIENT + 0.1 * t) * ambientCloudFactor(ccf);
    hemi.diffuse = new Color3(0.85, 0.9, 1.0);
  } else {
    sun.intensity = 0;
    // Twilight: the sky stays bright for a while after sunset. Blend from the
    // horizon ambient down to night over the twilight (0° to -10°).
    const dusk = Math.max(0, Math.min(1, (altitude * 180 / Math.PI + TWILIGHT_DEG) / TWILIGHT_DEG));
    const k = Math.pow(dusk, 1.3);
    hemi.intensity = NIGHT_AMBIENT + (HORIZON_AMBIENT * ambientCloudFactor(ccf) - NIGHT_AMBIENT) * k;
    hemi.diffuse = Color3.Lerp(NIGHT_TINT, DUSK_TINT, k);
  }
}

const HORIZON_AMBIENT = 0.5;
const NIGHT_AMBIENT = 0.08;
const TWILIGHT_DEG = 10;
const NIGHT_TINT = new Color3(0.2, 0.25, 0.4);
const DUSK_TINT = new Color3(0.7, 0.72, 0.9);

/** Overcast sky still lights the scene diffusely: clouds dim ambient half as much as direct sun. */
function ambientCloudFactor(ccf: number): number {
  return 1 - (1 - ccf) * 0.5;
}

/**
 * Returns true if the sun is above the horizon for the given location and time.
 */
export function isDaytime(
  latitude: number,
  longitude: number,
  minutes?: number,
): boolean {
  return getSunPosition(latitude, longitude, minutes).isDay;
}

export function minutesToLabel(m: number): string {
  const h = String(Math.floor(m / 60)).padStart(2, '0');
  const min = String(m % 60).padStart(2, '0');
  return `${h}:${min}`;
}
