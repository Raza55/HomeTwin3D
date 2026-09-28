import { useState, useEffect, useMemo, useRef } from 'react';
import {
  CloudOff,
  CloudRain,
  CloudSnow,
  CloudSun,
  Cloudy,
  Moon,
  SunMedium,
  type LucideIcon,
} from 'lucide-react';
import type { DirectionalLight, HemisphericLight } from '@babylonjs/core';
import { updateSunPosition, minutesToLabel, getSunPosition } from '../babylon/SunController';
import { useDemoMode } from '../contexts/DemoModeContext';
import { useSimulationMode } from '../contexts/SimulationModeContext';
import { useTheme } from '../contexts/ThemeContext';
import { useLanguage } from '../contexts/LanguageContext';
import { getSetting } from '../services/settingsStore';
import { isRaining, isSnowing, type WeatherData } from '../services/weatherApi';
import { LOGO_2D_VIEWBOX, LOGO_2D_SLASHES } from './logoData';
import './HUD.css';

interface Props {
  latitude: number;
  longitude: number;
  northOffset: number;
  sunLight: DirectionalLight | null;
  hemiLight: HemisphericLight | null;

  /* Sun state (lifted to parent for settings modal) */
  sunLiveMode: boolean;
  sliderValue: number;
  scrubberTime: string;
  onSunLiveModeChange: (live: boolean) => void;
  onSliderValueChange: (mins: number) => void;
  onScrubberTimeChange: (time: string) => void;
  cloudCoverFactor?: number;
  currentWeather?: WeatherData | null;
}

function cardinalFromAzimuth(azimuthDeg: number, language: string): string {
  const labels = language.startsWith('de')
    ? ['N', 'NO', 'O', 'SO', 'S', 'SW', 'W', 'NW']
    : ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return labels[Math.round(azimuthDeg / 45) % labels.length];
}

function weatherConditionKey(weather: WeatherData): string {
  if (isSnowing(weather.weather_code) || weather.snowfall > 0) return 'dashboard.weatherSnow';
  if (isRaining(weather.weather_code) || weather.rain > 0) return 'dashboard.weatherRain';
  if (weather.cloud_cover >= 70) return 'dashboard.weatherCloudy';
  if (weather.weather_code === 3) return 'dashboard.weatherCloudy';
  if (weather.cloud_cover >= 20) return 'dashboard.weatherPartlyCloudy';
  if (weather.weather_code === 1 || weather.weather_code === 2) return 'dashboard.weatherPartlyCloudy';
  return 'dashboard.weatherClear';
}

function weatherVisualFor(weather?: WeatherData | null): { icon: LucideIcon; variant: string } {
  if (!weather) return { icon: CloudOff, variant: 'weather-unavailable' };
  if (isSnowing(weather.weather_code) || weather.snowfall > 0) return { icon: CloudSnow, variant: 'weather-snow' };
  if (isRaining(weather.weather_code) || weather.rain > 0) return { icon: CloudRain, variant: 'weather-rain' };
  if (weather.weather_code === 3 || weather.cloud_cover >= 70) return { icon: Cloudy, variant: 'weather-cloudy' };
  if (weather.weather_code === 1 || weather.weather_code === 2 || weather.cloud_cover >= 20) {
    return { icon: CloudSun, variant: 'weather-partly' };
  }
  return { icon: SunMedium, variant: 'weather-clear' };
}

