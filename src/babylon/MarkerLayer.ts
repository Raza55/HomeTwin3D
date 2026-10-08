import {
  Constants, Effect, Mesh, Observable, RawTexture, ShaderMaterial, UtilityLayerRenderer, Vector3, VertexBuffer,
  type InternalTexture, type Observer, type Scene,
} from '@babylonjs/core';
import { getMarkerProjection, setMarkerStyle } from './MarkerProjection';
import { rasterizeMarker, type MarkerRaster } from './MarkerRaster';
import { markerSizeScale } from './DeviceClass';
import { MarkerVertexBuffers } from './MarkerVertexBuffers';

/**
 * Map markers (lights, doors, blinds, devices, warnings) drawn by WebGL in the
 * same frame as the model: one overlay draw call, no per-frame DOM writes and
 * no marker lagging behind the camera.
 *
 * Each marker's React component still renders its button. That element is the
 * source of appearance (rasterized into an atlas, re-rasterized when its
 * classes, style or content change), state and accessibility, but it is
 * invisible and parked off screen. Pointer input on the canvas is hit-tested
 * against the drawn markers and forwarded to the element, so the components'
 * click, hover and touch handlers work unchanged.
 *
 * The overlay is a separate utility scene, so mirror probes, glow and shadow
 * passes never see it. `?markers=dom` restores positioned DOM markers.
 */
/** Main kinds of plan markers, shown or hidden together (filter bar; the day demo per chapter). */
export type MarkerCategory = 'light' | 'blind' | 'climate' | 'door' | 'device' | 'media';
export const MARKER_CATEGORIES: MarkerCategory[] = ['light', 'blind', 'climate', 'door', 'device', 'media'];

export interface MapMarkerSpec {
  id: string;
  /** Filter category; markers without one (warnings) are always shown. */
  category?: MarkerCategory;
  element: () => HTMLElement | null | undefined;
  /** World anchor for this frame, written into `out`; null hides the marker. */
  anchor: (out: Vector3) => Vector3 | null;
  /** Hidden behind walls and furniture (MarkerOcclusion); otherwise always visible. */
  occlude?: boolean;
  /** Markers of one group are pushed apart vertically when they overlap. */
  stack?: { group: string; width: number; height: number };
  /** Screen offset in CSS pixels. */
  offset?: { x: number; y: number };
  /** CSS display value of the element when shown. */
  display: string;
  /** False for status displays that let pointer input through to the model. */
  interactive?: boolean;
  /** Stays visible in the energy view, which hides the other plan markers. */
  energy?: boolean;
  /**
   * Long press runs this instead of the element's click (e.g. light on/off).
   * Returning false (nothing to do: unassigned, unavailable, offline) lets the
   * release open the popup as a normal tap would.
   */
  primaryAction?: () => boolean;
}

export interface MarkerPlacement { x: number; y: number; visible: boolean }

export interface MarkerGroup {
  placement(id: string): MarkerPlacement | undefined;
  dispose(): void;
}

interface Marker {
  spec: MapMarkerSpec;
  element: HTMLElement | null;
  mutations: MutationObserver;
  raster: MarkerRaster | null;
  /** Reserved atlas area (texels) and the part the current raster uses. */
  slot: { x: number; y: number; width: number; height: number } | null;
  used: { width: number; height: number };
  pixelRatio: number;
  dirty: boolean;
  placement: MarkerPlacement;
  point: Vector3;
}

/**
 * Proxy state lives in a data attribute: React rewrites `className` whenever a
 * marker's state changes, but leaves attributes it does not render alone.
 */
const PROXY_ATTRIBUTE = 'data-map-marker';
const PARKED = '-10000px';
const STACK_GAP = 6;
const TOUCH_SLOP = 6;
/** Hold time and allowed finger travel for a long press. */
const LONG_PRESS_MS = 500;
const LONG_PRESS_SLOP = 10;

export function markerLayerMode(): 'webgl' | 'dom' {
  return typeof location !== 'undefined' && new URLSearchParams(location.search).get('markers') === 'dom' ? 'dom' : 'webgl';
}

const renderRequests = new WeakMap<Scene, () => void>();
/** Lets marker changes (new raster, hover) wake an idle render loop. */
export function setMarkerRenderRequest(scene: Scene, request: () => void): void { renderRequests.set(scene, request); }

