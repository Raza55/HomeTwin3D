import type { LightConfig, FloorplanObject } from '../types';

export const isEnsis = (label: string) => /ensis|hue[ _]+pendel/i.test(label);
export const ensisChannel = (label: string) => /(?:up|oben|deckenlicht)/i.test(label) ? 'Oben' : 'Unten';

/** Explicit groups win; automatic clusters require a matching fixture name and proximity. */
export function quickLightCluster(lights: LightConfig[], entityId: string): LightConfig[] {
  const selected = lights.find(l=>l.entityId===entityId);
  if(!selected) return [];
  const family=(label:string)=>label.toLowerCase().replace(/ü/g,'ue').replace(/\d+|diffusor|hue|[_\s.-]/g,'');
  const candidates = selected.group ? lights.filter(l=>l.group===selected.group)
    : isEnsis(selected.label) ? lights.filter(l=>isEnsis(l.label) && Math.hypot(l.position.x-selected.position.x,l.position.y-selected.position.y,l.position.z-selected.position.z)<.5)
    : /spot/i.test(selected.label) ? lights.filter(l=>family(l.label)===family(selected.label) && Math.hypot(l.position.x-selected.position.x,l.position.y-selected.position.y,l.position.z-selected.position.z)<=.85) : [selected];
  return candidates.length<=8 ? candidates.sort((a,b)=>a.label.localeCompare(b.label,'de',{numeric:true})) : [selected];
}

/** Include both physical Ensis channels even when only one has an HA assignment. */
export function lightMappingTargets(objects: FloorplanObject[], members: LightConfig[]): string[] {
  const lights = objects.filter(o => o.domain === 'light');
  const selected = lights.filter(o => members.some(m => m.floorplanIds?.includes(o.id) || (!!o.entityId && o.entityId === m.entityId)));
  return lights.filter(o => selected.includes(o) || (isEnsis(o.label) && selected.some(s =>
    isEnsis(s.label) && s.room === o.room && Math.hypot(s.position.x-o.position.x,s.position.y-o.position.y,s.position.z-o.position.z)<.5
  ))).map(o => o.id);
}
