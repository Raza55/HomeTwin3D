import { useRef, useEffect, useCallback, useState } from 'react';

interface Props {
  hue: number; // 0-360
  onChange: (hue: number) => void;
}

const SIZE = 160;
const OUTER_R = SIZE / 2 - 2;
const INNER_R = OUTER_R - 26;
const MID_R = (OUTER_R + INNER_R) / 2;
const THUMB_R = 10;

function angleFromCenter(x: number, y: number): number {
  const cx = SIZE / 2;
  const cy = SIZE / 2;
  // Angle in degrees, 0° at top, clockwise
  const rad = Math.atan2(x - cx, -(y - cy));
  return ((rad * 180) / Math.PI + 360) % 360;
}

export function hslToRgb(h: number): { r: number; g: number; b: number } {
  const s = 1, l = 0.5;
  const c = s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (h < 60)       { r = c; g = x; b = 0; }
  else if (h < 120) { r = x; g = c; b = 0; }
  else if (h < 180) { r = 0; g = c; b = x; }
  else if (h < 240) { r = 0; g = x; b = c; }
  else if (h < 300) { r = x; g = 0; b = c; }
  else              { r = c; g = 0; b = x; }
  return {
    r: Math.round((r + m) * 255),
    g: Math.round((g + m) * 255),
    b: Math.round((b + m) * 255),
  };
}

export default function ColorWheel({ hue, onChange }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [dragHue, setDragHue] = useState<number | null>(null);
  const dragging = useRef(false);

  const displayHue = dragHue ?? hue;

  // Draw the hue ring
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, SIZE, SIZE);
    const cx = SIZE / 2;
    const cy = SIZE / 2;

    // Draw hue ring segment by segment
    for (let angle = 0; angle < 360; angle++) {
      const startRad = ((angle - 91) * Math.PI) / 180;
      const endRad = ((angle - 89) * Math.PI) / 180;
      ctx.beginPath();
      ctx.arc(cx, cy, OUTER_R, startRad, endRad);
      ctx.arc(cx, cy, INNER_R, endRad, startRad, true);
      ctx.closePath();
      ctx.fillStyle = `hsl(${angle}, 100%, 50%)`;
      ctx.fill();
    }

    // Draw thumb
    const thumbAngle = ((displayHue - 90) * Math.PI) / 180;
    const tx = cx + MID_R * Math.cos(thumbAngle);
    const ty = cy + MID_R * Math.sin(thumbAngle);
    const { r, g, b } = hslToRgb(displayHue);

    ctx.beginPath();
    ctx.arc(tx, ty, THUMB_R, 0, Math.PI * 2);
    ctx.fillStyle = `rgb(${r},${g},${b})`;
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = '#fff';
    ctx.stroke();
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(0,0,0,0.3)';
    ctx.stroke();
  }, [displayHue]);

  const getCoords = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const scale = SIZE / rect.width;
    let clientX: number, clientY: number;
    if ('touches' in e) {
      const touch = e.touches[0] ?? (e as React.TouchEvent).changedTouches[0];
      if (!touch) return null;
      clientX = touch.clientX;
      clientY = touch.clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }
    return {
      x: (clientX - rect.left) * scale,
      y: (clientY - rect.top) * scale,
    };
  }, []);

  const handleStart = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    dragging.current = true;
    const coords = getCoords(e);
    if (coords) setDragHue(angleFromCenter(coords.x, coords.y));
  }, [getCoords]);

  const handleMove = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (!dragging.current) return;
    e.preventDefault();
    const coords = getCoords(e);
    if (coords) setDragHue(angleFromCenter(coords.x, coords.y));
  }, [getCoords]);

  const handleEnd = useCallback(() => {
    if (!dragging.current) return;
    dragging.current = false;
    if (dragHue !== null) {
      onChange(dragHue);
      setDragHue(null);
    }
  }, [dragHue, onChange]);

  return (
    <canvas
      ref={canvasRef}
      width={SIZE}
      height={SIZE}
      onMouseDown={handleStart}
      onMouseMove={handleMove}
      onMouseUp={handleEnd}
      onMouseLeave={handleEnd}
      onTouchStart={handleStart}
      onTouchMove={handleMove}
      onTouchEnd={handleEnd}
      style={{
        width: SIZE,
        height: SIZE,
        cursor: 'crosshair',
        touchAction: 'none',
      }}
    />
  );
}
