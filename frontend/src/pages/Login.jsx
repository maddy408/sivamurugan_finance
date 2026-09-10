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
        <h1>Sign in</h1>
        <p className="sub">Siva Murugan Chit Fund</p>

        {terminatedMessage && (
          <div className="toast error" style={{ position: 'static', marginBottom: 16 }}>{terminatedMessage}</div>
        )}
        {err && <div className="toast error" style={{ position: 'static', marginBottom: 16 }}>{err}</div>}

        <Field label="Username">
          <input value={username} onChange={(e) => setUsername(e.target.value)} autoFocus autoComplete="username" required />
        </Field>
        <Field label="Password">
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
        </Field>
        <button className="btn" style={{ width: '100%', marginTop: 6 }} disabled={busy}>
          {busy ? 'Signing in…' : 'Login'}
        </button>
        <p className="muted" style={{ fontSize: 12, marginTop: 16, marginBottom: 0 }}>
          Default admin: <b>admin / Admin@123</b>
        </p>
      </form>
    </div>
  );
}
