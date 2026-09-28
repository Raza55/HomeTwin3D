import type { AppConfig, FloorplanManifest } from '../types';
import { applyFloorplanMappings, collectFloorplanBindings } from './floorplanImport';

/** Include saved owners from temporarily absent models so reimport cannot resurrect them. */
export function assignmentOwners(config: AppConfig, targetId: string) {
  return collectFloorplanBindings(config).filter(o => o.id !== targetId && o.entityId);
}

export function saveFloorplanAssignment(config: AppConfig, manifest: FloorplanManifest, targetId: string, transfer: boolean): AppConfig {
  const target = manifest.objects.find(o => o.id === targetId);
  if (!target) throw new Error('Das Zielobjekt ist nicht mehr vorhanden.');
  const owners = assignmentOwners(config, targetId).filter(o => o.entityId === target.entityId);
  // Confirming an unchanged, previously shared assignment must not break that group.
  const unchanged = config.model?.floorplan?.objects.find(o => o.id === targetId)?.entityId === target.entityId;
  if (!target.entityId || !owners.length || unchanged) return applyFloorplanMappings(config, manifest);
  if (!transfer) throw new Error('Diese Entity ist bereits zugeordnet. „Bereits zugeordnete Entities anzeigen“ aktivieren, um sie zu übernehmen.');
  const previous = structuredClone(config);
  previous.floorplanBindings = collectFloorplanBindings(config).map(o => o.id !== targetId && o.entityId === target.entityId ? { ...o, entityId: '' } : o);
  if (previous.model?.floorplan) previous.model.floorplan.objects = previous.model.floorplan.objects.map(o => o.id !== targetId && o.entityId === target.entityId ? { ...o, entityId: '' } : o);
  const next = structuredClone(manifest);
  next.objects = next.objects.map(o => o.id !== targetId && o.entityId === target.entityId ? { ...o, entityId: '' } : o);
  return applyFloorplanMappings(previous, next);
}
