import { useEffect, useMemo, useState } from 'react';
import { api, money, fmtDate } from '../api/client';
import { Spinner, ErrorState, EmptyState } from '../components/ui';
import { useAuth } from '../state/AuthContext';
import { useToast } from '../state/ToastContext';

/* ------------------------------------------------------------------ helpers */

const REPORT_ICONS = {
  'chit-opening': '🆕', 'chit-closing': '✅', 'chit-collection': '💳',
  'customer-collection': '👥', 'daily-collection': '📅', 'employee-collection': '👨‍💼',
  'location-collection': '📍', 'chit-distribution': '💸', 'pending-dues': '⏳',
  'chit-profit': '📈', 'monthly-summary': '📊', 'financial-ledger': '🏦',
};

const CARD_META = {
  chits_opened:      { label: 'Chits Opened',      icon: '🆕', tint: '#eff6ff', fg: '#1e3a8a', money: false },
  chits_closed:      { label: 'Chits Closed',      icon: '✅', tint: '#ecfdf5', fg: '#047857', money: false },
  active_chits:      { label: 'Active Chits',      icon: '📂', tint: '#f5f3ff', fg: '#6d28d9', money: false },
  total_chit_amount: { label: 'Total Chit Amount', icon: '💰', tint: '#f8fafc', fg: '#0f172a', money: true },
  total_distributed: { label: 'Total Distributed', icon: '💸', tint: '#fff7ed', fg: '#c2410c', money: true },
  total_collection:  { label: 'Total Collection',  icon: '💳', tint: '#ecfdf5', fg: '#047857', money: true },
  total_fine:        { label: 'Total Fine',        icon: '⚖️', tint: '#fffbeb', fg: '#b45309', money: true },
  pending_amount:    { label: 'Pending Dues',      icon: '⏳', tint: '#fff1f2', fg: '#be123c', money: true },
  profit:            { label: 'Profit / Surplus',  icon: '📈', tint: '#eef2ff', fg: '#4338ca', money: true },
};

const fmtCell = (type, val) => {
  if (val === null || val === undefined || val === '') return '—';
  if (type === 'money') return money(val);
  if (type === 'number') return new Intl.NumberFormat('en-IN').format(val);
  if (type === 'date') return fmtDate(val);
  return String(val);
};
const rightAlign = (type) => type === 'money' || type === 'number';

const cleanParams = (f) => {
  const out = {};
  Object.entries(f).forEach(([k, v]) => { if (v !== '' && v != null) out[k] = v; });
  // month needs year and vice-versa
  if (out.month && !out.year) delete out.month;
  if (out.year && out.month) { delete out.date_from; delete out.date_to; }
  if (out.range) { delete out.date_from; delete out.date_to; delete out.month; delete out.year; }
  return out;
};

const YEARS = (() => { const y = new Date().getFullYear(); return [y + 1, y, y - 1, y - 2, y - 3]; })();
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const QUICK = [
  ['today', 'Today'], ['this_week', 'This Week'], ['this_month', 'This Month'], ['last_month', 'Last Month'],
];

/* ------------------------------------------------------------------- page */

