import { signOut } from 'firebase/auth';
import { useState } from 'react';
import { formatCents, NOT_TAX_ADVICE, parseCents, PRICES } from '@uvl/shared';
import { auth } from '../firebase.ts';
import { DAY_MS, KEEP_DELETED_DAYS, processQueue, restoreReceipt, restoreYear } from '../receipts.ts';
import { reportError, saveSettings, useAppState } from '../store.ts';
import { Field, formatDate } from '../ui.tsx';

const MODEL_LABELS: Record<string, string> = {
  'claude-opus-5-5': 'Claude Opus 5.5 – most accurate (recommended)',
  'claude-sonnet-5-5': 'Claude Sonnet 5.5 – about half the cost',
};

export function Settings() {
  const state = useAppState();
  const { settings, usage } = state;
  const [key, setKey] = useState('');
  const [cap, setCap] = useState((settings.monthlyCapCents / 100).toFixed(2));
  const [saved, setSaved] = useState('');
  const spentCents = Math.round(usage.costMicros / 10_000);
  const pct = settings.monthlyCapCents > 0 ? Math.round((spentCents / settings.monthlyCapCents) * 100) : 0;
  const deleted = state.receipts.filter((r) => r.deletedAt);
  const cleared = state.years.filter((y) => y.status === 'cleared' && y.purgeAt && y.purgeAt > Date.now());

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>Settings</h2>

      <div className="card stack" data-testid="ai-settings">
        <h3>Reading receipts</h3>
        <p className="muted small">
          Receipts are read by Claude, an AI service from Anthropic. It needs an API key from your Anthropic account (console.anthropic.com). The key is saved with your records, so you enter it once and both phones use it.
        </p>
        {settings.anthropicKey ? (
          <div className="row">
            <span className="grow" data-testid="key-status">
              Key saved: …{settings.anthropicKey.slice(-4)}
            </span>
            <button
              className="danger"
              onClick={() => {
                if (confirm('Remove the AI key? Scans will wait until a key is entered again.')) saveSettings({ anthropicKey: '' });
              }}
              data-testid="remove-key"
            >
              Remove key
            </button>
          </div>
        ) : (
          <div className="banner" data-testid="key-status">No key yet. Scans will wait, or you can enter receipts by hand.</div>
        )}
        <Field label={settings.anthropicKey ? 'Replace the key' : 'Anthropic API key'}>
          <input type="password" autoComplete="off" value={key} onChange={(e) => setKey(e.target.value)} placeholder="sk-ant-…" data-testid="key-input" />
        </Field>
        <button
          disabled={!key.trim()}
          onClick={() => {
            saveSettings({ anthropicKey: key.trim() });
            setKey('');
            setTimeout(() => void processQueue(), 500);
          }}
          data-testid="save-key"
        >
          Save key
        </button>
        <p className="muted small">Also set a monthly spend limit in the Anthropic console. That limit is the real safety net if the key ever leaks.</p>

        <h3 style={{ marginTop: '0.6rem' }}>Monthly limit</h3>
        <div data-testid="usage">
          This month: <b className="num">{formatCents(spentCents)}</b> of {formatCents(settings.monthlyCapCents)} ({usage.scans} scan{usage.scans === 1 ? '' : 's'})
        </div>
        {pct >= 100 ? (
          <div className="banner bad">The monthly limit is reached. New scans wait until next month or until you raise the limit. You can still enter receipts by hand.</div>
        ) : (
          pct >= 80 && <div className="banner">You have used {pct}% of this month's limit.</div>
        )}
        <div className="row">
          <div className="grow">
            <Field label="Stop reading when the month reaches ($)">
              <input inputMode="decimal" value={cap} onChange={(e) => setCap(e.target.value)} data-testid="cap-input" />
            </Field>
          </div>
          <button
            onClick={() => {
              const cents = parseCents(cap);
              if (cents === null || cents < 0) return setSaved('Enter an amount like 10.00');
              saveSettings({ monthlyCapCents: cents });
              setSaved('Saved');
              setTimeout(() => void processQueue(), 500);
            }}
            data-testid="save-cap"
          >
            Save limit
          </button>
        </div>
        {saved && <div className="muted small">{saved}</div>}
        <Field label="AI model">
          <select value={settings.model} onChange={(e) => saveSettings({ model: e.target.value })}>
            {Object.keys(PRICES)
              .filter((m) => MODEL_LABELS[m])
              .map((m) => (
                <option key={m} value={m}>
                  {MODEL_LABELS[m]}
                </option>
              ))}
          </select>
        </Field>
      </div>

      <div className="card">
        <a className="button" href="#/vendors">
          Vendors
        </a>
      </div>

      {deleted.length > 0 && (
        <div className="card" data-testid="recently-deleted">
          <h3>Recently deleted</h3>
          <ul className="list">
            {deleted.map((r) => (
              <li key={r.id}>
                <div className="item">
                  <div className="grow">
                    <div className="title">{r.vendorName || 'Unknown vendor'}</div>
                    <div className="muted">
                      {formatDate(r.date)} · {formatCents(r.totalCents)} · removed for good in {Math.max(0, Math.ceil((r.deletedAt! + KEEP_DELETED_DAYS * DAY_MS - Date.now()) / DAY_MS))} days
                    </div>
                  </div>
                  <button onClick={() => void restoreReceipt(r).catch(reportError)}>Restore</button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {cleared.map((y) => (
        <div className="card stack" key={y.id} data-testid="restore-year">
          <h3>{y.year} was cleared</h3>
          <p className="muted small">It can be brought back for {Math.max(0, Math.ceil((y.purgeAt! - Date.now()) / DAY_MS))} more days. After that it exists only in the archive file you saved.</p>
          <button onClick={() => void restoreYear(y.year).catch(reportError)}>Restore {y.year}</button>
        </div>
      ))}

      <div className="card stack">
        <h3>Account</h3>
        <p>Signed in as {state.user?.email}</p>
        <button onClick={() => signOut(auth)} data-testid="sign-out">
          Sign out
        </button>
      </div>
      <p className="muted small">{NOT_TAX_ADVICE}</p>
    </div>
  );
}
