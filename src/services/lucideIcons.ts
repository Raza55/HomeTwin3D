import type { LucideIcon, IconNode } from 'lucide-react';
import { iconLoaders } from './iconLoaders.generated';

export interface IconModule { default: LucideIcon; __iconNode: IconNode }
const pending = new Map<string, Promise<IconModule | null>>();

export function loadLucideIcon(name: string): Promise<IconModule | null> {
  if (!Object.prototype.hasOwnProperty.call(iconLoaders, name)) return Promise.resolve(null);
  let result = pending.get(name);
  if (!result) {
    result = iconLoaders[name as keyof typeof iconLoaders]().catch(error => {
      pending.delete(name); // A later request can retry a transient chunk failure.
      throw error;
    });
    pending.set(name, result);
  }
  return result;
}

interface ImageEntry {
  image: HTMLImageElement | null;
  listeners: Map<object, () => void>;
}
const images = new Map<string, ImageEntry>();

/** One decoded image per style, with event-driven redraws instead of frame polling. */
export function getLucideIconImage(name: string, color: string, size: number, owner: object, onReady: () => void): HTMLImageElement | null {
  if (!Object.prototype.hasOwnProperty.call(iconLoaders, name)) return null;
  const key = JSON.stringify([name, color, size]);
  let entry = images.get(key);
  if (!entry) {
    entry = { image: null, listeners: new Map() };
    images.set(key, entry);
    const current = entry;
    void loadLucideIcon(name).then(async module => {
      if (!module) return;
      const ns = 'http://www.w3.org/2000/svg';
      const svg = document.createElementNS(ns, 'svg');
      for (const [attribute, value] of Object.entries({ xmlns: ns, width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: color, 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' })) svg.setAttribute(attribute, String(value));
      for (const [tag, attributes] of module.__iconNode) {
        const child = document.createElementNS(ns, tag);
        for (const [attribute, value] of Object.entries(attributes)) if (attribute !== 'key') child.setAttribute(attribute, String(value));
        svg.appendChild(child);
      }
      const image = new Image();
      image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(svg))}`;
      await image.decode();
      current.image = image;
      const listeners = [...current.listeners.values()];
      current.listeners.clear();
      for (const notify of listeners) notify();
    }).catch(() => {
      current.listeners.clear();
      images.delete(key); // Retry on the next real state update, never in a redraw loop.
    });
  }
  if (!entry.image) entry.listeners.set(owner, onReady);
  return entry.image;
}
