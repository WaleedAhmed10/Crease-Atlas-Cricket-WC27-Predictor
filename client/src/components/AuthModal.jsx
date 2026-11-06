import { useState, useEffect, useRef } from 'react';

export default function AuthModal({ open, onClose, onSubmit }) {
  const [signUp, setSignUp] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const first = useRef(null);
  useEffect(() => { if (open) { setError(''); setTimeout(() => first.current?.focus(), 30); } }, [open, signUp]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (!username.trim() || !password) return setError('Enter a username and password');
    if (signUp && password.length < 6) return setError('Password must be at least 6 characters');
    setBusy(true);
    try { await onSubmit(signUp, username.trim(), password); setPassword(''); }
    catch (err) { setError(err.message); }
    setBusy(false);
  };

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className="modal" onSubmit={submit} role="dialog" aria-modal="true" aria-label={signUp ? 'Create account' : 'Sign in'}>
        <button type="button" className="x" onClick={onClose} aria-label="Close">×</button>
        <h2>{signUp ? 'Create your account' : 'Welcome back'}</h2>
        <p className="muted small">Guests can predict without an account. Sign in to join the leaderboard; your guest picks come along.</p>
        {error && <div className="notice error" role="alert">{error}</div>}
        <input ref={first} placeholder="Username" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" maxLength={20} />
        <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={signUp ? 'new-password' : 'current-password'} />
        <button className="btn btn-lime wide" disabled={busy}>{busy ? 'One moment…' : signUp ? 'Sign up' : 'Sign in'}</button>
        <button type="button" className="btn btn-ghost wide" onClick={() => setSignUp(!signUp)}>{signUp ? 'I already have an account' : 'Create an account'}</button>
        <button type="button" className="link center" onClick={onClose}>Continue as guest</button>
      </form>
    </div>
  );
}
