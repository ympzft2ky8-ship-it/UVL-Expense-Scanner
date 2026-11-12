import { useMemo, useState } from 'react';
import { deleteDoc, doc } from 'firebase/firestore';
import { CATEGORIES, formatCents, groupBy, isValidCategory, ledgerRows, PROPERTY_TYPE_LABEL, sumRows, taxTreatment, type Property, type PropertyType } from '@uvl/shared';
import { db } from '../firebase.ts';
import { propertyTypeOf } from '../receipts.ts';
import { create, getState, newId, openYears, OVERHEAD_ID, reportError, save, useAppState } from '../store.ts';
import { Field, go, Modal, US_STATES } from '../ui.tsx';

function blankProperty(): Property {
  return { id: newId(), version: 0, createdAt: 0, createdBy: '', updatedAt: 0, updatedBy: '', name: '', type: 'rental', address: '', city: '', state: 'NY', zip: '', notes: '', purchaseDate: '', saleDate: '', inServiceDate: '', archivedAt: null };
}

const sameName = (a: string, b: string) => a.trim().replace(/\s+/g, ' ').toLowerCase() === b.trim().replace(/\s+/g, ' ').toLowerCase();

/** When a property changes type, its old categories no longer apply: clear them and flag the lines. */
async function flagCategoriesAfterTypeChange(property: Property) {
  const { receipts, properties } = getState();
  const next = properties.map((p) => (p.id === property.id ? property : p));
  for (const r of receipts) {
    if (r.deletedAt) continue;
    let touched = false;
    const flags = { ...r.flags };
    const lines = r.lines.map((l) => {
      if ((l.propertyId ?? r.propertyId) !== property.id) return l;
      const type = propertyTypeOf(l, r, next);
      if (!type || isValidCategory(type, l.category)) return l;
      touched = true;
      flags[`lines.${l.id}.category`] = 'Category needs review – the property type changed';
      return { ...l, category: null };
    });
    if (touched) await save('receipts', { ...r, lines, flags, needsAttention: true }, r);
  }
}

