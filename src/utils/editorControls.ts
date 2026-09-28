export interface SliderRange {
  min: number;
  max: number;
}

function round(value: number): number {
  return parseFloat(value.toFixed(3));
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function fineSliderRange(
  value: number,
  span: number,
  hardMin?: number,
  hardMax?: number,
): SliderRange {
  const center = Number.isFinite(value) ? value : 0;
  const safeSpan = Math.max(0.001, span);
  let min = center - safeSpan;
  let max = center + safeSpan;

  if (hardMin !== undefined) min = Math.max(hardMin, min);
  if (hardMax !== undefined) max = Math.min(hardMax, max);

  if (max <= min) {
    if (hardMin !== undefined && center <= hardMin) {
      max = hardMax !== undefined ? Math.min(hardMax, hardMin + safeSpan * 2) : hardMin + safeSpan * 2;
      min = hardMin;
    } else if (hardMax !== undefined && center >= hardMax) {
      min = hardMin !== undefined ? Math.max(hardMin, hardMax - safeSpan * 2) : hardMax - safeSpan * 2;
      max = hardMax;
    } else {
      min = center - safeSpan;
      max = center + safeSpan;
    }
  }

  return { min: round(min), max: round(max) };
}

export function sceneRelativeDefaults(diagonal: number) {
  const d = Number.isFinite(diagonal) && diagonal > 0 ? diagonal : 10;
  const lightDiameter = clamp(d * 0.016, 0.12, 0.24);
  const boxSize = clamp(d * 0.018, 0.14, 0.28);
  const screenWidth = clamp(d * 0.045, 0.35, 0.8);
  const blindWidth = clamp(d * 0.06, 0.45, 1);
  const wallSide = clamp(d * 0.2, 1.2, 4);
  const nanoleafWidth = clamp(d * 0.045, 0.32, 0.7);

  return {
    light: {
      diameter: round(lightDiameter),
      width: round(boxSize),
      height: round(boxSize),
      depth: round(boxSize),
      hitboxDiameter: round(lightDiameter * 2.5),
      hitboxBox: round(boxSize * 2),
    },
    nanoleaf: {
      width: round(nanoleafWidth),
      height: round(nanoleafWidth * 0.68),
      depth: 0.02,
    },
    screen: {
      width: round(screenWidth),
      height: round(screenWidth * 0.5625),
    },
    blind: {
      width: round(blindWidth),
      height: round(blindWidth * 1.25),
      depth: 0.025,
    },
    wall: {
      width: round(wallSide),
      height: 0.03,
      depth: round(wallSide),
    },
    tube: {
      diameter: round(clamp(d * 0.004, 0.035, 0.07)),
      gap: round(clamp(d * 0.014, 0.12, 0.25)),
      fontSize: 36,
      labelHeight: round(clamp(d * 0.02, 0.15, 0.3)),
    },
  };
}

export type SceneRelativeDefaults = ReturnType<typeof sceneRelativeDefaults>;
