import { useEffect, useMemo, useState } from 'react';
import { api, API_BASE, money, fmtDate } from '../api/client';
import { Spinner, ErrorState, EmptyState } from '../components/ui';
import { useAuth } from '../state/AuthContext';
import { useToast } from '../state/ToastContext';
import {
  FiBarChart2, FiFileText, FiCheckCircle, FiCreditCard, FiUsers, FiCalendar,
  FiUser, FiDollarSign, FiTrendingUp, FiClipboard, FiBookOpen, FiSearch, FiDownload, FiPrinter,
} from 'react-icons/fi';

/** Downloads the current report+filters as a PDF (works for any/no filter, incl. NIL results). */
const downloadReportPdf = (name, params, toast, setBusy) => {
  setBusy(true);
  api.download(`/api/reports/${name}/print.pdf`, params, `${name}_report.pdf`)
    .catch((e) => {
      toast.error(e.message || 'PDF export unavailable. Opening print view...');
      window.print();
    })
    .finally(() => setBusy(false));
};

/* ------------------------------------------------------------------ helpers */

const REPORT_ICONS = {
  'chit-opening': <FiFileText />, 'chit-closing': <FiCheckCircle />, 'chit-collection': <FiCreditCard />,
  'customer-collection': <FiUsers />, 'daily-collection': <FiCalendar />,
  'chit-distribution': <FiDollarSign />, 'pending-dues': <FiClipboard />,
  'chit-profit': <FiTrendingUp />, 'monthly-summary': <FiBarChart2 />, 'financial-ledger': <FiBookOpen />,
};

const fmtCell = (type, val) => {
  if (val === null || val === undefined || val === '') return '—';
  if (type === 'money') return money(val);
  if (type === 'number') return new Intl.NumberFormat('en-IN').format(val);
  if (type === 'date') return fmtDate(val);
  return String(val);
};
const rightAlign = (type) => type === 'money' || type === 'number';

// Print/PDF layout only: columns whose values are inherently short and must
// never wrap (dates, codes, amounts, status, frequency, tenure) get a narrow
// fixed share of the table width and `white-space: nowrap`; free-text
// columns (customer/employee/location names, remarks) get a wider share and
// are allowed to wrap normally at word boundaries. Without this, a
// table-layout:fixed table with many columns squeezes every column to an
// equal, too-narrow share and the browser is forced to break words —  even
// numbers — mid-token to fit (e.g. "DATE" rendering as "D/A/T/E").
const isWrapCol = (h) => /customer|name|remarks|address|note/i.test(String(h || ''));
const colWidthPct = (h, type) => {
  const lower = String(h || '').trim().toLowerCase();
  if (lower === 's.no' || lower === 'sno' || lower === '#') return 4;
  if (type === 'date') return 9.5;
  if (type === 'money') return 9.5;
  if (type === 'number') return 5.5;
  if (isWrapCol(h)) return 15;
  if (/code/.test(lower)) return 7.5;
  if (/status/.test(lower)) return 7;
  if (/frequency/.test(lower)) return 7;
  if (/tenure/.test(lower)) return 6;
  return 7.5;
};

