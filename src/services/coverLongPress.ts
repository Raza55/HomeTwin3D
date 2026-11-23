import type { HAState } from '../types';

export type CoverLongPressService = 'open_cover' | 'close_cover' | 'stop_cover';

/**
 * What a long press on a blind (its 3D model or its marker) does: a moving blind
 * stops, a closed one opens, an open or partly open one closes. Nothing when the
 * cover is unknown to Home Assistant or unavailable.
 */
export function coverLongPressService(state: HAState | null | undefined): CoverLongPressService | null {
  if (!state || state.state === 'unavailable') return null;
  if (state.state === 'opening' || state.state === 'closing') return 'stop_cover';
  const position = state.attributes?.current_position;
  const closed = typeof position === 'number' ? position <= 0 : state.state === 'closed';
  return closed ? 'open_cover' : 'close_cover';
}
