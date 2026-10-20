import { useState } from 'react';
import { Plus, Check, PackageOpen } from 'lucide-react';
import { shoppingProducts, shoppingSets, presetNames, matchesShoppingSearch } from '../../services/shoppingPresets';
import { shoppingCategories, shoppingProductKey } from '../../services/shoppingCategories';
import { parseShoppingInput, type ShoppingItem } from '../../services/shopping';

export default function ShoppingPresets({ de, items, draft, disabled, onPrepare, onReview }: {
  de: boolean; items: ShoppingItem[]; draft: string; disabled: boolean; onPrepare: (names: string[]) => void; onReview: () => void;
}) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [limit, setLimit] = useState(18);
  const included = new Set([...items.filter(i => i.status === 'needs_action').map(i => i.summary), ...parseShoppingInput(draft)].map(shoppingProductKey));
  const missing = (names: string[]) => names.filter(name => !included.has(shoppingProductKey(name)));
  const products = shoppingProducts.filter(p => (!category || category === p.category) && matchesShoppingSearch(de ? p.de : p.en, query));
  return <details className="shopping-presets">
    <summary><PackageOpen size={20} aria-hidden="true" /> {de ? 'Artikelkatalog & Einkaufssets' : 'Product catalogue & shopping sets'}</summary>
    <p className="shopping-hint">{de ? 'Auswählen → oben prüfen, Mengen ergänzen und hinzufügen. Vorhandene Artikel werden übersprungen.' : 'Choose → review above, adjust quantities and add. Existing items are skipped.'}</p>
    {!!parseShoppingInput(draft).length && <button className="shopping-review-draft" type="button" onClick={onReview}>{de ? 'Auswahl prüfen' : 'Review selection'} ({parseShoppingInput(draft).length})</button>}
    <div className="shopping-set-buttons">{shoppingSets.map(set => {
      const names = missing(presetNames(set, de));
      return <button key={set.en} type="button" disabled={disabled || !names.length} onClick={() => onPrepare(names)}>
        <Plus size={16} aria-hidden="true" />{de ? set.de : set.en}<small>{names.length}</small>
      </button>;
    })}</div>
    <div className="shopping-catalogue-filters">
      <label>{de ? 'Artikel suchen' : 'Find products'}<input type="search" value={query} placeholder={de ? 'z. B. Hafer, Käse, Zahnpasta' : 'e.g. oats, cheese, toothpaste'} onChange={e => { setQuery(e.target.value); setLimit(18); }} /></label>
      <label>{de ? 'Warengruppe' : 'Category'}<select aria-label={de ? 'Warengruppe' : 'Category'} value={category} onChange={e => { setCategory(e.target.value); setLimit(18); }}>
        <option value="">{de ? 'Alle Warengruppen' : 'All categories'}</option>
        {shoppingCategories.filter(c => c.id !== 'other').map(c => <option key={c.id} value={c.id}>{de ? c.de : c.en}</option>)}
      </select></label>
    </div>
    <div className="shopping-catalogue-products">{products.slice(0, limit).map(product => {
      const name = de ? product.de : product.en, exists = included.has(shoppingProductKey(name));
      return <button key={product.en} type="button" disabled={disabled || exists} onClick={() => onPrepare([name])}>{exists ? <Check size={16} /> : <Plus size={16} />} {name}</button>;
    })}</div>
    {!products.length && <p>{de ? 'Kein Treffer. Eigene Artikel kannst du oben frei eingeben.' : 'No match. You can enter any product above.'}</p>}
    {products.length > limit && <button type="button" onClick={() => setLimit(n => n + 24)}>{de ? 'Weitere Artikel' : 'More products'} ({products.length - limit})</button>}
  </details>;
}
