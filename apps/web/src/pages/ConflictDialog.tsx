import { useState } from 'react';
import { formatCents } from '@uvl/shared';
import { resolveConflict, useAppState, type PendingConflict } from '../store.ts';
import { Modal } from '../ui.tsx';

const LABELS: Record<string, string> = {
  date: 'Date',
  vendorName: 'Vendor',
  vendorAddress: 'Vendor address',
  vendorPhone: 'Vendor phone',
  vendorEmail: 'Vendor email',
  invoiceNo: 'Invoice number',
  subtotalCents: 'Subtotal',
  taxCents: 'Tax',
  totalCents: 'Total',
  taxState: 'State',
  propertyId: 'Property',
  lines: 'Line items',
  notes: 'Notes',
  paymentMethod: 'Payment method',
  name: 'Name',
  type: 'Type',
  address: 'Address',
  phone: 'Phone',
  email: 'Email',
  deletedAt: 'Deleted',
  status: 'Status',
  flags: 'Fields to check',
  needsAttention: 'Needs attention',
};

function show(field: string, value: unknown, propertyName: (id: string) => string): string {
  if (value === null || value === undefined || value === '') return '(empty)';
  if (field.endsWith('Cents') && typeof value === 'number') return formatCents(value);
  if (field === 'propertyId') return propertyName(String(value));
  if (field === 'lines' && Array.isArray(value)) {
    const total = value.reduce((a: number, l: { amountCents?: number }) => a + (l.amountCents ?? 0), 0);
    return `${value.length} line${value.length === 1 ? '' : 's'}, ${formatCents(total)}`;
  }
  if (field === 'deletedAt') return 'Yes';
  if (typeof value === 'object') return 'Changed';
  return String(value);
}

/** Both members changed the same field: show both versions and let the member choose. */
export function ConflictDialog({ conflict }: { conflict: PendingConflict }) {
  const { properties } = useAppState();
  const [choices, setChoices] = useState<Record<string, 'mine' | 'theirs'>>({});
  const propertyName = (id: string) => properties.find((p) => p.id === id)?.name ?? id;
  const who = conflict.theirs.updatedBy || 'the other phone';
  const done = conflict.conflicts.every((c) => choices[c.field]);
  return (
    <Modal>
      <div className="stack" data-testid="conflict-dialog">
        <h2 style={{ marginTop: 0 }}>Changed on both phones</h2>
        <p className="muted">While you were editing, {who} changed the same record. Pick which value to keep for each field.</p>
        {conflict.conflicts.map((c) => (
          <div className="card" key={c.field}>
            <h3>{LABELS[c.field] ?? c.field}</h3>
            {(['mine', 'theirs'] as const).map((side) => (
              <label key={side} className="row" style={{ padding: '0.3rem 0' }}>
                <input type="radio" name={c.field} checked={choices[c.field] === side} onChange={() => setChoices({ ...choices, [c.field]: side })} data-testid={`conflict-${c.field}-${side}`} />
                <span className="grow">
                  <b>{side === 'mine' ? 'Yours' : `Theirs (${who})`}:</b> {show(c.field, side === 'mine' ? c.mine : c.theirs, propertyName)}
                </span>
              </label>
            ))}
          </div>
        ))}
        <button className="primary big" disabled={!done} onClick={() => resolveConflict(conflict, choices)} data-testid="conflict-save">
          Keep these
        </button>
      </div>
    </Modal>
  );
}
