import { useEffect, useMemo, useRef, useState } from 'react';
import {
  allocateTax,
  CATEGORIES,
  findDuplicate,
  formatCents,
  formatRate,
  isValidCategory,
  missingRequired,
  normalizeVendorName,
  PROPERTY_TYPE_LABEL,
  receiptTaxRate,
  runChecks,
  taxTreatment,
  type Line,
  type Receipt,
} from '@uvl/shared';
import { loadPages, type StoredPage } from '../blobs.ts';
import { prepareFile } from '../capture/image.ts';
import {
  attachPages,
  BLOCKER_TEXT,
  blankLine,
  categorize,
  checkContext,
  createManual,
  deleteReceipt,
  discardScan,
  propertyTypeOf,
  readingBlocker,
  retryReading,
  saveReceipt,
} from '../receipts.ts';
import { openYears, reportError, save, useAppState } from '../store.ts';
import { Field, formatWhen, go, MoneyInput, US_STATES } from '../ui.tsx';

function usePages(id: string, pageCount: number): StoredPage[] {
  const [pages, setPages] = useState<StoredPage[]>([]);
  useEffect(() => {
    let live = true;
    if (pageCount === 0) return setPages([]);
    const attempt = (triesLeft: number) =>
      loadPages(id)
        .then((p) => {
          if (!live) return;
          if (p.length > 0 || triesLeft === 0) setPages(p);
          else setTimeout(() => attempt(triesLeft - 1), 2000);
        })
        .catch(reportError);
    attempt(5);
    return () => {
      live = false;
    };
  }, [id, pageCount]);
  return pages;
}

function Pages({ pages, zoom = 1 }: { pages: StoredPage[]; zoom?: number }) {
  const urls = useMemo(() => pages.map((p) => URL.createObjectURL(new Blob([p.bytes as BlobPart], { type: p.mime }))), [pages]);
  useEffect(() => () => urls.forEach((u) => URL.revokeObjectURL(u)), [urls]);
  if (pages.length === 0) return <p className="muted">No receipt image.</p>;
  return (
    <>
      {pages.map((p, i) =>
        p.mime === 'application/pdf' ? (
          <p key={i}>
            <a className="button" href={urls[i]} target="_blank" rel="noreferrer">
              Open PDF (page set {i + 1})
            </a>
          </p>
        ) : (
          <img key={i} src={urls[i]} alt={`Receipt page ${i + 1}`} style={zoom === 1 ? undefined : { width: `${zoom * 100}%` }} />
        ),
      )}
    </>
  );
}

function Viewer({ pages, onClose }: { pages: StoredPage[]; onClose: () => void }) {
  const [zoom, setZoom] = useState(1);
  return (
    <div className="viewer" data-testid="image-viewer">
      <div className="bar">
        <button onClick={onClose}>Back to fields</button>
        <span style={{ flex: 1 }} />
        <button onClick={() => setZoom(Math.max(1, zoom - 0.5))} aria-label="Zoom out">
          −
        </button>
        <button onClick={() => setZoom(Math.min(4, zoom + 0.5))} aria-label="Zoom in">
          +
        </button>
      </div>
      <div className="pages">
        <div style={{ width: `${zoom * 100}%` }}>
          <Pages pages={pages} />
        </div>
      </div>
    </div>
  );
}

const KIND_OPTIONS = [
  ['labor', 'Labor'],
  ['materials', 'Materials'],
  ['other', 'Other'],
] as const;

export function ReceiptEditor({ id }: { id: string }) {
  const state = useAppState();
  const stored = state.receipts.find((r) => r.id === id) ?? null;
  const manual = useRef<Receipt | null>(id === 'new' ? createManual() : null);

  const status = stored?.status;
  if (id !== 'new' && !stored) {
    return (
      <div className="card">
        <p>This receipt is no longer here. It may have been deleted on the other phone.</p>
        <button onClick={() => go('/')}>Back to receipts</button>
      </div>
    );
  }
  if (stored && (status === 'queued' || status === 'reading' || status === 'failed')) return <Waiting receipt={stored} />;
  // Remount the form when the reading finishes, so it starts from the read values.
  return <Form key={stored ? `${stored.id}:${stored.status}` : 'new'} initial={stored ?? manual.current!} latest={stored} isNew={!stored} />;
}

