import { useEffect, useMemo, useRef, useState } from 'react';
import { formatCents, ledgerRows, sumRows, type Receipt } from '@uvl/shared';
import { prepareFile, UnsupportedFileError, type PreparedPage } from '../capture/image.ts';
import { BLOCKER_TEXT, createScan, readingBlocker } from '../receipts.ts';
import { openYears, useAppState } from '../store.ts';
import { formatDate, go, Modal } from '../ui.tsx';

function pageUrl(page: PreparedPage): string {
  return URL.createObjectURL(new Blob([page.bytes as BlobPart], { type: page.mime }));
}

/** Confirm the photos before they are read: retake a poor one, or add more pages. */
function CaptureSheet(props: { pages: PreparedPage[]; busy: boolean; error: string; onAdd: () => void; onRemove: (i: number) => void; onCancel: () => void; onRead: () => void }) {
  const urls = useMemo(() => props.pages.map(pageUrl), [props.pages]);
  useEffect(() => () => urls.forEach((u) => URL.revokeObjectURL(u)), [urls]);
  const warnings = [...new Set(props.pages.flatMap((p) => p.warnings))];
  return (
    <Modal onClose={props.onCancel}>
      <div className="stack" data-testid="capture-sheet">
        <h2 style={{ marginTop: 0 }}>{props.pages.length === 1 ? '1 page' : `${props.pages.length} pages`}</h2>
        <div className="thumbs">
          {props.pages.map((p, i) => (
            <figure key={i}>
              {p.mime === 'application/pdf' ? <div className="pdf">PDF</div> : <img src={urls[i]} alt={`Page ${i + 1}`} />}
              <button className="link small" onClick={() => props.onRemove(i)}>
                Remove
              </button>
            </figure>
          ))}
        </div>
        {warnings.map((w) => (
          <div className="banner" key={w} data-testid="quality-warning">
            {w} Remove it and take it again, or use it anyway.
          </div>
        ))}
        {props.error && <div className="banner bad">{props.error}</div>}
        {props.busy && <div className="spinner" />}
        <button onClick={props.onAdd} disabled={props.busy}>
          Add page
        </button>
        <button className="primary big" onClick={props.onRead} disabled={props.busy || props.pages.length === 0} data-testid="read-receipt">
          Read receipt
        </button>
        <button className="link" onClick={props.onCancel}>
          Cancel
        </button>
      </div>
    </Modal>
  );
}

function statusText(r: Receipt): string {
  if (r.status === 'reading') return 'Reading…';
  if (r.status === 'failed') return `Couldn't read this receipt`;
  const blocker = readingBlocker();
  return blocker ? BLOCKER_TEXT[blocker]! : 'Waiting to read';
}

