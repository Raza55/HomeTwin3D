import { installationEntity } from './installationConfig.ts';
import type { DisplayConfig, HAState } from '../types';

export const LIVING_ROOM_TV = {
  receiver: installationEntity('media_player.living_room_receiver'),
  shield: installationEntity('media_player.streaming_player'),
  television: installationEntity('media_player.living_room_tv'),
  remote: installationEntity('media_player.streaming_remote'),
  screenshot: installationEntity('media_player.streaming_screenshot'),
  /** HA camera fed by the PC screen helper; shown as the TV background while the receiver is on the PC input. */
  pcScreenshot: installationEntity('camera.desktop_main_bildschirm'),
};
export type TVMediaRoute = NonNullable<DisplayConfig['tvMedia']>;
export interface TVScreenContent {
  kind: 'shield' | 'pc' | 'playstation' | 'other' | 'off' | 'unavailable';
  title: string;
  subtitle: string;
  status: string;
  artwork?: string;
  artworkKind?: 'cover' | 'screenshot';
  /** Set when `artwork` is a camera still (`/api/camera_proxy/…`) rather than a media proxy image. */
  camera?: string;
  position?: number;
  duration?: number;
  ticking?: boolean;
}
const text = (value: unknown) => typeof value === 'string' ? value.trim() : '';
const number = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? value : undefined;
const offline = (state?: HAState) => !state || ['unavailable', 'unknown'].includes(state.state);
const picture = (state?: HAState) => text(state?.attributes.entity_picture_local) || text(state?.attributes.entity_picture) || undefined;
const appName = (state?: HAState) => {
  const name = text(state?.attributes.app_name) || text(state?.attributes.app_id);
  return ({'com.plexapp.android':'Plex','com.netflix.ninja':'Netflix','com.google.android.youtube.tv':'YouTube','com.amazon.amazonvideo.livingroom':'Prime Video','com.disney.disneyplus':'Disney+','com.google.android.tvlauncher':'Startbildschirm'} as Record<string,string>)[name] || name;
};

export function tvMediaRoute(config: DisplayConfig): TVMediaRoute | undefined {
  if (config.kind !== 'tv') return undefined;
  if (config.tvMedia) return config.tvMedia.shield === LIVING_ROOM_TV.shield && config.tvMedia.television === LIVING_ROOM_TV.television
    ? { ...LIVING_ROOM_TV, ...config.tvMedia } : config.tvMedia;
  return config.sources.some(s=>s.entityId===LIVING_ROOM_TV.television) ? LIVING_ROOM_TV : undefined;
}

export function displayStateDependencies(config: DisplayConfig): string[] {
  const route = tvMediaRoute(config);
  return [...new Set([...config.sources.map(s=>s.entityId), ...Object.values(route ?? {})])];
}

export function resolveTVScreen(states: Record<string, HAState>, route: TVMediaRoute, now = Date.now()): TVScreenContent {
  const receiver = states[route.receiver], tv = states[route.television];
  if (tv?.state === 'off' || tv?.state === 'standby' || receiver?.state === 'off' || receiver?.state === 'standby')
    return {kind:'off',title:'',subtitle:'',status:'Aus'};
  if (!receiver || offline(receiver) || offline(tv)) return {kind:'unavailable',title:'TV',subtitle:'Verbindung nicht verfügbar',status:'Offline'};
  const source = text(receiver.attributes.source);
  const normalized = source.toLowerCase();
  if (normalized === 'pc') {
    const camera = route.pcScreenshot ? states[route.pcScreenshot] : undefined;
    const desktop = !offline(camera) && !['off','standby'].includes(camera!.state) ? picture(camera) : undefined;
    return {kind:'pc',title:'PC',subtitle:'Desktop · HDMI',status:desktop ? 'Bildschirmvorschau' : 'Verbunden',
      artwork:desktop,artworkKind:desktop ? 'screenshot' : undefined,camera:desktop ? route.pcScreenshot : undefined};
  }
  if (['playststion','playstation','playstation 5','ps5'].includes(normalized))
    return {kind:'playstation',title:'PlayStation',subtitle:'Konsole · HDMI',status:'Verbunden'};
  if (normalized !== 'shield media') return {kind:'other',title:source || 'TV',subtitle:'Denon · HDMI',status:source?'Verbunden':'Quelle unbekannt'};
  const player = states[route.shield];
  const remote = route.remote ? states[route.remote] : undefined;
  const screenshot = route.screenshot ? states[route.screenshot] : undefined;
  const screenArt = !offline(screenshot) && !['off','standby'].includes(screenshot!.state) ? picture(screenshot) : undefined;
  const fallback: TVScreenContent = {
    kind:'shield',title:'SHIELD',subtitle:!offline(remote) ? appName(remote) || 'Bereit zur Wiedergabe' : 'Medieninfos nicht verfügbar',
    status:screenArt ? 'Bildschirmvorschau' : !offline(remote) ? 'Bereit' : 'Offline',
    artwork:screenArt,artworkKind:screenArt ? 'screenshot' : undefined,
  };
  if (!player || offline(player)) return fallback;
  const active = ['playing','paused','buffering'].includes(player.state), a = player.attributes;
  if (!active) return {...fallback,subtitle:!offline(remote) ? appName(remote) || 'Bereit zur Wiedergabe' : 'Bereit zur Wiedergabe',status:screenArt ? 'Bildschirmvorschau' : 'Bereit'};
  const duration = number(a.media_duration), base = number(a.media_position);
  const updated = Date.parse(text(a.media_position_updated_at));
  const elapsed = player.state==='playing' && Number.isFinite(updated) ? Math.max(0,(now-updated)/1000) : 0;
  const position = base===undefined ? undefined : Math.min(duration && duration>0 ? duration : Infinity,Math.max(0,base+elapsed));
  return {
    kind:'shield',title:text(a.media_title) || text(a.media_series_title) || 'SHIELD',
    subtitle:[text(a.app_name),text(a.media_series_title) || text(a.media_artist)].filter(Boolean).join(' · ') || 'SHIELD',
    status:player.state==='playing'?'Wiedergabe':player.state==='paused'?'Pausiert':'Lädt …',
    artwork:screenArt || picture(player),
    artworkKind:screenArt ? 'screenshot' : picture(player) ? 'cover' : undefined,
    duration:duration && duration>0 ? duration : undefined,position,
    ticking:player.state==='playing' && position!==undefined && Number.isFinite(updated),
  };
}

export function mediaTime(seconds: number): string {
  const s=Math.max(0,Math.floor(seconds)), h=Math.floor(s/3600), m=Math.floor(s/60)%60;
  return h ? `${h}:${String(m).padStart(2,'0')}:${String(s%60).padStart(2,'0')}` : `${m}:${String(s%60).padStart(2,'0')}`;
}

/** Only HA proxy artwork is used; Plex-relative paths are not dashboard URLs. */
export function mediaArtworkUrl(path: string | undefined, haBase: string): string | undefined {
  if (!path || !haBase) return undefined;
  try {
    const base=new URL(haBase), url=new URL(path,base);
    if (!['http:','https:'].includes(url.protocol) || url.origin!==base.origin || !url.pathname.startsWith('/api/media_player_proxy/')) return undefined;
    return url.href;
  } catch { return undefined; }
}