function Waiting({ receipt }: { receipt: Receipt }) {
  const pages = usePages(receipt.id, receipt.pageCount);
  const blocker = readingBlocker();
  return (
    <div className="stack" data-testid="waiting">
      <div className="card stack">
        {receipt.status === 'failed' ? (
          <>
            <h2 style={{ marginTop: 0 }}>Couldn't read this receipt</h2>
            <p>{receipt.failReason}</p>
            <button className="primary" onClick={() => retryReading(receipt)}>
              Try again
            </button>
            <button onClick={() => saveReceiptAsDraft(receipt)} data-testid="enter-by-hand">
              Enter by hand
            </button>
          </>
        ) : (
          <div className="row">
            <div className="spinner" />
            <div className="grow">
              <b>{receipt.status === 'reading' ? 'Reading the receipt…' : blocker ? BLOCKER_TEXT[blocker] : 'Waiting to read'}</b>
              <div className="muted">{receipt.status === 'reading' ? 'This usually takes less than half a minute.' : 'It will be read automatically. You can leave this screen.'}</div>
              {blocker === 'nokey' && <a href="#/settings">Open Settings</a>}
              {blocker === 'cap' && <a href="#/settings">Raise the limit in Settings, or enter it by hand</a>}
            </div>
          </div>
        )}
        {receipt.status !== 'failed' && (
          <button onClick={() => saveReceiptAsDraft(receipt)}>Enter by hand instead</button>
        )}
        <button
          className="danger"
          onClick={() => {
            if (confirm('Discard this scan?')) void discardScan(receipt).then(() => go('/'));
          }}
        >
          Discard scan
        </button>
      </div>
      <Pages pages={pages} />
    </div>
  );
}

/** Stop waiting for the reader and open the empty form, keeping the image. */
function saveReceiptAsDraft(receipt: Receipt) {
  void save('receipts', { ...receipt, status: 'toReview', failReason: '', readingBy: '', readingAt: 0 }, receipt).catch(reportError);
}