function PropertyForm({ initial, onClose }: { initial: Property; onClose: () => void }) {
  const { properties, receipts } = useAppState();
  const [p, setP] = useState(initial);
  const [error, setError] = useState('');
  const isNew = initial.version === 0;
  const builtIn = initial.id === OVERHEAD_ID;
  const used = receipts.some((r) => r.propertyId === initial.id || r.lines.some((l) => l.propertyId === initial.id || l.splits.some((s) => s.propertyId === initial.id)));
  const set = (change: Partial<Property>) => setP({ ...p, ...change });

  async function submit() {
    if (!p.name.trim()) return setError('Give the property a name.');
    const clash = properties.find((o) => o.id !== p.id && !o.archivedAt && sameName(o.name, p.name));
    if (clash) return setError(`There is already a property called "${clash.name}".`);
    const next = { ...p, name: p.name.trim() };
    try {
      if (isNew) create('properties', next);
      else {
        await save('properties', next, initial);
        if (next.type !== initial.type) await flagCategoriesAfterTypeChange(next);
      }
      onClose();
    } catch (e) {
      reportError(e);
    }
  }

  return (
    <Modal onClose={onClose}>
      <div className="stack" data-testid="property-form">
        <h2 style={{ marginTop: 0 }}>{isNew ? 'New property' : p.name}</h2>
        <Field label="Name" flag={error || undefined}>
          <input value={p.name} onChange={(e) => set({ name: e.target.value })} placeholder="12 Oak St" data-testid="property-name" />
        </Field>
        {!builtIn && (
          <Field label="Type">
            <select value={p.type} onChange={(e) => set({ type: e.target.value as PropertyType })} data-testid="property-type">
              <option value="rental">Rental – a property you rent out</option>
              <option value="flip">Flip – bought to renovate and sell</option>
            </select>
          </Field>
        )}
        {!builtIn && (
          <>
            <Field label="Street address">
              <input value={p.address} onChange={(e) => set({ address: e.target.value })} />
            </Field>
            <div className="grid3">
              <Field label="City">
                <input value={p.city} onChange={(e) => set({ city: e.target.value })} />
              </Field>
              <Field label="State">
                <select value={p.state} onChange={(e) => set({ state: e.target.value })}>
                  <option value="" />
                  {US_STATES.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </Field>
              <Field label="ZIP">
                <input inputMode="numeric" value={p.zip} onChange={(e) => set({ zip: e.target.value })} />
              </Field>
            </div>
            {p.type === 'flip' ? (
              <div className="grid2">
                <Field label="Purchase date">
                  <input type="date" value={p.purchaseDate} onChange={(e) => set({ purchaseDate: e.target.value })} />
                </Field>
                <Field label="Sale date">
                  <input type="date" value={p.saleDate} onChange={(e) => set({ saleDate: e.target.value })} />
                </Field>
              </div>
            ) : (
              <Field label="Date first rented out">
                <input type="date" value={p.inServiceDate} onChange={(e) => set({ inServiceDate: e.target.value })} />
              </Field>
            )}
          </>
        )}
        <Field label="Notes">
          <textarea value={p.notes} onChange={(e) => set({ notes: e.target.value })} />
        </Field>
        <button className="primary big" onClick={submit} data-testid="property-save">
          Save
        </button>
        {!isNew && !builtIn && (
          <div className="row">
            <button
              className="grow"
              onClick={() => void save('properties', { ...initial, archivedAt: initial.archivedAt ? null : Date.now() }, initial).then(onClose)}
              data-testid="property-archive"
            >
              {initial.archivedAt ? 'Bring back from archive' : 'Archive (hide from new receipts)'}
            </button>
            <button
              className="danger"
              onClick={() => {
                if (used) return setError('This property has expenses, so it cannot be deleted. Archive it instead.');
                if (confirm(`Delete "${initial.name}"?`)) void deleteDoc(doc(db, 'properties', initial.id)).then(onClose, reportError);
              }}
              data-testid="property-delete"
            >
              Delete
            </button>
          </div>
        )}
        <button className="link" onClick={onClose}>
          Cancel
        </button>
      </div>
    </Modal>
  );
}

export function Properties() {
  const state = useAppState();
  const [editing, setEditing] = useState<Property | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const year = openYears(state.years)[0]!;
  const rows = useMemo(() => ledgerRows(state.receipts, state.properties, year), [state.receipts, state.properties, year]);
  const totals = new Map([...groupBy(rows, (r) => r.propertyId ?? '').entries()].map(([id, list]) => [id, sumRows(list).totalCents]));
  const archived = state.properties.filter((p) => p.archivedAt);
  const list = state.properties.filter((p) => (showArchived ? true : !p.archivedAt));
  return (
    <div>
      <div className="row">
        <h2 className="grow" style={{ margin: 0 }}>
          Properties
        </h2>
        <button className="primary" onClick={() => setEditing(blankProperty())} data-testid="add-property">
          Add property
        </button>
      </div>
      <div className="card">
        <ul className="list" data-testid="property-list">
          {list.map((p) => (
            <li key={p.id}>
              <div className="item">
                <a className="grow" href={`#/p/${p.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                  <div className="title">{p.name}</div>
                  <div className="muted">
                    {PROPERTY_TYPE_LABEL[p.type]} {p.archivedAt && <span className="badge plain">Archived</span>} · {year}: <span className="num">{formatCents(totals.get(p.id) ?? 0)}</span>
                  </div>
                </a>
                <button onClick={() => setEditing(p)} aria-label={`Edit ${p.name}`}>
                  Edit
                </button>
              </div>
            </li>
          ))}
        </ul>
      </div>
      {archived.length > 0 && (
        <button className="link" onClick={() => setShowArchived(!showArchived)}>
          {showArchived ? 'Hide archived' : `Show ${archived.length} archived`}
        </button>
      )}
      {editing && <PropertyForm initial={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

export function PropertySummary({ id }: { id: string }) {
  const state = useAppState();
  const years = openYears(state.years);
  const [year, setYear] = useState(years[0]!);
  const property = state.properties.find((p) => p.id === id);
  const rows = useMemo(() => ledgerRows(state.receipts, state.properties, year).filter((r) => r.propertyId === id), [state.receipts, state.properties, year, id]);
  if (!property) return <p>That property is no longer here.</p>;
  const total = sumRows(rows);
  const order = CATEGORIES[property.type];
  const byCategory = [...groupBy(rows, (r) => r.category || 'No category yet').entries()].sort(([a], [b]) => (order.indexOf(a) + 1 || 99) - (order.indexOf(b) + 1 || 99));
  const kindSum = (list: typeof rows, kind: string) => sumRows(list.filter((r) => r.kind === kind)).amountCents;
  return (
    <div data-testid="property-summary">
      <button className="link" onClick={() => go('/properties')}>
        ‹ Properties
      </button>
      <div className="row">
        <h2 className="grow" style={{ margin: '0.5rem 0' }}>
          {property.name} <span className="badge plain">{PROPERTY_TYPE_LABEL[property.type]}</span>
        </h2>
        {years.length > 1 &&
          years.map((y) => (
            <button key={y} className={`chip${y === year ? ' on' : ''}`} onClick={() => setYear(y)}>
              {y}
            </button>
          ))}
      </div>
      <div className="card">
        <div className="row">
          <div className="grow">
            <div className="muted">{year} total including tax</div>
            <div className="num" style={{ fontSize: '1.5rem', fontWeight: 700 }} data-testid="property-total">
              {formatCents(total.totalCents)}
            </div>
          </div>
          <div className="right">
            <div className="muted">of which tax</div>
            <div className="num">{formatCents(total.taxCents)}</div>
          </div>
        </div>
      </div>
      <div className="card scroll-x">
        <table>
          <thead>
            <tr>
              <th>Category</th>
              <th className="right">Labor</th>
              <th className="right">Materials</th>
              <th className="right">Other</th>
              <th className="right">Tax</th>
              <th className="right">Total</th>
            </tr>
          </thead>
          <tbody>
            {byCategory.map(([category, list]) => (
              <tr key={category}>
                <td>
                  {category}
                  {order.includes(category) && <div className="muted small">{taxTreatment(property.type, category)}</div>}
                </td>
                <td className="right num">{formatCents(kindSum(list, 'labor'))}</td>
                <td className="right num">{formatCents(kindSum(list, 'materials'))}</td>
                <td className="right num">{formatCents(kindSum(list, 'other'))}</td>
                <td className="right num">{formatCents(sumRows(list).taxCents)}</td>
                <td className="right num">{formatCents(sumRows(list).totalCents)}</td>
              </tr>
            ))}
            <tr className="total">
              <td>Total</td>
              <td className="right num">{formatCents(kindSum(rows, 'labor'))}</td>
              <td className="right num">{formatCents(kindSum(rows, 'materials'))}</td>
              <td className="right num">{formatCents(kindSum(rows, 'other'))}</td>
              <td className="right num">{formatCents(total.taxCents)}</td>
              <td className="right num">{formatCents(total.totalCents)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="muted small">Labels like "Deduct this year" organize records for your accountant and are not tax advice.</p>
    </div>
  );
}
