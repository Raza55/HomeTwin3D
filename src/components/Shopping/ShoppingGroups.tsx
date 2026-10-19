import { useState, type CSSProperties } from 'react';
import { Apple, Croissant, Milk, Fish, CookingPot, Snowflake, CupSoda, Cookie, SprayCan, PawPrint, Package, Square, Tags } from 'lucide-react';
import { readStored, type ShoppingItem } from '../../services/shopping';
import { categoryFor, groupShoppingItems, shoppingCategories, shoppingProductKey, validateCategoryOverrides, type ShoppingCategoryId } from '../../services/shoppingCategories';

const icons = { produce: Apple, bakery: Croissant, chilled: Milk, protein: Fish, pantry: CookingPot, frozen: Snowflake, drinks: CupSoda, snacks: Cookie, household: SprayCan, pets: PawPrint, other: Package };
export function ShoppingCategoryIcon({ name }: { name: string }) {
  const Icon = icons[categoryFor(name, {})];
  return <Icon size={17} aria-hidden="true" />;
}

export default function ShoppingGroups({ items, list, de, disabled, onToggle }: {
  items: ShoppingItem[]; list: string; de: boolean; disabled: boolean; onToggle: (item: ShoppingItem) => void;
}) {
  const key = 'shopping.categories.' + list;
  const [overrides, setOverrides] = useState(() => validateCategoryOverrides(readStored(key, {})));
  const [warning, setWarning] = useState('');
  const groups = groupShoppingItems(items, overrides);
  function change(name: string, value: string) {
    const next = { ...overrides };
    if (value === 'auto') delete next[shoppingProductKey(name)];
    else next[shoppingProductKey(name)] = value as ShoppingCategoryId;
    setOverrides(next);
    try { localStorage.setItem(key, JSON.stringify(next)); setWarning(''); }
    catch { setWarning(de ? 'Zuordnung gilt nur für diesen Besuch: Gerätespeicher nicht verfügbar.' : 'Assignment applies to this visit only: device storage unavailable.'); }
  }
  return <>
    {warning && <p role="status" className="shopping-hint">{warning}</p>}
    {groups.map(group => {
      const Icon = icons[group.id];
      return <section key={group.id} className="shopping-group" aria-label={de ? group.de : group.en} style={{ '--group-color': group.color } as CSSProperties}>
        <h3><Icon size={21} aria-hidden="true" /><span>{de ? group.de : group.en}</span><small>{group.items.length}</small></h3>
        {group.items.map(item => <div className="shopping-group-row" key={item.uid}>
          <button className="shopping-row" type="button" role="checkbox" aria-checked={false} disabled={disabled} onClick={() => onToggle(item)}><Square size={25} aria-hidden="true" /><span>{item.summary}</span></button>
          <div className="shopping-category-picker" title={de ? 'Warengruppe ändern' : 'Change category'}>
            <Tags size={18} aria-hidden="true" />
            <select aria-label={`${de ? 'Warengruppe für' : 'Category for'} ${item.summary}`} value={Object.prototype.hasOwnProperty.call(overrides, shoppingProductKey(item.summary)) ? overrides[shoppingProductKey(item.summary)] : 'auto'} onChange={e => change(item.summary, e.target.value)}>
              <option value="auto">{de ? 'Automatisch erkennen' : 'Detect automatically'}</option>
              {shoppingCategories.map(c => <option key={c.id} value={c.id}>{de ? c.de : c.en}</option>)}
            </select>
          </div>
        </div>)}
      </section>;
    })}
  </>;
}
