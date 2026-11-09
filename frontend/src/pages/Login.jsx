import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Field, FieldError } from '../components/ui';
import { validateText, focusFirstError } from '../utils/validation';
import { useAuth } from '../state/AuthContext';
import { useI18n } from '../state/I18nContext';
import { API_BASE } from '../api/client';

export default function Login() {
  const { user, login, terminatedMessage } = useAuth();
  const { t, lang, setLang } = useI18n();
  const nav = useNavigate();
  const loc = useLocation();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});
  const [logoBroken, setLogoBroken] = useState(false);

  if (user) return <Navigate to={loc.state?.from || '/'} replace />;

  const submit = async (e) => {
    e.preventDefault();
    const errs = {};
    if (!username.trim()) errs.username = 'Username is required.';
    if (!password) errs.password = 'Password is required.';

    if (Object.keys(errs).length > 0) {
      setFieldErrors(errs);
      focusFirstError(errs);
      return;
    }

    setFieldErrors({});
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
      <form className="login-card" onSubmit={submit} noValidate>
        {/* Language Switcher on Login Screen */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
          <div style={{
            display: 'inline-flex',
            background: '#f1f5f9',
            borderRadius: 20,
            padding: 3,
            border: '1px solid #e2e8f0',
            gap: 2
          }}>
            <button
              type="button"
              onClick={() => setLang('en')}
              style={{
                border: 'none',
                background: lang === 'en' ? '#ffffff' : 'transparent',
                color: lang === 'en' ? '#1d4ed8' : '#64748b',
                fontWeight: lang === 'en' ? 800 : 500,
                fontSize: 11.5,
                padding: '3px 10px',
                borderRadius: 16,
                cursor: 'pointer',
                boxShadow: lang === 'en' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none'
              }}
            >
              English
            </button>
            <button
              type="button"
              onClick={() => setLang('ta')}
              style={{
                border: 'none',
                background: lang === 'ta' ? '#ffffff' : 'transparent',
                color: lang === 'ta' ? '#1d4ed8' : '#64748b',
                fontWeight: lang === 'ta' ? 800 : 500,
                fontSize: 11.5,
                padding: '3px 10px',
                borderRadius: 16,
                cursor: 'pointer',
                boxShadow: lang === 'ta' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none'
              }}
            >
              தமிழ்
            </button>
          </div>
        </div>

        <div className="login-brand">
          <div className="brand-logo-pill" style={{ padding: 0, background: '#fff', overflow: 'hidden' }}>
            <img src={logoBroken ? '/logo.jpeg' : API_BASE + '/api/settings/organization/logo'} alt="Organization logo"
              onError={() => setLogoBroken(true)} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          </div>
          <div>
            <h1>{t('Sign in', 'Sign in')}</h1>
            <p className="sub" style={{ margin: 0 }}>{t('Siva Murugan Chit Fund', 'Siva Murugan Chit Fund')}</p>
          </div>
        </div>

        {terminatedMessage && (
          <div className="toast error" style={{ position: 'static', marginBottom: 16 }}>{t(terminatedMessage, terminatedMessage)}</div>
        )}
        {err && <div className="toast error" style={{ position: 'static', marginBottom: 16 }}>{t(err, err)}</div>}

        <div className="form-field-group" style={{ marginBottom: 12 }}>
          <label className="form-field-label">{t('Username', 'Username')}</label>
          <div className="input-with-icon">
            <div className="input-icon-pill"><IconUser /></div>
            <input
              name="username"
              value={username}
              onChange={(e) => {
                setUsername(e.target.value);
                if (fieldErrors.username) {
                  setFieldErrors((prev) => { const n = { ...prev }; delete n.username; return n; });
                }
              }}
              onBlur={() => {
                if (!username.trim()) {
                  setFieldErrors((prev) => ({ ...prev, username: 'Username is required.' }));
                }
              }}
              className={fieldErrors.username ? 'is-invalid' : ''}
              autoFocus
              autoComplete="username"
              placeholder={t('Your username', 'Your username')}
            />
          </div>
          <FieldError error={fieldErrors.username} />
        </div>
        <div className="form-field-group" style={{ marginBottom: 14 }}>
          <label className="form-field-label">{t('Password', 'Password')}</label>
          <div className="input-with-icon">
            <div className="input-icon-pill"><IconLock /></div>
            <input
              name="password"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (fieldErrors.password) {
                  setFieldErrors((prev) => { const n = { ...prev }; delete n.password; return n; });
                }
              }}
              onBlur={() => {
                if (!password) {
                  setFieldErrors((prev) => ({ ...prev, password: 'Password is required.' }));
                }
              }}
              className={fieldErrors.password ? 'is-invalid' : ''}
              autoComplete="current-password"
              placeholder={t('Your password', 'Your password')}
            />
            <button
              type="button"
              className="password-toggle-btn"
              onClick={() => setShowPassword(!showPassword)}
              aria-label={showPassword ? t('Hide password', 'Hide password') : t('Show password', 'Show password')}
              title={showPassword ? t('Hide password', 'Hide password') : t('Show password', 'Show password')}
              style={{ position: 'absolute', right: 12, background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}
            >
              {showPassword ? <IconEyeOff /> : <IconEye />}
            </button>
          </div>
          <FieldError error={fieldErrors.password} />
        </div>
        <button className="btn-save-glow" style={{ width: '100%', marginTop: 8, height: 42, justifyContent: 'center', fontSize: 14 }} disabled={busy}>
          {busy ? t('Signing in…', 'Signing in…') : t('Login', 'Login')}
        </button>
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

function IconEye() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function IconEyeOff() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  );
}