const layers = new WeakMap<Scene, MarkerLayer>();
export function getMarkerLayer(scene: Scene): MarkerLayer {
  let layer = layers.get(scene);
  if (!layer) {
    layer = new MarkerLayer(scene, markerLayerMode());
    layers.set(scene, layer);
    if (import.meta.env?.DEV) (window as Window & { __markerLayer?: MarkerLayer }).__markerLayer = layer;
    scene.onDisposeObservable.addOnce(() => { layer!.dispose(); layers.delete(scene); });
  }
  return layer;
}

export class MarkerLayer {
  readonly onLayoutObservable = new Observable<void>();
  /** Drawn marker size relative to CSS (tablets: larger, see markerSizeScale). */
  sizeScale = 1;
  private groups = new Set<Marker[]>();
  private markerList: Marker[] | null = null;
  private point = Vector3.Zero();
  private overlay: MarkerOverlay | null = null;
  private layoutObserver: Observer<Scene> | null = null;

  constructor(private scene: Scene, readonly mode: 'webgl' | 'dom') {
    if (mode === 'webgl') this.overlay = new MarkerOverlay(scene, this);
    else this.layoutObserver = scene.onAfterRenderObservable.add(() => this.layout(), undefined, true);
  }

  add(specs: MapMarkerSpec[]): MarkerGroup {
    const markers = specs.map(spec => {
      const marker: Marker = {
        spec, element: null, raster: null, slot: null, used: { width: 0, height: 0 }, pixelRatio: 1, dirty: true,
        placement: { x: 0, y: 0, visible: false }, point: Vector3.Zero(),
        mutations: new MutationObserver(records => {
          if (records.every(invisibleChange)) return;
          marker.dirty = true;
          this.requestRender();
        }),
      };
      return marker;
    });
    this.groups.add(markers);
    this.markerList = null;
    this.requestRender();
    return {
      placement: id => markers.find(m => m.spec.id === id)?.placement,
      dispose: () => {
        this.groups.delete(markers);
        this.markerList = null;
        for (const marker of markers) {
          marker.mutations.disconnect();
          this.overlay?.release(marker);
          if (marker.element) this.detach(marker.element);
        }
        this.requestRender();
      },
    };
  }

  requestRender(): void { renderRequests.get(this.scene)?.(); }

  markers(): readonly Marker[] {
    if (this.markerList) return this.markerList;
    const all: Marker[] = [];
    for (const group of this.groups) all.push(...group);
    return this.markerList = all;
  }

  /** Projects, occludes and stacks every marker for the current frame. */
  layout(): void {
    const projection = getMarkerProjection(this.scene);
    const size = this.mode === 'webgl' ? markerSizeScale() : 1;
    if (size !== this.sizeScale) { this.sizeScale = size; for (const marker of this.markers()) marker.dirty = true; }
    const stacks = new Map<string, Array<{ x: number; y: number; width: number; height: number }>>();
    for (const group of this.groups) {
      for (const marker of group) {
        const { spec } = marker;
        const element = spec.element() ?? null;
        if (element !== marker.element) this.attach(marker, element);
        const placement = marker.placement;
        placement.visible = false;
        if (!element || !projection) continue;
        // Scripted first-person shots (day demo) show the room without plan markers.
        // The energy view shows only its own labels.
        // `markerCategories`: the categories shown (filter bar or day demo chapter); unset shows all.
        const shown = this.scene.metadata?.markerCategories as ReadonlySet<MarkerCategory> | undefined;
        if (this.scene.metadata?.hideMarkers || (!!this.scene.metadata?.energyView !== !!spec.energy) || (spec.category && shown && !shown.has(spec.category))) { if (this.mode === 'dom') setMarkerStyle(element, 'display', 'none'); continue; }
        const point = spec.anchor(this.point);
        if (!point) { if (this.mode === 'dom') setMarkerStyle(element, 'display', 'none'); continue; }
        marker.point.copyFrom(point);
        const { rect, width, height } = projection;
        const p = projection.project(point, spec.occlude ? element : undefined);
        const visible = p.z >= 0 && p.z <= 1 && p.x >= 0 && p.x <= width && p.y >= 0 && p.y <= height;
        const x = rect.left + p.x / width * rect.width + (spec.offset?.x ?? 0) * size;
        let y = rect.top + p.y / height * rect.height + (spec.offset?.y ?? 0) * size;
        if (spec.stack) {
          const placed = stacks.get(spec.stack.group) ?? [];
          stacks.set(spec.stack.group, placed);
          const w = spec.stack.width * size, h = spec.stack.height * size;
          for (const prior of placed) {
            if (Math.abs(x - prior.x) < (w + prior.width) / 2 + STACK_GAP && Math.abs(y - prior.y) < (h + prior.height) / 2 + STACK_GAP)
              y = prior.y + (h + prior.height) / 2 + STACK_GAP;
          }
          placed.push({ x, y, width: w, height: h });
        }
        placement.x = x; placement.y = y; placement.visible = visible;
        if (this.mode === 'dom') {
          setMarkerStyle(element, 'display', visible ? spec.display : 'none');
          setMarkerStyle(element, 'left', `${x}px`); setMarkerStyle(element, 'top', `${y}px`);
        }
      }
    }
    this.onLayoutObservable.notifyObservers();
  }