export default function Reports() {
  const { meta, can } = useAuth();
  const toast = useToast();

  const [catalogue, setCatalogue] = useState([]);
  const [name, setName] = useState('chit-opening');
  const [employees, setEmployees] = useState([]);
  const [customers, setCustomers] = useState([]);

  const [filters, setFilters] = useState({});
  const [applied, setApplied] = useState({});

  const [cards, setCards] = useState(null);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.get('/api/reports').then((r) => setCatalogue(r.data)).catch(setError);
    api.get('/api/employees', { params: { per_page: 300 } }).then((r) => setEmployees(r.data || [])).catch(() => {});
    api.get('/api/customers', { params: { per_page: 500 } }).then((r) => setCustomers(r.data || [])).catch(() => {});
  }, []);

  const loadCards = (params) => {
    api.get('/api/reports/summary', { params }).then((r) => setCards(r.data.cards)).catch(() => setCards(null));
  };
  const loadReport = (rep, params) => {
    setLoading(true); setError(null);
    api.get(`/api/reports/${rep}`, { params })
      .then((r) => setData(r.data))
      .catch(setError)
      .finally(() => setLoading(false));
  };

  // initial + whenever the active report changes -> use the applied filters
  useEffect(() => {
    const params = cleanParams(applied);
    loadReport(name, params);
    loadCards(params);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name]);

  const apply = (next) => {
    const f = next ?? filters;
    setApplied(f);
    const params = cleanParams(f);
    loadReport(name, params);
    loadCards(params);
  };
  const clearAll = () => { setFilters({}); setApplied({}); loadReport(name, {}); loadCards({}); };

  const setF = (k, v) => setFilters((f) => ({ ...f, [k]: v }));
  const quick = (range) => { const f = { range }; setFilters(f); apply(f); };

  const download = (path, params) =>
    api.download(path, params).catch((e) => toast.error(e.message || 'Export failed'));

  const hasFilters = Object.keys(cleanParams(filters)).length > 0 || Object.keys(cleanParams(applied)).length > 0;
  const activeMeta = catalogue.find((c) => c.name === name);
  const exportParams = cleanParams(applied);

  const runningCols = useMemo(() => {
    if (!data?.headers) return new Set();
    const base = new Set(data.headers.filter((h) => !h.endsWith(' Total')));
    return new Set(data.headers.filter((h) => h.endsWith(' Total') && base.has(h.replace(/ Total$/, ''))));
  }, [data]);

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">📊 Reports</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          {can('reports.export') && (
            <>
              <button className="btn secondary" onClick={() => download('/api/reports/full-export', exportParams)}>
                📦 Export Full Workbook
              </button>
              <div className="dropdown-wrap" style={{ position: 'relative' }}>
                <TemplatesMenu onPick={(t) => download(`/api/reports/templates/${t}`)} />
              </div>
            </>
          )}
        </div>
      </div>

      {/* ---------- summary cards ---------- */}
      <div className="rpt-section-label">Overview {data?.filters?.period ? `· ${data.filters.period}` : ''}</div>
      <div className="rpt-cards" style={{ marginBottom: 18 }}>
        {Object.entries(CARD_META).map(([k, m]) => (
          <div key={k} className="rpt-card" style={{ background: m.tint, borderColor: 'rgba(0,0,0,0.06)' }}>
            <div className="rpt-card-label" style={{ color: m.fg }}>
              <span aria-hidden>{m.icon}</span> {m.label}
            </div>
            <div className="rpt-card-value" style={{ color: m.fg }}>
              {cards ? (m.money ? money(cards[k]) : new Intl.NumberFormat('en-IN').format(cards[k] ?? 0)) : '…'}
            </div>
          </div>
        ))}
      </div>

      {/* ---------- filters ---------- */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-head" style={{ paddingBottom: 0, border: 'none' }}>
          <h2 style={{ fontSize: 14 }}>🔎 Filters</h2>
        </div>
        <div className="card-body" style={{ padding: 14 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 10 }}>
            {QUICK.map(([v, lbl]) => (
              <button key={v} className={`btn sm ${filters.range === v ? '' : 'secondary'}`} onClick={() => quick(v)}>{lbl}</button>
            ))}
            <span className="muted" style={{ fontSize: 12, marginLeft: 4 }}>
              {data?.filters?.period || 'All time'}
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 8 }}>
            <label className="mini">From
              <input type="date" value={filters.date_from || ''} onChange={(e) => { setF('date_from', e.target.value); setF('range', ''); }} />
            </label>
            <label className="mini">To
              <input type="date" value={filters.date_to || ''} onChange={(e) => { setF('date_to', e.target.value); setF('range', ''); }} />
            </label>
            <label className="mini">Month
              <select value={filters.month || ''} onChange={(e) => { setF('month', e.target.value); setF('range', ''); }}>
                <option value="">—</option>
                {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
              </select>
            </label>
            <label className="mini">Year
              <select value={filters.year || ''} onChange={(e) => { setF('year', e.target.value); setF('range', ''); }}>
                <option value="">—</option>
                {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </label>
            <label className="mini">Location
              <select value={filters.location_id || ''} onChange={(e) => setF('location_id', e.target.value)}>
                <option value="">All locations</option>
                {(meta?.locations || []).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </label>
            <label className="mini">Employee
              <select value={filters.employee_id || ''} onChange={(e) => setF('employee_id', e.target.value)}>
                <option value="">All employees</option>
                {employees.map((e) => <option key={e.employee_id || e.id} value={e.employee_id || e.id}>{e.name}</option>)}
              </select>
            </label>
            <label className="mini">Customer
              <select value={filters.customer_id || ''} onChange={(e) => setF('customer_id', e.target.value)}>
                <option value="">All customers</option>
                {customers.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.customer_code})</option>)}
              </select>
            </label>
            <label className="mini">Chit Code
              <input value={filters.chit_code || ''} onChange={(e) => setF('chit_code', e.target.value)} placeholder="e.g. JRM-001" />
            </label>
            <label className="mini">Payment Method
              <select value={filters.payment_mode_id || ''} onChange={(e) => setF('payment_mode_id', e.target.value)}>
                <option value="">All modes</option>
                {(meta?.payment_modes || []).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </label>
            <label className="mini">Status
              <select value={filters.status || ''} onChange={(e) => setF('status', e.target.value)}>
                <option value="">Any</option>
                {['active', 'completed', 'cancelled', 'PENDING', 'PARTIAL', 'OVERDUE'].map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
            <label className="mini">Frequency
              <select value={filters.frequency || ''} onChange={(e) => setF('frequency', e.target.value)}>
                <option value="">Any</option>
                {['daily', 'weekly', 'monthly'].map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button className="btn" onClick={() => apply()}>🔎 Search / Apply</button>
            <button className="btn secondary" onClick={clearAll} disabled={!hasFilters}>Clear</button>
          </div>
        </div>
      </div>

      {/* ---------- report tabs ---------- */}
      <div className="report-navbar-wrapper">
        <div className="report-navbar-header">
          <span className="report-navbar-title">REPORT TYPES</span>
          <span className="muted" style={{ fontSize: 12, fontWeight: 600 }}>{catalogue.length} reports</span>
        </div>
        <div className="report-navbar-scroll">
          {catalogue.map((c) => (
            <button key={c.name} className={`report-nav-item ${c.name === name ? 'active' : ''}`}
              onClick={() => { setName(c.name); setData(null); }}>
              <span className="report-nav-icon">{REPORT_ICONS[c.name] || '📄'}</span>
              <span>{c.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ---------- report body ---------- */}
      <div className="card">
        {loading && <Spinner />}
        {error && <ErrorState error={error} onRetry={() => apply()} />}
        {!loading && !error && data && (
          <>
            <div className="card-head">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 20 }}>{REPORT_ICONS[name] || '📄'}</span>
                <div>
                  <h2 style={{ margin: 0, fontSize: 16 }}>{data.title || activeMeta?.label}</h2>
                  <div className="muted" style={{ fontSize: 12 }}>
                    {data.filters?.period} · generated {new Date(data.generated_at).toLocaleString()}
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span className="badge COMPLETED">{data.rows.length} rows</span>
                {can('reports.export') && (
                  <button className="btn sm secondary"
                    onClick={() => download(`/api/reports/${name}/export`, exportParams)}>
                    📥 Export Excel
                  </button>
                )}
              </div>
            </div>

            {data.kind === 'summary' ? (
              <div className="card-body">
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
                  {data.rows.map((r) => (
                    <div key={r.Metric} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '14px 16px' }}>
                      <div style={{ fontSize: 11, fontWeight: 800, color: '#475569', textTransform: 'uppercase' }}>{r.Metric}</div>
                      <div style={{ fontSize: 20, fontWeight: 800, color: '#0f172a', marginTop: 4 }}>
                        {/^(Chits|Active)/.test(r.Metric) ? new Intl.NumberFormat('en-IN').format(r.Value) : money(r.Value)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : data.rows.length === 0 ? (
              <EmptyState title="No data for these filters" hint="Adjust the date range or clear the filters." />
            ) : (
              <div className="table-wrap">
                <table className="grid">
                  <thead>
                    <tr>
                      {data.headers.map((h) => (
                        <th key={h} style={{
                          textAlign: rightAlign(data.col_types[h]) ? 'right' : 'left',
                          background: runningCols.has(h) ? '#eef2ff' : undefined,
                        }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.rows.map((row, i) => (
                      <tr key={i}>
                        {data.headers.map((h) => (
                          <td key={h} style={{
                            textAlign: rightAlign(data.col_types[h]) ? 'right' : 'left',
                            background: runningCols.has(h) ? '#f5f7ff' : undefined,
                            fontVariantNumeric: rightAlign(data.col_types[h]) ? 'tabular-nums' : undefined,
                          }}>{fmtCell(data.col_types[h], row[h])}</td>
                        ))}
                      </tr>
                    ))}
                    {data.totals && Object.keys(data.totals).length > 0 && (
                      <tr style={{ fontWeight: 800, background: '#f1f5f9', borderTop: '2px solid #cbd5e1' }}>
                        {data.headers.map((h, i) => (
                          <td key={h} style={{ textAlign: rightAlign(data.col_types[h]) || i === 0 ? (i === 0 ? 'left' : 'right') : 'left' }}>
                            {h in data.totals
                              ? (typeof data.totals[h] === 'number' ? fmtCell(data.col_types[h], data.totals[h]) : data.totals[h])
                              : ''}
                          </td>
                        ))}
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}

/* ------------------------------------------------------------- templates */

function TemplatesMenu({ onPick }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="btn secondary" onClick={() => setOpen((o) => !o)}>📄 Templates ▾</button>
      {open && (
        <div style={{ position: 'absolute', right: 0, top: '110%', background: '#fff', border: '1px solid var(--line)', borderRadius: 8, boxShadow: 'var(--shadow-lg)', zIndex: 20, minWidth: 180 }}
          onMouseLeave={() => setOpen(false)}>
          {[['chit', 'Chit import template'], ['collection', 'Collection import template'], ['expense', 'Expense import template']].map(([t, lbl]) => (
            <button key={t} className="menu-item" style={{ display: 'block', width: '100%', textAlign: 'left', padding: '9px 12px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13 }}
              onClick={() => { onPick(t); setOpen(false); }}>{lbl}</button>
          ))}
        </div>
      )}
    </>
  );
}
