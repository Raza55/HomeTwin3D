import { useState, useEffect, useMemo, useRef } from 'react';
import {
  Cloud,
  CloudOff,
  CloudRain,
  CloudSnow,
  CloudSun,
  Cloudy,
  Droplets,
  Moon,
  Snowflake,
  SunMedium,
  type LucideIcon,
  Settings as SettingsIcon,
} from 'lucide-react';
import type { DirectionalLight, HemisphericLight } from '@babylonjs/core';
import { updateSunPosition, minutesToLabel, getSunPosition } from '../babylon/SunController';
import { useDemoMode } from '../contexts/DemoModeContext';
import { useSimulationMode } from '../contexts/SimulationModeContext';
import { useTheme } from '../contexts/ThemeContext';
import { useLanguage } from '../contexts/LanguageContext';
import { getSetting } from '../services/settingsStore';
import { isRaining, isSnowing, type WeatherData } from '../services/weatherApi';
import './HUD.css';

interface Props {
  /** Opens the settings (gear next to the logo; the editor is started from there). */
  onSettings?: () => void;
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
  onSettings,
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
    let timer: ReturnType<typeof setTimeout>;
    const refresh = () => {
      tick();
      timer = setTimeout(refresh, 60000 - Date.now() % 60000 + 20);
    };
    refresh();
    return () => clearTimeout(timer);
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
    // Day or night shows in the icon; the full wording stays in the tooltip.
    const text = `${Math.round(pos.altitudeDeg)}${degree} ${heading}${modeTime}`;
    return {
      icon: pos.isDay ? SunMedium : Moon,
      variant: pos.isDay ? 'sun-day' : 'sun-night',
      text,
      title: `${t('dashboard.sun')}: ${pos.isDay ? '' : `${t('dashboard.sunNight')} `}${text}`,
    };
  }, [currentMinutes, language, latitude, longitude, northOffset, scrubberTime, sliderValue, sunLiveMode, t]);

  // Compact: the badge shows the condition, cloud cover and precipitation get
  // small icons instead of words. The full wording stays in the tooltip.
  const weatherStatus = useMemo(() => {
    if (!currentWeather) {
      return {
        icon: CloudOff,
        variant: 'weather-unavailable',
        temperature: '',
        clouds: '',
        precipitation: null as null | { icon: LucideIcon; text: string },
        title: t('dashboard.weatherUnavailable'),
      };
    }

    const condition = t(weatherConditionKey(currentWeather));
    const temperature = typeof currentWeather.temperature_2m === 'number'
      ? `${Math.round(currentWeather.temperature_2m)}${'°'}`
      : '';
    const clouds = `${Math.round(currentWeather.cloud_cover)}%`;
    const precipitation =
      currentWeather.snowfall > 0
        ? { icon: Snowflake as LucideIcon, text: `${currentWeather.snowfall.toFixed(1)} cm/h`, label: t('dashboard.weatherSnow') }
        : currentWeather.rain > 0
          ? { icon: Droplets as LucideIcon, text: `${currentWeather.rain.toFixed(1)} mm/h`, label: t('dashboard.weatherRain') }
          : null;
    const visual = weatherVisualFor(currentWeather);

    return {
      icon: visual.icon,
      variant: visual.variant,
      temperature,
      clouds,
      precipitation,
      title: [
        `${t('dashboard.weather')}: ${temperature ? `${temperature}C` : ''}`.trim(),
        condition,
        `${t('dashboard.weatherClouds')} ${clouds}`,
        precipitation ? `${precipitation.label} ${precipitation.text}` : '',
      ].filter(Boolean).join(' · '),
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
        <img className="hud-logo" src={`${import.meta.env.BASE_URL}favicon/dark/favicon.svg`} alt="HomeTwin3D" draggable={false} />
        {onSettings && <button type="button" className="hud-settings" onClick={onSettings} aria-label={t('settings.title')} title={t('settings.title')}><SettingsIcon size={19} strokeWidth={1.7} aria-hidden="true" /></button>}
        {(simulationMode || demoMode) && (
          <div className="label">{simulationMode ? t('dashboard.simulation') : t('dashboard.demoView')}</div>
        )}
      </div>

      <div className="time-display">
        <div className="hud-status-lines">
          <div className="hud-status-line" title={sunStatus.title} aria-label={sunStatus.title}>
            <span className={`hud-status-icon-badge ${sunStatus.variant}`}>
              <SunStatusIcon className="hud-status-icon" size={13} strokeWidth={1.8} aria-hidden="true" />
            </span>
            <strong>{sunStatus.text}</strong>
          </div>
          <div className="hud-status-line" title={weatherStatus.title} aria-label={weatherStatus.title}>
            <span className={`hud-status-icon-badge ${weatherStatus.variant}`}>
              <WeatherStatusIcon className="hud-status-icon" size={13} strokeWidth={1.8} aria-hidden="true" />
            </span>
            {weatherStatus.temperature && <strong>{weatherStatus.temperature}</strong>}
            {weatherStatus.clouds && (
              <span className="hud-status-part">
                <Cloud className="hud-status-mini" size={11} strokeWidth={1.8} aria-hidden="true" />
                <strong>{weatherStatus.clouds}</strong>
              </span>
            )}
            {weatherStatus.precipitation && (() => {
              const PrecipitationIcon = weatherStatus.precipitation.icon;
              return (
                <span className="hud-status-part">
                  <PrecipitationIcon className="hud-status-mini" size={11} strokeWidth={1.8} aria-hidden="true" />
                  <strong>{weatherStatus.precipitation.text}</strong>
                </span>
              );
            })()}
            {!weatherStatus.temperature && !weatherStatus.clouds && <span className="hud-status-label">{weatherStatus.title}</span>}
          </div>
        </div>
        <div className="hud-clock">
          <div className="time">{clock}</div>
          <div className="date">{date}</div>
        </div>
      </div>
    </div>
  );
}
