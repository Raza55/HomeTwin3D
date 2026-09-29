import { useEffect, useRef, type DependencyList } from 'react';
import type { Scene } from '@babylonjs/core';
import { getMarkerLayer, type MapMarkerSpec, type MarkerGroup, type MarkerPlacement } from '../babylon/MarkerLayer';
import './MapMarkers.css';

/** Registers a component's map markers with the scene's marker layer while `deps` are unchanged. */
export function useMapMarkers(scene: Scene, build: () => MapMarkerSpec[], deps: DependencyList) {
  const group = useRef<MarkerGroup | null>(null);
  useEffect(() => {
    const added = getMarkerLayer(scene).add(build());
    group.current = added;
    return () => { added.dispose(); if (group.current === added) group.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene, ...deps]);
  return group;
}

/** Calls `apply` after every marker layout with the placement of marker `id` (popups that follow their marker). */
export function useMarkerPlacement(scene: Scene, group: { current: MarkerGroup | null }, id: string | null | undefined,
  apply: (placement: MarkerPlacement) => void, deps: DependencyList = []) {
  useEffect(() => {
    if (!id) return;
    const layer = getMarkerLayer(scene);
    const observer = layer.onLayoutObservable.add(() => {
      const placement = group.current?.placement(id);
      if (placement) apply(placement);
    });
    layer.requestRender();
    return () => { layer.onLayoutObservable.remove(observer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene, id, ...deps]);
}
