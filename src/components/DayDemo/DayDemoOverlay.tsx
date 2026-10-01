import { useMemo, useSyncExternalStore } from 'react';
import {
  AlarmClock, BedDouble, Blinds, Bot, CloudLightning, CloudSun, Coffee, DoorOpen, Droplets, Fan, Film, Footprints,
  Gamepad2, Gauge, House, Lightbulb, LightbulbOff, Lock, Monitor, Moon, Palette, Pause, Play, RotateCcw, Snowflake,
  Speaker, Sun, Sunrise, Sunset, Thermometer, TriangleAlert, Tv, Utensils, Video, VideoOff, WashingMachine, Wind, X,
  Cloud, CloudFog, CloudRain, CloudDrizzle, CloudSnow, type LucideIcon,
} from 'lucide-react';
import type { DayDemoController } from '../../services/dayDemo/controller';
import { CHAPTERS, DAY_LENGTH, clockLabel, pick, realSecondsUntil, virtualToClock } from '../../services/dayDemo/story';
import { getSunPosition } from '../../babylon/SunController';
import { useLanguage } from '../../contexts/LanguageContext';
import './DayDemoOverlay.css';

type Icon = LucideIcon;

const ICONS: Record<string, Icon> = {
  moon: Moon, alarm: AlarmClock, sunrise: Sunrise, sunset: Sunset, coffee: Coffee, droplets: Droplets, tv: Tv, door: DoorOpen,
  robot: Bot, sun: Sun, thermometer: Thermometer, monitor: Monitor, alert: TriangleAlert, storm: CloudLightning,
  'sun-cloud': CloudSun, home: House, utensils: Utensils, film: Film, gamepad: Gamepad2, bed: BedDouble, footprints: Footprints,
  snow: Snowflake, lamp: Lightbulb, 'lamp-off': LightbulbOff, blinds: Blinds, lock: Lock, fan: Fan, washer: WashingMachine,
  speaker: Speaker, palette: Palette, wind: Wind,
};


function weatherIcon(code: number, clouds: number): Icon {
  if (code >= 95) return CloudLightning;
  if (code >= 71 && code <= 86) return CloudSnow;
  if (code >= 61) return CloudRain;
  if (code >= 51) return CloudDrizzle;
  if (code === 45 || code === 48) return CloudFog;
  if (code === 3 || clouds >= 70) return Cloud;
  if (clouds >= 20) return CloudSun;
  return Sun;
}

interface Props {
  controller: DayDemoController;
  latitude: number;
  longitude: number;
  onExit: () => void;
}

