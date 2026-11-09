import { useEffect, useRef, useState } from 'react';
import { api, API_BASE, fmtDate, money } from '../api/client';
import { Spinner, ErrorState, Field } from '../components/ui';
import { useToast } from '../state/ToastContext';
import { useAuth } from '../state/AuthContext';
import { useI18n } from '../state/I18nContext';
import { validateIndianMobile, validatePassword, validateConfirmPassword, validateEmail, validateText, validateAmount, focusFirstError, handleNumericKeyDown } from '../utils/validation';
import Employees from './Employees';
import {
  FiSettings, FiUsers, FiUser, FiLock, FiBriefcase, FiGrid,
  FiCalendar, FiAward, FiCreditCard, FiDollarSign, FiGlobe,
  FiHome, FiMail, FiPhone, FiPhoneCall, FiFileText, FiMapPin,
  FiUpload, FiSave, FiCheckCircle
} from 'react-icons/fi';

export default function Settings() {
  const toast = useToast();
  const { user, can, isAdmin, refreshMeta } = useAuth();
  const { t } = useI18n();
  const [tab, setTab] = useState('Organization');
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef();

  const tabs = [
    { id: 'Organization', label: 'Organization', icon: FiBriefcase },
    { id: 'Profile', label: 'Profile', icon: FiUser },
    { id: 'Change Password', label: 'Change Password', icon: FiLock },
    ...((can('employees.view') || isAdmin) ? [{ id: 'Users', label: 'Users', icon: FiUsers }] : []),
    { id: 'Chit codes', label: 'Chit Codes', icon: FiGrid },
    { id: 'Schedule', label: 'Schedule', icon: FiCalendar },
    { id: 'Fine rules', label: 'Fine Rules', icon: FiAward },
    { id: 'Payment modes', label: 'Payment Modes', icon: FiCreditCard },
    { id: 'Accounts', label: 'Accounts', icon: FiDollarSign },
    { id: 'Language', label: 'Language', icon: FiGlobe },
  ];

  const load = () => { setError(null); api.get('/api/settings').then((r) => setData(r.data)).catch(setError); };
  useEffect(load, []);

  if (error) return <ErrorState error={error} onRetry={load} />;
  if (!data) return <Spinner />;

  const save = async (fn, okMsg) => {
    setBusy(true);
    try { await fn(); toast.success(okMsg || 'Saved'); load(); }
    catch (e) { toast.error(e.errors ? Object.values(e.errors)[0][0] : e.message); }
    finally { setBusy(false); }
  };

  return (
    <>
      {/* Settings Top Text Header (No Box Card, Comfortable & Clear) */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 10, flexWrap: 'wrap' }}>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 900, color: '#0f172a', letterSpacing: '-0.02em', display: 'flex', alignItems: 'center', gap: 8 }}>
          <FiSettings size={20} style={{ color: '#1d4ed8' }} /> {t('Settings', 'Settings')}
        </h1>
        <span style={{ fontSize: 13, color: '#64748b', fontWeight: 500 }}>
          {t('Manage your application settings and organization details', 'Manage your application settings and organization details')}
        </span>
      </div>

      {/* Settings Tab Navigation Pills (Single Row, Well-Spaced & Clear) */}
      <div className="settings-tab-bar" style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'nowrap', overflowX: 'auto', marginBottom: 12, scrollbarWidth: 'none' }}>
        {tabs.map((tabItem) => {
          const Icon = tabItem.icon;
          const isActive = tab === tabItem.id;
          return (
            <button
              key={tabItem.id}
              className={`settings-tab-btn ${isActive ? 'active' : ''}`}
              onClick={() => setTab(tabItem.id)}
              style={{ flexShrink: 0, whiteSpace: 'nowrap' }}
            >
              <Icon size={13} />
              <span>{t(tabItem.label, tabItem.label)}</span>
            </button>
          );
        })}
      </div>

      {tab === 'Profile' && <ProfileTab user={user} />}
      {tab === 'Change Password' && <ChangePasswordTab toast={toast} />}
      {tab === 'Organization' && <OrgTab data={data} busy={busy} save={save} fileRef={fileRef} toast={toast} reload={load} refreshMeta={refreshMeta} />}
      {tab === 'Users' && <Employees />}
      {tab === 'Chit codes' && <ChitCodeTab data={data} busy={busy} save={save} />}
      {tab === 'Schedule' && <ScheduleTab data={data} busy={busy} save={save} />}
      {tab === 'Fine rules' && <FineTab data={data} busy={busy} save={save} />}
      {tab === 'Payment modes' && <ListTab title="Payment modes" rows={data.payment_modes} busy={busy} save={save}
        createPath="/api/settings/payment-modes" fields={[['code', 'Code'], ['name', 'Name'], ['sort_order', 'Sort', 'number']]} />}
      {tab === 'Accounts' && <AccountsTab data={data} busy={busy} save={save} />}
      {tab === 'Language' && <LangTab data={data} busy={busy} save={save} />}
    </>
  );
}

