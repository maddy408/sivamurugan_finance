import { useEffect, useRef, useState } from 'react';
import { api, API_BASE, fmtDate, money } from '../api/client';
import { Spinner, ErrorState, Field } from '../components/ui';
import { useToast } from '../state/ToastContext';
import { useAuth } from '../state/AuthContext';
import { useI18n } from '../state/I18nContext';
import Employees from './Employees';

export default function Settings() {
  const toast = useToast();
  const { user, can, isAdmin, refreshMeta } = useAuth();
  const [tab, setTab] = useState('Profile');
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef();

  const tabs = [
    'Profile',
    'Organization',
    ...((can('employees.view') || isAdmin) ? ['Employees'] : []),
    'Chit codes',
    'Schedule',
    'Fine rules',
    'Payment modes',
    'Accounts',
    'Language',
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
      <div className="page-header">
        <h1 className="page-title">⚙️ Settings</h1>
      </div>

      <div className="toolbar" style={{ marginBottom: 20 }}>
        {tabs.map((t) => (
          <button key={t} className={`btn sm ${tab === t ? '' : 'secondary'}`} onClick={() => setTab(t)}>
            {t === 'Employees' ? '👨‍💼 Employees' : t}
          </button>
        ))}
      </div>

      {tab === 'Profile' && <ProfileTab user={user} />}
      {tab === 'Organization' && <OrgTab data={data} busy={busy} save={save} fileRef={fileRef} toast={toast} reload={load} refreshMeta={refreshMeta} />}
      {tab === 'Employees' && <Employees />}
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

function ProfileTab({ user }) {
  const initial = user?.name ? user.name.charAt(0).toUpperCase() : 'U';
  return (
    <div className="card">
      <div className="card-head">
        <h2>👤 User Profile Settings</h2>
      </div>
      <div className="card-body">
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20, paddingBottom: 16, borderBottom: '1px solid var(--line-subtle)' }}>
          <div className="customer-avatar-box" style={{ width: 56, height: 56, fontSize: 24 }}>{initial}</div>
          <div>
            <h3 style={{ margin: 0, fontSize: 18, color: '#0f172a' }}>{user?.name}</h3>
            <span className="badge PENDING" style={{ marginTop: 4 }}>{user?.role_name || user?.role}</span>
          </div>
        </div>
        <dl className="kv" style={{ gridTemplateColumns: '160px 1fr', rowGap: 10 }}>
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

function OrgTab({ data, busy, save, fileRef, toast, reload, refreshMeta }) {
  const [f, setF] = useState(data.organization || {});
  const logo = data.organization?.logo_path;
  return (
    <div className="card"><div className="card-body">
      <div className="form-grid">
        {[['name', 'Organization name'], ['email', 'Email'], ['mobile', 'Mobile'], ['telephone', 'Telephone'], ['website', 'Website'], ['gst', 'GST / Reg. no']].map(([k, l]) => (
          <Field key={k} label={l}><input value={f[k] || ''} onChange={(e) => setF({ ...f, [k]: e.target.value })} /></Field>
        ))}
      </div>
      <Field label="Address"><textarea rows={2} value={f.address || ''} onChange={(e) => setF({ ...f, address: e.target.value })} /></Field>

      <Field label="Organization logo (also shown in the top navbar)">
        <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ width: 56, height: 56, borderRadius: 12, border: '1px solid var(--line)', background: '#f8fafc',
            display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
            {logo
              ? <img src={API_BASE + logo} alt="logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
              : <span className="muted" style={{ fontSize: 11 }}>No logo</span>}
          </div>
          <input type="file" ref={fileRef} accept="image/png,image/jpeg,image/webp" />
          <button className="btn secondary" disabled={busy} onClick={async () => {
            const file = fileRef.current?.files?.[0];
            if (!file) return toast.error('Choose an image first');
            try {
              await api.upload('/api/settings/organization/logo', file);
              toast.success('Logo updated — navbar refreshed');
              await refreshMeta?.();   // navbar picks up the new logo without a page reload
              reload();
            } catch (e) { toast.error(e.message); }
          }}>Upload logo</button>
        </div>
      </Field>

      <button className="btn" disabled={busy} onClick={() => save(() => api.put('/api/settings/organization', f), 'Organization profile saved')}>Save profile</button>
    </div></div>
  );
}

function ScheduleTab({ data, busy, save }) {
  const [f, setF] = useState(data.schedule || {});
  const days = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  return (
    <div className="card"><div className="card-body">
      <div className="form-grid">
        <Field label="Weekly collection day">
          <select value={f.weekly_collection_day || 1} onChange={(e) => setF({ ...f, weekly_collection_day: Number(e.target.value) })}>
            {[1, 2, 3, 4, 5, 6, 7].map((d) => <option key={d} value={d}>{days[d]}</option>)}
          </select>
        </Field>
        <Field label="Monthly mode">
          <select value={f.monthly_mode || 'MONTHLY_WEEKDAY'} onChange={(e) => setF({ ...f, monthly_mode: e.target.value })}>
            <option value="MONTHLY_WEEKDAY">Weekday cycle</option>
            <option value="MONTHLY_DAILY">Daily display</option>
            <option value="MONTHLY_INTERVAL">Day interval</option>
          </select>
        </Field>
        <Field label="Cycle weeks (weekday mode)"><input type="number" min="1" max="8" value={f.monthly_cycle_weeks || 4} onChange={(e) => setF({ ...f, monthly_cycle_weeks: Number(e.target.value) })} /></Field>
        <Field label="Interval days (interval mode)"><input type="number" min="1" max="120" value={f.monthly_interval_days || 30} onChange={(e) => setF({ ...f, monthly_interval_days: Number(e.target.value) })} /></Field>
      </div>
      <p className="muted" style={{ fontSize: 12 }}>Changes apply to newly generated / future unpaid installments only. Historical transactions are never rewritten.</p>
      <button className="btn" disabled={busy} onClick={() => save(() => api.put('/api/settings/schedule', f), 'Schedule settings saved')}>Save</button>
    </div></div>
  );
}

function FineTab({ data, busy, save }) {
  const [f, setF] = useState({
    fine_type: 'FIXED_PER_DAY', rate_value: 50, grace_days: 0,
    max_fine_type: 'percent_of_payable', max_fine_value: 10,
    effective_from: new Date().toISOString().slice(0, 10), notes: '',
  });
  return (
    <>
      <div className="card" style={{ marginBottom: 14 }}>
        <div className="card-head"><h2>Effective-dated fine rules</h2></div>
        <div className="table-wrap">
          <table className="grid">
            <thead><tr><th>Effective from</th><th>Type</th><th className="right">Rate</th><th className="right">Grace</th><th>Cap</th><th>Active</th></tr></thead>
            <tbody>
              {data.fine_settings.map((r) => (
                <tr key={r.id}>
                  <td>{fmtDate(r.effective_from)}</td><td>{r.fine_type}</td>
                  <td className="right">{r.rate_value}</td><td className="right">{r.grace_days}</td>
                  <td>{r.max_fine_type === 'none' ? '—' : `${r.max_fine_value} ${r.max_fine_type === 'percent_of_payable' ? '% of payable' : 'flat'}`}</td>
                  <td><span className={`badge ${r.active ? 'active' : 'inactive'}`}>{r.active ? 'active' : 'inactive'}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="card"><div className="card-body">
        <h3 style={{ marginTop: 0 }}>Add a new rule</h3>
        <div className="form-grid">
          <Field label="Fine type">
            <select value={f.fine_type} onChange={(e) => setF({ ...f, fine_type: e.target.value })}>
              {['NONE', 'FIXED_PER_DAY', 'PERCENT_PER_DAY', 'FIXED_PER_INSTALLMENT'].map((t) => <option key={t}>{t}</option>)}
            </select>
          </Field>
          <Field label="Rate / value"><input type="number" min="0" step="0.01" value={f.rate_value} onChange={(e) => setF({ ...f, rate_value: Number(e.target.value) })} /></Field>
          <Field label="Grace days"><input type="number" min="0" max="60" value={f.grace_days} onChange={(e) => setF({ ...f, grace_days: Number(e.target.value) })} /></Field>
          <Field label="Cap type">
            <select value={f.max_fine_type} onChange={(e) => setF({ ...f, max_fine_type: e.target.value })}>
              <option value="none">No cap</option>
              <option value="percent_of_payable">% of payable</option>
              <option value="flat">Flat amount</option>
            </select>
          </Field>
          <Field label="Cap value"><input type="number" min="0" step="0.01" value={f.max_fine_value} onChange={(e) => setF({ ...f, max_fine_value: Number(e.target.value) })} /></Field>
          <Field label="Effective from"><input type="date" value={f.effective_from} onChange={(e) => setF({ ...f, effective_from: e.target.value })} /></Field>
        </div>
        <Field label="Notes"><input value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
        <button className="btn" disabled={busy} onClick={() => save(() => api.post('/api/settings/fine', f), 'New fine rule saved')}>Add fine rule</button>
      </div></div>
    </>
  );
}

function ListTab({ title, rows, busy, save, createPath, fields }) {
  const [f, setF] = useState(Object.fromEntries(fields.map(([k]) => [k, ''])));
  return (
    <>
      <div className="card" style={{ marginBottom: 14 }}>
        <div className="card-head"><h2>{title}</h2></div>
        <div className="table-wrap">
          <table className="grid">
            <thead><tr>{fields.map(([k, l]) => <th key={k}>{l}</th>)}<th>Active</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  {fields.map(([k]) => <td key={k}>{String(r[k] ?? '—')}</td>)}
                  <td><span className={`badge ${r.is_active ? 'active' : 'inactive'}`}>{r.is_active ? 'active' : 'inactive'}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="card"><div className="card-body">
        <h3 style={{ marginTop: 0 }}>Add {title.toLowerCase().replace(/s$/, '')}</h3>
        <div className="form-grid">
          {fields.map(([k, l, type, opts]) => (
            <Field key={k} label={l}>
              {type === 'select'
                ? <select value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })}><option value="">—</option>{opts.map((o) => <option key={o}>{o}</option>)}</select>
                : <input type={type || 'text'} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} />}
            </Field>
          ))}
        </div>
        <button className="btn" disabled={busy} onClick={() => save(() => api.post(createPath, f), `${title} updated`)}>Add</button>
      </div></div>
    </>
  );
}

function AccountsTab({ data, busy, save }) {
  const [f, setF] = useState({ code: '', name: '', type: 'cash', opening_balance: '' });
  const bal = Object.fromEntries((data.finance?.accounts || []).map((a) => [a.id, a]));
  return (
    <>
      <div className="card" style={{ marginBottom: 14 }}>
        <div className="card-head"><h2>Accounts / cash boxes</h2>
          <span className="muted">live balance = opening + income + collections − expenses − distributions</span></div>
        <div className="table-wrap">
          <table className="grid">
            <thead><tr><th>Code</th><th>Name</th><th>Type</th><th className="right">Opening</th><th className="right">Income</th><th className="right">Collections</th><th className="right">Expenses</th><th className="right">Live balance</th><th>Active</th></tr></thead>
            <tbody>
              {data.accounts.map((r) => {
                const b = bal[r.id] || {};
                return (
                  <tr key={r.id}>
                    <td>{r.code}</td><td>{r.name}</td><td>{r.type}</td>
                    <td className="right">{money(r.opening_balance)}</td>
                    <td className="right">{money(b.income)}</td>
                    <td className="right">{money(b.collections)}</td>
                    <td className="right">{money(b.expenses)}</td>
                    <td className="right"><b>{money(b.balance)}</b></td>
                    <td><span className={`badge ${r.is_active ? 'active' : 'inactive'}`}>{r.is_active ? 'active' : 'inactive'}</span></td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr style={{ fontWeight: 700, background: '#f8fafc' }}>
                <td colSpan={7}>Office Cash {money(data.finance?.office_cash)} + Bank Cash {money(data.finance?.bank_cash)} =</td>
                <td className="right">{money(data.finance?.total_amount)}</td><td />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
      <div className="card"><div className="card-body">
        <h3 style={{ marginTop: 0 }}>Add account</h3>
        <div className="form-grid">
          <Field label="Code"><input value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} /></Field>
          <Field label="Name"><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
          <Field label="Type">
            <select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>
              <option value="cash">cash</option><option value="bank">bank</option><option value="other">other</option>
            </select>
          </Field>
          <Field label="Opening balance"><input type="number" step="0.01" value={f.opening_balance} onChange={(e) => setF({ ...f, opening_balance: e.target.value })} /></Field>
        </div>
        <button className="btn" disabled={busy} onClick={() => save(() => api.post('/api/settings/accounts', { ...f, opening_balance: Number(f.opening_balance || 0) }), 'Account added')}>Add</button>
      </div></div>
      <div className="card" style={{ marginTop: 14 }}><div className="card-body">
        <h3 style={{ marginTop: 0 }}>Set opening balance</h3>
        <p className="muted" style={{ fontSize: 12, marginTop: 0 }}>Use this to enter the real starting cash / bank balance for the business.</p>
        {data.accounts.map((a) => <OpeningBalanceRow key={a.id} account={a} busy={busy} save={save} />)}
      </div></div>
    </>
  );
}

function OpeningBalanceRow({ account, busy, save }) {
  const [v, setV] = useState(account.opening_balance);
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 8 }}>
      <span style={{ width: 180 }}>{account.name} ({account.type})</span>
      <input type="number" step="0.01" value={v} onChange={(e) => setV(e.target.value)} style={{ width: 160, padding: 8 }} />
      <button className="btn sm" disabled={busy}
        onClick={() => save(() => api.put(`/api/settings/accounts/${account.id}`, { opening_balance: Number(v || 0) }), 'Opening balance updated')}>Save</button>
    </div>
  );
}

function ChitCodeTab({ data, busy, save }) {
  const cf = data.code_format || {};
  const [prefix, setPrefix] = useState(cf.loan_prefix || 'JRM');
  const clean = (prefix || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return (
    <div className="card"><div className="card-body">
      <Field label="Chit Code Prefix">
        <input value={prefix} onChange={(e) => setPrefix(e.target.value)} maxLength={8} style={{ maxWidth: 220 }} />
      </Field>
      <p className="muted" style={{ fontSize: 12 }}>
        New chits auto-generate as <b>{clean || 'PREFIX'}-1</b>, <b>{clean || 'PREFIX'}-2</b>, <b>{clean || 'PREFIX'}-3</b> …
        The numeric part increments automatically and is unique (checked on the backend).
        You can still type a custom code on the New Chit form; leave it blank to auto-generate.
        <br />Changing the prefix only affects <b>new</b> chits — existing chit codes are never rewritten.
      </p>
      <button className="btn" disabled={busy || !clean}
        onClick={() => save(() => api.put('/api/settings/chit-prefix', { prefix: clean }), `Chit code prefix saved — next chit will be ${clean}-N`)}>
        Save prefix
      </button>
    </div></div>
  );
}

function LangTab({ data, busy, save }) {
  const { lang, setLang, t } = useI18n();
  const [def, setDef] = useState(data.locale?.default || lang || 'en');
  return (
    <div className="card"><div className="card-body">
      <Field label="Language">
        <select value={lang} onChange={(e) => { setLang(e.target.value); setDef(e.target.value); }}>
          <option value="en">English</option>
          <option value="ta">தமிழ் (Tamil)</option>
        </select>
      </Field>
      <p className="muted" style={{ fontSize: 12 }}>
        The interface switches immediately and your choice is remembered on this device (localStorage).
        "{t('nav.dashboard')} · {t('nav.collection')} · {t('nav.chits')}" — sample of the current language.
      </p>
      <button className="btn" disabled={busy}
        onClick={() => save(() => api.put('/api/settings/locale', { default: def }), 'Default language saved for all users')}>
        Also make this the default for everyone
      </button>
    </div></div>
  );
}
