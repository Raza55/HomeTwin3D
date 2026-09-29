/**
 * Draws a map marker's DOM element (box, border, shadows, lucide SVG icons,
 * badges, captions) into a 2D canvas, so the WebGL marker layer shows exactly
 * what the marker's React component and CSS describe. The element stays in the
 * DOM (invisible) as the source of appearance, state and accessibility.
 *
 * Geometry is measured without the marker's own transform: the centering
 * translate and the hover scale are applied by the layer, so a hovered marker
 * does not need a new raster.
 */
export interface MarkerRaster {
  /** Image size in CSS pixels (marker plus badges, captions and shadows). */
  width: number;
  height: number;
  /** Marker box center within the image, CSS pixels. */
  centerX: number;
  centerY: number;
  /** Untransformed marker box, CSS pixels (hit area before scaling). */
  boxWidth: number;
  boxHeight: number;
  /** Scale from the marker's CSS transform (hover, touch, open states). */
  scale: number;
  zIndex: number;
  /** Draws the image with its top-left corner at the canvas origin, `pixelRatio` pixels per CSS pixel. */
  draw(context: CanvasRenderingContext2D, pixelRatio: number): void;
}

type Draw = (context: CanvasRenderingContext2D, pixelRatio: number) => void;
interface Bounds { left: number; top: number; right: number; bottom: number }

const SHAPES = new Set(['path', 'circle', 'ellipse', 'rect', 'line', 'polyline', 'polygon']);