function OrgTab({ data, busy, save, fileRef, toast, reload, refreshMeta }) {
  const { t } = useI18n();
  const [f, setF] = useState(data.organization || {});
  const [orgErrors, setOrgErrors] = useState({});
  const [selectedFile, setSelectedFile] = useState(null);
  const logo = data.organization?.logo_path;

  const handleSaveAll = async () => {
    const errs = {};
    const mobileErr = validateIndianMobile(f.mobile, false);
    if (mobileErr) errs.mobile = mobileErr;
    if (f.email && f.email.trim()) {
      const emailErr = validateEmail(f.email, false);
      if (emailErr) errs.email = emailErr;
    }
    if (Object.keys(errs).length > 0) {
      setOrgErrors(errs);
      focusFirstError(errs);
      return;
    }
    setOrgErrors({});
    if (selectedFile) {
      try {
        await api.upload('/api/settings/organization/logo', selectedFile);
        await refreshMeta?.();
      } catch (e) {
        toast.error('Logo upload error: ' + e.message);
        return;
      }
    }
    await save(() => api.put('/api/settings/organization', f), 'Organization information saved');
    reload();
  };

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden', borderRadius: 14, boxShadow: '0 4px 16px rgba(0,0,0,0.04)' }}>
      {/* Banner Header Matching Reference Screenshot (Attractive & Balanced) */}
      <div style={{
        background: 'linear-gradient(135deg, #0d2856 0%, #1d4ed8 100%)',
        padding: '12px 20px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        position: 'relative',
        overflow: 'hidden',
        color: '#ffffff'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, zIndex: 1 }}>
          <div style={{
            width: 34, height: 34, borderRadius: 9,
            background: 'rgba(255, 255, 255, 0.15)',
            backdropFilter: 'blur(8px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: '1px solid rgba(255, 255, 255, 0.25)',
            color: '#facc15'
          }}>
            <FiBriefcase size={16} />
          </div>
          <div>
            <h2 style={{ margin: 0, fontSize: 15, fontWeight: 900, color: '#ffffff', letterSpacing: '-0.01em' }}>
              {t('Organization Information', 'Organization Information')}
            </h2>
            <p style={{ margin: '1px 0 0', fontSize: 11.5, color: 'rgba(255, 255, 255, 0.85)', fontWeight: 500 }}>
              {t('Manage your chit fund business details', 'Manage your chit fund business details')}
            </p>
          </div>
        </div>

        {/* Ambient Glow Gradient */}
        <div style={{
          position: 'absolute', right: 0, top: 0, bottom: 0, width: 220,
          background: 'radial-gradient(ellipse at right, rgba(251, 191, 36, 0.22) 0%, transparent 70%)',
          pointerEvents: 'none'
        }} />
      </div>

      <div style={{ padding: '16px 20px' }}>
        {/* Form Fields: Single Icon Per Field (Exact 2-column grid, comfortable spacing) */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 20px', marginBottom: 8 }}>
          {/* Organization Name */}
          <div className="form-field-group">
            <label className="form-field-label">{t('Organization Name', 'Organization Name')}</label>
            <div className="input-with-icon">
              <div className="input-icon-pill"><FiHome size={13} /></div>
              <input
                value={f.name || ''}
                onChange={(e) => setF({ ...f, name: e.target.value })}
                placeholder="Siva Murugan Chit Fund"
              />
            </div>
          </div>

          {/* Email Address */}
          <div className="form-field-group">
            <label className="form-field-label">{t('Email Address', 'Email Address')}</label>
            <div className="input-with-icon">
              <div className="input-icon-pill"><FiMail size={13} /></div>
              <input
                type="email"
                name="email"
                value={f.email || ''}
                onChange={(e) => {
                  setF({ ...f, email: e.target.value });
                  if (orgErrors.email) {
                    setOrgErrors((prev) => { const n = { ...prev }; delete n.email; return n; });
                  }
                }}
                onBlur={(e) => {
                  if (e.target.value) {
                    const err = validateEmail(e.target.value, false);
                    if (err) setOrgErrors((prev) => ({ ...prev, email: err }));
                  }
                }}
                aria-invalid={!!orgErrors.email}
                className={orgErrors.email ? 'is-invalid' : ''}
                placeholder="info@sivamuruganchitfund.example"
              />
            </div>
            {orgErrors.email && <span className="field-error-msg err">{orgErrors.email}</span>}
          </div>

          {/* Mobile Number */}
          <div className="form-field-group">
            <label className="form-field-label">{t('Mobile Number', 'Mobile Number')}</label>
            <div className="input-with-icon">
              <div className="input-icon-pill"><FiPhone size={13} /></div>
              <input
                type="tel"
                name="mobile"
                inputMode="numeric"
                maxLength={10}
                value={f.mobile || ''}
                onKeyDown={handleNumericKeyDown}
                onChange={(e) => {
                  const v = e.target.value.replace(/\D/g, '').slice(0, 10);
                  setF({ ...f, mobile: v });
                  if (orgErrors.mobile && !validateIndianMobile(v, false)) {
                    setOrgErrors((errs) => {
                      const next = { ...errs };
                      delete next.mobile;
                      return next;
                    });
                  }
                }}
                onBlur={(e) => {
                  const err = validateIndianMobile(e.target.value, false);
                  setOrgErrors((errs) => {
                    const next = { ...errs };
                    if (err) next.mobile = err;
                    else delete next.mobile;
                    return next;
                  });
                }}
                aria-invalid={!!orgErrors.mobile}
                className={orgErrors.mobile ? 'is-invalid' : ''}
                placeholder={t('10-digit mobile number', '10-digit mobile number')}
              />
            </div>
            {orgErrors.mobile && <span className="field-error-msg err">{orgErrors.mobile}</span>}
          </div>

          {/* Telephone */}
          <div className="form-field-group">
            <label className="form-field-label">{t('Telephone', 'Telephone')}</label>
            <div className="input-with-icon">
              <div className="input-icon-pill"><FiPhoneCall size={13} /></div>
              <input
                value={f.telephone || ''}
                onChange={(e) => setF({ ...f, telephone: e.target.value })}
                placeholder="044-20000000"
              />
            </div>
          </div>

          {/* Website */}
          <div className="form-field-group">
            <label className="form-field-label">{t('Website', 'Website')}</label>
            <div className="input-with-icon">
              <div className="input-icon-pill"><FiGlobe size={13} /></div>
              <input
                value={f.website || ''}
                onChange={(e) => setF({ ...f, website: e.target.value })}
                placeholder="https://sivamuruganchitfund.example"
              />
            </div>
          </div>

          {/* GST / REG. No. */}
          <div className="form-field-group">
            <label className="form-field-label">{t('GST / REG. No.', 'GST / REG. No.')}</label>
            <div className="input-with-icon">
              <div className="input-icon-pill"><FiFileText size={13} /></div>
              <input
                value={f.gst || ''}
                onChange={(e) => setF({ ...f, gst: e.target.value })}
                placeholder="33ABCDE1234F1Z5"
              />
            </div>
          </div>
        </div>

        {/* Address spanning full width */}
        <div className="form-field-group" style={{ marginBottom: 10 }}>
          <label className="form-field-label">{t('Address', 'Address')}</label>
          <div className="input-with-icon">
            <div className="input-icon-pill"><FiMapPin size={13} /></div>
            <input
              value={f.address || ''}
              onChange={(e) => setF({ ...f, address: e.target.value })}
              placeholder={t('Main Road, Tamil Nadu', 'Main Road, Tamil Nadu')}
            />
          </div>
        </div>

        {/* Bottom Section: Logo Upload & Save Changes Button */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          paddingTop: 10, borderTop: '1px solid #edf2f7', flexWrap: 'wrap', gap: 12
        }}>
          {/* Logo Card & Upload */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <div style={{
              width: 90, height: 42, borderRadius: 10, border: '1.5px solid #cbd5e1',
              background: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: 4, overflow: 'hidden'
            }}>
              {selectedFile ? (
                <span style={{ fontSize: 10.5, fontWeight: 700, color: '#16a34a', textAlign: 'center' }}>{t('Selected', 'Selected')}</span>
              ) : logo ? (
                <img src={API_BASE + logo} alt="logo" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
              ) : (
                <span className="muted" style={{ fontSize: 10.5 }}>{t('No logo', 'No logo')}</span>
              )}
            </div>

            <div>
              <div style={{ fontWeight: 800, fontSize: 13, color: '#0f172a', lineHeight: 1.2 }}>{t('Organization Logo', 'Organization Logo')}</div>
              <div style={{ fontSize: 11, color: '#64748b' }}>PNG, JPG or SVG</div>
            </div>

            <input
              type="file"
              ref={fileRef}
              style={{ display: 'none' }}
              accept="image/png,image/jpeg,image/webp,image/svg+xml"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) setSelectedFile(file);
              }}
            />

            <button
              type="button"
              className="btn secondary sm"
              onClick={() => fileRef.current?.click()}
              style={{
                borderRadius: 16, border: '1.5px solid #cbd5e1', padding: '4px 14px',
                fontSize: 11.5, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 6,
                height: 30
              }}
            >
              <FiUpload size={12} /> {t('Choose File', 'Choose File')}
            </button>
            <span style={{ fontSize: 11, color: '#64748b' }}>
              {selectedFile ? selectedFile.name : t('No file chosen', 'No file chosen')}
            </span>
          </div>

          {/* Glowing Save Changes Button */}
          <button
            className="btn-save-glow"
            disabled={busy}
            onClick={handleSaveAll}
          >
            <FiSave size={14} /> {busy ? t('Saving…', 'Saving…') : t('Save Changes', 'Save Changes')}
          </button>
        </div>
      </div>
    </div>
  );
}

