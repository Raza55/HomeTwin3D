import React from 'react';
import { createRoot } from 'react-dom/client';
import BlenderLightSettings from '../src/components/BlenderLightSettings';
import { setSimulationConfigOverride } from '../src/services/configApi';
import '../src/pages/ConfigEditor/ConfigEditor.css';
Object.defineProperty(window, 'localStorage', { value: { getItem: () => null, setItem: () => {}, removeItem: () => {} } });
// In-memory fixture only; never replaces the user's saved configuration.
setSimulationConfigOverride({ location: { latitude: 0, longitude: 0 }, lights: [], model: { floorplan: {
  version: 1, source: 'QA.blend', coordinateSystem: 'babylon-lh-meters', objects: [
    { id: 'qa', label: 'Esstisch oben', domain: 'light', entityId: '', room: 'Wohnzimmer', position: { x: 0, y: 2, z: 0 }, size: { width: 1, height: .1, depth: .1 }, rotationY: 0,
      emitters: [{ kind: 'spot', lumens: 600, range: 5, angle: 120, position: { x: 0, y: 2, z: 0 }, direction: { x: 0, y: 1, z: 0 } }] },
  ],
} } });
createRoot(document.getElementById('root')!).render(<main style={{ maxWidth: 380, margin: 20, fontFamily: 'sans-serif' }}><h1>Blender-Lichter</h1><BlenderLightSettings onSave={() => {}} /></main>);
