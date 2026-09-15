import { useEffect, useMemo, useState } from 'react';
import { api, money, fmtDate } from '../api/client';
import { Spinner, ErrorState, EmptyState } from '../components/ui';
import { useAuth } from '../state/AuthContext';
import { useToast } from '../state/ToastContext';

/* ------------------------------------------------------------------ helpers */

const REPORT_ICONS = {
  'chit-opening': '', 'chit-closing': '', 'chit-collection': '',
  'customer-collection': '', 'daily-collection': '', 'employee-collection': '',
  'chit-distribution': '', 'pending-dues': '',
  'chit-profit': '', 'monthly-summary': '', 'financial-ledger': '',
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

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.get('/api/reports').then((r) => setCatalogue(r.data)).catch(setError);
    api.get('/api/employees', { params: { per_page: 300 } }).then((r) => setEmployees(r.data || [])).catch(() => {});
    api.get('/api/customers', { params: { per_page: 500 } }).then((r) => setCustomers(r.data || [])).catch(() => {});
  }, []);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name]);

  const apply = (next) => {
    const f = next ?? filters;
    setApplied(f);
    const params = cleanParams(f);
    loadReport(name, params);
  };
  const clearAll = () => { setFilters({}); setApplied({}); loadReport(name, {}); };

  const setF = (k, v) => setFilters((f) => ({ ...f, [k]: v }));

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
                 Export Full Workbook
              </button>
              <div className="dropdown-wrap" style={{ position: 'relative' }}>
                <TemplatesMenu onPick={(t) => download(`/api/reports/templates/${t}`)} />
              </div>
            </>
          )}
        </div>
      </div>

      {/* ---------- Report Types in clean grid layout (No side scroll) ---------- */}
      <div className="card" style={{ marginBottom: 16, padding: 14 }}>
        <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--blue-primary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 10 }}>
          SELECT REPORT TYPE ({catalogue.filter((c) => c.name !== 'location-collection').length})
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10 }}>
          {catalogue.filter((c) => c.name !== 'location-collection').map((c) => (
            <button key={c.name} className={`report-nav-item ${c.name === name ? 'active' : ''}`}
              onClick={() => { setName(c.name); setData(null); }}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px',
                borderRadius: 8, border: '1.5px solid ' + (c.name === name ? 'var(--blue-primary)' : 'var(--line)'),
                background: c.name === name ? 'var(--blue-primary)' : '#ffffff',
                color: c.name === name ? '#ffffff' : '#0f172a', fontWeight: 700, fontSize: 13, cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}>
              <span style={{ fontSize: 16 }}>{REPORT_ICONS[c.name] || '📄'}</span>
              <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.label}</span>
            </button>
          ))}
        </div>
      </div>

        <div className="reports-main">
          {/* ---------- Filters (always visible) ---------- */}
          <div className="rpt-filter-panel">
            <div className="rpt-filter-head">
              <h2>🔎 Filters</h2>
              <span className="muted" style={{ fontSize: 12 }}>{data?.filters?.period || 'All time'}</span>
            </div>
            <div className="rpt-filter-grid">
              <label className="mini">From
                <input type="date" value={filters.date_from || ''} onChange={(e) => setF('date_from', e.target.value)} />
              </label>
              <label className="mini">To
                <input type="date" value={filters.date_to || ''} onChange={(e) => setF('date_to', e.target.value)} />
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
              <button className="btn sm" onClick={() => apply()}>🔎 Apply Filters</button>
              <button className="btn sm secondary" onClick={clearAll} disabled={!hasFilters}>Clear</button>
            </div>
          </div>

          {/* ---------- report body ---------- */}
          <div className="card rpt-table-card">
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
                  <div className="table-wrap rpt-table-wrap">
                    <table className="grid rpt-table">
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
