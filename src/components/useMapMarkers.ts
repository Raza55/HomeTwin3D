import { createContext, createElement, useContext, useEffect, useRef, type DependencyList, type ReactNode } from 'react';
import type { Scene } from '@babylonjs/core';
import { getMarkerLayer, type MapMarkerSpec, type MarkerCategory, type MarkerGroup, type MarkerPlacement } from '../babylon/MarkerLayer';
import './MapMarkers.css';

/** The filter category of every marker registered below (the marker filter on the plan's right edge). */
const CategoryContext = createContext<MarkerCategory | undefined>(undefined);
export function MarkerCategoryScope({ value, children }: { value: MarkerCategory; children: ReactNode }) {
  return createElement(CategoryContext.Provider, { value }, children);
}

/** Registers a component's map markers with the scene's marker layer while `deps` are unchanged. */
export function useMapMarkers(scene: Scene, build: () => MapMarkerSpec[], deps: DependencyList) {
  const group = useRef<MarkerGroup | null>(null);
  const category = useContext(CategoryContext);
  useEffect(() => {
    const specs = build();
    const added = getMarkerLayer(scene).add(category ? specs.map(spec => spec.category ? spec : { ...spec, category }) : specs);
    group.current = added;
    return () => { added.dispose(); if (group.current === added) group.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene, category, ...deps]);
  return group;
}

/** Ref to the latest render's value, for callbacks registered once (marker primary actions). */
export function useLatest<T>(value: T) {
  const ref = useRef(value);
  ref.current = value;
  return ref;
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
