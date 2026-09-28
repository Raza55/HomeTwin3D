import type { HAState } from '../types';

// MediaPlayerEntityFeature: https://developers.home-assistant.io/docs/core/entity/media-player/
export const ECHO_FEATURE = { media_pause: 1, volume_set: 4, volume_mute: 8, media_previous_track: 16, media_next_track: 32, turn_on: 128, turn_off: 256, media_stop: 4096, media_play: 16384 } as const;
export type EchoService = keyof typeof ECHO_FEATURE;
export function echoState(state: HAState | undefined, connected: boolean) {
  const available = connected && !!state && !['unknown', 'unavailable'].includes(state.state) && state.attributes.available !== false;
  const value = available ? state!.state : 'unavailable';
  const labels: Record<string, string> = { playing: 'Wiedergabe', paused: 'Pausiert', idle: 'Bereit', standby: 'Bereitschaft', off: 'Aus', on: 'An', buffering: 'Lädt', unavailable: 'Nicht verfügbar' };
  const volume = state?.attributes.volume_level;
  return { available, value, label: labels[value] ?? value, active: value === 'playing' || value === 'buffering',
    volume: available && typeof volume === 'number' && Number.isFinite(volume) ? Math.round(Math.max(0, Math.min(1, volume)) * 100) : null,
    muted: available && state?.attributes.is_volume_muted === true,
    title: available && ['playing', 'paused', 'buffering'].includes(value) && typeof state?.attributes.media_title === 'string' ? state.attributes.media_title : '',
    supports: (service: EchoService) => available && (Number(state?.attributes.supported_features) & ECHO_FEATURE[service]) !== 0 };
}