function Form({ initial, latest, isNew }: { initial: Receipt; latest: Receipt | null; isNew: boolean }) {
  const state = useAppState();
  const { properties, vendors, receipts } = state;
  const [base, setBase] = useState(initial);
  const [draft, setDraft] = useState<Receipt>(initial);
  // If the other phone changes this receipt while it is open here and untouched, show the new version.
  useEffect(() => {
    if (latest && latest.version !== base.version && JSON.stringify(draft) === JSON.stringify(base)) {
      setBase(latest);
      setDraft(latest);
    }
  }, [latest, base, draft]);
  const [viewer, setViewer] = useState(false);
  const [showContact, setShowContact] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [openLine, setOpenLine] = useState<string | null>(null);
  const pages = usePages(draft.id, draft.pageCount);
  const fileRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLDivElement>(null);

  const checks = useMemo(() => runChecks(draft, checkContext()), [draft]);
  const flags = { ...draft.flags, ...checks };
  const flagCount = Object.keys(flags).length;
  const taxes = useMemo(() => allocateTax(draft.lines, draft.taxCents), [draft.lines, draft.taxCents]);
  const lineSum = draft.lines.reduce((a, l) => a + l.amountCents, 0);
  const duplicate = draft.status !== 'saved' ? findDuplicate(draft, receipts, normalizeVendorName) : null;
  const usable = properties.filter((p) => !p.archivedAt || p.id === draft.propertyId);

  function clearFlag(flagsNow: Receipt['flags'], key: string) {
    if (!(key in flagsNow)) return flagsNow;
    const { [key]: _gone, ...rest } = flagsNow;
    return rest;
  }

  /** Change a field; editing a flagged field counts as having checked it. */
  function patch(change: Partial<Receipt>, flagKey?: string) {
    setDraft((d) => ({ ...d, ...change, flags: flagKey ? clearFlag(d.flags, flagKey) : d.flags }));
  }

  function confirmFlag(key: string) {
    setDraft((d) => ({ ...d, flags: clearFlag(d.flags, key) }));
  }

  function patchLine(lineId: string, change: Partial<Line>, flagKey?: string) {
    setDraft((d) => ({
      ...d,
      lines: d.lines.map((l) => (l.id === lineId ? { ...l, ...change } : l)),
      flags: flagKey ? clearFlag(d.flags, `lines.${lineId}.${flagKey}`) : d.flags,
    }));
  }

  /** After a property change: categories from another property type are dropped and re-suggested. */
  function recategorize(next: Receipt): Receipt {
    const cleared = next.lines.map((l) => {
      const type = propertyTypeOf(l, next, properties);
      return type && !isValidCategory(type, l.category) ? { ...l, category: null } : l;
    });
    const vendor = vendors.find((v) => v.id === next.vendorId) ?? null;
    const result = categorize({ ...next, lines: cleared }, properties, vendor);
    const kept = Object.fromEntries(Object.entries(next.flags).filter(([k]) => !k.endsWith('.category') || result.lines.some((l) => k === `lines.${l.id}.category` && !l.category)));
    return { ...next, lines: result.lines, flags: { ...kept, ...result.flags } };
  }

  function nextFlag() {
    const el = formRef.current?.querySelector<HTMLElement>('[data-flagged="true"]');
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.querySelector<HTMLElement>('input, select')?.focus({ preventScroll: true });
  }

  async function addImages(files: FileList | null) {
    if (!files) return;
    try {
      const prepared: Awaited<ReturnType<typeof prepareFile>>[] = [];
      for (const f of Array.from(files)) prepared.push(await prepareFile(f));
      setDraft((d) => attachPages(d, prepared.map((p) => ({ mime: p.mime, bytes: p.bytes }))));
    } catch (error) {
      setErrors([error instanceof Error ? error.message : 'That file could not be added.']);
    }
  }

  async function onSave() {
    const labels: Record<string, string> = { date: 'the date', total: 'the total', property: 'a property', taxState: 'the state (confirm it)' };
    const problems = missingRequired(draft).map((m) => `Add ${labels[m]} before saving.`);
    const year = Number(draft.date.slice(0, 4));
    if (problems.length === 0 && !openYears(state.years).includes(year)) problems.push(`${year} is closed, so this receipt cannot be added to it.`);
    setErrors(problems);
    if (problems.length > 0) return;
    if (flagCount > 0 && !confirm(`${flagCount} field${flagCount === 1 ? '' : 's'} still need${flagCount === 1 ? 's' : ''} checking. Save anyway?`)) return;
    setSaving(true);
    try {
      await saveReceipt(draft, isNew ? null : base);
      go('/');
    } catch (error) {
      reportError(error);
      setSaving(false);
    }
  }

  function onDelete() {
    if (draft.status === 'saved') {
      if (confirm('Delete this receipt? You can restore it from Settings for 30 days.')) void deleteReceipt(base).then(() => go('/'));
    } else if (isNew) {
      go('/');
    } else if (confirm('Discard this scan?')) {
      void discardScan(base).then(() => go('/'));
    }
  }

  const rate = receiptTaxRate(draft);

  return (
    <div className="editor" data-testid="receipt-form">
      <div ref={formRef}>
        <div className="row">
          <button className="link" onClick={() => go('/')}>
            ‹ Receipts
          </button>
          <span className="grow" />
          {draft.pageCount > 0 ? (
            <button className="only-narrow" onClick={() => setViewer(true)} data-testid="view-image">
              View receipt
            </button>
          ) : (
            <>
              <span className="badge plain">No receipt image</span>
              <button onClick={() => fileRef.current?.click()}>Attach image</button>
            </>
          )}
          <input ref={fileRef} type="file" accept="image/*,application/pdf" multiple hidden onChange={(e) => { void addImages(e.target.files); e.target.value = ''; }} />
        </div>

        {duplicate && (
          <div className="banner" data-testid="duplicate-warning">
            This looks like a receipt you already saved ({duplicate.vendorName}, {duplicate.date}, {formatCents(duplicate.totalCents)}). <a href={`#/r/${duplicate.id}`}>Open it</a>
          </div>
        )}
        {flagCount > 0 ? (
          <div className="banner row" data-testid="flag-banner">
            <b className="grow" data-testid="flag-count">
              {flagCount} to check
            </b>
            <button onClick={nextFlag}>Next</button>
          </div>
        ) : (
          draft.status !== 'saved' && <div className="banner info">Everything adds up. Have a quick look, then save.</div>
        )}
        {errors.map((e) => (
          <div className="banner bad" key={e} data-testid="save-error">
            {e}
          </div>
        ))}

        <div className="card stack">
          <Field label="Property" flag={!draft.propertyId ? 'Choose the property this is for' : undefined} testId="field-property">
            <select
              value={draft.propertyId ?? ''}
              onChange={(e) => setDraft((d) => recategorize({ ...d, propertyId: e.target.value || null }))}
              data-testid="property-select"
            >
              <option value="">Choose…</option>
              {usable.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({PROPERTY_TYPE_LABEL[p.type]})
                </option>
              ))}
            </select>
          </Field>
          <Field label="Vendor" flag={flags.vendorName} onConfirm={() => confirmFlag('vendorName')}>
            <input list="vendor-names" value={draft.vendorName} onChange={(e) => patch({ vendorName: e.target.value, vendorId: null }, 'vendorName')} data-testid="vendor-input" />
            <datalist id="vendor-names">
              {vendors.map((v) => (
                <option key={v.id} value={v.name} />
              ))}
            </datalist>
          </Field>
          <div className="grid2">
            <Field label="Date" flag={flags.date} onConfirm={draft.flags.date && !checks.date ? () => confirmFlag('date') : undefined} testId="field-date">
              <input type="date" value={draft.date} onChange={(e) => patch({ date: e.target.value }, 'date')} data-testid="date-input" />
            </Field>
            <Field label="Invoice / receipt #" flag={flags.invoiceNo} onConfirm={() => confirmFlag('invoiceNo')}>
              <input value={draft.invoiceNo} onChange={(e) => patch({ invoiceNo: e.target.value }, 'invoiceNo')} />
            </Field>
          </div>
        </div>

        <h2>Items</h2>
        {draft.lines.map((line, i) => {
          const type = propertyTypeOf(line, draft, properties);
          const amountFlag = flags[`lines.${line.id}.amount`];
          const categoryFlag = flags[`lines.${line.id}.category`];
          const open = openLine === line.id;
          const lineTax = taxes[i] ?? 0;
          const sameType = properties.filter((p) => !p.archivedAt && p.type === type);
          return (
            <div className="line-card stack" key={line.id} data-testid="line-card">
              <div className="row">
                <div className="grow">
                  <input placeholder="Description" value={line.description} onChange={(e) => patchLine(line.id, { description: e.target.value })} aria-label="Description" data-testid="line-description" />
                </div>
              </div>
              <div className="grid3">
                <Field label="Amount" flag={amountFlag} onConfirm={draft.flags[`lines.${line.id}.amount`] && !checks[`lines.${line.id}.amount`] ? () => confirmFlag(`lines.${line.id}.amount`) : undefined}>
                  <MoneyInput value={line.amountCents} onChange={(c) => patchLine(line.id, { amountCents: c ?? 0 }, 'amount')} testId="line-amount" />
                </Field>
                <Field label="Type">
                  <select value={line.kind} onChange={(e) => patchLine(line.id, { kind: e.target.value as Line['kind'] })} data-testid="line-kind">
                    {KIND_OPTIONS.map(([v, label]) => (
                      <option key={v} value={v}>
                        {label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Tax on this item">
                  <select value={line.taxed === null ? '' : String(line.taxed)} onChange={(e) => patchLine(line.id, { taxed: e.target.value === '' ? null : e.target.value === 'true' })}>
                    <option value="">Not marked</option>
                    <option value="true">Taxed</option>
                    <option value="false">Not taxed</option>
                  </select>
                </Field>
              </div>
              <Field label={type ? `Category (${PROPERTY_TYPE_LABEL[type]})` : 'Category – choose a property first'} flag={categoryFlag} testId="field-category">
                <select value={line.category ?? ''} disabled={!type} onChange={(e) => patchLine(line.id, { category: e.target.value || null }, 'category')} data-testid="line-category">
                  <option value="">Choose…</option>
                  {type && CATEGORIES[type].map((c) => <option key={c}>{c}</option>)}
                </select>
              </Field>
              <div className="row small muted">
                <span className="grow">
                  {type && line.category ? taxTreatment(type, line.category) : ''}
                  {line.propertyId && ` · ${properties.find((p) => p.id === line.propertyId)?.name ?? ''}`}
                  {line.splits.length > 0 && ' · split'}
                </span>
                <span className="num" data-testid="line-total">
                  {formatCents(line.amountCents)} + {formatCents(lineTax)} tax = {formatCents(line.amountCents + lineTax)}
                </span>
              </div>
              <div className="row">
                <button className="link small" onClick={() => setOpenLine(open ? null : line.id)} data-testid="line-more">
                  {open ? 'Less' : 'More: quantity, another property, split'}
                </button>
                <span className="grow" />
                <button className="link small" onClick={() => setDraft((d) => ({ ...d, lines: d.lines.filter((l) => l.id !== line.id) }))}>
                  Remove
                </button>
              </div>
              {open && (
                <div className="stack">
                  <div className="grid3">
                    <Field label="Quantity">
                      <input inputMode="decimal" value={line.qty ?? ''} onChange={(e) => patchLine(line.id, { qty: e.target.value === '' || Number.isNaN(Number(e.target.value)) ? null : Number(e.target.value) })} />
                    </Field>
                    <Field label="Unit price">
                      <MoneyInput value={line.unitPriceCents} onChange={(c) => patchLine(line.id, { unitPriceCents: c })} placeholder="" />
                    </Field>
                    <Field label="Item #">
                      <input value={line.sku} onChange={(e) => patchLine(line.id, { sku: e.target.value })} />
                    </Field>
                  </div>
                  <Field label="This item is for a different property">
                    <select
                      value={line.propertyId ?? ''}
                      onChange={(e) => setDraft((d) => recategorize({ ...d, lines: d.lines.map((l) => (l.id === line.id ? { ...l, propertyId: e.target.value || null, splits: [] } : l)) }))}
                      data-testid="line-property"
                    >
                      <option value="">Same as the receipt</option>
                      {usable
                        .filter((p) => p.id !== draft.propertyId)
                        .map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name} ({PROPERTY_TYPE_LABEL[p.type]})
                          </option>
                        ))}
                    </select>
                  </Field>
                  <div>
                    <div className="muted small">Split this item with another {type ? PROPERTY_TYPE_LABEL[type].toLowerCase() : ''} property</div>
                    {line.splits.map((s, si) => (
                      <div className="row" key={si} style={{ marginTop: '0.4rem' }}>
                        <select
                          className="grow"
                          value={s.propertyId}
                          onChange={(e) => patchLine(line.id, { splits: line.splits.map((x, xi) => (xi === si ? { ...x, propertyId: e.target.value } : x)) })}
                          aria-label="Split property"
                          data-testid="split-property"
                        >
                          {sameType
                            .filter((p) => p.id !== (line.propertyId ?? draft.propertyId))
                            .map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.name}
                              </option>
                            ))}
                        </select>
                        <input
                          style={{ width: '5.5rem' }}
                          inputMode="decimal"
                          aria-label="Split percent"
                          value={s.percentBp === null ? '' : s.percentBp / 100}
                          placeholder="%"
                          onChange={(e) => patchLine(line.id, { splits: line.splits.map((x, xi) => (xi === si ? { ...x, amountCents: null, percentBp: Math.max(0, Math.min(10000, Math.round(Number(e.target.value) * 100) || 0)) } : x)) })}
                          data-testid="split-percent"
                        />
                        <span>%</span>
                        <div style={{ width: '6.5rem' }}>
                          <MoneyInput
                            aria-label="Split amount"
                            value={s.amountCents}
                            placeholder="or $"
                            onChange={(c) => patchLine(line.id, { splits: line.splits.map((x, xi) => (xi === si ? { ...x, amountCents: c, percentBp: c === null ? (x.percentBp ?? 5000) : null } : x)) })}
                          />
                        </div>
                        <button className="link small" onClick={() => patchLine(line.id, { splits: line.splits.filter((_, xi) => xi !== si) })}>
                          Remove
                        </button>
                      </div>
                    ))}
                    {sameType.filter((p) => p.id !== (line.propertyId ?? draft.propertyId)).length > 0 ? (
                      <button
                        className="link small"
                        onClick={() => {
                          const other = sameType.find((p) => p.id !== (line.propertyId ?? draft.propertyId) && !line.splits.some((s) => s.propertyId === p.id));
                          if (other) patchLine(line.id, { splits: [...line.splits, { propertyId: other.id, amountCents: null, percentBp: 5000 }] });
                        }}
                        data-testid="add-split"
                      >
                        Add a split
                      </button>
                    ) : (
                      <div className="muted small">There is no other property of this type to split with.</div>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
        <div className="row">
          <button onClick={() => setDraft((d) => recategorize({ ...d, lines: [...d.lines, blankLine()] }))} data-testid="add-line">
            Add an item
          </button>
          <button onClick={() => setDraft((d) => recategorize({ ...d, lines: [...d.lines, blankLine({ kind: 'other', isCharge: true, description: 'Delivery' })] }))}>Add a fee or discount</button>
        </div>

        <h2>Totals</h2>
        <div className="card stack">
          <div className="row small muted">
            <span className="grow">Items add up to</span>
            <span className="num" data-testid="line-sum">
              {formatCents(lineSum)}
            </span>
          </div>
          <div className="grid3">
            <Field label="Subtotal" flag={flags.subtotal} onConfirm={draft.flags.subtotal && !checks.subtotal ? () => confirmFlag('subtotal') : undefined} testId="field-subtotal">
              <MoneyInput value={draft.subtotalCents} onChange={(c) => patch({ subtotalCents: c }, 'subtotal')} placeholder="" testId="subtotal-input" />
            </Field>
            <Field label="Sales tax" flag={flags.tax} onConfirm={draft.flags.tax && !checks.tax ? () => confirmFlag('tax') : undefined} testId="field-tax">
              <MoneyInput value={draft.taxCents} onChange={(c) => patch({ taxCents: c ?? 0 }, 'tax')} testId="tax-input" />
            </Field>
            <Field label="Total" flag={flags.total ?? (draft.totalCents === null ? 'Enter the total' : undefined)} onConfirm={draft.flags.total && !checks.total ? () => confirmFlag('total') : undefined} testId="field-total">
              <MoneyInput value={draft.totalCents} onChange={(c) => patch({ totalCents: c }, 'total')} placeholder="" testId="total-input" />
            </Field>
          </div>
          <div className="grid2">
            <Field
              label="State where tax was charged"
              flag={flags.taxState ?? (!draft.taxStateConfirmed ? 'Please confirm the state' : undefined)}
              onConfirm={() => setDraft((d) => ({ ...d, taxStateConfirmed: true, flags: clearFlag(d.flags, 'taxState') }))}
              testId="field-state"
            >
              <select value={draft.taxState} onChange={(e) => setDraft((d) => ({ ...d, taxState: e.target.value, taxStateConfirmed: e.target.value !== '', flags: clearFlag(d.flags, 'taxState') }))} data-testid="state-select">
                <option value="">Choose…</option>
                {US_STATES.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </Field>
            <div className="field">
              <span>Tax rate</span>
              <div className="num" style={{ padding: '0.6rem 0' }}>
                {rate === null ? '—' : formatRate(rate)} {rate !== null && draft.taxRatePrinted === null && <span className="badge plain">calculated</span>}
              </div>
            </div>
          </div>
        </div>

        <h2>Payment and notes</h2>
        <div className="card stack">
          <div className="grid2">
            <Field label="Paid by" flag={flags.paymentMethod} onConfirm={() => confirmFlag('paymentMethod')}>
              <select value={draft.paymentMethod} onChange={(e) => patch({ paymentMethod: e.target.value as Receipt['paymentMethod'] }, 'paymentMethod')}>
                <option value="">Not recorded</option>
                <option value="card">Card</option>
                <option value="cash">Cash</option>
                <option value="check">Check</option>
                <option value="transfer">Bank transfer</option>
                <option value="other">Other</option>
              </select>
            </Field>
            <Field label={draft.paymentMethod === 'check' ? 'Check number' : 'Card last 4 digits'}>
              <input value={draft.paymentRef} onChange={(e) => patch({ paymentRef: e.target.value })} />
            </Field>
          </div>
          <Field label="Notes">
            <textarea value={draft.notes} onChange={(e) => patch({ notes: e.target.value })} />
          </Field>
          <button className="link" onClick={() => setShowContact(!showContact)}>
            {showContact ? 'Hide vendor contact details' : 'Vendor contact details'}
          </button>
          {(showContact || flags.vendorAddress) && (
            <>
              <Field label="Address" flag={flags.vendorAddress} onConfirm={() => confirmFlag('vendorAddress')}>
                <input value={draft.vendorAddress} onChange={(e) => patch({ vendorAddress: e.target.value }, 'vendorAddress')} />
              </Field>
              <div className="grid2">
                <Field label="Phone">
                  <input type="tel" value={draft.vendorPhone} onChange={(e) => patch({ vendorPhone: e.target.value })} />
                </Field>
                <Field label="Email">
                  <input type="email" value={draft.vendorEmail} onChange={(e) => patch({ vendorEmail: e.target.value })} />
                </Field>
              </div>
              <Field label="Website">
                <input value={draft.vendorWebsite} onChange={(e) => patch({ vendorWebsite: e.target.value })} />
              </Field>
            </>
          )}
        </div>

        {base.createdAt > 0 && (
          <p className="muted small" data-testid="attribution">
            Added by {base.createdBy} on {formatWhen(base.createdAt)}
            {base.updatedAt > base.createdAt && ` · last changed by ${base.updatedBy} on ${formatWhen(base.updatedAt)}`}
          </p>
        )}

        <div className="sticky-actions">
          <button className="danger" onClick={onDelete} data-testid="delete-button">
            {draft.status === 'saved' ? 'Delete' : 'Discard'}
          </button>
          <button className="primary" onClick={onSave} disabled={saving} data-testid="save-button">
            {draft.status === 'saved' ? 'Save changes' : 'Save'}
          </button>
        </div>
      </div>

      <aside className="image-pane">
        <Pages pages={pages} />
      </aside>
      {viewer && <Viewer pages={pages} onClose={() => setViewer(false)} />}
    </div>
  );
}