export function rasterizeMarker(root: HTMLElement): MarkerRaster | null {
  const style = getComputedStyle(root);
  if (style.display === 'none' || !root.offsetWidth || !root.offsetHeight) return null;
  const rootRect = root.getBoundingClientRect();
  // Rects include the marker's own transform; dividing by its scale restores CSS pixels.
  const scale = rootRect.width / root.offsetWidth || 1;
  const toLocal = (rect: DOMRect) => ({
    x: (rect.left - rootRect.left) / scale, y: (rect.top - rootRect.top) / scale,
    width: rect.width / scale, height: rect.height / scale,
  });
  const draws: Draw[] = [];
  const bounds: Bounds = { left: 0, top: 0, right: root.offsetWidth, bottom: root.offsetHeight };
  const include = (left: number, top: number, right: number, bottom: number) => {
    bounds.left = Math.min(bounds.left, left); bounds.top = Math.min(bounds.top, top);
    bounds.right = Math.max(bounds.right, right); bounds.bottom = Math.max(bounds.bottom, bottom);
  };

  const visit = (element: Element, opacity: number) => {
    const computed = element === root ? style : getComputedStyle(element);
    if (computed.display === 'none' || computed.visibility === 'hidden') return;
    const alpha = opacity * (parseFloat(computed.opacity) || (computed.opacity === '0' ? 0 : 1));
    if (alpha <= 0) return;
    if (element instanceof SVGSVGElement) { svg(element, computed, alpha); return; }
    if (!(element instanceof HTMLElement)) return;
    const box = element === root ? { x: 0, y: 0, width: root.offsetWidth, height: root.offsetHeight } : toLocal(element.getBoundingClientRect());
    decorate(box, computed, alpha);
    const clip = computed.overflow === 'hidden' || computed.textOverflow === 'ellipsis' ? box : null;
    for (const child of element.childNodes) {
      if (child.nodeType === Node.TEXT_NODE) text(child as Text, computed, alpha, clip);
      else if (child.nodeType === Node.ELEMENT_NODE) visit(child as Element, alpha);
    }
  };

  const decorate = (box: { x: number; y: number; width: number; height: number }, computed: CSSStyleDeclaration, alpha: number) => {
    const radius = cornerRadius(computed.borderTopLeftRadius, box.width, box.height);
    const background = computed.backgroundColor;
    const borderWidth = parseFloat(computed.borderTopWidth) || 0;
    const borderStyle = computed.borderTopStyle;
    const border = borderWidth > 0 && borderStyle !== 'none' && borderStyle !== 'hidden' ? computed.borderTopColor : '';
    const shadows = parseShadows(computed.boxShadow);
    if (!visibleColor(background) && !border && !shadows.length) return;
    for (const shadow of shadows) {
      include(box.x + shadow.x - shadow.blur - shadow.spread, box.y + shadow.y - shadow.blur - shadow.spread,
        box.x + box.width + shadow.x + shadow.blur + shadow.spread, box.y + box.height + shadow.y + shadow.blur + shadow.spread);
    }
    include(box.x, box.y, box.x + box.width, box.y + box.height);
    draws.push((context, pixelRatio) => {
      context.save();
      context.globalAlpha = alpha;
      // CSS draws outer shadows only outside the border box.
      for (const shadow of shadows) {
        context.save();
        const outside = new Path2D();
        outside.rect(box.x - 200, box.y - 200, box.width + 400, box.height + 400);
        roundRect(outside, box.x, box.y, box.width, box.height, radius);
        context.clip(outside, 'evenodd');
        const shape = new Path2D();
        const far = 10000;
        roundRect(shape, box.x - shadow.spread + far, box.y - shadow.spread, box.width + 2 * shadow.spread, box.height + 2 * shadow.spread, radius + shadow.spread);
        context.shadowColor = shadow.color;
        context.shadowBlur = shadow.blur * pixelRatio;
        // Shadow offsets ignore the context transform: they are in device pixels.
        context.shadowOffsetX = (shadow.x - far) * pixelRatio;
        context.shadowOffsetY = shadow.y * pixelRatio;
        context.fillStyle = '#000';
        context.fill(shape);
        context.restore();
      }
      const inner = new Path2D();
      roundRect(inner, box.x, box.y, box.width, box.height, radius);
      if (visibleColor(background)) { context.fillStyle = background; context.fill(inner); }
      if (border) {
        const stroke = new Path2D();
        const half = borderWidth / 2;
        roundRect(stroke, box.x + half, box.y + half, box.width - borderWidth, box.height - borderWidth, Math.max(0, radius - half));
        context.lineWidth = borderWidth;
        context.strokeStyle = border;
        if (borderStyle === 'dashed') context.setLineDash([borderWidth * 2.5, borderWidth * 1.8]);
        else if (borderStyle === 'dotted') context.setLineDash([borderWidth, borderWidth]);
        context.stroke(stroke);
      }
      context.restore();
    });
  };

  const text = (node: Text, computed: CSSStyleDeclaration, alpha: number, clip: { x: number; y: number; width: number; height: number } | null) => {
    const content = node.textContent?.replace(/\s+/g, ' ').trim();
    if (!content) return;
    const range = document.createRange();
    range.selectNodeContents(node);
    const rect = range.getBoundingClientRect();
    if (!rect.width) return;
    const box = toLocal(rect);
    include(box.x, box.y, box.x + box.width, box.y + box.height);
    const font = `${computed.fontStyle} ${computed.fontWeight} ${computed.fontSize} ${computed.fontFamily}`;
    const color = computed.color;
    draws.push(context => {
      context.save();
      context.globalAlpha = alpha;
      if (clip) { context.beginPath(); context.rect(clip.x, clip.y, clip.width, clip.height); context.clip(); }
      context.font = font;
      context.fillStyle = color;
      context.textBaseline = 'middle';
      context.textAlign = 'left';
      context.fillText(content, box.x, box.y + box.height / 2, clip ? undefined : box.width + 2);
      context.restore();
    });
  };

  const svg = (element: SVGSVGElement, computed: CSSStyleDeclaration, alpha: number) => {
    const box = toLocal(element.getBoundingClientRect());
    if (!box.width || !box.height) return;
    include(box.x - 1, box.y - 1, box.x + box.width + 1, box.y + box.height + 1);
    const view = element.viewBox.baseVal;
    const viewBox = view && view.width ? view : { x: 0, y: 0, width: box.width, height: box.height };
    const color = computed.color;
    const shapes: Array<{ path: Path2D; fill: string; stroke: string; width: number; cap: CanvasLineCap; join: CanvasLineJoin; alpha: number }> = [];
    const collect = (parent: Element, opacity: number) => {
      for (const child of parent.children) {
        const shapeStyle = getComputedStyle(child);
        if (shapeStyle.display === 'none') continue;
        const shapeAlpha = opacity * (parseFloat(shapeStyle.opacity) || (shapeStyle.opacity === '0' ? 0 : 1));
        if (child.tagName.toLowerCase() === 'g') { collect(child, shapeAlpha); continue; }
        const path = shapePath(child);
        if (!path) continue;
        shapes.push({
          path, alpha: shapeAlpha,
          fill: paint(shapeStyle.fill, color), stroke: paint(shapeStyle.stroke, color),
          width: parseFloat(shapeStyle.strokeWidth) || 1,
          cap: (shapeStyle.strokeLinecap || 'butt') as CanvasLineCap, join: (shapeStyle.strokeLinejoin || 'miter') as CanvasLineJoin,
        });
      }
    };
    collect(element, 1);
    draws.push(context => {
      context.save();
      context.globalAlpha = alpha;
      context.translate(box.x, box.y);
      context.scale(box.width / viewBox.width, box.height / viewBox.height);
      context.translate(-viewBox.x, -viewBox.y);
      for (const shape of shapes) {
        context.globalAlpha = alpha * shape.alpha;
        if (shape.fill) { context.fillStyle = shape.fill; context.fill(shape.path); }
        if (shape.stroke) {
          context.strokeStyle = shape.stroke;
          context.lineWidth = shape.width;
          context.lineCap = shape.cap;
          context.lineJoin = shape.join;
          context.stroke(shape.path);
        }
      }
      context.restore();
    });
  };

  visit(root, 1);
  const left = Math.floor(bounds.left), top = Math.floor(bounds.top);
  const width = Math.ceil(bounds.right) - left, height = Math.ceil(bounds.bottom) - top;
  return {
    width, height,
    centerX: root.offsetWidth / 2 - left, centerY: root.offsetHeight / 2 - top,
    boxWidth: root.offsetWidth, boxHeight: root.offsetHeight,
    scale: transformScale(style.transform),
    zIndex: parseInt(style.zIndex, 10) || 0,
    draw(context, pixelRatio) {
      context.save();
      context.scale(pixelRatio, pixelRatio);
      context.translate(-left, -top);
      for (const draw of draws) draw(context, pixelRatio);
      context.restore();
    },
  };
}

