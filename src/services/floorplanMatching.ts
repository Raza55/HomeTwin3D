import type { FloorplanObject, RoomConfig } from '../types';

export interface MatchEntity {
  entity_id: string;
  friendly_name?: string;
  areaId?: string;
  areaName?: string;
  deviceName?: string;
  group?: boolean;
  disabled?: boolean;
  deviceClass?: string;
}
export interface MatchProposal {
  entity: MatchEntity;
  score: number;
  reasons: string[];
  automatic: boolean;
}

const normalize = (s: string) => s.toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss');
const aliases: Record<string, string> = { kueche: 'kuechen', kitchen: 'kuechen', rollos: 'rollo', blinds: 'rollo', blind: 'rollo', strip: 'stripe', lightstrip: 'stripe', lichtleiste: 'stripe', lichtkante: 'stripe', leiste: 'stripe', left: 'links', right: 'rechts', down: 'unten', bottom: 'unten', up: 'oben', top: 'oben', back: 'hinten', rear: 'hinten', rueckseite: 'hinten', bedroom: 'schlafzimmer', sz: 'schlafzimmer', kz: 'kinderzimmer', wz: 'wohnzimmer', bad: 'badezimmer', ak: 'abstellraum' };
const stop = new Set(['light', 'cover', 'sensor', 'switch', 'media', 'player', 'lampe', 'licht', 'leuchte', 'diffusor', 'glas', 'led', 'hue', 'color', 'white', 'der', 'die', 'das']);
export function isDoorContact(entity: MatchEntity): boolean {
  return entity.entity_id.startsWith('binary_sensor.') && (!entity.deviceClass || ['door', 'window', 'opening', 'garage_door'].includes(entity.deviceClass));
}
export function matchTokens(value: string): string[] {
  const s = normalize(value).replace(/(kuechen|schlafzimmer|wohnzimmer|kinderzimmer|badezimmer|esstisch|bett|flur|spiegel|decke|rollo|spot|stripe|leiste|lampe|licht|links|rechts|oben|unten)/g, ' $1 ');
  return [...new Set(s.split(/[^a-z0-9]+/).filter(Boolean).map(t => aliases[t] ?? t).filter(t => !stop.has(t) && !/^\d{3,}$/.test(t)))];
}
function similarity(a: string, b: string): number {
  const aa = matchTokens(a), bb = new Set(matchTokens(b));
  return aa.length && bb.size ? aa.filter(t => bb.has(t)).length / Math.max(aa.length, bb.size) : 0;
}
function contains(room: RoomConfig, o: FloorplanObject): boolean {
  const x = o.position.x - room.anchor.x, z = o.position.z - room.anchor.z;
  const angle = (room.zone.rotationY ?? 0) * Math.PI / 180;
  const px = x * Math.cos(angle) - z * Math.sin(angle), pz = x * Math.sin(angle) + z * Math.cos(angle);
  const pts = room.zone.points;
  if (!pts || pts.length < 3) return Math.abs(px) <= room.zone.width / 2 && Math.abs(pz) <= room.zone.depth / 2;
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i], b = pts[j];
    if ((a.z > pz) !== (b.z > pz) && px < (b.x-a.x)*(pz-a.z)/(b.z-a.z)+a.x) inside = !inside;
  }
  return inside;
}

