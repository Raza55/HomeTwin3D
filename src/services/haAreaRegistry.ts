import type { HAConnectOptions } from './haWebSocket';
import { HAConnection } from './haWebSocket';
import type { HAState } from '../types';
import type { HAEntityOption } from '../components/EntityPicker';

export interface HAAreaRegistryEntry {
  area_id: string;
  name: string;
  floor_id?: string | null;
  picture?: string | null;
}

interface HADeviceRegistryEntry {
  id: string;
  area_id?: string | null;
  name?: string | null;
  name_by_user?: string | null;
  manufacturer?: string | null;
  model?: string | null;
}

interface HAEntityRegistryEntry {
  entity_id: string;
  area_id?: string | null;
  device_id?: string | null;
  name?: string | null;
  original_name?: string | null;
  platform?: string | null;
  entity_category?: string | null;
  disabled_by?: string | null;
  hidden_by?: string | null;
}

export interface HARoomEntity extends HAEntityOption {
  area_id: string;
  device_id?: string;
  device_name?: string;
  domain: string;
  state?: string;
  attributes: Record<string, unknown>;
  entity_category?: string;
  platform?: string;
  disabled?: boolean;
  hidden?: boolean;
}

export interface HAAreaDiscovery {
  areas: HAAreaRegistryEntry[];
  entities: HARoomEntity[];
  entityOptions: HAEntityOption[];
}

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : [];
}

/** Read HA registries without modifying Home Assistant. */
export function discoverHAAreas(options: HAConnectOptions): Promise<HAAreaDiscovery> {
  return new Promise((resolve, reject) => {
    let started = false;
    let settled = false;
    let connection: HAConnection;
    const timeout = window.setTimeout(() => {
      finish(undefined, new Error('Home Assistant area discovery timed out'));
    }, 20000);

    const finish = (result?: HAAreaDiscovery, error?: Error) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      connection.dispose();
      if (error) reject(error);
      else resolve(result!);
    };

    connection = new HAConnection(options, {
      onStatusChanged: (status) => {
        if (status === 'auth_error') {
          finish(undefined, new Error('Home Assistant authentication failed'));
          return;
        }
        if (status !== 'connected' || started) return;
        started = true;

        void Promise.all([
          connection.request({ type: 'config/area_registry/list' }),
          connection.request({ type: 'config/device_registry/list' }),
          connection.request({ type: 'config/entity_registry/list' }),
          connection.request({ type: 'get_states' }),
        ]).then(([areaResult, deviceResult, entityResult, stateResult]) => {
          const areas = asArray<HAAreaRegistryEntry>(areaResult)
            .filter((area) => Boolean(area.area_id && area.name))
            .sort((a, b) => a.name.localeCompare(b.name));
          const devices = asArray<HADeviceRegistryEntry>(deviceResult);
          const registryEntities = asArray<HAEntityRegistryEntry>(entityResult);
          const states = asArray<HAState>(stateResult);
          const deviceById = new Map(devices.map((device) => [device.id, device]));
          const stateById = new Map(states.map((state) => [state.entity_id, state]));

          const entities = registryEntities.flatMap<HARoomEntity>((entity) => {
            const device = entity.device_id ? deviceById.get(entity.device_id) : undefined;
            const areaId = entity.area_id || device?.area_id;
            if (!areaId) return [];
            const state = stateById.get(entity.entity_id);
            const friendlyName = state?.attributes.friendly_name as string | undefined;
            return [{
              entity_id: entity.entity_id,
              friendly_name: entity.name || friendlyName || entity.original_name || undefined,
              area_id: areaId,
              device_id: entity.device_id || undefined,
              device_name: device?.name_by_user || device?.name || undefined,
              domain: entity.entity_id.split('.')[0] || '',
              state: state?.state,
              attributes: state?.attributes ?? {},
              entity_category: entity.entity_category || undefined,
              platform: entity.platform || undefined,
              disabled: Boolean(entity.disabled_by),
              hidden: Boolean(entity.hidden_by),
            }];
          }).sort((a, b) => (
            a.area_id.localeCompare(b.area_id)
            || (a.friendly_name || a.entity_id).localeCompare(b.friendly_name || b.entity_id)
          ));

          const entityOptions = states
            .map((state) => ({
              entity_id: state.entity_id,
              friendly_name: state.attributes.friendly_name as string | undefined,
            }))
            .sort((a, b) => a.entity_id.localeCompare(b.entity_id));

          finish({ areas, entities, entityOptions });
        }).catch((error: unknown) => {
          finish(undefined, error instanceof Error ? error : new Error(String(error)));
        });
      },
    });

    connection.connect();
  });
}