function shapePath(element: Element): Path2D | null {
  const tag = element.tagName.toLowerCase();
  if (!SHAPES.has(tag)) return null;
  const number = (name: string) => parseFloat(element.getAttribute(name) ?? '') || 0;
  const path = new Path2D();
  switch (tag) {
    case 'path': { const d = element.getAttribute('d'); return d ? new Path2D(d) : null; }
    case 'circle': path.arc(number('cx'), number('cy'), number('r'), 0, Math.PI * 2); break;
    case 'ellipse': path.ellipse(number('cx'), number('cy'), number('rx'), number('ry'), 0, 0, Math.PI * 2); break;
    case 'rect': roundRect(path, number('x'), number('y'), number('width'), number('height'), number('rx') || number('ry')); break;
    case 'line': path.moveTo(number('x1'), number('y1')); path.lineTo(number('x2'), number('y2')); break;
    default: {
      const points = (element.getAttribute('points') ?? '').trim().split(/[\s,]+/).map(Number);
      for (let i = 0; i + 1 < points.length; i += 2) {
        if (i === 0) path.moveTo(points[i], points[i + 1]); else path.lineTo(points[i], points[i + 1]);
      }
      if (tag === 'polygon') path.closePath();
    }
  }
  return path;
}

function roundRect(path: Path2D, x: number, y: number, width: number, height: number, radius: number): void {
  const r = Math.max(0, Math.min(radius, width / 2, height / 2));
  if (!r) { path.rect(x, y, width, height); return; }
  path.moveTo(x + r, y);
  path.arcTo(x + width, y, x + width, y + height, r);
  path.arcTo(x + width, y + height, x, y + height, r);
  path.arcTo(x, y + height, x, y, r);
  path.arcTo(x, y, x + width, y, r);
  path.closePath();
}

function cornerRadius(value: string, width: number, height: number): number {
  const first = value.split(' ')[0] ?? '';
  if (first.endsWith('%')) return parseFloat(first) / 100 * Math.min(width, height);
  return parseFloat(first) || 0;
}

/** Resolves an SVG paint; `currentColor` needs the element's text color. */
function paint(value: string, color: string): string {
  if (!value || value === 'none' || value.startsWith('url(')) return '';
  return /currentcolor/i.test(value) ? color : value;
}

function visibleColor(value: string): boolean {
  if (!value || value === 'transparent') return false;
  const alpha = value.match(/rgba?\([^)]*[,/]\s*([\d.]+%?)\s*\)/);
  if (!alpha) return true;
  return parseFloat(alpha[1]) > 0;
}

interface Shadow { color: string; x: number; y: number; blur: number; spread: number }
/** Outer shadows from a computed `box-shadow` (inset shadows are ignored). */
export function parseShadows(value: string): Shadow[] {
  if (!value || value === 'none') return [];
  const shadows: Shadow[] = [];
  for (const part of value.split(/,(?![^(]*\))/)) {
    if (/\binset\b/.test(part)) continue;
    const color = part.match(/(rgba?\([^)]*\)|#[0-9a-f]{3,8}\b|[a-z]+(?=\s|$))/i)?.[0] ?? 'rgba(0,0,0,.5)';
    const lengths = part.replace(color, '').trim().split(/\s+/).map(parseFloat).filter(n => !Number.isNaN(n));
    const [x = 0, y = 0, blur = 0, spread = 0] = lengths;
    if (visibleColor(color)) shadows.push({ color, x, y, blur, spread });
  }
  return shadows;
}

/** Uniform scale of a computed `transform` (`none` or a matrix). */
export function transformScale(value: string): number {
  const matrix = value.match(/^matrix\(([^)]+)\)/);
  if (!matrix) return 1;
  const [a, b] = matrix[1].split(',').map(Number);
  return Math.hypot(a, b) || 1;
}
