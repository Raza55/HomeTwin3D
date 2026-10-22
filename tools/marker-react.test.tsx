import { Profiler, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { MeshBuilder, NullEngine, Scene } from '@babylonjs/core';
import { isEntityStateWatched, notifyEntityStates, useEntityStatesVersion } from '../src/services/entityStateSignal';
import { HUE_SYNC_AREA, HUE_SYNC_AREA_NAME, HUE_SYNC_MEMBERS, HUE_SYNC_SWITCH } from '../src/services/hueSync';
import LightClusterMarkers from '../src/components/LightClusterMarkers';
import BlindMarkers from '../src/components/BlindMarkers';
import WaterLeakMarkers from '../src/components/WaterLeakMarkers';
import ApplianceMarkers from '../src/components/ApplianceMarkers';
import TVDialControl from '../src/components/TVDialControl';
import BlindQuickControls from '../src/components/BlindQuickControls';
import { TV_DIAL_AUTOMATION } from '../src/services/tvDial';
import { LIVING_ROOM_TV } from '../src/services/tvMedia';
import { installationEntity } from '../src/services/installationConfig';
import { WATER_LEAK_SENSORS } from '../src/services/waterLeak';
import type { AppConfig, HAState } from '../src/types';

const check = (value: unknown, message: string) => { if (!value) throw new Error(message); };
const settle = () => new Promise(resolve => setTimeout(resolve, 30));

export async function runMarkerTests() {
  const host = document.createElement('div'); document.body.append(host);
  const root = createRoot(host);
  const engine = new NullEngine(); const scene = new Scene(engine);
  let renders = 0;
  function Probe({ ids }: { ids?: string[] }) {
    useEntityStatesVersion(ids); renders++; return null;
  }
  const render = (element: React.ReactNode) => flushSync(() => root.render(element));
  const signal = async (id?: string) => { notifyEntityStates(id); await settle(); };
  const state = (id: string, value: string, attributes = {}): HAState => ({ entity_id: id, state: value, attributes });
  try {
    render(<StrictMode><Probe ids={['sensor.first']} /><Probe ids={['sensor.first']} /></StrictMode>);
    check(isEntityStateWatched('sensor.first'), 'StrictMode subscriptions must register interests');
    const before = renders;
    await signal('sensor.unrelated');
    check(renders === before, 'unrelated events must not render scoped consumers');
    await signal('sensor.first');
    check(renders > before, 'relevant updates must render');
    render(<StrictMode><Probe ids={['sensor.first']} /></StrictMode>);
    check(isEntityStateWatched('sensor.first'), 'removing one consumer must preserve the other interest');
    render(<StrictMode><Probe ids={['sensor.second']} /></StrictMode>);
    check(!isEntityStateWatched('sensor.first') && isEntityStateWatched('sensor.second'), 'reassignment must replace interests');
    const reassigned = renders;
    await signal('sensor.first');
    check(renders === reassigned, 'old assignment must stop rendering');
    await signal('sensor.second');
    check(renders > reassigned, 'initially missing/new entities must still update');
    const broadcast = renders;
    await signal();
    check(renders > broadcast, 'broadcast refresh must remain supported');

    const id = HUE_SYNC_MEMBERS[0];
    const light = { entityId: id, label: 'Test lamp', position: { x: 0, y: 0, z: 0 } };
    let groupLookups = 0;
    const lights = new Proxy([light], { get(target, property, receiver) {
      if (property === 'find') groupLookups++;
      return Reflect.get(target, property, receiver);
    } });
    let config = { lights, blinds: [], model: { scale: 1, floorplan: { objects: [] } } } as unknown as AppConfig;
    const icon = MeshBuilder.CreateBox('test-icon', {}, scene);
    const meshes: any = { [id]: { touchIconMesh: icon, bulb: icon } };
    const states: Record<string, HAState> = { [id]: state(id, 'on', { rgb_color: [255, 0, 0] }) };
    let commits = 0;
    const showLights = () => render(<Profiler id="lights" onRender={() => commits++}><LightClusterMarkers scene={scene} config={config} meshes={meshes} states={states} onOpen={() => {}} onLeave={() => {}} /></Profiler>);
    showLights();
    check(!isEntityStateWatched('sensor.second'), 'unmounted consumers must release interests');
    check(host.querySelectorAll('button').length === 1, 'single light with icon must remain visible');
    const initialLookups = groupLookups;
    check(initialLookups > 0, 'initial grouping must run');
    const lightCommits = commits;
    await signal('cover.unrelated');
    check(commits === lightCommits, 'cover events must not rerender light markers');
    states[HUE_SYNC_SWITCH] = state(HUE_SYNC_SWITCH, 'on');
    states[HUE_SYNC_AREA] = state(HUE_SYNC_AREA, HUE_SYNC_AREA_NAME);
    await signal(HUE_SYNC_AREA);
    check(host.querySelector('.hue-sync-locked'), 'Hue Sync area must update the lock');
    states[id] = state(id, 'unavailable'); await signal(id);
    check(!host.querySelector('.hue-sync-locked'), 'unavailable lights must update lock state');
    states[id] = state(id, 'on', { rgb_color: [0, 255, 0] });
    states[HUE_SYNC_SWITCH] = state(HUE_SYNC_SWITCH, 'off'); await signal(HUE_SYNC_SWITCH);
    check(host.querySelector('button')?.style.color === 'rgb(0, 255, 0)', 'unlock must restore latest light color');
    check(groupLookups === initialLookups, 'HA state updates must reuse calculated light groups');
    delete meshes[id].touchIconMesh; showLights();
    check(host.querySelectorAll('button').length === 0, 'in-place icon removal must invalidate group cache');
    meshes[id].touchIconMesh = icon; showLights();
    check(host.querySelectorAll('button').length === 1, 'in-place icon addition must invalidate group cache');
    const second = { ...light, entityId: 'light.second', label: 'Second lamp', group: 'test' };
    config = { ...config, lights: [{ ...light, group: 'test' }, second] } as AppConfig;
    showLights();
    check(host.querySelector('button')?.getAttribute('aria-label')?.startsWith('2 '), 'changed configuration must regroup lights');
    check(isEntityStateWatched(second.entityId), 'all group members must be subscribed');

    const cover = 'cover.test';
    const blindMeshes: any = { [cover]: { config: { id: 'blind', label: 'Blind' }, frame: icon } };
    states[cover] = state(cover, 'open', { friendly_name: 'Before' });
    render(<BlindMarkers scene={scene} meshes={blindMeshes} config={config} states={states} onAssign={() => {}} onOpen={() => {}} />);
    states[cover] = state(cover, 'open', { friendly_name: 'After' }); await signal(cover);
    check(host.textContent?.includes('After'), 'attribute-only changes must update blind captions');

    const water = WATER_LEAK_SENSORS[0].entityId;
    render(<WaterLeakMarkers scene={scene} config={config} states={states} connected={true} />);
    check(!host.querySelector('[role=alert]'), 'no leak means no warning');
    states[water] = state(water, 'on'); await signal(water);
    check(host.querySelector('[role=alert]'), 'new leak must appear immediately');
    states[water] = state(water, 'off'); await signal(water);
    check(!host.querySelector('[role=alert]'), 'cleared leak must disappear');

    const appliance = { id: 'appliance', label: 'Dryer', entityId: 'sensor.dryer', position: { x: 0, y: 0, z: 0 },
      appliance: { kind: 'dryer', remainingEntityId: 'sensor.remaining', finishedEntityId: 'input_boolean.finished' } };
    const applianceConfig = { ...config, model: { ...config.model, floorplan: { objects: [appliance] } } } as unknown as AppConfig;
    states[appliance.entityId] = state(appliance.entityId, 'running');
    render(<ApplianceMarkers scene={scene} config={applianceConfig} states={states} connected={true} onAssign={() => {}} />);
    states['sensor.remaining'] = state('sensor.remaining', '12', { unit_of_measurement: 'min' }); await signal('sensor.remaining');
    check(host.textContent?.includes('12 min'), 'nested remaining-time sensor must update');
    states[appliance.entityId] = state(appliance.entityId, 'off');
    states['input_boolean.finished'] = state('input_boolean.finished', 'on'); await signal('input_boolean.finished');
    check(host.textContent?.includes('Fertig'), 'nested completion helper must update');

    states[TV_DIAL_AUTOMATION] = state(TV_DIAL_AUTOMATION, 'on');
    states[LIVING_ROOM_TV.television] = state(LIVING_ROOM_TV.television, 'on');
    states[LIVING_ROOM_TV.receiver] = state(LIVING_ROOM_TV.receiver, 'on', { source: 'PC' });
    render(<TVDialControl scene={scene} states={states} connected={true} />);
    check(isEntityStateWatched(TV_DIAL_AUTOMATION), 'custom TV automation ID must be routed');
    check(host.querySelector('.tv-dial-marker.is-on'), 'TV power/source must remain visible');
    states[LIVING_ROOM_TV.receiver] = state(LIVING_ROOM_TV.receiver, 'off'); await signal(LIVING_ROOM_TV.receiver);
    check(!host.querySelector('.tv-dial-marker.is-on'), 'receiver updates must change TV marker');

    const balcony = installationEntity('cover.living_room_balcony');
    const roomConfig = { ...config, blinds: [{ entityId: cover }, { entityId: 'cover.other' }, { entityId: balcony }] } as AppConfig;
    states[cover] = state(cover, 'closed', { supported_features: 15, current_position: 0 });
    states['cover.other'] = state('cover.other', 'closed', { supported_features: 15 });
    render(<BlindQuickControls visible={true} entityId={cover} label="Blind" state={states[cover]} states={states} config={roomConfig} connected={true}
      anchor={null} onClose={() => {}} onOpenCover={async () => {}} onCloseCover={async () => {}} onStopCover={async () => {}} onSetPosition={async () => {}} />);
    await settle();
    check(host.textContent?.includes('Alle aufwachen'), 'closed shutters must offer wake-up action');
    states['cover.other'] = state('cover.other', 'opening', { supported_features: 15 }); await signal('cover.other');
    check(host.querySelector<HTMLButtonElement>('.blind-sleep-button')?.disabled && host.textContent?.includes('Rollos fahren'), 'other shutters must update batch movement lock');
    render(null);
    check(!isEntityStateWatched(water) && !isEntityStateWatched(id), 'all interests must clean up');
    return 'PASS: scoped React updates, StrictMode cleanup, reassignment, broadcast, Hue Sync, colors, mesh rebuilds, groups, blind attributes, water warnings, appliance dependencies, TV and shutter batch controls';
  } finally { root.unmount(); scene.dispose(); engine.dispose(); host.remove(); }
}
