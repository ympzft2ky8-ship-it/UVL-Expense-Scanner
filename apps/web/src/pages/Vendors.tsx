import { useMemo, useState } from 'react';
import { formatCents, groupBy, ledgerRows, normalizeVendorName, sumRows, type Vendor } from '@uvl/shared';
import { mergeVendors } from '../receipts.ts';
import { openYears, reportError, save, useAppState } from '../store.ts';
import { Field, go, Modal } from '../ui.tsx';

function VendorForm({ initial, onClose }: { initial: Vendor; onClose: () => void }) {
  const { vendors } = useAppState();
  const [v, setV] = useState(initial);
  const [mergeInto, setMergeInto] = useState('');
  const set = (change: Partial<Vendor>) => setV({ ...v, ...change });
  return (
    <Modal onClose={onClose}>
      <div className="stack" data-testid="vendor-form">
        <h2 style={{ marginTop: 0 }}>{initial.name}</h2>
        <Field label="Name">
          <input value={v.name} onChange={(e) => set({ name: e.target.value })} />
        </Field>
        <Field label="Address">
          <input value={v.address} onChange={(e) => set({ address: e.target.value })} />
        </Field>
        <div className="grid2">
          <Field label="Phone">
            <input type="tel" value={v.phone} onChange={(e) => set({ phone: e.target.value })} />
          </Field>
          <Field label="Email">
            <input type="email" value={v.email} onChange={(e) => set({ email: e.target.value })} />
          </Field>
        </div>
        <Field label="Website">
          <input value={v.website} onChange={(e) => set({ website: e.target.value })} />
        </Field>
        <button className="primary big" onClick={() => void save('vendors', { ...v, name: v.name.trim() || initial.name, normalizedName: normalizeVendorName(v.name || initial.name) }, initial).then(onClose, reportError)}>
          Save
        </button>
        {vendors.length > 1 && (
          <div className="card stack">
            <h3>Same vendor listed twice?</h3>
            <select value={mergeInto} onChange={(e) => setMergeInto(e.target.value)} aria-label="Merge into" data-testid="merge-into">
              <option value="">Merge "{initial.name}" into…</option>
              {vendors
                .filter((o) => o.id !== initial.id)
                .map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
            </select>
            <button
              disabled={!mergeInto}
              onClick={() => {
                const into = vendors.find((o) => o.id === mergeInto);
                if (into && confirm(`Move all receipts from "${initial.name}" to "${into.name}" and remove "${initial.name}"?`)) void mergeVendors(initial, into).then(onClose, reportError);
              }}
              data-testid="merge-button"
            >
              Merge
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

export function Vendors() {
  const state = useAppState();
  const [editing, setEditing] = useState<Vendor | null>(null);
  const year = openYears(state.years)[0]!;
  const rows = useMemo(() => ledgerRows(state.receipts, state.properties, year), [state.receipts, state.properties, year]);
  const idByReceipt = new Map(state.receipts.map((r) => [r.id, r.vendorId ?? '']));
  const totals = new Map([...groupBy(rows, (r) => idByReceipt.get(r.receiptId) ?? '').entries()].map(([id, list]) => [id, sumRows(list).totalCents]));
  return (
    <div>
      <button className="link" onClick={() => go('/settings')}>
        ‹ Settings
      </button>
      <h2>Vendors</h2>
      <div className="card">
        {state.vendors.length === 0 ? (
          <p className="muted">Vendors are added automatically as you save receipts.</p>
        ) : (
          <ul className="list" data-testid="vendor-list">
            {state.vendors.map((v) => (
              <li key={v.id}>
                <div className="item">
                  <div className="grow">
                    <div className="title">{v.name}</div>
                    <div className="muted">
                      {[v.phone, v.email].filter(Boolean).join(' · ') || 'No contact details'} · {year}: <span className="num">{formatCents(totals.get(v.id) ?? 0)}</span>
                    </div>
                  </div>
                  <button onClick={() => setEditing(v)}>Edit</button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
      {editing && <VendorForm initial={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
