import { createUserWithEmailAndPassword, sendEmailVerification, sendPasswordResetEmail, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { useState, type FormEvent } from 'react';
import { auth } from '../firebase.ts';
import { refreshUser } from '../store.ts';

function friendly(error: unknown): string {
  const code = (error as { code?: string }).code ?? '';
  if (code.includes('invalid-credential') || code.includes('wrong-password') || code.includes('user-not-found')) return 'That email and password do not match.';
  if (code.includes('email-already-in-use')) return 'There is already an account for this email. Sign in instead.';
  if (code.includes('weak-password')) return 'Choose a password with at least 6 characters.';
  if (code.includes('invalid-email')) return 'That does not look like an email address.';
  if (code.includes('network')) return 'No connection. Try again when you are online.';
  if (code.includes('too-many-requests')) return 'Too many tries. Wait a few minutes and try again.';
  return 'Something went wrong. Please try again.';
}

export function AuthScreen() {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage('');
    try {
      if (mode === 'signin') await signInWithEmailAndPassword(auth, email.trim(), password);
      else {
        const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
        await sendEmailVerification(cred.user);
      }
    } catch (error) {
      setMessage(friendly(error));
    } finally {
      setBusy(false);
    }
  }

  async function reset() {
    if (!email.trim()) return setMessage('Type your email address first.');
    try {
      await sendPasswordResetEmail(auth, email.trim());
      setMessage('If there is an account for that email, a reset link is on its way.');
    } catch (error) {
      setMessage(friendly(error));
    }
  }

  return (
    <form className="auth stack" onSubmit={submit}>
      <h1>UVL Expenses</h1>
      <p className="muted">{mode === 'signin' ? 'Sign in to see your records.' : 'Create your account. Only the two members of Urban Vibes Living can open the records.'}</p>
      <label className="field">
        <span>Email</span>
        <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      </label>
      <label className="field">
        <span>Password</span>
        <input type="password" autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
      </label>
      {message && <div className="banner">{message}</div>}
      <button className="primary big" disabled={busy}>
        {mode === 'signin' ? 'Sign in' : 'Create account'}
      </button>
      <div className="row">
        <button type="button" className="link" onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}>
          {mode === 'signin' ? 'First time? Create an account' : 'I already have an account'}
        </button>
        {mode === 'signin' && (
          <button type="button" className="link" onClick={reset}>
            Forgot password
          </button>
        )}
      </div>
    </form>
  );
}

export function VerifyScreen({ email }: { email: string }) {
  const [message, setMessage] = useState('');
  return (
    <div className="auth stack">
      <h1>Check your email</h1>
      <p>
        We sent a link to <b>{email}</b>. Open it in any browser to confirm the address is yours, then come back here and tap Continue.
      </p>
      {message && <div className="banner">{message}</div>}
      <button
        className="primary big"
        onClick={async () => {
          await refreshUser();
          if (!auth.currentUser?.emailVerified) setMessage('Not confirmed yet. Open the link in the email first.');
        }}
      >
        Continue
      </button>
      <div className="row">
        <button
          className="link"
          onClick={async () => {
            try {
              if (auth.currentUser) await sendEmailVerification(auth.currentUser);
              setMessage('Sent again.');
            } catch (error) {
              setMessage(friendly(error));
            }
          }}
        >
          Send the email again
        </button>
        <button className="link" onClick={() => signOut(auth)}>
          Use a different email
        </button>
      </div>
    </div>
  );
}

export function DeniedScreen({ email }: { email: string }) {
  return (
    <div className="auth stack">
      <h1>Not on the members list</h1>
      <p>
        <b>{email}</b> is not one of the two members who can open these records. If this is a mistake, the member list is in the Firebase rules (see docs/setup.md).
      </p>
      <button className="big" onClick={() => signOut(auth)}>
        Sign out
      </button>
    </div>
  );
}