const isExcludedCol = (h) => {
  const lower = String(h || '').trim().toLowerCase();
  return (
    lower === 'employee' ||
    lower === 'employee name' ||
    lower === 'employee_name' ||
    lower === 'employee id' ||
    lower === 'employee_id' ||
    lower === 'collector' ||
    lower === 'collector name' ||
    lower === 'location' ||
    lower === 'location name' ||
    lower === 'location_name' ||
    lower === 'location code' ||
    lower === 'location_code'
  );
};

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
  const [customers, setCustomers] = useState([]);

  const [filters, setFilters] = useState({});
  const [applied, setApplied] = useState({});

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [pdfBusy, setPdfBusy] = useState(false);

  useEffect(() => {
    api.get('/api/reports').then((r) => setCatalogue(r.data)).catch(setError);
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

  const visibleHeaders = useMemo(() => {
    if (!data?.headers) return [];
    return data.headers.filter((h) => !isExcludedCol(h));
  }, [data]);

  // Print/PDF column widths (as %), normalized to sum to 100 so a
  // table-layout:fixed table gets a sensible width per column instead of an
  // equal too-narrow share for every column. See colWidthPct above.
  const colWidths = useMemo(() => {
    if (!visibleHeaders.length) return [];
    const raw = visibleHeaders.map((h) => colWidthPct(h, data?.col_types?.[h]));
    const total = raw.reduce((a, b) => a + b, 0) || 1;
    return raw.map((w) => (w / total) * 100);
  }, [visibleHeaders, data]);

  const displayRows = useMemo(() => {
    if (!data?.rows) return [];
    let rows = data.rows;
    const searchBillNo = (applied.bill_no || filters.bill_no || '').trim().toLowerCase();
    if (searchBillNo) {
      rows = rows.filter((r) => {
        return Object.entries(r).some(([key, val]) => {
          if (val === null || val === undefined) return false;
          return String(val).toLowerCase().includes(searchBillNo);
        });
      });
    }
    return rows;
  }, [data, applied.bill_no, filters.bill_no]);

  const computedTotals = useMemo(() => {
    if (!data || !displayRows || displayRows.length === 0) return null;
    const totals = {};
    let hasSum = false;
    visibleHeaders.forEach((h, idx) => {
      const type = data.col_types?.[h];
      if (type === 'money' || type === 'number') {
        const sum = displayRows.reduce((acc, row) => {
          const v = Number(row[h]);
          return acc + (isNaN(v) ? 0 : v);
        }, 0);
        totals[h] = sum;
        hasSum = true;
      } else if (idx === 0) {
        totals[h] = 'Total';
      }
    });
    return hasSum ? totals : (data.totals || null);
  }, [data, displayRows, visibleHeaders]);

  const activeFilterSummary = useMemo(() => {
    const parts = [];
    const p = cleanParams(applied);
    if (p.date_from && p.date_to) parts.push(`Date: ${fmtDate(p.date_from)} to ${fmtDate(p.date_to)}`);
    else if (p.date_from) parts.push(`From: ${fmtDate(p.date_from)}`);
    else if (p.date_to) parts.push(`To: ${fmtDate(p.date_to)}`);

    if (p.customer_id) {
      const cust = customers.find((c) => String(c.id) === String(p.customer_id));
      parts.push(`Customer: ${cust ? `${cust.name} (${cust.customer_code || ''})` : p.customer_id}`);
    }
    if (p.chit_code) parts.push(`Chit Code: ${p.chit_code}`);
    if (p.bill_no) parts.push(`Bill No: ${p.bill_no}`);
    if (p.payment_mode_id) {
      const mode = (meta?.payment_modes || []).find((m) => String(m.id) === String(p.payment_mode_id));
      parts.push(`Payment Mode: ${mode ? mode.name : p.payment_mode_id}`);
    }
    if (p.status) parts.push(`Status: ${p.status}`);
    if (p.frequency) parts.push(`Frequency: ${p.frequency}`);

    return parts.length > 0 ? parts.join(' • ') : 'All Records (No Filters Applied)';
  }, [applied, customers, meta]);

  const runningCols = useMemo(() => {
    if (!visibleHeaders) return new Set();
    const base = new Set(visibleHeaders.filter((h) => !h.endsWith(' Total')));
    return new Set(visibleHeaders.filter((h) => h.endsWith(' Total') && base.has(h.replace(/ Total$/, ''))));
  }, [visibleHeaders]);

  const reportList = useMemo(() => {
    return catalogue.filter((c) => c.name !== 'location-collection' && c.name !== 'employee-collection');
  }, [catalogue]);

  return (
    <>
      <div className="page-header">
        <h1 className="page-title" style={{ display: "flex", alignItems: "center", gap: 8 }}><FiBarChart2 /> Reports</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          {can('reports.export') && (
            <>
              <button className="btn secondary" onClick={() => download('/api/reports/full-export', exportParams)}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <FiDownload size={13} /> Export Full Workbook
              </button>
              <div className="dropdown-wrap" style={{ position: 'relative' }}>
                <TemplatesMenu onPick={(t) => download(`/api/reports/templates/${t}`)} />
              </div>
            </>
          )}
        </div>
      </div>

      {/* ---------- Report Types in clean grid layout (No side scroll) ---------- */}
      <div className="card no-print" style={{ marginBottom: 16, padding: 14 }}>
        <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--blue-primary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 10 }}>
          SELECT REPORT TYPE ({reportList.length})
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10 }}>
          {reportList.map((c) => (
            <button key={c.name} className={`report-nav-item ${c.name === name ? 'active' : ''}`}
              onClick={() => { setName(c.name); setData(null); }}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px',
                borderRadius: 8, border: '1.5px solid ' + (c.name === name ? 'var(--blue-primary)' : 'var(--line)'),
                background: c.name === name ? 'var(--blue-primary)' : '#ffffff',
                color: c.name === name ? '#ffffff' : '#0f172a', fontWeight: 700, fontSize: 13, cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}>
              <span style={{ fontSize: 16 }}>{REPORT_ICONS[c.name] || <FiFileText />}</span>
              <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.label}</span>
            </button>
          ))}
        </div>
      </div>

        <div className="reports-main">
          {/* ---------- Filters (always visible) ---------- */}
          <div className="rpt-filter-panel">
            <div className="rpt-filter-head">
              <h2 style={{ display: "flex", alignItems: "center", gap: 6 }}><FiSearch size={14} /> Filters</h2>
              <span className="muted" style={{ fontSize: 12 }}>{data?.filters?.period || 'All time'}</span>
            </div>
            <div className="rpt-filter-grid">
              <label className="mini">From
                <input type="date" value={filters.date_from || ''} onChange={(e) => setF('date_from', e.target.value)} />
              </label>
              <label className="mini">To
                <input type="date" value={filters.date_to || ''} onChange={(e) => setF('date_to', e.target.value)} />
              </label>
              <label className="mini">Customer
                <select value={filters.customer_id || ''} onChange={(e) => setF('customer_id', e.target.value)}>
                  <option value="">All customers</option>
                  {customers.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.customer_code})</option>)}
                </select>
              </label>
              <label className="mini">Chit Code
                <input value={filters.chit_code || ''} onChange={(e) => setF('chit_code', e.target.value)} placeholder="e.g. SM-001" />
              </label>
              <label className="mini">Bill No
                <input value={filters.bill_no || ''} onChange={(e) => setF('bill_no', e.target.value)} placeholder="e.g. BILL-1025" />
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
              <button className="btn sm" onClick={() => apply()} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><FiSearch size={13} /> Apply Filters</button>
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
                    <span style={{ fontSize: 20 }}>{REPORT_ICONS[name] || <FiFileText />}</span>
                    <div>
                      <h2 style={{ margin: 0, fontSize: 16 }}>{data.title || activeMeta?.label}</h2>
                      <div className="muted" style={{ fontSize: 12 }}>
                        {data.filters?.period} · generated {new Date(data.generated_at).toLocaleString()}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <span className="badge COMPLETED">{displayRows.length} rows</span>
                    <button className="btn sm secondary" onClick={() => window.print()}>
                      <FiPrinter size={13} style={{ marginRight: 4, verticalAlign: -2 }} />Print
                    </button>
                    {can('reports.export') && (
                      <>
                        <button className="btn sm secondary" disabled={pdfBusy}
                          onClick={() => downloadReportPdf(name, exportParams, toast, setPdfBusy)}>
                          <FiDownload size={13} style={{ marginRight: 4, verticalAlign: -2 }} />Download PDF
                        </button>
                        <button className="btn sm secondary"
                          onClick={() => download(`/api/reports/${name}/export`, exportParams)}>
                          <FiDownload size={13} style={{ marginRight: 4, verticalAlign: -2 }} />Export Excel
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {/* Filter Summary Banner — screen only; the print-only-block below has its own copy */}
                <div className="no-print" style={{
                  background: '#f8fafc', borderBottom: '1px solid #e2e8f0', padding: '8px 16px',
                  fontSize: 12, color: '#334155', display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600
                }}>
                  <span style={{ color: 'var(--blue-primary)', fontWeight: 800 }}>Applied Filters:</span>
                  <span>{activeFilterSummary}</span>
                </div>

                <div className="print-report">
                  {/* Print-only header: hidden on screen, shown only inside @media print */}
                  <div className="receipt-header print-only-block" style={{ marginBottom: 16, borderBottom: '2px solid #0f172a', paddingBottom: 14 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                      <img className="receipt-logo" src={API_BASE + '/api/settings/organization/logo'} alt="logo" onError={(e) => { e.target.style.display = 'none'; }} style={{ width: 56, height: 56, objectFit: 'contain' }} />
                      <div>
                        <div className="receipt-org-name" style={{ fontSize: 20, fontWeight: 800, color: '#0f172a', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                          Siva Murugan Chit Fund
                        </div>
                        {meta?.organization?.address && (
                          <div className="receipt-org-line" style={{ fontSize: 12, color: '#475569', marginTop: 2 }}>
                            {meta.organization.address}
                          </div>
                        )}
                        <div className="receipt-org-line" style={{ fontSize: 12, color: '#475569', marginTop: 2 }}>
                          {[meta?.organization?.mobile, meta?.organization?.telephone].filter(Boolean).join(' • ')}
                          {meta?.organization?.email && meta.organization.email !== 'a@b.com' ? ` • ${meta.organization.email}` : ''}
                        </div>
                        {meta?.organization?.gst && (
                          <div className="receipt-org-line" style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                            GST/Reg No: {meta.organization.gst}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="print-only-block" style={{ marginBottom: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', borderBottom: '1.5px solid #cbd5e1', paddingBottom: 8 }}>
                      <div>
                        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#0f172a', textTransform: 'uppercase' }}>
                          {data.title || activeMeta?.label}
                        </h2>
                        <div className="muted" style={{ fontSize: 11.5, color: '#64748b', marginTop: 3 }}>
                          Period: {data.filters?.period || 'All time'} • Generated: {new Date(data.generated_at).toLocaleString()}
                        </div>
                      </div>
                    </div>
                    <div className="print-filter-summary" style={{
                      background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: 6,
                      padding: '8px 12px', marginTop: 10, fontSize: 11, color: '#334155', fontWeight: 600
                    }}>
                      <strong style={{ color: '#0f172a', textTransform: 'uppercase' }}>Applied Filters:</strong> {activeFilterSummary}
                    </div>
                  </div>

                  {data.kind === 'summary' ? (
                    <div className="card-body">
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
                        {displayRows.map((r) => (
                          <div key={r.Metric} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '14px 16px' }}>
                            <div style={{ fontSize: 11, fontWeight: 800, color: '#475569', textTransform: 'uppercase' }}>{r.Metric}</div>
                            <div style={{ fontSize: 20, fontWeight: 800, color: '#0f172a', marginTop: 4 }}>
                              {/^(Chits|Active)/.test(r.Metric) ? new Intl.NumberFormat('en-IN').format(r.Value) : money(r.Value)}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : displayRows.length === 0 ? (
                    <EmptyState title="NIL — No Data Available" hint="No records match the selected filters. Adjust the date range or clear the filters." />
                  ) : (
                    <div className="table-wrap rpt-table-wrap">
                      <table className="grid rpt-table">
                        <colgroup>
                          {visibleHeaders.map((h, i) => (
                            <col key={h} style={{ width: `${colWidths[i]}%` }} />
                          ))}
                        </colgroup>
                        <thead>
                          <tr>
                            {visibleHeaders.map((h) => (
                              <th key={h} className={[rightAlign(data.col_types?.[h]) ? 'right' : '', isWrapCol(h) ? 'col-wrap' : ''].filter(Boolean).join(' ')} style={{
                                background: runningCols.has(h) ? '#eef2ff' : undefined,
                              }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {displayRows.map((row, i) => (
                            <tr key={i}>
                              {visibleHeaders.map((h) => (
                                <td key={h} className={[rightAlign(data.col_types?.[h]) ? 'right' : '', isWrapCol(h) ? 'col-wrap' : ''].filter(Boolean).join(' ')} style={{
                                  background: runningCols.has(h) ? '#f5f7ff' : undefined,
                                  fontVariantNumeric: rightAlign(data.col_types?.[h]) ? 'tabular-nums' : undefined,
                                }}>{fmtCell(data.col_types?.[h], row[h])}</td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                        {computedTotals && Object.keys(computedTotals).length > 0 && (
                          <tfoot>
                            <tr className="rpt-total-row">
                              {visibleHeaders.map((h, i) => (
                                <td key={h} className={[i === 0 ? '' : (rightAlign(data.col_types?.[h]) ? 'right' : ''), isWrapCol(h) ? 'col-wrap' : ''].filter(Boolean).join(' ')}>
                                  {h in computedTotals
                                    ? (typeof computedTotals[h] === 'number' ? fmtCell(data.col_types?.[h], computedTotals[h]) : computedTotals[h])
                                    : ''}
                                </td>
                              ))}
                            </tr>
                          </tfoot>
                        )}
                      </table>
                    </div>
                  )}
                </div>
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
      <button className="btn secondary" onClick={() => setOpen((o) => !o)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><FiFileText size={13} /> Templates ▾</button>
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
