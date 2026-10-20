import type { ShoppingCategoryId } from './shoppingCategories';

export interface ShoppingProduct { de: string; en: string; category: ShoppingCategoryId }
const products = (category: ShoppingCategoryId, de: string, en: string): ShoppingProduct[] =>
  de.split('|').map((name, i) => ({ de: name, en: en.split('|')[i], category }));

export const shoppingProducts: ShoppingProduct[] = [
  ...products('produce', 'Äpfel|Bananen|Birnen|Orangen|Zitronen|Limetten|Erdbeeren|Heidelbeeren|Trauben|Avocado|Mango|Kiwi|Tomaten|Gurke|Paprika|Karotten|Kartoffeln|Süßkartoffeln|Zwiebeln|Knoblauch|Ingwer|Brokkoli|Blumenkohl|Zucchini|Aubergine|Champignons|Salat|Spinat|Lauch|Sellerie|Frühlingszwiebeln|Petersilie|Basilikum',
    'Apples|Bananas|Pears|Oranges|Lemons|Limes|Strawberries|Blueberries|Grapes|Avocado|Mango|Kiwi|Tomatoes|Cucumber|Peppers|Carrots|Potatoes|Sweet potatoes|Onions|Garlic|Ginger|Broccoli|Cauliflower|Courgette|Aubergine|Mushrooms|Lettuce|Spinach|Leek|Celery|Spring onions|Parsley|Basil'),
  ...products('bakery', 'Brot|Vollkornbrot|Brötchen|Toast|Baguette|Croissants|Brezeln|Wraps',
    'Bread|Wholemeal bread|Bread rolls|Toast|Baguette|Croissants|Pretzels|Wraps'),
  ...products('chilled', 'Milch|Hafermilch|Sojamilch|Joghurt|Quark|Skyr|Butter|Margarine|Sahne|Crème fraîche|Käse|Frischkäse|Mozzarella|Feta|Parmesan|Eier|Tofu|Hummus',
    'Milk|Oat milk|Soya milk|Yoghurt|Quark|Skyr|Butter|Margarine|Cream|Crème fraîche|Cheese|Cream cheese|Mozzarella|Feta|Parmesan|Eggs|Tofu|Hummus'),
  ...products('protein', 'Hähnchenbrust|Hackfleisch|Steak|Schinken|Salami|Würstchen|Speck|Lachs|Fischfilet|Garnelen',
    'Chicken breast|Minced meat|Steak|Ham|Salami|Sausages|Bacon|Salmon|Fish fillet|Prawns'),
  ...products('pantry', 'Nudeln|Spaghetti|Reis|Couscous|Bulgur|Mehl|Zucker|Salz|Pfeffer|Olivenöl|Rapsöl|Essig|Haferflocken|Müsli|Linsen|Kichererbsen|Kidneybohnen|Mais (Dose)|Passierte Tomaten|Tomatenmark|Kokosmilch|Gemüsebrühe|Backpulver|Hefe|Honig|Marmelade|Erdnussbutter|Ketchup|Senf|Sojasauce|Pesto',
    'Pasta|Spaghetti|Rice|Couscous|Bulgur|Flour|Sugar|Salt|Pepper|Olive oil|Rapeseed oil|Vinegar|Oats|Muesli|Lentils|Chickpeas|Kidney beans|Tinned sweetcorn|Passata|Tomato purée|Coconut milk|Vegetable stock|Baking powder|Yeast|Honey|Jam|Peanut butter|Ketchup|Mustard|Soy sauce|Pesto'),
  ...products('frozen', 'TK-Gemüse|TK-Spinat|TK-Erbsen|TK-Beeren|Tiefkühlpizza|Pommes (TK)|Eiscreme',
    'Frozen vegetables|Frozen spinach|Frozen peas|Frozen berries|Frozen pizza|Frozen chips|Ice cream'),
  ...products('drinks', 'Wasser|Mineralwasser|Apfelsaft|Orangensaft|Kaffee|Tee|Kakao|Cola|Limonade|Bier|Wein',
    'Water|Sparkling water|Apple juice|Orange juice|Coffee|Tea|Cocoa|Cola|Lemonade|Beer|Wine'),
  ...products('snacks', 'Schokolade|Kekse|Chips|Nüsse|Mandeln|Erdnüsse|Gummibärchen|Popcorn|Müsliriegel',
    'Chocolate|Biscuits|Crisps|Nuts|Almonds|Peanuts|Gummy bears|Popcorn|Cereal bars'),
  ...products('household', 'Toilettenpapier|Küchenrolle|Taschentücher|Müllbeutel|Spülmittel|Spülmaschinentabs|Waschmittel|Weichspüler|Allzweckreiniger|Schwämme|Backpapier|Alufolie|Frischhaltefolie|Seife|Duschgel|Shampoo|Zahnpasta|Zahnbürste|Deo|Sonnencreme|Windeln|Feuchttücher|Batterien',
    'Toilet paper|Kitchen roll|Tissues|Bin bags|Washing-up liquid|Dishwasher tablets|Laundry detergent|Fabric softener|All-purpose cleaner|Sponges|Baking paper|Aluminium foil|Cling film|Soap|Shower gel|Shampoo|Toothpaste|Toothbrush|Deodorant|Sun cream|Nappies|Wet wipes|Batteries'),
  ...products('pets', 'Katzenfutter|Katzenstreu|Hundefutter|Hundeleckerlis|Vogelfutter',
    'Cat food|Cat litter|Dog food|Dog treats|Bird food'),
];

/** Search only: never change the name or quantity that will be saved. */
export function shoppingSearchKey(value: string): string {
  return value.toLocaleLowerCase('de').replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
}
export function matchesShoppingSearch(name: string, query: string): boolean {
  const fold = (s: string) => shoppingSearchKey(s).replace(/ae/g, 'a').replace(/oe/g, 'o').replace(/ue/g, 'u');
  return fold(query).split(/\s+/).every(word => fold(name).includes(word));
}

export const shoppingSets = [
  { de: 'Frühstück', en: 'Breakfast', items: ['Brot', 'Eier', 'Butter', 'Käse', 'Marmelade', 'Kaffee'] },
  { de: 'Obstkorb', en: 'Fruit bowl', items: ['Äpfel', 'Bananen', 'Birnen', 'Orangen', 'Trauben'] },
  { de: 'Pasta-Abend', en: 'Pasta night', items: ['Spaghetti', 'Passierte Tomaten', 'Zwiebeln', 'Knoblauch', 'Parmesan', 'Basilikum'] },
  { de: 'Salat & Beilagen', en: 'Salad & sides', items: ['Salat', 'Tomaten', 'Gurke', 'Paprika', 'Feta', 'Olivenöl'] },
  { de: 'Vegetarisches Curry', en: 'Vegetarian curry', items: ['Reis', 'Kokosmilch', 'Kichererbsen', 'Brokkoli', 'Karotten', 'Ingwer'] },
  { de: 'Backvorrat', en: 'Baking basics', items: ['Mehl', 'Zucker', 'Eier', 'Butter', 'Backpulver', 'Backpapier'] },
  { de: 'Haushalt auffüllen', en: 'Household refill', items: ['Toilettenpapier', 'Küchenrolle', 'Spülmittel', 'Waschmittel', 'Müllbeutel'] },
  { de: 'Bad auffüllen', en: 'Bathroom refill', items: ['Seife', 'Duschgel', 'Shampoo', 'Zahnpasta', 'Deo'] },
] as const;

export function presetNames(set: typeof shoppingSets[number], de: boolean): string[] {
  return set.items.map(name => de ? name : shoppingProducts.find(p => p.de === name)!.en);
}
