import { Matrix, Vector3, Viewport, type Scene, type AbstractMesh } from '@babylonjs/core';
import { getMarkerOcclusion, type MarkerOcclusion } from './MarkerOcclusion';
import { isDisabledForDebug } from './DebugFlags';

/** Shared by overlay observers: measure the canvas once, before their DOM writes. */
class MarkerProjection {
  frameId = -1;
  rect!: DOMRect;
  width = 0;
  height = 0;
  viewport = new Viewport(0, 0, 0, 0);
  transform = Matrix.Identity();
  private viewportTransform = Matrix.Identity();
  private screenTransform = Matrix.Identity();
  private result = Vector3.Zero();
  occlusion?: MarkerOcclusion;

  updateTransform(halfZRange: boolean): void {
    const { x, y, width, height } = this.viewport;
    Matrix.FromValuesToRef(
      width / 2, 0, 0, 0,
      0, -height / 2, 0, 0,
      0, 0, halfZRange ? 1 : .5, 0,
      x + width / 2, y + height / 2, halfZRange ? 0 : .5, 1,
      this.viewportTransform,
    );
    this.transform.multiplyToRef(this.viewportTransform, this.screenTransform);
  }

  /** Omit marker to bypass occlusion for persistent controls. Result is scratch storage; consume it before projecting the next marker. */
  project(point: Vector3, marker?: object): Vector3 {
    const p = Vector3.TransformCoordinatesToRef(point, this.screenTransform, this.result);
    if (marker && this.occlusion && p.z >= 0 && p.z <= 1 && p.x >= 0 && p.x <= this.width && p.y >= 0 && p.y <= this.height
      && !this.occlusion.visible(marker, point)) p.z = -1;
    return p;
  }
}

const projections = new WeakMap<Scene, MarkerProjection>();
/** `?off=markers`: overlays stop positioning (diagnostics only). */
const markersOff = isDisabledForDebug('markers');

/** Preserve the mean of live world bounds without allocating per mesh/frame. */
export function markerCenterToRef(meshes: readonly AbstractMesh[], fallback: Vector3, result: Vector3): Vector3 {
  if (!meshes.length) return result.copyFrom(fallback);
  result.setAll(0);
  for (const mesh of meshes) result.addInPlace(mesh.getBoundingInfo().boundingBox.centerWorld);
  return result.scaleInPlace(1 / meshes.length);
}

export function getMarkerProjection(scene: Scene): MarkerProjection | null {
  if (markersOff) return null;
  const camera = scene.activeCamera;
  const engine = scene.getEngine();
  const canvas = engine.getRenderingCanvas();
  if (!camera || !canvas) return null;
  let projection = projections.get(scene);
  if (!projection) {
    projection = new MarkerProjection();
    projections.set(scene, projection);
  }
  if (projection.frameId !== scene.getFrameId()) {
    projection.frameId = scene.getFrameId();
    projection.occlusion = getMarkerOcclusion(scene);
    projection.occlusion?.update();
    projection.rect = canvas.getBoundingClientRect();
    projection.width = engine.getRenderWidth();
    projection.height = engine.getRenderHeight();
    camera.viewport.toGlobalToRef(projection.width, projection.height, projection.viewport);
    projection.transform.copyFrom(scene.getTransformMatrix());
    // The view/viewport product is identical for every marker in this frame.
    projection.updateTransform(engine.isNDCHalfZRange);
  }
  return projection;
}

type MarkerStyle = 'left' | 'top' | 'display' | 'visibility';
const styles = new WeakMap<HTMLElement, Partial<Record<MarkerStyle, { requested: string; serialized: string }>>>();
/** Screen position per marker, applied through the compositor-only `translate` property. */
const positions = new WeakMap<HTMLElement, { x: string; y: string; applied: string; serialized: string }>();

/**
 * Avoid dirtying layout, including when CSSOM rounds fractional pixel strings.
 * Positions no longer move `left`/`top` (layout on every camera frame, costly on
 * iPad): markers are anchored at 0/0 once and moved with CSS `translate`, which
 * the browser composites on the GPU. It combines with centering transforms in CSS.
 */
export function setMarkerStyle(element: HTMLElement, property: MarkerStyle, value: string): void {
  if (property === 'left' || property === 'top') {
    let position = positions.get(element);
    if (!position) {
      position = { x: '0px', y: '0px', applied: '', serialized: '' };
      positions.set(element, position);
      element.style.left = '0px';
      element.style.top = '0px';
    }
    if (property === 'left') position.x = value; else position.y = value;
    const translate = `${position.x} ${position.y}`;
    // CSSOM may round the stored value; an external write shows up as a different serialization.
    if (translate === position.applied && element.style.translate === position.serialized) return;
    position.applied = translate;
    element.style.translate = translate;
    position.serialized = element.style.translate;
    return;
  }
  const current = element.style[property];
  if (current === value) return;
  let cached = styles.get(element);
  const previous = cached?.[property];
  if (previous?.requested === value && previous.serialized === current) return;
  element.style[property] = value;
  if (!cached) { cached = {}; styles.set(element, cached); }
  cached[property] = { requested: value, serialized: element.style[property] };
}
