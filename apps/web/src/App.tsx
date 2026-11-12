import { useEffect, useState } from 'react';
import { isConfigured } from './firebase.ts';
import { AuthScreen, DeniedScreen, VerifyScreen } from './pages/Auth.tsx';
import { ConflictDialog } from './pages/ConflictDialog.tsx';
import { Home } from './pages/Home.tsx';
import { Properties, PropertySummary } from './pages/Properties.tsx';
import { ReceiptEditor } from './pages/ReceiptEditor.tsx';
import { Reports } from './pages/Reports.tsx';
import { Settings } from './pages/Settings.tsx';
import { Vendors } from './pages/Vendors.tsx';
import { processQueue, purgeExpired } from './receipts.ts';
import { clearError, flushOutbox, reportError, useAppState } from './store.ts';
import { useHash } from './ui.tsx';

const TABS = [
  ['/', 'Receipts'],
  ['/properties', 'Properties'],
  ['/reports', 'Reports'],
  ['/settings', 'Settings'],
] as const;

function SyncBadge() {
  const { online, unsynced, outbox } = useAppState();
  const waiting = unsynced + outbox.length;
  if (!online) return <span className="sync" data-testid="sync-status">Offline{waiting ? ` · ${waiting} waiting to sync` : ''}</span>;
  if (waiting) return <span className="sync" data-testid="sync-status">{waiting} waiting to sync</span>;
  return null;
}

function InstallHint() {
  const [hidden, setHidden] = useState(() => localStorage.getItem('uvl.hideInstallHint') === '1');
  const standalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;
  const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (hidden || standalone || !isIos) return null;
  return (
    <div className="banner info">
      To use this like an app: tap the Share button in Safari, then <b>Add to Home Screen</b>.{' '}
      <button
        className="link"
        onClick={() => {
          localStorage.setItem('uvl.hideInstallHint', '1');
          setHidden(true);
        }}
      >
        Hide
      </button>
    </div>
  );
}

export function App() {
  const state = useAppState();
  const hash = useHash();
  const ready = state.loaded;

  useEffect(() => {
    if (!ready) return;
    void flushOutbox();
    purgeExpired().catch(reportError);
  }, [ready]);

  // Read waiting scans whenever one appears, or whatever was blocking them changes.
  const queued = state.receipts.filter((r) => r.status === 'queued' && !r.deletedAt).length;
  const { anthropicKey, monthlyCapCents } = state.settings;
  useEffect(() => {
    if (!ready) return;
    void processQueue();
    // Also look again every minute, to pick up a scan whose reading was interrupted.
    const timer = setInterval(() => void processQueue(), 60_000);
    return () => clearInterval(timer);
  }, [ready, queued, anthropicKey, monthlyCapCents, state.online]);

  if (!isConfigured) {
    return (
      <div className="auth stack">
        <h1>UVL Expenses</h1>
        <p>This copy of the app is not connected to a Firebase project yet. Follow docs/setup.md, then build it again.</p>
      </div>
    );
  }
  if (!state.authReady) return <div className="auth"><div className="spinner" /></div>;
  if (!state.user) return <AuthScreen />;
  if (!state.user.verified) return <VerifyScreen email={state.user.email} />;
  if (state.denied) return <DeniedScreen email={state.user.email} />;
  if (!ready) return <div className="auth"><div className="spinner" /><p className="muted">Loading your records…</p></div>;

  const [path] = hash.split('?');
  const parts = (path ?? '/').split('/').filter(Boolean);
  let page;
  if (parts[0] === 'r' && parts[1]) page = <ReceiptEditor key={parts[1]} id={parts[1]} />;
  else if (parts[0] === 'p' && parts[1]) page = <PropertySummary id={parts[1]} />;
  else if (parts[0] === 'properties') page = <Properties />;
  else if (parts[0] === 'vendors') page = <Vendors />;
  else if (parts[0] === 'reports') page = <Reports />;
  else if (parts[0] === 'settings') page = <Settings />;
  else page = <Home />;
  const active = parts[0] === 'r' || !parts[0] ? '/' : parts[0] === 'p' ? '/properties' : parts[0] === 'vendors' ? '/settings' : `/${parts[0]}`;

  return (
    <div className="shell">
      <header className="topbar">
        <h1>UVL Expenses</h1>
        <SyncBadge />
      </header>
      <main className="main">
        {state.error && (
          <div className="banner bad">
            {state.error}{' '}
            <button className="link" onClick={clearError}>Dismiss</button>
          </div>
        )}
        <InstallHint />
        {page}
      </main>
      <nav className="tabbar">
        {TABS.map(([to, label]) => (
          <a key={to} href={`#${to}`} className={active === to ? 'active' : ''}>
            {label}
          </a>
        ))}
      </nav>
      {state.conflicts[0] && <ConflictDialog conflict={state.conflicts[0]} />}
    </div>
  );
}
