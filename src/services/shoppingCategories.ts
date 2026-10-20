import type { ShoppingItem } from './shopping';
import { shoppingProducts } from './shoppingPresets.ts';

export const shoppingCategories = [
  { id: 'produce', de: 'Obst & Gemüse', en: 'Fruit & vegetables', color: '#65b97c' },
  { id: 'bakery', de: 'Brot & Backwaren', en: 'Bread & bakery', color: '#d7aa66' },
  { id: 'chilled', de: 'Kühlregal & Eier', en: 'Chilled & eggs', color: '#75b8df' },
  { id: 'protein', de: 'Fleisch & Fisch', en: 'Meat & fish', color: '#df9189' },
  { id: 'pantry', de: 'Vorrat & Kochen', en: 'Pantry & cooking', color: '#c5ac72' },
  { id: 'frozen', de: 'Tiefkühlkost', en: 'Frozen food', color: '#8dcbd8' },
  { id: 'drinks', de: 'Getränke', en: 'Drinks', color: '#a29cdf' },
  { id: 'snacks', de: 'Süßes & Snacks', en: 'Sweets & snacks', color: '#d79bc5' },
  { id: 'household', de: 'Haushalt & Drogerie', en: 'Household & care', color: '#9bb5be' },
  { id: 'pets', de: 'Tierbedarf', en: 'Pet supplies', color: '#c4a28b' },
  { id: 'other', de: 'Sonstiges', en: 'Other', color: '#a5abb7' },
] as const;
export type ShoppingCategoryId = typeof shoppingCategories[number]['id'];
export type CategoryOverrides = Record<string, ShoppingCategoryId>;

function normalize(name: string) {
  return name.toLocaleLowerCase('de').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ß/g, 'ss').replace(/[^a-z0-9,\.]+/g, ' ').trim();
}
/** Remember products across common leading quantities, without changing their actual titles. */
export function shoppingProductKey(name: string): string {
  return normalize(name).replace(/^(?:\d+(?:[.,]\d+)?\s*(?:x\s*)?(?:(?:kg|g|mg|ml|cl|l|liter|litre|packung(?:en)?|pack(?:s)?|stuck|stk|bund|dose(?:n)?|flasche(?:n)?)\b\s*)?)+/i, '').trim();
}

// Specific products first. Word boundaries keep e.g. Eisbergsalat out of frozen food.
const rules: [ShoppingCategoryId, RegExp][] = [
  ['pets', /\b(?:katzen\w*|hunde\w*|tierfutter|vogelfutter|cat food|dog food|cat litter)\b/],
  ['household', /\b(?:spul\w*|waschmittel|weichspuler|reiniger|allzweckreiniger|seife|shampoo|duschgel|zahnpasta|zahnburste\w*|toilettenpapier|klopapier|kuchenrolle\w*|mullbeutel|windeln|deo|batterien|soap|detergent|toilet paper|toothpaste)\b/],
  ['frozen', /\b(?:tk|tiefkuhl\w*|gefroren\w*|frozen|eis|eiscreme|speiseeis|ice cream)\b/],
  ['snacks', /\b(?:schokolade|milchschokolade|schokoriegel|butterkekse|kekse|chips|gummibarchen|bonbons|popcorn|nusse|mandeln|erdnusse|chocolate|cookies|biscuits|nuts|sweets)\b/],
  ['pantry', /\b(?:tomatenmark|passierte tomaten|dosentomaten|kokosmilch|nudeln|pasta|spaghetti|reis|mehl|zucker|salz|pfeffer|olivenol|sonnenblumenol|essig|gewurz\w*|musli|haferflocken|linsen|kichererbsen|konserve\w*|honig|marmelade|ketchup|senf|rice|flour|sugar|salt|oats|cereal|oil|canned\w*)\b/],
  ['drinks', /\b(?:wasser|mineralwasser|sprudel|saft|orangensaft|apfelsaft|limonade|cola|kaffee|tee|bier|wein|sekt|water|juice|coffee|tea|beer|wine)\b/],
  ['chilled', /\b(?:milch|hafermilch|sojamilch|mandelmilch|haferdrink|sojadrink|joghurt|jogurt|quark|skyr|butter|margarine|sahne|kase|frischkase|gouda|mozzarella|feta|eier|ei|tofu|hummus|milk|oat milk|yogurt|yoghurt|cheese|cream|eggs?)\b/],
  ['protein', /\b(?:fleisch|hackfleisch|hack|hahnchen|huhn|pute|rind\w*|schwein\w*|steak|wurst|wurstchen|schinken|salami|speck|fisch|lachs|thunfisch|garnelen|chicken|beef|pork|fish|salmon|ham|bacon|sausages?)\b/],
  ['bakery', /\b(?:brot|vollkornbrot|toast|toastbrot|brotchen|semmeln|brezel\w*|baguette|croissant\w*|kuchen|tortilla\w*|bread|rolls|bagels)\b/],
  ['produce', /\b(?:apfel|apfeln|bananen?|birnen?|orangen?|mandarinen?|zitronen?|limetten?|trauben|erdbeeren?|himbeeren?|blaubeeren?|heidelbeeren?|beeren|avocados?|mango\w*|kiwis?|tomaten?|gurken?|paprika|karotten?|mohren?|kartoffeln?|zwiebeln?|knoblauch|salat|eisbergsalat|spinat|brokkoli|blumenkohl|zucchini|auberginen?|pilze|champignons|lauch|sellerie|ingwer|krauter|apples?|bananas?|oranges?|lemons?|tomatoes|cucumber|carrots?|potatoes|onions?|lettuce|spinach|broccoli|mushrooms?)\b/],
];

export function detectShoppingCategory(name: string): ShoppingCategoryId {
  const product = shoppingProductKey(name);
  const known = shoppingProducts.find(p => shoppingProductKey(p.de) === product || shoppingProductKey(p.en) === product);
  if (known) return known.category;
  const key = normalize(name);
  return rules.find(([, pattern]) => pattern.test(key))?.[0] ?? 'other';
}
export function categoryFor(name: string, overrides: CategoryOverrides): ShoppingCategoryId {
  const override = Object.prototype.hasOwnProperty.call(overrides, shoppingProductKey(name)) ? overrides[shoppingProductKey(name)] : undefined;
  return shoppingCategories.some(c => c.id === override) ? override! : detectShoppingCategory(name);
}
export function validateCategoryOverrides(value: unknown): CategoryOverrides {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter(([key, id]) => key.length <= 200 && shoppingCategories.some(c => c.id === id))) as CategoryOverrides;
}
export function groupShoppingItems(items: ShoppingItem[], overrides: CategoryOverrides) {
  return shoppingCategories.map(category => ({ ...category, items: items.filter(item => categoryFor(item.summary, overrides) === category.id) })).filter(group => group.items.length > 0);
}