  private attach(marker: Marker, element: HTMLElement | null): void {
    marker.mutations.disconnect();
    if (marker.element) this.detach(marker.element);
    marker.element = element;
    marker.dirty = true;
    if (!element || this.mode === 'dom') return;
    element.setAttribute(PROXY_ATTRIBUTE, 'proxy');
    element.style.display = marker.spec.display;
    park(element);
    marker.mutations.observe(element, { attributes: true, childList: true, subtree: true, characterData: true });
    marker.mutations.takeRecords();
  }

  private detach(element: HTMLElement): void {
    if (this.mode === 'dom') return;
    element.removeAttribute(PROXY_ATTRIBUTE);
  }

  /**
   * Writes the proxy's position without re-rasterizing it. Only the layer's own
   * style write is dropped: other pending changes (hover attribute, classes the
   * component toggled in a forwarded event) still re-rasterize.
   */
  quietly(marker: Marker, write: () => void): void {
    const pending = marker.mutations.takeRecords();
    write();
    marker.mutations.takeRecords();
    if (pending.some(record => !invisibleChange(record))) { marker.dirty = true; this.requestRender(); }
  }

  dispose(): void {
    for (const group of [...this.groups]) for (const marker of group) marker.mutations.disconnect();
    this.groups.clear();
    this.markerList = null;
    this.overlay?.dispose();
    if (this.layoutObserver) this.scene.onAfterRenderObservable.remove(this.layoutObserver);
    this.onLayoutObservable.clear();
  }
}

/** Tooltip and screen-reader texts (e.g. a door's "open for 5 min") never change the drawn marker. */
const TEXT_ATTRIBUTES = new Set(['title', 'aria-label', 'aria-expanded', 'aria-haspopup']);
function invisibleChange(record: MutationRecord): boolean {
  return record.type === 'attributes' && TEXT_ATTRIBUTES.has(record.attributeName ?? '');
}

function park(element: HTMLElement): void {
  setMarkerStyle(element, 'left', PARKED);
  setMarkerStyle(element, 'top', PARKED);
}