const KINDS = { labor: 'Labor', materials: 'Materials', other: 'Other' } as const;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function Home() {
  const state = useAppState();
  const { receipts, properties } = state;
  const years = openYears(state.years);
  const [year, setYear] = useState(years[0]!);
  const cameraRef = useRef<HTMLInputElement>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const [pages, setPages] = useState<PreparedPage[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [captureError, setCaptureError] = useState('');

  const [search, setSearch] = useState('');
  const [propertyId, setPropertyId] = useState('');
  const [category, setCategory] = useState('');
  const [kind, setKind] = useState('');
  const [month, setMonth] = useState('');
  const [attention, setAttention] = useState(false);
  const [noImage, setNoImage] = useState(false);

  async function addFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setBusy(true);
    setCaptureError('');
    setPages((p) => p ?? []);
    try {
      for (const file of Array.from(files)) {
        const page = await prepareFile(file);
        setPages((p) => [...(p ?? []), page]);
      }
    } catch (error) {
      setCaptureError(error instanceof UnsupportedFileError ? error.message : 'That file could not be added.');
    } finally {
      setBusy(false);
    }
  }

  function read() {
    if (!pages) return;
    const receipt = createScan(pages.map((p) => ({ mime: p.mime, bytes: p.bytes })));
    setPages(null);
    go(`/r/${receipt.id}`);
  }

  const live = receipts.filter((r) => !r.deletedAt);
  const waiting = live.filter((r) => r.status === 'queued' || r.status === 'reading' || r.status === 'failed');
  const toReview = live.filter((r) => r.status === 'toReview');
  const saved = live.filter((r) => r.status === 'saved' && r.ledgerYear === year);
  const needAttention = saved.filter((r) => r.needsAttention).length;

  const rows = useMemo(() => ledgerRows(receipts, properties, year), [receipts, properties, year]);
  const categories = useMemo(() => [...new Set(rows.map((r) => r.category).filter(Boolean))].sort(), [rows]);

  // Filters work on line items, so "Home Depot on 12 Oak St" totals only the matching lines.
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const amountQuery = q.replace(/[$,]/g, '');
    const receiptById = new Map(saved.map((r) => [r.id, r]));
    return rows.filter((row) => {
      const r = receiptById.get(row.receiptId);
      if (!r) return false;
      if (propertyId && row.propertyId !== propertyId) return false;
      if (category && row.category !== category) return false;
      if (kind && row.kind !== kind) return false;
      if (month && row.date.slice(5, 7) !== month) return false;
      if (attention && !r.needsAttention) return false;
      if (noImage && r.pageCount > 0) return false;
      if (q) {
        const hay = `${row.vendor} ${row.description} ${row.invoiceNo}`.toLowerCase();
        const amounts = [row.amountCents, row.totalCents, r.totalCents ?? 0].map((c) => (c / 100).toFixed(2));
        if (!hay.includes(q) && !(amountQuery && amounts.some((a) => a.includes(amountQuery)))) return false;
      }
      return true;
    });
  }, [rows, saved, search, propertyId, category, kind, month, attention, noImage]);

  const shownIds = new Set(filtered.map((r) => r.receiptId));
  const shown = saved.filter((r) => shownIds.has(r.id) || (r.lines.length === 0 && !search && !propertyId && !category && !kind && !month && (!attention || r.needsAttention) && (!noImage || r.pageCount === 0)));
  shown.sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
  const filteredTotal = sumRows(filtered);
  const yearTotal = sumRows(rows);
  const filtering = Boolean(search || propertyId || category || kind || month || attention || noImage);

  return (
    <div>
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { void addFiles(e.target.files); e.target.value = ''; }} data-testid="camera-input" />
      <input ref={importRef} type="file" accept="image/*,application/pdf" multiple hidden onChange={(e) => { void addFiles(e.target.files); e.target.value = ''; }} data-testid="import-input" />

      <button className="primary big" onClick={() => cameraRef.current?.click()} data-testid="scan-button">
        Scan a receipt
      </button>
      <div className="row" style={{ marginTop: '0.6rem' }}>
        <button className="grow" onClick={() => importRef.current?.click()}>
          Import photo or PDF
        </button>
        <button className="grow" onClick={() => go('/r/new')} data-testid="manual-button">
          Enter by hand
        </button>
      </div>

      {pages && (
        <CaptureSheet
          pages={pages}
          busy={busy}
          error={captureError}
          onAdd={() => cameraRef.current?.click()}
          onRemove={(i) => setPages(pages.filter((_, j) => j !== i))}
          onCancel={() => setPages(null)}
          onRead={read}
        />
      )}

      {waiting.length > 0 && (
        <section data-testid="waiting-list">
          <h2>Waiting to read ({waiting.length})</h2>
          <div className="card">
            <ul className="list">
              {waiting.map((r) => (
                <li key={r.id}>
                  <a className="item" href={`#/r/${r.id}`}>
                    {r.status === 'reading' && <div className="spinner" />}
                    <div className="grow">
                      <div className="title">Scan from {new Date(r.createdAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</div>
                      <div className="muted">{statusText(r)}</div>
                    </div>
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {toReview.length > 0 && (
        <section data-testid="review-list">
          <h2>To review ({toReview.length})</h2>
          <div className="card">
            <ul className="list">
              {toReview.map((r) => (
                <li key={r.id}>
                  <a className="item" href={`#/r/${r.id}`}>
                    <div className="grow">
                      <div className="title">{r.vendorName || 'Unknown vendor'}</div>
                      <div className="muted">{formatDate(r.date)} · not saved yet</div>
                    </div>
                    <div className="num">{formatCents(r.totalCents)}</div>
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      <div className="row" style={{ marginTop: '1rem' }}>
        <h2 className="grow" style={{ margin: 0 }}>
          {year} expenses
        </h2>
        {years.length > 1 &&
          years.map((y) => (
            <button key={y} className={`chip${y === year ? ' on' : ''}`} onClick={() => setYear(y)}>
              {y}
            </button>
          ))}
      </div>
      {years.length > 1 && live.some((r) => r.ledgerYear === years[1]) && (
        <div className="banner info">
          {years[1]} is still open – <a href="#/reports">close it</a> when your records are complete.
        </div>
      )}
      <div className="card" data-testid="year-total">
        <div className="row">
          <div className="grow">
            <div className="muted">Total including tax</div>
            <div className="num" style={{ fontSize: '1.5rem', fontWeight: 700 }}>
              {formatCents(yearTotal.totalCents)}
            </div>
          </div>
          <div className="right">
            <div className="muted">of which tax</div>
            <div className="num">{formatCents(yearTotal.taxCents)}</div>
          </div>
        </div>
        <div className="muted">
          {saved.length} receipt{saved.length === 1 ? '' : 's'}
          {needAttention > 0 && (
            <>
              {' · '}
              <button className="link" onClick={() => setAttention(true)}>
                {needAttention} need attention
              </button>
            </>
          )}
        </div>
      </div>

      <input type="search" placeholder="Search vendor, item, amount or invoice #" value={search} onChange={(e) => setSearch(e.target.value)} data-testid="search" />
      <div className="grid2" style={{ marginTop: '0.5rem' }}>
        <select value={propertyId} onChange={(e) => setPropertyId(e.target.value)} aria-label="Property" data-testid="filter-property">
          <option value="">All properties</option>
          {properties.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <select value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Category">
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <select value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Labor or materials">
          <option value="">Labor, materials & other</option>
          {Object.entries(KINDS).map(([k, label]) => (
            <option key={k} value={k}>
              {label}
            </option>
          ))}
        </select>
        <select value={month} onChange={(e) => setMonth(e.target.value)} aria-label="Month">
          <option value="">All months</option>
          {MONTHS.map((m, i) => (
            <option key={m} value={String(i + 1).padStart(2, '0')}>
              {m}
            </option>
          ))}
        </select>
      </div>
      <div className="row" style={{ marginTop: '0.5rem' }}>
        <button className={`chip${attention ? ' on' : ''}`} onClick={() => setAttention(!attention)} data-testid="filter-attention">
          Needs attention
        </button>
        <button className={`chip${noImage ? ' on' : ''}`} onClick={() => setNoImage(!noImage)}>
          No receipt image
        </button>
      </div>

      {filtering && (
        <p className="muted" data-testid="filtered-total">
          {shown.length} receipt{shown.length === 1 ? '' : 's'} match · {formatCents(filteredTotal.totalCents)} including tax
        </p>
      )}
      <div className="card">
        {shown.length === 0 ? (
          <p className="muted">{filtering ? 'Nothing matches.' : 'No receipts saved yet. Scan your first one above.'}</p>
        ) : (
          <ul className="list" data-testid="receipt-list">
            {shown.map((r) => (
              <li key={r.id}>
                <a className="item" href={`#/r/${r.id}`}>
                  <div className="grow">
                    <div className="title">{r.vendorName || 'Unknown vendor'}</div>
                    <div className="muted">
                      {formatDate(r.date)} · {properties.find((p) => p.id === r.propertyId)?.name ?? 'No property'}{' '}
                      {r.needsAttention && <span className="badge">Needs attention</span>} {r.pageCount === 0 && <span className="badge plain">No image</span>}
                    </div>
                  </div>
                  <div className="num">{formatCents(r.totalCents)}</div>
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