export default function HUD({
  latitude,
  longitude,
  northOffset,
  sunLight,
  hemiLight,
  sunLiveMode,
  sliderValue,
  scrubberTime,
  onSunLiveModeChange,
  onSliderValueChange,
  onScrubberTimeChange,
  cloudCoverFactor,
  currentWeather,
}: Props) {
  const { demoMode } = useDemoMode();
  const { simulationMode } = useSimulationMode();
  const { updateAutoTheme } = useTheme();
  const { language, t } = useLanguage();
  const [hudVisible, setHudVisible] = useState(() => getSetting('appearance').hudVisible);
  const [clock, setClock] = useState('--:--');
  const [date, setDate] = useState('---');
  const [currentMinutes, setCurrentMinutes] = useState(720);

  useEffect(() => {
    const handler = () => setHudVisible(getSetting('appearance').hudVisible);
    window.addEventListener('appearance-changed', handler);
    return () => window.removeEventListener('appearance-changed', handler);
  }, []);
  const sunLiveModeRef = useRef(sunLiveMode);
  sunLiveModeRef.current = sunLiveMode;

  // Clock update
  useEffect(() => {
    function tick() {
      const now = new Date();
      setClock(now.toLocaleTimeString(language, { hour: '2-digit', minute: '2-digit' }));
      setDate(now.toLocaleDateString(language, { weekday: 'short', day: 'numeric', month: 'short' }));
      setCurrentMinutes(now.getHours() * 60 + now.getMinutes());
    }
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [language]);

  // Sun position update
  useEffect(() => {
    if (!sunLight || !hemiLight) return;

    function sunTick() {
      if (!sunLiveModeRef.current || !sunLight || !hemiLight) return;
      const now = new Date();
      const liveMin = now.getHours() * 60 + now.getMinutes();
      onSliderValueChange(liveMin);
      onScrubberTimeChange(minutesToLabel(liveMin));
      updateSunPosition(sunLight, hemiLight, latitude, longitude, undefined, northOffset, cloudCoverFactor);
      updateAutoTheme();
    }

    sunTick();
    const id = setInterval(sunTick, 60000);
    return () => clearInterval(id);
  }, [sunLight, hemiLight, latitude, longitude, northOffset, cloudCoverFactor, onSliderValueChange, onScrubberTimeChange, updateAutoTheme]);

  const sunStatus = useMemo(() => {
    const minutes = sunLiveMode ? currentMinutes : sliderValue;
    const pos = getSunPosition(latitude, longitude, minutes, northOffset);
    const degree = '\u00b0';
    const heading = cardinalFromAzimuth(pos.azimuthDeg, language);
    const modeTime = sunLiveMode ? '' : ` · ${scrubberTime}`;
    const nightPrefix = pos.isDay ? '' : `${t('dashboard.sunNight')} `;
    return {
      icon: pos.isDay ? SunMedium : Moon,
      variant: pos.isDay ? 'sun-day' : 'sun-night',
      text: `${nightPrefix}${Math.round(pos.altitudeDeg)}${degree} ${heading}${modeTime}`,
    };
  }, [currentMinutes, language, latitude, longitude, northOffset, scrubberTime, sliderValue, sunLiveMode, t]);

  const weatherStatus = useMemo(() => {
    if (!currentWeather) {
      return {
        icon: CloudOff,
        variant: 'weather-unavailable',
        text: t('dashboard.weatherUnavailable'),
      };
    }

    const condition = t(weatherConditionKey(currentWeather));
    const temperature = typeof currentWeather.temperature_2m === 'number'
      ? `${Math.round(currentWeather.temperature_2m)}${'\u00b0'}C`
      : '';
    const clouds = `${t('dashboard.weatherClouds')} ${Math.round(currentWeather.cloud_cover)}%`;
    const precipitation =
      currentWeather.snowfall > 0
        ? `${t('dashboard.weatherSnow')} ${currentWeather.snowfall.toFixed(1)} cm/h`
        : currentWeather.rain > 0
          ? `${t('dashboard.weatherRain')} ${currentWeather.rain.toFixed(1)} mm/h`
          : '';
    const visual = weatherVisualFor(currentWeather);

    return {
      icon: visual.icon,
      variant: visual.variant,
      text: [temperature, condition, clouds, precipitation].filter(Boolean).join(' · '),
    };
  }, [currentWeather, t]);

  const SunStatusIcon = sunStatus.icon;
  const WeatherStatusIcon = weatherStatus.icon;

  if (!hudVisible) return null;

  return (
    <div className="hud">
      <div className="corner tl" />
      <div className="corner tr" />
      <div className="corner bl" />
      <div className="corner br" />

      <div className={`title-bar${simulationMode ? ' demo' : demoMode ? ' demo' : ''}`}>
        <svg className="hud-logo" viewBox={LOGO_2D_VIEWBOX} xmlns="http://www.w3.org/2000/svg">
          <defs>
            <filter id="hud-glow" x="-80%" y="-80%" width="260%" height="260%">
              <feGaussianBlur in="SourceGraphic" stdDeviation="12" result="b1" />
              <feGaussianBlur in="SourceGraphic" stdDeviation="30" result="b2" />
              <feGaussianBlur in="SourceGraphic" stdDeviation="50" result="b3" />
              <feMerge>
                <feMergeNode in="b3" />
                <feMergeNode in="b2" />
                <feMergeNode in="b1" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          {LOGO_2D_SLASHES.map((p, i) => (
            <polygon key={i} points={p} className="hud-logo-front" />
          ))}
          <g filter="url(#hud-glow)" className="hud-logo-glow">
            {LOGO_2D_SLASHES.map((p, i) => (
              <polygon key={i} points={p} fill="none" strokeWidth="6" strokeLinejoin="round" />
            ))}
          </g>
        </svg>
        <div className="label">{'3Dash'}<span className="label-sep">{' · '}</span>{simulationMode ? t('dashboard.simulation') : demoMode ? t('dashboard.demoView') : t('dashboard.liveView')}</div>
      </div>

      <div className="time-display">
        <div className="time">{clock}</div>
        <div className="date">{date}</div>
        <div className="hud-status-lines">
          <div className="hud-status-line">
            <span className={`hud-status-icon-badge ${sunStatus.variant}`}>
              <SunStatusIcon className="hud-status-icon" size={13} strokeWidth={1.8} aria-hidden="true" />
            </span>
            <span className="hud-status-label">{t('dashboard.sun')}</span>
            <strong>{sunStatus.text}</strong>
          </div>
          <div className="hud-status-line">
            <span className={`hud-status-icon-badge ${weatherStatus.variant}`}>
              <WeatherStatusIcon className="hud-status-icon" size={13} strokeWidth={1.8} aria-hidden="true" />
            </span>
            <span className="hud-status-label">{t('dashboard.weather')}</span>
            <strong>{weatherStatus.text}</strong>
          </div>
        </div>
      </div>
    </div>
  );
}
