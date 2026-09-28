export interface WeatherData {
  temperature_2m?: number;
  weather_code: number;
  cloud_cover: number;
  rain: number;
  snowfall: number;
  is_day?: number;
}

// WMO weather codes for precipitation types
const RAIN_CODES = new Set([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82]);
const SNOW_CODES = new Set([71, 73, 75, 77, 85, 86]);

export function isRaining(code: number): boolean {
  return RAIN_CODES.has(code);
}

export function isSnowing(code: number): boolean {
  return SNOW_CODES.has(code);
}

// Client-side cache (10 min TTL, same as old server cache)
let cache: { data: WeatherData; latitude: number; longitude: number; ts: number } | null = null;
const CACHE_TTL = 600_000;
const LOCATION_EPSILON = 0.0001;

export async function fetchWeather(latitude: number, longitude: number): Promise<WeatherData> {
  if (
    cache &&
    Math.abs(cache.latitude - latitude) < LOCATION_EPSILON &&
    Math.abs(cache.longitude - longitude) < LOCATION_EPSILON &&
    Date.now() - cache.ts < CACHE_TTL
  ) {
    return cache.data;
  }

  const url = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,weather_code,cloud_cover,rain,snowfall,is_day&timezone=Europe%2FBerlin`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Open-Meteo HTTP ${res.status}`);
  const json = await res.json();
  const data: WeatherData = json.current;
  cache = { data, latitude, longitude, ts: Date.now() };
  return data;
}