function ProfileTab({ user }) {
  const initial = user?.name ? user.name.charAt(0).toUpperCase() : 'U';
  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden', borderRadius: 14 }}>
      <div style={{
        background: 'linear-gradient(135deg, #0d2856 0%, #1d4ed8 100%)',
        padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 10, color: '#ffffff'
      }}>
        <div style={{
          width: 34, height: 34, borderRadius: 9, background: 'rgba(255, 255, 255, 0.15)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          border: '1px solid rgba(255, 255, 255, 0.25)', color: '#facc15'
        }}>
          <FiUser size={16} />
        </div>
        <div>
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 900, color: '#ffffff' }}>User Profile Settings</h2>
          <p style={{ margin: 0, fontSize: 11.5, color: 'rgba(255, 255, 255, 0.85)' }}>View account details and assigned permissions</p>
        </div>
      </div>
      <div style={{ padding: '16px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14, paddingBottom: 12, borderBottom: '1px solid #e2e8f0' }}>
          <div className="customer-avatar-box" style={{ width: 44, height: 44, fontSize: 18, borderRadius: 12 }}>{initial}</div>
          <div>
            <h3 style={{ margin: 0, fontSize: 15, color: '#0f172a' }}>{user?.name}</h3>
            <span className="badge PENDING" style={{ marginTop: 2, fontSize: 11 }}>{user?.role_name || user?.role}</span>
          </div>
        </div>
        <dl className="kv" style={{ gridTemplateColumns: '140px 1fr', rowGap: 8 }}>
          <dt>Full Name</dt><dd>{user?.name}</dd>
          <dt>Username</dt><dd><code>{user?.username}</code></dd>
          <dt>Email Address</dt><dd>{user?.email || '—'}</dd>
          <dt>System Role</dt><dd style={{ textTransform: 'capitalize', fontWeight: 700 }}>{user?.role_name || user?.role}</dd>
          <dt>Active Permissions</dt><dd><span className="badge COMPLETED">{(user?.permissions || []).length} permissions active</span></dd>
        </dl>
      </div>
    </div>
  );
}