Effect.ShadersStore.mapMarkerVertexShader = `
precision highp float;
attribute vec3 position;
attribute vec2 uv;
attribute vec4 color;
varying vec2 vUV;
varying float vAlpha;
void main(void) {
  vUV = uv;
  vAlpha = color.a;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;
Effect.ShadersStore.mapMarkerFragmentShader = `
precision highp float;
varying vec2 vUV;
varying float vAlpha;
uniform sampler2D atlas;
void main(void) {
  gl_FragColor = texture2D(atlas, vUV) * vAlpha;
}`;

/** Both engines implement sub-rectangle uploads (texSubImage2D / writeTexture); AbstractEngine does not declare it. */
function uploadTexels(scene: Scene, texture: InternalTexture, data: Uint8Array, x: number, y: number, width: number, height: number): void {
  (scene.getEngine() as unknown as {
    updateTextureData(texture: InternalTexture, data: ArrayBufferView, x: number, y: number, width: number, height: number): void;
  }).updateTextureData(texture, data, x, y, width, height);
}

/** Shelf-packed texture atlas for marker rasters. */
class Atlas {
  private shelves: Array<{ y: number; height: number; x: number }> = [];
  private bottom = 0;
  constructor(readonly size: number) {}
  allocate(width: number, height: number): { x: number; y: number } | null {
    if (width > this.size) return null;
    for (const shelf of this.shelves) {
      if (height <= shelf.height && shelf.x + width <= this.size) {
        const slot = { x: shelf.x, y: shelf.y };
        shelf.x += width + 1;
        return slot;
      }
    }
    if (this.bottom + height > this.size) return null;
    const shelf = { y: this.bottom, height, x: width + 1 };
    this.shelves.push(shelf);
    this.bottom += height + 1;
    return { x: 0, y: shelf.y };
  }
}

class MarkerOverlay {
  private utility: UtilityLayerRenderer;
  private mesh: Mesh;
  private material: ShaderMaterial;
  private texture: RawTexture;
  private atlas: Atlas;
  private capacity = 0;
  private positions = new Float32Array(0);
  private uvs = new Float32Array(0);
  private colors = new Float32Array(0);
  private visible: Marker[] = [];
  private visibleSource: Marker[] = [];
  private visibleZIndices: number[] = [];
  private uvSlots: Marker['slot'][] = [];
  private uvSizes: Marker['used'][] = [];
  private uvAtlasSize = 0;
  private positionCount = 0;
  private buffers = new MarkerVertexBuffers();
  private scratch = document.createElement('canvas');
  private beforeRender: Observer<Scene>;
  private input: MarkerInput;

  constructor(private scene: Scene, private layer: MarkerLayer) {
    this.utility = new UtilityLayerRenderer(scene, false);
    const overlayScene = this.utility.utilityLayerScene;
    this.atlas = new Atlas(1024);
    this.texture = this.createTexture(1024);
    this.material = new ShaderMaterial('map-markers', overlayScene, { vertex: 'mapMarker', fragment: 'mapMarker' }, {
      attributes: ['position', 'uv', 'color'], uniforms: [], samplers: ['atlas'], needAlphaBlending: true,
    });
    this.material.alphaMode = Constants.ALPHA_PREMULTIPLIED;
    this.material.backFaceCulling = false;
    this.material.disableDepthWrite = true;
    this.material.depthFunction = Constants.ALWAYS;
    this.material.setTexture('atlas', this.texture);
    this.mesh = new Mesh('map-markers', overlayScene);
    this.mesh.material = this.material;
    this.mesh.isPickable = false;
    this.mesh.alwaysSelectAsActiveMesh = true;
    this.mesh.doNotSyncBoundingInfo = true;
    this.grow(64);
    this.beforeRender = overlayScene.onBeforeRenderObservable.add(() => this.update());
    this.input = new MarkerInput(scene, layer);
  }

  private createTexture(size: number): RawTexture {
    const texture = new RawTexture(new Uint8Array(size * size * 4), size, size, Constants.TEXTUREFORMAT_RGBA,
      this.utility.utilityLayerScene, false, false, Constants.TEXTURE_BILINEAR_SAMPLINGMODE);
    texture.wrapU = texture.wrapV = Constants.TEXTURE_CLAMP_ADDRESSMODE;
    return texture;
  }

  private grow(capacity: number): void {
    this.buffers.reset();
    this.capacity = capacity;
    this.positions = new Float32Array(capacity * 12);
    this.uvs = new Float32Array(capacity * 8);
    // Every drawn quad is opaque white; the atlas supplies its color and alpha.
    this.colors = new Float32Array(capacity * 16).fill(1);
    this.uvSlots.length = this.uvSizes.length = 0;
    this.positionCount = 0;
    const indices = new Uint32Array(capacity * 6);
    for (let i = 0; i < capacity; i++) indices.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3], i * 6);
    this.mesh.setVerticesData(VertexBuffer.PositionKind, this.positions, true, 3);
    this.mesh.setVerticesData(VertexBuffer.UVKind, this.uvs, true, 2);
    this.mesh.setVerticesData(VertexBuffer.ColorKind, this.colors, false, 4);
    this.mesh.setIndices(indices);
  }

  release(marker: Marker): void { marker.slot = null; marker.raster = null; }

  private update(): void {
    this.layer.layout();
    this.input.follow();
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 3);
    const markers = this.layer.markers();
    for (const marker of markers) {
      if (!marker.element || (!marker.dirty && marker.pixelRatio === pixelRatio)) continue;
      marker.dirty = false;
      marker.pixelRatio = pixelRatio;
      this.rasterize(marker, pixelRatio, markers);
    }
    const visible = this.visible;
    let count = 0, orderChanged = false;
    for (const marker of markers) {
      if (!marker.placement.visible || !marker.raster || !marker.slot) continue;
      const zIndex = marker.raster.zIndex;
      if (this.visibleSource[count] !== marker || this.visibleZIndices[count] !== zIndex) orderChanged = true;
      this.visibleSource[count] = marker;
      this.visibleZIndices[count++] = zIndex;
    }
    if (this.visibleSource.length !== count) orderChanged = true;
    this.visibleSource.length = this.visibleZIndices.length = count;
    if (orderChanged) {
      visible.length = count;
      for (let i = 0; i < count; i++) visible[i] = this.visibleSource[i];
      // Start from registration order so ties retain the same hit-test priority.
      visible.sort((a, b) => a.raster!.zIndex - b.raster!.zIndex);
    }
    this.input.setOrder(visible);
    if (visible.length > this.capacity) this.grow(Math.max(visible.length, this.capacity * 2));
    const projection = getMarkerProjection(this.scene);
    const rect = projection?.rect;
    let positionCount = 0, uvChanged = false;
    if (rect && rect.width && rect.height) {
      const size = this.atlas.size;
      const atlasChanged = this.uvAtlasSize !== size;
      if (atlasChanged) this.uvSlots.length = this.uvSizes.length = 0;
      this.uvAtlasSize = size;
      positionCount = visible.length;
      const snap = (value: number) => Math.round(value * pixelRatio) / pixelRatio;
      for (let i = 0; i < visible.length; i++) {
        const marker = visible[i];
        const raster = marker.raster!, slot = marker.slot!, scale = raster.scale * this.layer.sizeScale;
        const left = snap(marker.placement.x - raster.centerX * scale), top = snap(marker.placement.y - raster.centerY * scale);
        const right = left + raster.width * scale, bottom = top + raster.height * scale;
        const x0 = (left - rect.left) / rect.width * 2 - 1, x1 = (right - rect.left) / rect.width * 2 - 1;
        const y0 = 1 - (top - rect.top) / rect.height * 2, y1 = 1 - (bottom - rect.top) / rect.height * 2;
        // z stays zero from allocation; x/y follow the current projection every frame.
        const p = i * 12;
        this.positions[p] = x0; this.positions[p + 1] = y0;
        this.positions[p + 3] = x1; this.positions[p + 4] = y0;
        this.positions[p + 6] = x1; this.positions[p + 7] = y1;
        this.positions[p + 9] = x0; this.positions[p + 10] = y1;
        // Slots and used sizes are replaced on atlas allocation/rasterization.
        // Camera motion alone does not change texture coordinates.
        if (atlasChanged || this.uvSlots[i] !== slot || this.uvSizes[i] !== marker.used) {
          const u0 = slot.x / size, v0 = slot.y / size, u1 = (slot.x + marker.used.width) / size, v1 = (slot.y + marker.used.height) / size;
          const u = i * 8;
          this.uvs[u] = u0; this.uvs[u + 1] = v0; this.uvs[u + 2] = u1; this.uvs[u + 3] = v0;
          this.uvs[u + 4] = u1; this.uvs[u + 5] = v1; this.uvs[u + 6] = u0; this.uvs[u + 7] = v1;
          this.uvSlots[i] = slot; this.uvSizes[i] = marker.used;
          uvChanged = true;
        }
      }
    }
    // Removed/hidden quads must collapse, including when the canvas has no size.
    if (positionCount < this.positionCount) this.positions.fill(0, positionCount * 12, this.positionCount * 12);
    this.positionCount = positionCount;
    this.buffers.upload(this.mesh, VertexBuffer.PositionKind, this.positions);
    if (uvChanged) this.buffers.upload(this.mesh, VertexBuffer.UVKind, this.uvs);
  }

  private rasterize(marker: Marker, pixelRatio: number, all: readonly Marker[]): void {
    const raster = rasterizeMarker(marker.element!);
    marker.raster = raster;
    if (!raster) { marker.slot = null; return; }
    // Rasterized at the displayed scale: one texel per device pixel, also when hovered or enlarged.
    const ratio = pixelRatio * raster.scale * this.layer.sizeScale;
    const width = Math.max(1, Math.ceil(raster.width * ratio)), height = Math.max(1, Math.ceil(raster.height * ratio));
    if (!marker.slot || marker.slot.width < width || marker.slot.height < height) {
      marker.slot = this.allocate(width, height, all, marker);
      if (!marker.slot) return;
    }
    const canvas = this.scratch;
    if (canvas.width < width) canvas.width = width;
    if (canvas.height < height) canvas.height = height;
    const context = canvas.getContext('2d', { willReadFrequently: true })!;
    context.clearRect(0, 0, width, height);
    raster.draw(context, ratio);
    const image = context.getImageData(0, 0, width, height);
    const data = image.data;
    // Premultiplied alpha: bilinear filtering then keeps edges free of dark fringes.
    for (let i = 0; i < data.length; i += 4) {
      const a = data[i + 3];
      if (a === 255) continue;
      data[i] = data[i] * a / 255; data[i + 1] = data[i + 1] * a / 255; data[i + 2] = data[i + 2] * a / 255;
    }
    const slot = marker.slot;
    const texture = this.texture.getInternalTexture();
    if (!texture) return;
    uploadTexels(this.scene, texture, new Uint8Array(data.buffer), slot.x, slot.y, width, height);
    marker.used = { width, height };
  }

  private allocate(width: number, height: number, all: readonly Marker[], requester: Marker): Marker['slot'] {
    const slot = this.atlas.allocate(width, height);
    if (slot) return { ...slot, width, height };
    // Atlas full: start over (and grow when needed); every marker is rasterized again.
    const size = this.atlas.size * (this.usedArea(all) > this.atlas.size ** 2 / 2 ? 2 : 1);
    if (size > 4096) return null;
    if (size !== this.atlas.size) {
      this.texture.dispose();
      this.texture = this.createTexture(size);
      this.material.setTexture('atlas', this.texture);
    } else {
      // Old rasters would bleed into the new neighbours' filtering margins.
      const texture = this.texture.getInternalTexture();
      if (texture) uploadTexels(this.scene, texture, new Uint8Array(size * size * 4), 0, 0, size, size);
    }
    this.atlas = new Atlas(size);
    for (const marker of all) if (marker !== requester) { marker.slot = null; marker.dirty = true; }
    const fresh = this.atlas.allocate(width, height);
    return fresh ? { ...fresh, width, height } : null;
  }

  private usedArea(all: readonly Marker[]): number {
    return all.reduce((sum, m) => sum + (m.slot ? m.slot.width * m.slot.height : 0), 0);
  }

  dispose(): void {
    this.utility.utilityLayerScene.onBeforeRenderObservable.remove(this.beforeRender);
    this.input.dispose();
    this.mesh.dispose();
    this.material.dispose();
    this.texture.dispose();
    this.utility.dispose();
  }
}

/**
 * Canvas pointer input over a drawn marker goes to the marker's element instead
 * of the camera, as it did when the element itself was on top of the canvas.
 */
class MarkerInput {
  private order: Marker[] = [];
  private hovered: Marker | null = null;
  private pressed: { marker: Marker; pointerId: number } | null = null;
  private suppressClick = false;
  private longPress: { marker: Marker; timer: number; x: number; y: number; fired: boolean } | null = null;
  private canvas: HTMLCanvasElement | null;
  private cursor = '';
  private title = '';
  private listeners: Array<[string, (event: Event) => void]> = [];
  /** Events this class dispatches to marker elements pass its own window listeners too. */
  private forwarding = false;

  constructor(scene: Scene, private layer: MarkerLayer) {
    this.canvas = scene.getEngine().getRenderingCanvas();
    const on = (type: string, handler: (event: Event) => void) => {
      const guarded = (event: Event) => { if (!this.forwarding) handler(event); };
      window.addEventListener(type, guarded, true);
      this.listeners.push([type, guarded]);
    };
    on('pointerdown', event => this.down(event as PointerEvent));
    on('pointermove', event => this.move(event as PointerEvent));
    on('pointerup', event => this.up(event as PointerEvent));
    on('pointercancel', event => this.up(event as PointerEvent));
    on('click', event => {
      if (!this.suppressClick || event.target !== this.canvas) return;
      this.suppressClick = false;
      event.stopPropagation();
      event.preventDefault();
    });
    // A long press on a marker must not open the system callout or context menu.
    on('contextmenu', event => { if (this.pressed || this.longPress?.fired) event.preventDefault(); });
    this.canvas?.style.setProperty('-webkit-touch-callout', 'none');
    this.canvas?.addEventListener('pointerleave', this.leave);
  }

  setOrder(visible: Marker[]): void {
    this.order = visible;
    if (this.hovered && !visible.includes(this.hovered) && !this.pressed) this.clearHover();
  }

  /** Keeps the hovered or pressed element at its marker (its handlers read the element's rect). */
  follow(): void {
    for (const marker of [this.hovered, this.pressed?.marker]) if (marker) this.place(marker);
  }

  private hit(event: PointerEvent): Marker | null {
    const slop = event.pointerType === 'touch' ? TOUCH_SLOP : 0;
    for (let i = this.order.length - 1; i >= 0; i--) {
      const marker = this.order[i], raster = marker.raster!;
      if (marker.spec.interactive === false) continue;
      const scale = raster.scale * this.layer.sizeScale;
      const halfWidth = raster.boxWidth * scale / 2 + slop, halfHeight = raster.boxHeight * scale / 2 + slop;
      if (Math.abs(event.clientX - marker.placement.x) <= halfWidth && Math.abs(event.clientY - marker.placement.y) <= halfHeight) return marker;
    }
    return null;
  }

  private place(marker: Marker): void {
    const element = marker.element;
    if (!element) return;
    this.layer.quietly(marker, () => {
      setMarkerStyle(element, 'left', `${marker.placement.x}px`);
      setMarkerStyle(element, 'top', `${marker.placement.y}px`);
    });
  }

  private unplace(marker: Marker): void {
    if (marker === this.hovered || marker === this.pressed?.marker || !marker.element) return;
    const element = marker.element;
    this.layer.quietly(marker, () => park(element));
  }

  private forward(marker: Marker, type: string, event: PointerEvent, init: PointerEventInit = {}): void {
    this.dispatch(marker.element, new PointerEvent(type, {
      bubbles: true, cancelable: true, composed: true,
      clientX: event.clientX, clientY: event.clientY, screenX: event.screenX, screenY: event.screenY,
      pointerId: event.pointerId, pointerType: event.pointerType, isPrimary: event.isPrimary,
      button: event.button, buttons: event.buttons, pressure: event.pressure, width: event.width, height: event.height,
      ctrlKey: event.ctrlKey, shiftKey: event.shiftKey, altKey: event.altKey, metaKey: event.metaKey, ...init,
    }));
  }

  private dispatch(element: HTMLElement | null, event: Event): void {
    if (!element) return;
    this.forwarding = true;
    try { element.dispatchEvent(event); } finally { this.forwarding = false; }
  }

  private down(event: PointerEvent): void {
    if (event.target !== this.canvas) return;
    const marker = this.hit(event);
    if (!marker) return;
    event.stopPropagation();
    this.pressed = { marker, pointerId: event.pointerId };
    this.place(marker);
    // Touch has no hover: the pressed marker grows instead, as a mouse-hovered one does.
    if (event.pointerType === 'touch') this.setAttribute(marker, 'hover');
    this.forward(marker, 'pointerdown', event);
    this.cancelLongPress();
    if (marker.spec.primaryAction && event.button === 0) {
      this.longPress = { marker, x: event.clientX, y: event.clientY, fired: false, timer: window.setTimeout(() => this.runPrimaryAction(), LONG_PRESS_MS) };
    }
    this.layer.requestRender();
  }

  private cancelLongPress(): void {
    if (this.longPress && !this.longPress.fired) window.clearTimeout(this.longPress.timer);
    this.longPress = null;
  }

  /** Long press: the marker's primary action instead of its popup, with a short grow as confirmation. */
  private runPrimaryAction(): void {
    const press = this.longPress;
    if (!press || press.marker !== this.pressed?.marker) return;
    const { marker } = press;
    let handled = false;
    try { handled = marker.spec.primaryAction!(); } catch (error) { console.error('[MarkerLayer] Primary action failed:', error); }
    if (!handled) { this.longPress = null; return; }
    press.fired = true;
    this.setAttribute(marker, 'action');
    (navigator as Navigator & { vibrate?: (ms: number) => boolean }).vibrate?.(15);
    window.setTimeout(() => {
      if (marker.element?.getAttribute(PROXY_ATTRIBUTE) !== 'action') return;
      this.setAttribute(marker, marker === this.hovered || marker === this.pressed?.marker ? 'hover' : 'proxy');
    }, 250);
  }

  private move(event: PointerEvent): void {
    if (this.pressed && event.pointerId === this.pressed.pointerId) {
      event.stopPropagation();
      const press = this.longPress;
      if (press && !press.fired && Math.hypot(event.clientX - press.x, event.clientY - press.y) > LONG_PRESS_SLOP) this.cancelLongPress();
      this.forward(this.pressed.marker, 'pointermove', event);
      return;
    }
    if (event.target !== this.canvas || event.buttons || event.pointerType === 'touch') {
      if (this.hovered) this.clearHover(event);
      return;
    }
    const marker = this.hit(event);
    if (marker !== this.hovered) {
      if (this.hovered) this.clearHover(event);
      if (marker) this.setHover(marker, event);
    }
    if (marker) {
      event.stopPropagation();
      this.forward(marker, 'pointermove', event);
    }
  }

  private up(event: PointerEvent): void {
    const pressed = this.pressed;
    if (!pressed || event.pointerId !== pressed.pointerId) return;
    event.stopPropagation();
    this.pressed = null;
    const { marker } = pressed;
    const longPressed = this.longPress?.fired ?? false;
    this.cancelLongPress();
    this.forward(marker, event.type, event);
    // After a long press the confirmation grow resets itself.
    if (event.pointerType === 'touch' && marker !== this.hovered && !longPressed) this.setAttribute(marker, 'proxy');
    if (longPressed) {
      // The action ran already; neither the element nor the scene gets a click.
      this.suppressClick = true;
      setTimeout(() => { this.suppressClick = false; }, 400);
    } else if (event.type === 'pointerup' && this.hit(event) === marker && marker.element) {
      this.dispatch(marker.element, new MouseEvent('click', {
        bubbles: true, cancelable: true, composed: true, detail: 1,
        clientX: event.clientX, clientY: event.clientY, screenX: event.screenX, screenY: event.screenY,
        ctrlKey: event.ctrlKey, shiftKey: event.shiftKey, altKey: event.altKey, metaKey: event.metaKey,
      }));
      // The browser's own click follows on the canvas; it must not reach the scene.
      this.suppressClick = true;
      setTimeout(() => { this.suppressClick = false; }, 400);
    }
    this.unplace(marker);
    this.layer.requestRender();
  }

  private setHover(marker: Marker, event: PointerEvent): void {
    const element = marker.element;
    if (!element || !this.canvas) return;
    this.hovered = marker;
    this.place(marker);
    this.setAttribute(marker, 'hover');
    this.cursor = this.canvas.style.cursor;
    this.title = this.canvas.title;
    this.canvas.style.cursor = getComputedStyle(element).cursor || 'pointer';
    this.canvas.title = element.title;
    this.forward(marker, 'pointerover', event, { relatedTarget: this.canvas });
    this.layer.requestRender();
  }

  private clearHover(event?: PointerEvent): void {
    const marker = this.hovered;
    if (!marker) return;
    this.hovered = null;
    const element = marker.element;
    if (element) {
      this.setAttribute(marker, 'proxy');
      if (event) this.forward(marker, 'pointerout', event, { relatedTarget: this.canvas });
      else this.dispatch(element, new PointerEvent('pointerout', { bubbles: true, relatedTarget: this.canvas }));
    }
    if (this.canvas) { this.canvas.style.cursor = this.cursor; this.canvas.title = this.title; }
    this.unplace(marker);
    this.layer.requestRender();
  }

  /** Hover state on the proxy; a changed state re-rasterizes it (size, captions). */
  private setAttribute(marker: Marker, state: 'proxy' | 'hover' | 'action'): void {
    const element = marker.element;
    if (!element?.hasAttribute(PROXY_ATTRIBUTE) || element.getAttribute(PROXY_ATTRIBUTE) === state) return;
    element.setAttribute(PROXY_ATTRIBUTE, state);
    marker.dirty = true;
    this.layer.requestRender();
  }

  private leave = () => { if (!this.pressed) this.clearHover(); };

  dispose(): void {
    for (const [type, handler] of this.listeners) window.removeEventListener(type, handler, true);
    this.canvas?.removeEventListener('pointerleave', this.leave);
  }
}
