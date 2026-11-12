import { useMemo, useState } from 'react';
import { formatCents, groupBy, ledgerRows, NOT_TAX_ADVICE, sumRows } from '@uvl/shared';
import { archiveFileName, buildArchive, exportWorkbook, shareOrDownload, yearReceipts } from '../export/archive.ts';
import { exportFileName } from '../export/names.ts';
import { clearYear, markArchived } from '../receipts.ts';
import { openYears, reportError, useAppState } from '../store.ts';
import { Field } from '../ui.tsx';

const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Year-end: build the archive, confirm it was saved, then clear the year (year-end-archive spec). */
function CloseYear({ year }: { year: number }) {
  const state = useAppState();
  const [step, setStep] = useState<'intro' | 'building' | 'saved?' | 'confirm'>('intro');
  const [progress, setProgress] = useState('');
  const [typed, setTyped] = useState('');
  const [archive, setArchive] = useState<Blob | null>(null);
  const data = { year, receipts: state.receipts, properties: state.properties, vendors: state.vendors };
  const count = yearReceipts(state.receipts, year).length;
  const pendingReview = state.receipts.filter((r) => r.ledgerYear === year && !r.deletedAt && r.status !== 'saved').length;

  async function build() {
    setStep('building');
    try {
      const blob = await buildArchive(data, (done, total) => setProgress(`${done} of ${total} receipts`));
      setArchive(blob);
      await markArchived(year);
      await shareOrDownload(blob, archiveFileName(year), 'application/zip');
      setStep('saved?');
    } catch (error) {
      reportError(error);
      setStep('intro');
    }
  }

  return (
    <div className="card stack" data-testid="close-year">
      <h3>Close {year}</h3>
      <p>
        This saves everything from {year} into one file – the spreadsheet, every receipt image and a full copy of the data – and then clears {year} from the app. Your properties and vendors stay.
      </p>
      <div className="banner info" data-testid="retention-note">
        The IRS generally expects business records to be kept for at least 3 years, and up to 7 in some cases. Save the archive in two places, for example iCloud Drive and a computer.
      </div>
      {pendingReview > 0 && <div className="banner">{pendingReview} scan{pendingReview === 1 ? ' is' : 's are'} from {year} but not saved yet. Review them first, or they will not be in the archive.</div>}
      {step === 'intro' && (
        <button className="primary" onClick={build} data-testid="create-archive">
          Create the {year} archive ({count} receipts)
        </button>
      )}
      {step === 'building' && (
        <div className="row">
          <div className="spinner" />
          <span>Building the archive… {progress}</span>
        </div>
      )}
      {step === 'saved?' && (
        <>
          <p>
            <b>Did you save {archiveFileName(year)}?</b> Nothing is cleared until you say so.
          </p>
          <button className="primary" onClick={() => setStep('confirm')} data-testid="i-saved-it">
            I saved it
          </button>
          <button onClick={() => archive && void shareOrDownload(archive, archiveFileName(year), 'application/zip')}>Save it again</button>
          <button className="link" onClick={() => setStep('intro')}>
            Not now – keep {year} in the app
          </button>
        </>
      )}
      {step === 'confirm' && (
        <>
          <Field label={`Type ${year} to clear it from the app`}>
            <input inputMode="numeric" value={typed} onChange={(e) => setTyped(e.target.value)} data-testid="type-year" />
          </Field>
          <button className="danger" disabled={typed.trim() !== String(year)} onClick={() => void clearYear(year).catch(reportError)} data-testid="clear-year">
            Clear {year}
          </button>
          <p className="muted small">For 30 days you can bring {year} back from Settings, in case the saved file turns out to be lost.</p>
          <button className="link" onClick={() => setStep('intro')}>
            Cancel
          </button>
        </>
      )}
    </div>
  );
}

export function Reports() {
  const state = useAppState();
  const years = openYears(state.years);
  const [year, setYear] = useState(years[0]!);
  const [busy, setBusy] = useState(false);
  const rows = useMemo(() => ledgerRows(state.receipts, state.properties, year), [state.receipts, state.properties, year]);
  const saved = yearReceipts(state.receipts, year);
  const attention = saved.filter((r) => r.needsAttention).length;
  const total = sumRows(rows);
  const byMonth = groupBy(rows, (r) => r.date.slice(5, 7));
  const byVendor = [...groupBy(rows, (r) => r.vendor || 'Unknown vendor').entries()].map(([name, list]) => [name, sumRows(list).totalCents] as const).sort((a, b) => b[1] - a[1]);
  const thisYear = new Date().getFullYear();

  async function exportNow() {
    if (attention > 0 && !confirm(`${attention} receipt${attention === 1 ? '' : 's'} still need${attention === 1 ? 's' : ''} attention. Export anyway? They will be marked in the spreadsheet.`)) return;
    setBusy(true);
    try {
      const now = new Date();
      const bytes = await exportWorkbook({ year, receipts: state.receipts, properties: state.properties, vendors: state.vendors }, now);
      await shareOrDownload(bytes, exportFileName(year, now), XLSX);
    } catch (error) {
      reportError(error);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="row">
        <h2 className="grow" style={{ margin: 0 }}>
          {year} report
        </h2>
        {years.length > 1 &&
          years.map((y) => (
            <button key={y} className={`chip${y === year ? ' on' : ''}`} onClick={() => setYear(y)}>
              {y}
            </button>
          ))}
      </div>
      <div className="card stack">
        <div className="row">
          <div className="grow">
            <div className="muted">Total including tax</div>
            <div className="num" style={{ fontSize: '1.5rem', fontWeight: 700 }}>
              {formatCents(total.totalCents)}
            </div>
          </div>
          <div className="right muted">
            {saved.length} receipts
            <br />
            {rows.length} line items
          </div>
        </div>
        {attention > 0 && <div className="banner" data-testid="export-attention">{attention} receipt{attention === 1 ? '' : 's'} still need{attention === 1 ? 's' : ''} attention. <a href="#/">Review them</a></div>}
        <button className="primary big" onClick={exportNow} disabled={busy || saved.length === 0} data-testid="export-button">
          {busy ? 'Preparing…' : 'Export spreadsheet'}
        </button>
        <p className="muted small">One Excel file that also opens in Numbers and Google Sheets, with summaries by property, category, vendor and month.</p>
      </div>

      <h2>By month</h2>
      <div className="card scroll-x">
        <table>
          <tbody>
            {MONTHS.map((m, i) => {
              const list = byMonth.get(String(i + 1).padStart(2, '0')) ?? [];
              return list.length === 0 ? null : (
                <tr key={m}>
                  <td>{m}</td>
                  <td className="right num">{formatCents(sumRows(list).totalCents)}</td>
                </tr>
              );
            })}
            <tr className="total">
              <td>Total</td>
              <td className="right num">{formatCents(total.totalCents)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2>By vendor</h2>
      <div className="card scroll-x">
        <table>
          <tbody>
            {byVendor.map(([name, cents]) => (
              <tr key={name}>
                <td>{name}</td>
                <td className="right num">{formatCents(cents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <a href="#/vendors">Vendor contact details</a>
      </div>

      {year < thisYear ? <CloseYear year={year} /> : <p className="muted small">Closing {year} becomes available in January, once the year is over.</p>}
      <p className="muted small">{NOT_TAX_ADVICE}</p>
    </div>
  );
}
