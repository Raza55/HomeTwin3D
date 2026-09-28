import { test } from 'node:test';
import assert from 'node:assert/strict';
import { suggestFloorplanMatches } from '../src/services/floorplanMatching.ts';
const object = (id, label = 'Küchenspot 2', room = 'Küche') => ({ id, label, room, domain: 'light', entityId: '', position: { x: 0, y: 2, z: 0 } });
const entity = (id, name, areaName = 'Küche') => ({ entity_id: `light.${id}`, friendly_name: name, areaId: areaName, areaName });

test('TV top and back names match German fixture positions without confusing bottom', () => {
 const options=[entity('back','Hue TV back right','Wohnzimmer'),entity('top','Hue TV right top','Wohnzimmer'),entity('bottom','Hue TV right bottom','Wohnzimmer')];
 const result=suggestFloorplanMatches([object('play','Hue Play oben rechts','Wohnzimmer')],options).get('play');
 assert.equal(result[0].entity.entity_id,'light.top');
 assert.equal(result.find(p=>p.entity.entity_id==='light.bottom').automatic,false);
 const back=suggestFloorplanMatches([object('tv','TV Lightstrip Rückseite','Wohnzimmer')],options).get('tv');
 assert.equal(back[0].entity.entity_id,'light.back');
});
test('uses friendly numbering despite stale entity ID, excludes wrong domain and groups', () => {
  const result = suggestFloorplanMatches([object('a')], [entity('kuchenspot_1','Küchenspot 2'), entity('kuchenspot_2','Küchenspot 3'), { ...entity('group','Küchenspot 2'), group: true }, { ...entity('cover','Küchenspot 2'), entity_id: 'cover.kuchenspot_2' }]).get('a');
  assert.equal(result.length, 2); assert.equal(result[0].entity.entity_id, 'light.kuchenspot_1'); assert.equal(result[0].automatic, true);
});
test('ties, conflicting directions and competing fixtures never auto-match', () => {
  const entities = [entity('a','Küchenspot 2'), entity('b','Küchenspot 2')];
  assert.equal(suggestFloorplanMatches([object('a')], entities).get('a')[0].automatic, false);
  for (const proposals of suggestFloorplanMatches([object('a'),object('b')], [entities[0]]).values()) assert.equal(proposals[0].automatic, false);
  assert.equal(suggestFloorplanMatches([object('a','Küche Spot links')], [entity('a','Küche Spot rechts')]).get('a')[0].automatic,false);
});
test('confirmed room conflicts prevent auto-match, existing bindings are reserved', () => {
  const a = { ...object('a'), haAreaId: 'Bad' };
  assert.equal(suggestFloorplanMatches([a], [entity('a','Küchenspot 2')]).get('a')[0].automatic, false);
  assert.equal(suggestFloorplanMatches([object('a'),{ ...object('b'), entityId: 'light.a' }], [entity('a','Küchenspot 2')]).get('a').length, 0);
});
test('position evidence comes from containing mapped room, not arbitrary HA order', () => {
  const a = object('a', 'Wandleuchte', 'Unbekannt');
  const room = { anchor: { x:0,y:0,z:0 }, zone: { width:4,depth:4 }, haAreaIds:['Küche'] };
  const results = suggestFloorplanMatches([a], [entity('b','Wandleuchte','Bad'),entity('a','Wandleuchte')],[room]).get('a');
  assert.equal(results[0].entity.entity_id,'light.a'); assert.ok(results[0].reasons.some(r=>r.includes('Raumfläche')));
  assert.equal(results[0].automatic,true);
});
test('same device domain alone is never sufficient', () => {
  const result = suggestFloorplanMatches([object('a','Deckenpanel','Kind')], [entity('a','Schranklicht','Wohnzimmer')]).get('a');
  assert.equal(result[0].automatic,false);
});
