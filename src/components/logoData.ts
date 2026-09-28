/** Shared logo geometry — single source of truth for the /// slash coordinates. */

export const LOGO_2D_VIEWBOX = '0 0 590.9 590.9';

export const LOGO_2D_SLASHES = [
  '127.9,4 252.9,4 129,586.9 4,586.9',
  '294.9,4 419.9,4 296,586.9 171,586.9',
  '461.9,4 586.9,4 463,586.9 338,586.9',
];

/** Parameters used by the procedural 3D logo generator in AnimatedLogo. */
export const LOGO_PARAMS = {
  thickness: 125,
  targetDepth: 200,
  spacing: 42,
  angle: 12,
};