/** Scores are evidence weights, not probabilities. Never infer HA coordinates from names. */
export function suggestFloorplanMatches(objects: FloorplanObject[], entities: MatchEntity[], rooms: RoomConfig[] = []): Map<string, MatchProposal[]> {
  const used = new Set(objects.map(o => o.entityId).filter(Boolean));
  const byId = new Map(entities.map(e => [e.entity_id, e]));
  const result = new Map<string, MatchProposal[]>();
  for (const o of objects.filter(o => !o.entityId)) {
    const tokens = matchTokens(o.label);
    const zones = rooms.filter(r => contains(r, o));
    const spatialAreas = new Set(zones.flatMap(r => r.haAreaIds));
    // A nearby assigned fixture is weak evidence only; walls and multi-use rooms can intervene.
    const neighbors = objects.filter(n => n.id !== o.id && n.entityId && n.room && n.room === o.room)
      .map(n => ({ entity: byId.get(n.entityId), distance: Math.hypot(n.position.x-o.position.x, n.position.z-o.position.z) }))
      .filter(n => n.entity?.areaId && n.distance < 2).sort((a,b) => a.distance-b.distance);
    const nearestArea = neighbors[0]?.entity?.areaId;
    const proposals = entities.filter(e => (o.door ? isDoorContact(e) : o.appliance ? /^(sensor|binary_sensor|switch|input_boolean)\./.test(e.entity_id) : e.entity_id.startsWith(`${o.domain}.`)) && !e.disabled && !e.group && !used.has(e.entity_id)).map(entity => {
      const reasons: string[] = [];
      // Friendly names are authoritative for numbering (HA entity IDs often have stale numbers).
      const name = entity.friendly_name || entity.entity_id.split('.')[1];
      const other = matchTokens(name);
      const nameScore = Math.max(similarity(o.label, name), similarity(o.label, entity.deviceName ?? '') * .8);
      let score = Math.round(nameScore * 65);
      if (nameScore) reasons.push(`Name: ${Math.round(nameScore*100)} % Übereinstimmung`);
      if (o.appliance) {
        const operating = /l[äa]uft|running|operating|in_progress/i.test(name+' '+entity.entity_id);
        if(operating && nameScore > .2) { score += 35; reasons.push('Betriebssignal'); }
        if(/door|lock|t[üu]r|economy|stecker/i.test(name)) score -= 35;
      }
      let conflict = false;
      for (const [a,b] of [['links','rechts'], ['oben','unten']]) {
        if ((tokens.includes(a) && other.includes(b)) || (tokens.includes(b) && other.includes(a))) { score -= 50; conflict = true; reasons.push('Widersprüchliche Richtung'); }
      }
      const numbers = tokens.filter(t => /^\d+$/.test(t));
      const otherNumbers = other.filter(t => /^\d+$/.test(t));
      if (numbers.length && otherNumbers.length && !numbers.some(n => otherNumbers.includes(n))) { score -= 45; conflict = true; reasons.push('Abweichende Nummer'); }
      if (o.haAreaId && entity.areaId) {
        if (o.haAreaId === entity.areaId) { score += 30; reasons.push('Bestätigter HA-Raum'); }
        else { score -= 55; conflict = true; reasons.push('Anderer HA-Raum'); }
      } else if (entity.areaName && o.room && similarity(o.room, entity.areaName) >= .5) { score += 25; reasons.push(`Raum: ${entity.areaName}`); }
      if (entity.areaId && spatialAreas.has(entity.areaId)) { score += 20; reasons.push('Position liegt in zugeordneter Raumfläche'); }
      else if (entity.areaId && nearestArea === entity.areaId) { score += 8; reasons.push('Nähe zu bestätigtem Objekt desselben Planraums'); }
      if (!reasons.length) reasons.push('Nur gleicher Gerätetyp – keine eindeutige Zuordnung');
      return { entity, score: Math.max(0, Math.min(100, score)), reasons, automatic: !conflict && nameScore >= .55 };
    }).sort((a,b) => b.score-a.score || a.entity.entity_id.localeCompare(b.entity.entity_id));
    proposals.forEach((p,i) => { p.automatic = p.automatic && i === 0 && p.score >= 75 && p.score - (proposals[1]?.score ?? 0) >= 15; });
    result.set(o.id, proposals.slice(0,3));
  }
  // Competing objects must never win the same entity in one batch.
  const winners = new Map<string, number>();
  for (const p of result.values()) if (p[0]) winners.set(p[0].entity.entity_id, (winners.get(p[0].entity.entity_id) ?? 0) + 1);
  for (const p of result.values()) if (p[0] && (winners.get(p[0].entity.entity_id) ?? 0) > 1) { p[0].automatic = false; p[0].reasons.push('Auch für ein anderes Planobjekt vorgeschlagen'); }
  return result;
}
