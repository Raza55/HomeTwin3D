import { installationEntity } from './installationConfig.ts';
import type { HAState } from '../types';

export const HUE_SYNC_COLOR = '#f6b8d5';
export const HUE_SYNC_SWITCH = installationEntity('switch.media_sync');
export const HUE_SYNC_AREA = installationEntity('select.media_sync_area');
export const HUE_SYNC_BRIGHTNESS = installationEntity('number.media_sync_brightness');
// Example membership; configure local entities for your entertainment area.
// Keep membership scoped to the selected entertainment area, not the HA room.
export const HUE_SYNC_MEMBERS = [
  installationEntity('light.hue_tv_top'), installationEntity('light.hue_play_wall_washer_2'),
  installationEntity('light.hue_play_wall_washer_1'), installationEntity('light.hue_tv_left'),
  installationEntity('light.hue_tv_gradient'), installationEntity('light.hue_tv_right_top'),
  installationEntity('light.hue_tv_bottom'), installationEntity('light.hue_tv_right'),
  installationEntity('light.hue_tv_back_left'), installationEntity('light.hue_tv_left_top'),
] as const;

export function isHueSyncLocked(entityId: string, states: Record<string, HAState>): boolean {
  return states[HUE_SYNC_SWITCH]?.state === 'on'
    && states[HUE_SYNC_AREA]?.state === 'TV-Bereich 2'
    && (HUE_SYNC_MEMBERS as readonly string[]).includes(entityId)
    && !!states[entityId]
    && !['unavailable', 'unknown'].includes(states[entityId].state);
}

/** Presentation only: never write synthetic colour/state into the HA cache. */
export function hueSyncDisplayState(state: HAState, states: Record<string, HAState>): HAState {
  if (!isHueSyncLocked(state.entity_id, states)) return state;
  const value = Number(states[HUE_SYNC_BRIGHTNESS]?.state);
  const brightness = Number.isFinite(value) && value > 0 ? Math.min(100, value) : 53;
  return { ...state, state: 'on', attributes: {
    ...state.attributes, brightness: Math.round(brightness / 100 * 255),
    rgb_color: [246, 184, 213], hs_color: undefined, xy_color: undefined,
    color_mode: 'rgb', color_temp: undefined, color_temp_kelvin: undefined,
  } };
}

export function isHueSyncControl(entityId: string): boolean {
  return [HUE_SYNC_SWITCH, HUE_SYNC_AREA, HUE_SYNC_BRIGHTNESS].includes(entityId);
}
