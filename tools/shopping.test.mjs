import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseShoppingInput, learnPurchase, shoppingSuggestions, fetchShoppingLists, fetchShoppingItems, addShoppingItem, readItems, readPurchases } from '../src/services/shopping.ts';
import { detectShoppingCategory, categoryFor, shoppingProductKey, groupShoppingItems, validateCategoryOverrides } from '../src/services/shoppingCategories.ts';
import { shoppingProducts, shoppingSets, presetNames, matchesShoppingSearch } from '../src/services/shoppingPresets.ts';

test('expanded catalogue has unique bilingual products and matching categories', () => {
  assert.ok(shoppingProducts.length >= 150);
  for (const language of ['de', 'en']) {
    assert.equal(new Set(shoppingProducts.map(p => p[language])).size, shoppingProducts.length);
    for (const product of shoppingProducts) {
      assert.ok(product[language]);
      assert.equal(detectShoppingCategory(product[language]), product.category, product[language]);
    }
  }
  for (const set of shoppingSets) {
    assert.equal(presetNames(set, false).length, set.items.length);
    assert.ok(presetNames(set, false).every(Boolean));
  }
});
test('search supports umlauts, ASCII equivalents and multiple words without changing names', () => {
  for (const query of ['Käse', 'Kaese', 'kase']) assert.ok(matchesShoppingSearch('Frischkäse', query));
  assert.ok(matchesShoppingSearch('Äpfel', 'apfel'));
  assert.ok(matchesShoppingSearch('Crème fraîche', 'creme'));
  assert.ok(matchesShoppingSearch('Frozen vegetables', 'veg fro'));
  assert.equal(matchesShoppingSearch('Milch', 'Brot'), false);
  assert.deepEqual(shoppingSuggestions([], [], 'kaese', ['Frischkäse']), ['Frischkäse']);
});

test('categories recognize German and English products and avoid misleading substrings', () => {
  const examples = { '2 kg Äpfel': 'produce', 'Eisbergsalat': 'produce', 'Vollkornbrot': 'bakery', '6 Eier': 'chilled', 'Hafermilch': 'chilled', '500 g Hackfleisch': 'protein', 'Kokosmilch': 'pantry', 'Tomatenmark': 'pantry', 'TK-Spinat': 'frozen', 'Mineralwasser': 'drinks', 'Butterkekse': 'snacks', 'Milchschokolade': 'snacks', 'Spülmittel': 'household', 'Katzenfutter': 'pets', 'oat milk': 'chilled', 'ice cream': 'frozen', 'carrots': 'produce', 'toilet paper': 'household', 'Unbekanntes Markenprodukt': 'other' };
  for (const [name, expected] of Object.entries(examples)) assert.equal(detectShoppingCategory(name), expected, name);
});
test('category corrections survive quantity changes and can fall back to automatic detection', () => {
  assert.equal(shoppingProductKey('2 x 500 g Bio Äpfel'), 'bio apfel');
  assert.equal(shoppingProductKey('1,5 l Milch'), 'milch');
  assert.equal(shoppingProductKey('6 Eier'), 'eier');
  assert.equal(categoryFor('2 l Milch', { milch: 'drinks' }), 'drinks');
  assert.equal(categoryFor('2 l Milch', {}), 'chilled');
  assert.deepEqual(validateCategoryOverrides({ milch: 'drinks', wrong: 'invalid' }), {milch:'drinks'});
  assert.deepEqual(validateCategoryOverrides(null), {});
});
test('grouping has a stable aisle order and preserves all items and their identifiers', () => {
  const items = ['Wasser', 'Brot', 'Äpfel', 'unbekannt', 'Milch'].map((summary, n) => ({ uid: String(n), summary, status: 'needs_action' }));
  const groups = groupShoppingItems(items, {});
  assert.deepEqual(groups.map(g => g.id), ['produce', 'bakery', 'chilled', 'drinks', 'other']);
  assert.deepEqual(groups.flatMap(g => g.items).map(i => i.uid).sort(), items.map(i => i.uid).sort());
  assert.deepEqual(groupShoppingItems([], {}), []);
});

test('batch input preserves decimal quantities and product names with und, deduplicates', () => {
  assert.deepEqual(parseShoppingInput(' Milch, Brot; milch\n1,5 l Wasser,2 Eier\nObst und Gemüse'), ['Milch', 'Brot', '1,5 l Wasser', '2 Eier', 'Obst und Gemüse']);
  assert.deepEqual(parseShoppingInput(' , ;\n'), []);
});
test('frequent purchases rank first, completed items return, open items are excluded', () => {
  let history = learnPurchase([], 'Milch', 1);
  history = learnPurchase(history, 'Brot', 2);
  history = learnPurchase(history, 'milch', 3);
  assert.equal(history.find(p => p.name === 'milch').count, 2);
  assert.deepEqual(shoppingSuggestions(history, [], '', ['Eier']), ['milch', 'Brot', 'Eier']);
  assert.deepEqual(shoppingSuggestions(history, [{uid:'1',summary:'Milch',status:'needs_action'}, {uid:'2',summary:'Butter',status:'completed'}], 'b', []), ['Brot', 'Butter']);
});
test('corrupt browser storage is ignored', () => {
  globalThis.localStorage = { getItem: () => '{broken' };
  assert.deepEqual(readItems('test'), []);
  globalThis.localStorage.getItem = () => JSON.stringify([{uid: 3}, {name: 'x', count: -1, last: 0}]);
  assert.deepEqual(readItems('test'), []); assert.deepEqual(readPurchases('test'), []);
  delete globalThis.localStorage;
});
test('HA list discovery respects capabilities and availability', async () => {
  const conn = {request: async () => [{entity_id:'todo.groceries',state:'2',attributes:{friendly_name:'Groceries',supported_features:5}}, {entity_id:'todo.offline',state:'unavailable'}, {entity_id:'light.test',state:'on'}]};
  const lists = await fetchShoppingLists(conn);
  assert.equal(lists.length, 2); assert.equal(lists[0].features, 5); assert.equal(lists[1].available, false);
});
test('HA service response is requested and validated, errors are not empty lists', async () => {
  const items = [{uid:'abc',summary:'Milk',status:'needs_action'}];
  const conn = {request: async msg => { assert.equal(msg.return_response, true); assert.deepEqual(msg.target, {entity_id:'todo.test'}); return {response:{'todo.test':{items}}}; }};
  assert.deepEqual(await fetchShoppingItems(conn, 'todo.test'), items);
  await assert.rejects(fetchShoppingItems({request: async () => ({})}, 'todo.test'));
  await assert.rejects(fetchShoppingItems({request: async () => { throw new Error('Offline'); }}, 'todo.test'));
});
test('duplicate open items are skipped and completed ones updated by UID', async () => {
  const calls = []; const conn = {callService: async (...args) => calls.push(args)};
  await addShoppingItem(conn, 'todo.test', 'MILK', [{uid:'a',summary:'Milk',status:'needs_action'}], true);
  assert.equal(calls.length, 0);
  await addShoppingItem(conn, 'todo.test', 'Milk', [{uid:'b',summary:'Milk',status:'completed'}], true);
  assert.deepEqual(calls.pop(), ['todo','update_item','todo.test',{item:'b',status:'needs_action'}]);
  await addShoppingItem(conn, 'todo.test', 'Bread', [], false);
  assert.deepEqual(calls.pop(), ['todo','add_item','todo.test',{item:'Bread'}]);
});