export default function DayDemoOverlay({ controller, latitude, longitude, onExit }: Props) {
  const { language, t } = useLanguage();
  const view = useSyncExternalStore(controller.subscribe, controller.getView, controller.getView);
  const total = realSecondsUntil(DAY_LENGTH);

  // Day/night band for the timeline, from the (pinned) demo date's sun.
  const band = useMemo(() => {
    const stops: string[] = [];
    for (let i = 0; i <= 48; i++) {
      const virtual = i / 48 * DAY_LENGTH;
      const { altitudeDeg } = getSunPosition(latitude, longitude, virtualToClock(virtual));
      const light = Math.max(0, Math.min(1, (altitudeDeg + 8) / 30));
      const color = `hsl(${215 - light * 15} ${45 + light * 25}% ${10 + light * 45}%)`;
      stops.push(`${color} ${(realSecondsUntil(virtual) / total * 100).toFixed(2)}%`);
    }
    return `linear-gradient(90deg, ${stops.join(', ')})`;
  }, [latitude, longitude, total]);

  const progress = realSecondsUntil(view.virtual) / total * 100;
  const chapter = view.chapter;
  const ChapterIcon = (chapter && ICONS[chapter.icon]) || Moon;
  const WeatherIcon = weatherIcon(view.weather.weather_code, view.weather.cloud_cover);
  const weatherText = view.weather.weather_code >= 95 ? t('dayDemo.weatherStorm')
    : view.weather.snowfall > 0 ? t('dayDemo.weatherSnow')
      : view.weather.rain > 0 ? t('dayDemo.weatherRain')
        : view.weather.weather_code === 45 ? t('dayDemo.weatherFog')
          : view.weather.cloud_cover >= 70 ? t('dayDemo.weatherCloudy')
            : view.weather.cloud_cover >= 20 ? t('dayDemo.weatherPartly') : t('dayDemo.weatherClear');

  const seekTo = (event: React.PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const share = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)) * total;
    // Invert the paced timeline: find the virtual minute whose real offset matches.
    let lo = 0, hi = DAY_LENGTH;
    for (let i = 0; i < 24; i++) { const mid = (lo + hi) / 2; if (realSecondsUntil(mid) < share) lo = mid; else hi = mid; }
    controller.seek(lo);
  };

  const result = view.result;

  if (view.preparing !== undefined) {
    return (
      <div className="day-demo-prep" role="status" aria-live="polite">
        <div className="day-demo-prep-card">
          <h2>{t('dayDemo.title')}</h2>
          <p>{t('dayDemo.preparing')}</p>
          <div className="day-demo-prep-track"><span style={{ width: `${Math.round(view.preparing * 100)}%` }} /></div>
          <small>{Math.round(view.preparing * 100)} % · {t('dayDemo.preparingHint')}</small>
          <button type="button" onClick={onExit}>{t('common.cancel')}</button>
        </div>
      </div>
    );
  }

  return (
    <div className="day-demo" role="region" aria-label={t('dayDemo.title')}>
      {view.cut > 0 && <div className="day-demo-cut" key={view.cut} aria-hidden />}
      <div className="day-demo-panel">
        <div className="day-demo-top">
          <div className="day-demo-clock" aria-live="off">
            <span className="day-demo-time">{clockLabel(view.clock)}</span>
            <span className="day-demo-weather" title={weatherText}>
              <WeatherIcon size={16} strokeWidth={1.8} aria-hidden />
              <strong>{Math.round(view.weather.temperature_2m)}°</strong>
              <span>{weatherText}</span>
            </span>
          </div>
          {!result && (
            <div className="day-demo-chapter-head" key={chapter?.id ?? 'none'} title={t('dayDemo.chapter', { n: view.chapterIndex + 1, total: CHAPTERS.length })}>
              <span className="day-demo-chapter-icon"><ChapterIcon size={15} strokeWidth={1.9} aria-hidden /></span>
              <h2>{chapter ? pick(chapter.title, language) : t('dayDemo.title')}</h2>
              <span className="day-demo-chapter-count">{view.chapterIndex + 1}/{CHAPTERS.length}</span>
            </div>
          )}
          <div className="day-demo-controls">
            <button type="button" className="day-demo-btn" onClick={() => controller.togglePlay()} aria-label={view.playing ? t('dayDemo.pause') : t('dayDemo.play')} title={view.playing ? t('dayDemo.pause') : t('dayDemo.play')}>
              {view.playing ? <Pause size={16} /> : <Play size={16} />}
            </button>
            <button type="button" className={`day-demo-btn${view.tour ? ' active' : ''}`} onClick={() => controller.setTour(!view.tour)} aria-pressed={view.tour} title={t('dayDemo.cameraTour')} aria-label={t('dayDemo.cameraTour')}>
              {view.tour ? <Video size={16} /> : <VideoOff size={16} />}
            </button>
            <button type="button" className="day-demo-btn" onClick={() => controller.restart()} title={t('dayDemo.restart')} aria-label={t('dayDemo.restart')}><RotateCcw size={16} /></button>
            <span className="day-demo-fps" title={t('dayDemo.fps')}><Gauge size={14} aria-hidden />{view.fps}</span>
            <button type="button" className="day-demo-btn" onClick={onExit} title={t('dayDemo.exit')} aria-label={t('dayDemo.exit')}><X size={16} /></button>
          </div>
        </div>

        {result ? (
          <div className="day-demo-end" role="status">
            <span className="day-demo-end-title"><Sunrise size={16} aria-hidden /> {t('dayDemo.endTitle')}</span>
            <span><strong>Ø {Math.round(result.fps)} FPS</strong> <small>(min {result.fpsMin} · max {result.fpsMax})</small></span>
            <span><strong>{view.stats.lightSwitches.toLocaleString(language)}</strong> {t('dayDemo.endLights')}</span>
            <span><strong>{view.stats.blindMoves.toLocaleString(language)}</strong> {t('dayDemo.endBlinds')}</span>
            <span><strong>{view.stats.updates.toLocaleString(language)}</strong> {t('dayDemo.endUpdates')}</span>
            <span className="day-demo-end-actions">
              <button type="button" className="day-demo-btn" onClick={() => controller.restart()}><RotateCcw size={14} /> {t('dayDemo.again')}</button>
              <button type="button" className="day-demo-btn primary" onClick={onExit}>{t('dayDemo.exit')}</button>
            </span>
          </div>
        ) : (
        <div className="day-demo-body">
          <p className="day-demo-chapter" key={chapter?.id ?? 'none'}>{chapter ? pick(chapter.text, language) : ''}</p>
          <ol className="day-demo-feed" aria-label={t('dayDemo.feed')}>
            {view.log.slice(0, 2).map(entry => {
              const EntryIcon = ICONS[entry.icon] ?? Lightbulb;
              return (
                <li key={entry.id}>
                  <time>{clockLabel(entry.clock)}</time>
                  <EntryIcon size={14} strokeWidth={1.9} aria-hidden />
                  <span>{pick(entry.text, language)}</span>
                </li>
              );
            })}
          </ol>
        </div>
        )}

        <div className="day-demo-timeline" onPointerDown={seekTo} role="slider" aria-label={t('dayDemo.timeline')}
          aria-valuemin={0} aria-valuemax={DAY_LENGTH} aria-valuenow={Math.round(view.virtual)} aria-valuetext={clockLabel(view.clock)}>
          <div className="day-demo-band" style={{ background: band }} />
          {CHAPTERS.map(({ at, chapter: c }, i) => (
            <span key={c.id} className={`day-demo-tick${i <= view.chapterIndex ? ' done' : ''}`}
              style={{ left: `${realSecondsUntil(at) / total * 100}%` }} title={`${clockLabel(virtualToClock(at))} · ${pick(c.title, language)}`} />
          ))}
          <span className="day-demo-head" style={{ left: `${progress}%` }} />
        </div>
        <div className="day-demo-scale" aria-hidden>
          {['05:30', '09:00', '12:00', '15:00', '18:00', '21:00', '00:00', '03:00'].map(label => {
            const [h, m] = label.split(':').map(Number);
            const virtual = ((h * 60 + m - 330) % 1440 + 1440) % 1440;
            return <span key={label} style={{ left: `${realSecondsUntil(virtual) / total * 100}%` }}>{label}</span>;
          })}
        </div>
      </div>

    </div>
  );
}