function PasswordField({ name, label, value, onChange, onBlur, autoComplete, error }) {
  const [show, setShow] = useState(false);
  return (
    <div className="form-field-group">
      <label className="form-field-label">{label}</label>
      <div className="input-with-icon" style={{ position: 'relative' }}>
        <div className="input-icon-pill"><FiLock size={13} /></div>
        <input
          name={name}
          type={show ? 'text' : 'password'}
          value={value}
          onChange={onChange}
          onBlur={onBlur}
          autoComplete={autoComplete}
          placeholder={label}
          className={error ? 'is-invalid' : ''}
          aria-invalid={!!error}
        />
        <button
          type="button"
          className="password-toggle-btn"
          onClick={() => setShow((s) => !s)}
          tabIndex={-1}
          style={{ position: 'absolute', right: 12, background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}
          aria-label={show ? 'Hide password' : 'Show password'}
        >
          {show ? <IconEyeOff /> : <IconEye />}
        </button>
      </div>
      {error && <span className="field-error-msg err">{error}</span>}
    </div>
  );
}

function IconEye() {
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8Z" /><circle cx="12" cy="12" r="3" /></svg>;
}
function IconEyeOff() {
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-3.06 4.26M6.61 6.61A18.65 18.65 0 0 0 1 12s4 8 11 8a9.16 9.16 0 0 0 5.39-1.61M14.12 14.12a3 3 0 1 1-4.24-4.24" /><line x1="1" y1="1" x2="23" y2="23" /></svg>;
}

function ChangePasswordTab({ toast }) {
  const { t } = useI18n();
  const [f, setF] = useState({ current_password: '', new_password: '', confirm_password: '' });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);

  const setField = (k, v) => {
    setF((prev) => ({ ...prev, [k]: v }));
    if (errors[k]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[k];
        return next;
      });
    }
  };

  const submit = async () => {
    const errs = {};
    if (!f.current_password) errs.current_password = 'Current password is required.';
    const passErr = validatePassword(f.new_password, true, 8);
    if (passErr) errs.new_password = passErr;
    const confirmErr = validateConfirmPassword(f.confirm_password, f.new_password);
    if (confirmErr) errs.confirm_password = confirmErr;
    if (f.new_password && f.current_password && f.new_password === f.current_password) {
      errs.new_password = 'New password must be different from current password.';
    }

    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      focusFirstError(errs);
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      await api.post('/api/auth/change-password', f);
      toast.success(t('Password changed successfully', 'Password changed successfully'));
      setF({ current_password: '', new_password: '', confirm_password: '' });
    } catch (e) {
      if (e.errors) {
        const mapped = Object.fromEntries(Object.entries(e.errors).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]));
        setErrors(mapped);
        focusFirstError(mapped);
      } else {
        toast.error(e.message);
      }
    } finally { setBusy(false); }
  };

  return (
    <div className="card" style={{ maxWidth: 460, padding: 0, overflow: 'hidden', borderRadius: 14 }}>
      <div style={{
        background: 'linear-gradient(135deg, #0d2856 0%, #1d4ed8 100%)',
        padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 10, color: '#ffffff'
      }}>
        <div style={{
          width: 34, height: 34, borderRadius: 9, background: 'rgba(255, 255, 255, 0.15)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          border: '1px solid rgba(255, 255, 255, 0.25)', color: '#facc15'
        }}>
          <FiLock size={16} />
        </div>
        <div>
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 900, color: '#ffffff' }}>{t('Change Password', 'Change Password')}</h2>
          <p style={{ margin: 0, fontSize: 11.5, color: 'rgba(255, 255, 255, 0.85)' }}>{t('Update your account login password', 'Update your account login password')}</p>
        </div>
      </div>
      <div style={{ padding: '16px 20px' }}>
        <PasswordField
          name="current_password"
          label={t('Current Password *', 'Current Password *')}
          value={f.current_password}
          autoComplete="current-password"
          error={errors.current_password}
          onChange={(e) => setField('current_password', e.target.value)}
          onBlur={() => {
            if (!f.current_password) setErrors((prev) => ({ ...prev, current_password: 'Current password is required.' }));
          }}
        />
        <PasswordField
          name="new_password"
          label={t('New Password *', 'New Password *')}
          value={f.new_password}
          autoComplete="new-password"
          error={errors.new_password}
          onChange={(e) => setField('new_password', e.target.value)}
          onBlur={() => {
            const err = validatePassword(f.new_password, true, 8);
            if (err) setErrors((prev) => ({ ...prev, new_password: err }));
          }}
        />
        <PasswordField
          name="confirm_password"
          label={t('Confirm Password *', 'Confirm Password *')}
          value={f.confirm_password}
          autoComplete="new-password"
          error={errors.confirm_password}
          onChange={(e) => setField('confirm_password', e.target.value)}
          onBlur={() => {
            const err = validateConfirmPassword(f.confirm_password, f.new_password);
            if (err) setErrors((prev) => ({ ...prev, confirm_password: err }));
          }}
        />
        <button className="btn-save-glow" style={{ width: '100%', marginTop: 8, justifyContent: 'center' }} disabled={busy} onClick={submit}>
          <FiSave size={14} /> {busy ? t('Saving…', 'Saving…') : t('Change Password', 'Change Password')}
        </button>
      </div>
    </div>
  );
}

function ScheduleTab({ data, busy, save }) {
  const { t } = useI18n();
  const [f, setF] = useState(data.schedule || {});
  const days = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden', borderRadius: 14 }}>
      <div style={{
        background: 'linear-gradient(135deg, #0d2856 0%, #1d4ed8 100%)',
        padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 10, color: '#ffffff'
      }}>
        <div style={{
          width: 34, height: 34, borderRadius: 9, background: 'rgba(255, 255, 255, 0.15)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          border: '1px solid rgba(255, 255, 255, 0.25)', color: '#facc15'
        }}>
          <FiCalendar size={16} />
        </div>
        <div>
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 900, color: '#ffffff' }}>{t('Collection Schedule', 'Collection Schedule')}</h2>
          <p style={{ margin: 0, fontSize: 11.5, color: 'rgba(255, 255, 255, 0.85)' }}>{t('Configure weekly & monthly due date cycles', 'Configure weekly & monthly due date cycles')}</p>
        </div>
      </div>
      <div style={{ padding: '16px 20px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 20px', marginBottom: 12 }}>
          <div className="form-field-group">
            <label className="form-field-label">{t('Weekly collection day', 'Weekly collection day')}</label>
            <div className="input-with-icon">
              <div className="input-icon-pill"><FiCalendar size={13} /></div>
              <select value={f.weekly_collection_day || 1} onChange={(e) => setF({ ...f, weekly_collection_day: Number(e.target.value) })}>
                {[1, 2, 3, 4, 5, 6, 7].map((d) => <option key={d} value={d}>{t(days[d], days[d])}</option>)}
              </select>
            </div>
          </div>
          <div className="form-field-group">
            <label className="form-field-label">{t('Monthly mode', 'Monthly mode')}</label>
            <div className="input-with-icon">
              <div className="input-icon-pill"><FiCalendar size={13} /></div>
              <select value={f.monthly_mode || 'MONTHLY_WEEKDAY'} onChange={(e) => setF({ ...f, monthly_mode: e.target.value })}>
                <option value="MONTHLY_WEEKDAY">{t('Weekday cycle', 'Weekday cycle')}</option>
                <option value="MONTHLY_DAILY">{t('Calendar month', 'Calendar month')}</option>
                <option value="MONTHLY_INTERVAL">{t('Fixed day interval', 'Fixed day interval')}</option>
              </select>
            </div>
          </div>
          <div className="form-field-group">
            <label className="form-field-label">{t('Cycle weeks (weekday mode)', 'Cycle weeks (weekday mode)')}</label>
            <div className="input-with-icon">
              <div className="input-icon-pill"><FiCalendar size={13} /></div>
              <input type="number" min="1" max="8" value={f.monthly_cycle_weeks || 4} onChange={(e) => setF({ ...f, monthly_cycle_weeks: Number(e.target.value) })} />
            </div>
          </div>
          <div className="form-field-group">
            <label className="form-field-label">{t('Interval days (interval mode)', 'Interval days (interval mode)')}</label>
            <div className="input-with-icon">
              <div className="input-icon-pill"><FiCalendar size={13} /></div>
              <input type="number" min="1" max="120" value={f.monthly_interval_days || 30} onChange={(e) => setF({ ...f, monthly_interval_days: Number(e.target.value) })} />
            </div>
          </div>
        </div>
        <p className="muted" style={{ fontSize: 11, marginBottom: 12 }}>{t('Changes apply to newly generated / future unpaid installments only. Historical transactions are never rewritten.', 'Changes apply to newly generated / future unpaid installments only. Historical transactions are never rewritten.')}</p>
        <button className="btn-save-glow" disabled={busy} onClick={() => save(() => api.put('/api/settings/schedule', f), 'Schedule settings saved')}>
          <FiSave size={14} /> {busy ? t('Saving…', 'Saving…') : t('Save Schedule', 'Save Schedule')}
        </button>
      </div>
    </div>
  );
}

