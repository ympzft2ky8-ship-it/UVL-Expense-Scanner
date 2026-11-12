import { useEffect, useState, type ReactNode } from 'react';
import { centsToInput, parseCents } from '@uvl/shared';

export function useHash(): string {
  const [hash, setHash] = useState(() => window.location.hash.slice(1) || '/');
  useEffect(() => {
    const on = () => setHash(window.location.hash.slice(1) || '/');
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return hash;
}

export function go(path: string) {
  window.location.hash = path;
}

export function Field(props: { label: string; flag?: string; onConfirm?: () => void; children: ReactNode; testId?: string }) {
  return (
    <label className={`field${props.flag ? ' flagged' : ''}`} data-flagged={props.flag ? 'true' : undefined} data-testid={props.testId}>
      <span>{props.label}</span>
      {props.children}
      {props.flag && (
        <div className="flag-note">
          <span>{props.flag}</span>
          {props.onConfirm && (
            <button type="button" className="link" onClick={props.onConfirm}>
              Looks right
            </button>
          )}
        </div>
      )}
    </label>
  );
}

/** A dollar amount typed as text and kept as cents. */
export function MoneyInput(props: { value: number | null; onChange: (cents: number | null) => void; placeholder?: string; 'aria-label'?: string; testId?: string }) {
  const [text, setText] = useState(centsToInput(props.value));
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setText(centsToInput(props.value));
  }, [props.value, focused]);
  return (
    <input
      inputMode="decimal"
      value={text}
      placeholder={props.placeholder ?? '0.00'}
      aria-label={props['aria-label']}
      data-testid={props.testId}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onChange={(e) => {
        setText(e.target.value);
        props.onChange(parseCents(e.target.value));
      }}
    />
  );
}

export function Modal(props: { children: ReactNode; onClose?: () => void }) {
  return (
    <div className="modal-back" onClick={(e) => e.target === e.currentTarget && props.onClose?.()}>
      <div className="modal" role="dialog" aria-modal="true">
        {props.children}
      </div>
    </div>
  );
}

export function formatWhen(ms: number): string {
  if (!ms) return '';
  return new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function formatDate(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return 'No date';
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y!, m! - 1, d!).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export const US_STATES = 'AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY'.split(' ');
