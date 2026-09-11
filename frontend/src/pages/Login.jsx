import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Field } from '../components/ui';
import { useAuth } from '../state/AuthContext';

export default function Login() {
  const { user, login, terminatedMessage } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  if (user) return <Navigate to={loc.state?.from || '/'} replace />;

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      await login(username.trim(), password);
      nav(loc.state?.from || '/', { replace: true });
    } catch (e2) {
      setErr(e2.message || 'Login failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={submit}>
        <div className="login-brand">
          <div className="brand-logo-pill" style={{ padding: 0, background: '#fff', overflow: 'hidden' }}>
            <img src="/logo.jpeg" alt="Organization logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          </div>
          <div>
            <h1>Sign in</h1>
            <p className="sub" style={{ margin: 0 }}>Siva Murugan Chit Fund</p>
          </div>
        </div>

        {terminatedMessage && (
          <div className="toast error" style={{ position: 'static', marginBottom: 16 }}>{terminatedMessage}</div>
        )}
        {err && <div className="toast error" style={{ position: 'static', marginBottom: 16 }}>{err}</div>}

        <Field label="Username">
          <div className="input-icon-wrap">
            <IconUser />
            <input value={username} onChange={(e) => setUsername(e.target.value)} autoFocus autoComplete="username" required placeholder="Your username" />
          </div>
        </Field>
        <Field label="Password">
          <div className="input-icon-wrap">
            <IconLock />
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required placeholder="Your password" />
          </div>
        </Field>
        <button className="btn" style={{ width: '100%', marginTop: 8 }} disabled={busy}>
          {busy ? 'Signing in…' : 'Login'}
        </button>
        <p className="muted login-hint" style={{ fontSize: 12, marginBottom: 0 }}>
          Default admin: <b>admin / Admin@123</b>
        </p>
      </form>
    </div>
  );
}

function IconUser() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

function IconLock() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}