function FineTab({ data, busy, save }) {
  const { t } = useI18n();
  const [f, setF] = useState({
    fine_type: 'FIXED_PER_DAY', rate_value: 50, grace_days: 0,
    max_fine_type: 'percent_of_payable', max_fine_value: 10,
    effective_from: new Date().toISOString().slice(0, 10), notes: '',
  });
  return (
    <>
      <div className="card" style={{ marginBottom: 12, borderRadius: 14, overflow: 'hidden', padding: 0 }}>
        <div style={{
          background: 'linear-gradient(135deg, #0d2856 0%, #1d4ed8 100%)',
          padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 10, color: '#ffffff'
        }}>
          <div style={{
            width: 34, height: 34, borderRadius: 9, background: 'rgba(255, 255, 255, 0.15)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: '1px solid rgba(255, 255, 255, 0.25)', color: '#facc15'
          }}>
            <FiAward size={16} />
          </div>
          <div>
            <h2 style={{ margin: 0, fontSize: 15, fontWeight: 900, color: '#ffffff' }}>{t('Effective-dated Fine Rules', 'Effective-dated Fine Rules')}</h2>
            <p style={{ margin: 0, fontSize: 11.5, color: 'rgba(255, 255, 255, 0.85)' }}>{t('Active late fine calculation rules', 'Active late fine calculation rules')}</p>
          </div>
        </div>
        <div className="table-wrap">
          <table className="grid">
            <thead>
              <tr>
                <th>{t('Effective from', 'Effective from')}</th>
                <th>{t('Type', 'Type')}</th>
                <th className="right">{t('Rate', 'Rate')}</th>
                <th className="right">{t('Grace', 'Grace')}</th>
                <th>{t('Cap', 'Cap')}</th>
                <th>{t('Active', 'Active')}</th>
              </tr>
            </thead>
            <tbody>
              {data.fine_settings.map((r) => (
                <tr key={r.id}>
                  <td>{fmtDate(r.effective_from)}</td>
                  <td>{t(r.fine_type, r.fine_type)}</td>
                  <td className="right">{r.rate_value}</td>
                  <td className="right">{r.grace_days}</td>
                  <td>{r.max_fine_type === 'none' ? '—' : `${r.max_fine_value} ${r.max_fine_type === 'percent_of_payable' ? t('% of payable', '% of payable') : t('flat amount', 'flat')}`}</td>
                  <td><span className={`badge ${r.active ? 'active' : 'inactive'}`}>{r.active ? t('Active', 'active') : t('Inactive', 'inactive')}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="card" style={{ borderRadius: 14, padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '10px 20px', borderBottom: '1px solid #e2e8f0', background: '#f8fafc' }}>
          <h3 style={{ margin: 0, fontSize: 13, fontWeight: 800, color: '#0f172a' }}>{t('Add a New Fine Rule', 'Add a New Fine Rule')}</h3>
        </div>
        <div style={{ padding: '14px 20px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '8px 16px', marginBottom: 10 }}>
            <div className="form-field-group">
              <label className="form-field-label">{t('Fine type', 'Fine type')}</label>
              <div className="input-with-icon">
                <div className="input-icon-pill"><FiAward size={13} /></div>
                <select value={f.fine_type} onChange={(e) => setF({ ...f, fine_type: e.target.value })}>
                  {['NONE', 'FIXED_PER_DAY', 'PERCENT_PER_DAY', 'FIXED_PER_INSTALLMENT'].map((item) => <option key={item} value={item}>{t(item, item)}</option>)}
                </select>
              </div>
            </div>
            <div className="form-field-group">
              <label className="form-field-label">{t('Rate / value', 'Rate / value')}</label>
              <div className="input-with-icon">
                <div className="input-icon-pill"><FiAward size={13} /></div>
                <input type="number" min="0" step="0.01" value={f.rate_value} onChange={(e) => setF({ ...f, rate_value: Number(e.target.value) })} />
              </div>
            </div>
            <div className="form-field-group">
              <label className="form-field-label">{t('Grace days', 'Grace days')}</label>
              <div className="input-with-icon">
                <div className="input-icon-pill"><FiCalendar size={13} /></div>
                <input type="number" min="0" max="60" value={f.grace_days} onChange={(e) => setF({ ...f, grace_days: Number(e.target.value) })} />
              </div>
            </div>
            <div className="form-field-group">
              <label className="form-field-label">{t('Cap type', 'Cap type')}</label>
              <div className="input-with-icon">
                <div className="input-icon-pill"><FiAward size={13} /></div>
                <select value={f.max_fine_type} onChange={(e) => setF({ ...f, max_fine_type: e.target.value })}>
                  <option value="none">{t('No cap', 'No cap')}</option>
                  <option value="percent_of_payable">{t('% of payable', '% of payable')}</option>
                  <option value="flat">{t('Flat amount', 'Flat amount')}</option>
                </select>
              </div>
            </div>
            <div className="form-field-group">
              <label className="form-field-label">{t('Cap value', 'Cap value')}</label>
              <div className="input-with-icon">
                <div className="input-icon-pill"><FiAward size={13} /></div>
                <input type="number" min="0" step="0.01" value={f.max_fine_value} onChange={(e) => setF({ ...f, max_fine_value: Number(e.target.value) })} />
              </div>
            </div>
            <div className="form-field-group">
              <label className="form-field-label">{t('Effective from', 'Effective from')}</label>
              <div className="input-with-icon">
                <div className="input-icon-pill"><FiCalendar size={13} /></div>
                <input type="date" value={f.effective_from} onChange={(e) => setF({ ...f, effective_from: e.target.value })} />
              </div>
            </div>
          </div>
          <div className="form-field-group" style={{ marginBottom: 12 }}>
            <label className="form-field-label">{t('Notes', 'Notes')}</label>
            <div className="input-with-icon">
              <div className="input-icon-pill"><FiFileText size={13} /></div>
              <input value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} placeholder={t('Notes', 'Rule notes')} />
            </div>
          </div>
          <button className="btn-save-glow" disabled={busy} onClick={() => save(() => api.post('/api/settings/fine', f), 'New fine rule saved')}>
            <FiSave size={14} /> {busy ? t('Saving…', 'Saving…') : t('Add Fine Rule', 'Add Fine Rule')}
          </button>
        </div>
      </div>
    </>
  );
}

function ListTab({ title, rows, busy, save, createPath, fields }) {
  const { t } = useI18n();
  const [f, setF] = useState(Object.fromEntries(fields.map(([k]) => [k, ''])));
  const [errors, setErrors] = useState({});

  const setField = (k, v) => {
    setF((prev) => ({ ...prev, [k]: v }));
    if (errors[k]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[k];
        return next;
      });
    }
  };

  const handleAdd = () => {
    const errs = {};
    if (fields.some(([k]) => k === 'code')) {
      const codeErr = validateText(f.code, { required: true, fieldLabel: 'Code' });
      if (codeErr) errs.code = codeErr;
    }
    if (fields.some(([k]) => k === 'name')) {
      const nameErr = validateText(f.name, { required: true, fieldLabel: 'Name' });
      if (nameErr) errs.name = nameErr;
    }
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      focusFirstError(errs);
      return;
    }
    setErrors({});
    save(() => api.post(createPath, f), `${title} updated`);
  };

  return (
    <>
      <div className="card" style={{ marginBottom: 12, borderRadius: 14, overflow: 'hidden', padding: 0 }}>
        <div style={{
          background: 'linear-gradient(135deg, #0d2856 0%, #1d4ed8 100%)',
          padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 10, color: '#ffffff'
        }}>
          <div style={{
            width: 34, height: 34, borderRadius: 9, background: 'rgba(255, 255, 255, 0.15)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: '1px solid rgba(255, 255, 255, 0.25)', color: '#facc15'
          }}>
            <FiCreditCard size={16} />
          </div>
          <div>
            <h2 style={{ margin: 0, fontSize: 15, fontWeight: 900, color: '#ffffff' }}>{t(title, title)}</h2>
            <p style={{ margin: 0, fontSize: 11.5, color: 'rgba(255, 255, 255, 0.85)' }}>{t('Manage payment mode definitions', 'Manage payment mode definitions')}</p>
          </div>
        </div>
        <div className="table-wrap">
          <table className="grid">
            <thead>
              <tr>
                {fields.map(([k, l]) => <th key={k}>{t(l, l)}</th>)}
                <th>{t('Active', 'Active')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  {fields.map(([k]) => <td key={k}>{String(r[k] ?? '—')}</td>)}
                  <td><span className={`badge ${r.is_active ? 'active' : 'inactive'}`}>{r.is_active ? t('Active', 'active') : t('Inactive', 'inactive')}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="card" style={{ borderRadius: 14, padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '10px 20px', borderBottom: '1px solid #e2e8f0', background: '#f8fafc' }}>
          <h3 style={{ margin: 0, fontSize: 13, fontWeight: 800, color: '#0f172a' }}>{t('Add', 'Add')} {t(title, title)}</h3>
        </div>
        <div style={{ padding: '14px 20px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '8px 16px', marginBottom: 12 }}>
            {fields.map(([k, l, type, opts]) => (
              <div key={k} className="form-field-group">
                <label className="form-field-label">{t(l, l)}</label>
                <div className="input-with-icon">
                  <div className="input-icon-pill"><FiFileText size={13} /></div>
                  {type === 'select'
                    ? <select value={f[k]} onChange={(e) => setField(k, e.target.value)}><option value="">—</option>{opts.map((o) => <option key={o}>{o}</option>)}</select>
                    : <input
                        name={k}
                        type={type || 'text'}
                        value={f[k]}
                        onChange={(e) => setField(k, e.target.value)}
                        onBlur={() => {
                          if (k === 'code' || k === 'name') {
                            const err = validateText(f[k], { required: true, fieldLabel: l });
                            if (err) setErrors((prev) => ({ ...prev, [k]: err }));
                          }
                        }}
                        className={errors[k] ? 'is-invalid' : ''}
                        aria-invalid={!!errors[k]}
                        placeholder={t(l, l)}
                      />}
                </div>
                {errors[k] && <span className="field-error-msg err">{errors[k]}</span>}
              </div>
            ))}
          </div>
          <button className="btn-save-glow" disabled={busy} onClick={handleAdd}>
            <FiSave size={14} /> {busy ? t('Saving…', 'Saving…') : t('Add', 'Add')}
          </button>
        </div>
      </div>
    </>
  );
}

function AccountsTab({ data, busy, save }) {
  const { t } = useI18n();
  const [f, setF] = useState({ code: '', name: '', type: 'bank', opening_balance: 0 });
  const [errors, setErrors] = useState({});

  const setField = (k, v) => {
    setF((prev) => ({ ...prev, [k]: v }));
    if (errors[k]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[k];
        return next;
      });
    }
  };

  const handleAdd = () => {
    const errs = {};
    const codeErr = validateText(f.code, { required: true, fieldLabel: 'Account code' });
    if (codeErr) errs.code = codeErr;
    const nameErr = validateText(f.name, { required: true, fieldLabel: 'Account name' });
    if (nameErr) errs.name = nameErr;
    if (f.opening_balance !== '' && Number(f.opening_balance) < 0) {
      errs.opening_balance = 'Opening balance cannot be negative.';
    }

    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      focusFirstError(errs);
      return;
    }
    setErrors({});
    save(() => api.post('/api/settings/accounts', { ...f, opening_balance: Number(f.opening_balance || 0) }), 'Account added');
  };

  return (
    <>
      <div className="card" style={{ marginBottom: 12, borderRadius: 14, overflow: 'hidden', padding: 0 }}>
        <div style={{
          background: 'linear-gradient(135deg, #0d2856 0%, #1d4ed8 100%)',
          padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 10, color: '#ffffff'
        }}>
          <div style={{
            width: 34, height: 34, borderRadius: 9, background: 'rgba(255, 255, 255, 0.15)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: '1px solid rgba(255, 255, 255, 0.25)', color: '#facc15'
          }}>
            <FiDollarSign size={16} />
          </div>
          <div>
            <h2 style={{ margin: 0, fontSize: 15, fontWeight: 900, color: '#ffffff' }}>{t('Bank & Cash Accounts', 'Bank & Cash Accounts')}</h2>
            <p style={{ margin: 0, fontSize: 11.5, color: 'rgba(255, 255, 255, 0.85)' }}>{t('Office cash, petty cash and bank balance', 'Office cash, petty cash and bank balance')}</p>
          </div>
        </div>
        <div className="table-wrap">
          <table className="grid">
            <thead>
              <tr>
                <th>{t('Code', 'Code')}</th>
                <th>{t('Name', 'Name')}</th>
                <th>{t('Type', 'Type')}</th>
                <th className="right">{t('Opening', 'Opening')}</th>
                <th className="right">{t('Current balance', 'Current balance')}</th>
                <th>{t('Active', 'Active')}</th>
              </tr>
            </thead>
            <tbody>
              {data.accounts.map((a) => (
                <tr key={a.id}>
                  <td><code>{a.code}</code></td><td>{a.name}</td><td>{t(a.type, a.type)}</td>
                  <td className="right">{money(a.opening_balance)}</td>
                  <td className="right"><b>{money(a.current_balance)}</b></td>
                  <td><span className={`badge ${a.is_active ? 'active' : 'inactive'}`}>{a.is_active ? t('Active', 'active') : t('Inactive', 'inactive')}</span></td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ background: 'var(--blue-50)', fontWeight: 800 }}>
                <td colSpan={4}>{t('Office Cash', 'Office Cash')} {money(data.finance?.office_cash)} + {t('Bank Cash', 'Bank Cash')} {money(data.finance?.bank_cash)} =</td>
                <td className="right">{money(data.finance?.total_amount)}</td><td />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
      <div className="card" style={{ borderRadius: 14, padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '10px 20px', borderBottom: '1px solid #e2e8f0', background: '#f8fafc' }}>
          <h3 style={{ margin: 0, fontSize: 13, fontWeight: 800, color: '#0f172a' }}>{t('Add Account', 'Add Account')}</h3>
        </div>
        <div style={{ padding: '14px 20px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '8px 16px', marginBottom: 12 }}>
            <div className="form-field-group">
              <label className="form-field-label">{t('Code *', 'Code *')}</label>
              <div className="input-with-icon">
                <div className="input-icon-pill"><FiFileText size={13} /></div>
                <input
                  name="code"
                  value={f.code}
                  onChange={(e) => setField('code', e.target.value)}
                  onBlur={() => {
                    const err = validateText(f.code, { required: true, fieldLabel: 'Account code' });
                    if (err) setErrors((prev) => ({ ...prev, code: err }));
                  }}
                  className={errors.code ? 'is-invalid' : ''}
                  aria-invalid={!!errors.code}
                  placeholder="e.g. CASH-01"
                />
              </div>
              {errors.code && <span className="field-error-msg err">{errors.code}</span>}
            </div>
            <div className="form-field-group">
              <label className="form-field-label">{t('Name *', 'Name *')}</label>
              <div className="input-with-icon">
                <div className="input-icon-pill"><FiFileText size={13} /></div>
                <input
                  name="name"
                  value={f.name}
                  onChange={(e) => setField('name', e.target.value)}
                  onBlur={() => {
                    const err = validateText(f.name, { required: true, fieldLabel: 'Account name' });
                    if (err) setErrors((prev) => ({ ...prev, name: err }));
                  }}
                  className={errors.name ? 'is-invalid' : ''}
                  aria-invalid={!!errors.name}
                  placeholder="e.g. Main Office Cash"
                />
              </div>
              {errors.name && <span className="field-error-msg err">{errors.name}</span>}
            </div>
            <div className="form-field-group">
              <label className="form-field-label">{t('Type', 'Type')}</label>
              <div className="input-with-icon">
                <div className="input-icon-pill"><FiDollarSign size={13} /></div>
                <select value={f.type} onChange={(e) => setField('type', e.target.value)}>
                  <option value="cash">{t('Cash', 'cash')}</option><option value="bank">{t('Bank', 'bank')}</option><option value="other">{t('Other', 'other')}</option>
                </select>
              </div>
            </div>
            <div className="form-field-group">
              <label className="form-field-label">{t('Opening balance', 'Opening balance')}</label>
              <div className="input-with-icon">
                <div className="input-icon-pill"><FiDollarSign size={13} /></div>
                <input
                  name="opening_balance"
                  type="number"
                  step="0.01"
                  value={f.opening_balance}
                  onChange={(e) => setField('opening_balance', e.target.value)}
                  onBlur={() => {
                    if (f.opening_balance !== '' && Number(f.opening_balance) < 0) {
                      setErrors((prev) => ({ ...prev, opening_balance: 'Opening balance cannot be negative.' }));
                    }
                  }}
                  className={errors.opening_balance ? 'is-invalid' : ''}
                  aria-invalid={!!errors.opening_balance}
                  placeholder="0.00"
                />
              </div>
              {errors.opening_balance && <span className="field-error-msg err">{errors.opening_balance}</span>}
            </div>
          </div>
          <button className="btn-save-glow" disabled={busy} onClick={handleAdd}>
            <FiSave size={14} /> {busy ? t('Saving…', 'Saving…') : t('Add Account', 'Add Account')}
          </button>
        </div>
      </div>
      <div className="card" style={{ marginTop: 12, borderRadius: 14, padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '10px 20px', borderBottom: '1px solid #e2e8f0', background: '#f8fafc' }}>
          <h3 style={{ margin: 0, fontSize: 13, fontWeight: 800, color: '#0f172a' }}>{t('Set Opening Balance', 'Set Opening Balance')}</h3>
          <p className="muted" style={{ fontSize: 11, margin: '2px 0 0' }}>{t('Use this to enter the real starting cash / bank balance for the business.', 'Use this to enter the real starting cash / bank balance for the business.')}</p>
        </div>
        <div style={{ padding: '14px 20px' }}>
          {data.accounts.map((a) => <OpeningBalanceRow key={a.id} account={a} busy={busy} save={save} />)}
        </div>
      </div>
    </>
  );
}

function OpeningBalanceRow({ account, busy, save }) {
  const { t } = useI18n();
  const [v, setV] = useState(account.opening_balance);
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 8, flexWrap: 'wrap' }}>
      <span style={{ width: 180, fontWeight: 700, fontSize: 12.5 }}>{account.name} ({t(account.type, account.type)})</span>
      <div className="input-with-icon" style={{ width: 160 }}>
        <div className="input-icon-pill"><FiDollarSign size={13} /></div>
        <input type="number" step="0.01" value={v} onChange={(e) => setV(e.target.value)} />
      </div>
      <button className="btn sm secondary" disabled={busy}
        onClick={() => save(() => api.put(`/api/settings/accounts/${account.id}`, { opening_balance: Number(v || 0) }), 'Opening balance updated')}>{t('Save', 'Save')}</button>
    </div>
  );
}

function ChitCodeTab({ data, busy, save }) {
  const { t } = useI18n();
  const cf = data.code_format || {};
  const [prefix, setPrefix] = useState(cf.loan_prefix || 'SM');
  const clean = (prefix || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return (
    <div className="card" style={{ borderRadius: 14, padding: 0, overflow: 'hidden' }}>
      <div style={{
        background: 'linear-gradient(135deg, #0d2856 0%, #1d4ed8 100%)',
        padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 10, color: '#ffffff'
      }}>
        <div style={{
          width: 34, height: 34, borderRadius: 9, background: 'rgba(255, 255, 255, 0.15)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          border: '1px solid rgba(255, 255, 255, 0.25)', color: '#facc15'
        }}>
          <FiGrid size={16} />
        </div>
        <div>
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 900, color: '#ffffff' }}>{t('Chit Code Prefix', 'Chit Code Prefix')}</h2>
          <p style={{ margin: 0, fontSize: 11.5, color: 'rgba(255, 255, 255, 0.85)' }}>{t('Custom prefix for auto-generated chit numbers', 'Custom prefix for auto-generated chit numbers')}</p>
        </div>
      </div>
      <div style={{ padding: '14px 20px' }}>
        <div className="form-field-group" style={{ maxWidth: 260, marginBottom: 10 }}>
          <label className="form-field-label">{t('Chit Code Prefix', 'Chit Code Prefix')}</label>
          <div className="input-with-icon">
            <div className="input-icon-pill"><FiGrid size={13} /></div>
            <input value={prefix} onChange={(e) => setPrefix(e.target.value)} maxLength={8} />
          </div>
        </div>
        <p className="muted" style={{ fontSize: 11, marginBottom: 12 }}>
          {t('New chits auto-generate as', 'New chits auto-generate as')} <b>{clean || 'PREFIX'}-1</b>, <b>{clean || 'PREFIX'}-2</b>, <b>{clean || 'PREFIX'}-3</b> …
          {t('The numeric part increments automatically and is unique (checked on the backend).', 'The numeric part increments automatically and is unique (checked on the backend).')}
          <br />{t('Changing the prefix only affects new chits — existing chit codes are never rewritten.', 'Changing the prefix only affects new chits — existing chit codes are never rewritten.')}
        </p>
        <button className="btn-save-glow" disabled={busy || !clean}
          onClick={() => save(() => api.put('/api/settings/chit-prefix', { prefix: clean }), `Chit code prefix saved — next chit will be ${clean}-N`)}>
          <FiSave size={14} /> {busy ? t('Saving…', 'Saving…') : t('Save Prefix', 'Save Prefix')}
        </button>
      </div>
    </div>
  );
}

function LangTab({ data, busy, save }) {
  const { lang, setLang, t } = useI18n();
  const [def, setDef] = useState(data.locale?.default || lang || 'en');
  return (
    <div className="card" style={{ borderRadius: 14, padding: 0, overflow: 'hidden' }}>
      <div style={{
        background: 'linear-gradient(135deg, #0d2856 0%, #1d4ed8 100%)',
        padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 10, color: '#ffffff'
      }}>
        <div style={{
          width: 34, height: 34, borderRadius: 9, background: 'rgba(255, 255, 255, 0.15)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          border: '1px solid rgba(255, 255, 255, 0.25)', color: '#facc15'
        }}>
          <FiGlobe size={16} />
        </div>
        <div>
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 900, color: '#ffffff' }}>{t('System Language', 'System Language')}</h2>
          <p style={{ margin: 0, fontSize: 11.5, color: 'rgba(255, 255, 255, 0.85)' }}>{t('Configure default application language', 'Configure default application language')}</p>
        </div>
      </div>
      <div style={{ padding: '14px 20px' }}>
        <div className="form-field-group" style={{ maxWidth: 260, marginBottom: 10 }}>
          <label className="form-field-label">{t('Language', 'Language')}</label>
          <div className="input-with-icon">
            <div className="input-icon-pill"><FiGlobe size={13} /></div>
            <select value={lang} onChange={(e) => { setLang(e.target.value); setDef(e.target.value); }}>
              <option value="en">English</option>
              <option value="ta">தமிழ் (Tamil)</option>
            </select>
          </div>
        </div>
        <p className="muted" style={{ fontSize: 11, marginBottom: 12 }}>
          {t('The interface switches immediately and your choice is remembered on this device (localStorage).', 'The interface switches immediately and your choice is remembered on this device (localStorage).')}
        </p>
        <button className="btn-save-glow" disabled={busy}
          onClick={() => save(() => api.put('/api/settings/locale', { default: def }), 'Default language saved for all users')}>
          <FiSave size={14} /> {busy ? t('Saving…', 'Saving…') : t('Make Default for Everyone', 'Make Default for Everyone')}
        </button>
      </div>
    </div>
  );
}
