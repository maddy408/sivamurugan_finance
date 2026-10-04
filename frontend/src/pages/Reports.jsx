import { useEffect, useMemo, useState } from 'react';
import { api, API_BASE, money, fmtDate } from '../api/client';
import { Spinner, ErrorState, EmptyState } from '../components/ui';
import { useAuth } from '../state/AuthContext';
import { useToast } from '../state/ToastContext';
import {
  FiBarChart2, FiFileText, FiCheckCircle, FiCreditCard, FiUsers, FiCalendar,
  FiUser, FiDollarSign, FiTrendingUp, FiClipboard, FiBookOpen, FiSearch, FiDownload, FiPrinter, FiSun,
  FiChevronLeft, FiChevronRight, FiRefreshCw, FiInfo,
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
  'daily-report': <FiSun />,
  'chit-opening': <FiFileText />, 'chit-closing': <FiCheckCircle />, 'chit-collection': <FiCreditCard />,
  'customer-collection': <FiUsers />, 'daily-collection': <FiCalendar />,
  'chit-distribution': <FiDollarSign />, 'pending-dues': <FiClipboard />,
  'chit-profit': <FiTrendingUp />, 'financial-ledger': <FiBookOpen />,
};

const fmtCell = (type, val) => {
  if (val === null || val === undefined || val === '') return '—';
  if (type === 'money') return money(val);
  if (type === 'number') return new Intl.NumberFormat('en-IN').format(val);
  if (type === 'date') return fmtDate(val);
  return String(val);
};
const rightAlign = (type) => type === 'money' || type === 'number';

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
    lower === 'reference' ||
    lower === 'reference_no' ||
    lower === 'reference no' ||
    lower === 'receipt' ||
    lower === 'receipt_no' ||
    lower === 'receipt no' ||
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
  if (out.month && !out.year) delete out.month;
  if (out.year && out.month) { delete out.date_from; delete out.date_to; }
  if (out.range) { delete out.date_from; delete out.date_to; delete out.month; delete out.year; }
  return out;
};

const getQuickRangeDates = (type) => {
  const today = new Date();
  const fmt = (d) => d.toISOString().slice(0, 10);

  if (type === 'today') {
    const d = fmt(today);
    return { date_from: d, date_to: d };
  }
  if (type === 'yesterday') {
    const y = new Date(today);
    y.setDate(today.getDate() - 1);
    const d = fmt(y);
    return { date_from: d, date_to: d };
  }
  if (type === 'last_7_days') {
    const past = new Date(today);
    past.setDate(today.getDate() - 6);
    return { date_from: fmt(past), date_to: fmt(today) };
  }
  if (type === 'this_month') {
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
    const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    return { date_from: fmt(firstDay), date_to: fmt(lastDay) };
  }
  return {};
};


/* ------------------------------------------------------------------- page */

export default function Reports() {
  const { meta, can } = useAuth();
  const toast = useToast();

  const [catalogue, setCatalogue] = useState([]);
  const [name, setName] = useState('daily-report');
  const [customers, setCustomers] = useState([]);

  // Default filter: Last 7 Days
  const [quickRange, setQuickRange] = useState('last_7_days');
  const initialDates = useMemo(() => getQuickRangeDates('last_7_days'), []);
  const [filters, setFilters] = useState(initialDates);
  const [applied, setApplied] = useState(initialDates);

  // Pagination state (default perPage: 10)
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [pdfBusy, setPdfBusy] = useState(false);

  useEffect(() => {
    api.get('/api/reports').then((r) => setCatalogue(r.data)).catch(setError);
    api.get('/api/customers', { params: { per_page: 500 } }).then((r) => setCustomers(r.data || [])).catch(() => {});
  }, []);

  const loadReport = (rep, params, p = page, pp = perPage) => {
    setLoading(true); setError(null);
    const queryParams = { ...params, page: p, per_page: pp };
    api.get(`/api/reports/${rep}`, { params: queryParams })
      .then((r) => setData(r.data))
      .catch(setError)
      .finally(() => setLoading(false));
  };

  // Trigger report fetch when report name changes or applied filters change
  useEffect(() => {
    setPage(1);
    loadReport(name, cleanParams(applied), 1, perPage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name]);

  const handleQuickSelect = (type) => {
    setQuickRange(type);
    if (type === 'custom') return;
    const dates = getQuickRangeDates(type);
    const nextFilters = { ...filters, ...dates };
    setFilters(nextFilters);
    setApplied(nextFilters);
    setPage(1);
    loadReport(name, cleanParams(nextFilters), 1, perPage);
  };

  const apply = (next) => {
    const f = next ?? filters;
    setApplied(f);
    setPage(1);
    const params = cleanParams(f);
    loadReport(name, params, 1, perPage);
  };

  const clearAll = () => {
    setQuickRange('custom');
    setFilters({});
    setApplied({});
    setPage(1);
    loadReport(name, {}, 1, perPage);
  };

  const setF = (k, v) => {
    setQuickRange('custom');
    setFilters((f) => ({ ...f, [k]: v }));
  };

  const handlePageChange = (newPage) => {
    if (newPage < 1 || (data?.total_pages && newPage > data.total_pages)) return;
    setPage(newPage);
    loadReport(name, cleanParams(applied), newPage, perPage);
  };

  const handlePerPageChange = (newPerPage) => {
    setPerPage(newPerPage);
    setPage(1);
    loadReport(name, cleanParams(applied), 1, newPerPage);
  };

  const download = (path, params) =>
    api.download(path, params).catch((e) => toast.error(e.message || 'Export failed'));

  const hasFilters = Object.keys(cleanParams(filters)).length > 0 || Object.keys(cleanParams(applied)).length > 0;
  const activeMeta = catalogue.find((c) => c.name === name);
  const exportParams = cleanParams(applied);

  const visibleHeaders = useMemo(() => {
    if (!data?.headers) return [];
    return data.headers.filter((h) => !isExcludedCol(h));
  }, [data]);

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
    if (!data) return null;
    if (data.totals && Object.keys(data.totals).length > 0) {
      const t = { ...data.totals };
      if (visibleHeaders.length > 0 && !t[visibleHeaders[0]]) {
        t[visibleHeaders[0]] = 'Total';
      }
      return t;
    }
    if (!displayRows || displayRows.length === 0) return null;
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
    return hasSum ? totals : null;
  }, [data, displayRows, visibleHeaders]);

  const activeFilterSummary = useMemo(() => {
    const parts = [];
    const p = cleanParams(applied);
    
    if (quickRange === 'today') parts.push('Active filter: Today');
    else if (quickRange === 'yesterday') parts.push('Active filter: Yesterday');
    else if (quickRange === 'last_7_days') parts.push('Active filter: Last 7 Days');
    else if (quickRange === 'this_month') parts.push('Active filter: This Month');
    else if (p.date_from && p.date_to) parts.push(`Active filter: Custom Range (${fmtDate(p.date_from)} — ${fmtDate(p.date_to)})`);

    if (p.date_from && p.date_to) parts.push(`${fmtDate(p.date_from)} — ${fmtDate(p.date_to)}`);
    else if (p.date_from) parts.push(`From ${fmtDate(p.date_from)}`);
    else if (p.date_to) parts.push(`To ${fmtDate(p.date_to)}`);

    if (p.customer_id) {
      const cust = customers.find((c) => String(c.id) === String(p.customer_id));
      parts.push(`Customer: ${cust ? `${cust.name}` : p.customer_id}`);
    }
    if (p.chit_code) parts.push(`Chit Code: ${p.chit_code}`);
    if (p.status) parts.push(`Status: ${p.status}`);

    return parts.length > 0 ? parts.join(' • ') : 'All Records (No Filters Applied)';
  }, [applied, customers, quickRange]);

  const runningCols = useMemo(() => {
    if (!visibleHeaders) return new Set();
    const base = new Set(visibleHeaders.filter((h) => !h.endsWith(' Total')));
    return new Set(visibleHeaders.filter((h) => h.endsWith(' Total') && base.has(h.replace(/ Total$/, ''))));
  }, [visibleHeaders]);

  // Remove location-collection, employee-collection, and monthly-summary from report selection
  const reportList = useMemo(() => {
    return catalogue.filter((c) => c.name !== 'location-collection' && c.name !== 'employee-collection' && c.name !== 'monthly-summary');
  }, [catalogue]);

  return (
    <>
      {/* ---------- Page Header Matching Screenshot ---------- */}
      <div className="page-header" style={{ marginBottom: 16 }}>
        <div>
          <h1 className="page-title" style={{ margin: 0, fontSize: 26, fontWeight: 800, color: '#0f172a' }}>
            Reports
          </h1>
          <p style={{ margin: '4px 0 0 0', fontSize: 14, color: '#64748b' }}>
            Analyze and export your chit fund reports with custom date filters
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {can('reports.export') && (
            <>
              <button
                className="btn secondary"
                onClick={() => download('/api/reports/full-export', exportParams)}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px',
                  borderRadius: 8, border: '1px solid #cbd5e1', background: '#ffffff',
                  fontSize: 14, fontWeight: 600, color: '#334155', cursor: 'pointer'
                }}
              >
                <FiDownload size={15} /> Export Full Workbook
              </button>
              <div className="dropdown-wrap" style={{ position: 'relative' }}>
                <TemplatesMenu onPick={(t) => download(`/api/reports/templates/${t}`)} />
              </div>
            </>
          )}
        </div>
      </div>

      {/* ---------- Report Types Pills (SELECT REPORT TYPE) ---------- */}
      <div className="card no-print" style={{ marginBottom: 16, padding: 14, borderRadius: 12, background: '#ffffff', border: '1px solid #e2e8f0' }}>
        <div style={{ fontSize: 12.5, fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: 10 }}>
          SELECT REPORT TYPE ({reportList.length})
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {reportList.map((c) => {
            const isActive = c.name === name;
            return (
              <button
                key={c.name}
                className={`report-nav-item ${isActive ? 'active' : ''}`}
                onClick={() => { setName(c.name); setData(null); }}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 16px',
                  borderRadius: 8, border: isActive ? '1.5px solid #1d4ed8' : '1px solid #cbd5e1',
                  background: isActive ? '#1d4ed8' : '#ffffff',
                  color: isActive ? '#ffffff' : '#334155',
                  fontWeight: isActive ? 700 : 600, fontSize: 14, cursor: 'pointer',
                  transition: 'all 0.15s ease', boxShadow: isActive ? '0 2px 4px rgba(29, 78, 216, 0.2)' : 'none'
                }}
              >
                <span style={{ fontSize: 15 }}>{REPORT_ICONS[c.name] || <FiFileText />}</span>
                <span>{c.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ---------- Date / Range Filter Panel (Matching Screenshot) ---------- */}
      <div className="card no-print" style={{ marginBottom: 16, padding: 16, borderRadius: 12, background: '#ffffff', border: '1px solid #e2e8f0' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <h2 style={{ margin: 0, fontSize: 17.5, fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 8 }}>
            <FiCalendar size={19} style={{ color: '#1d4ed8' }} /> Date / Range Filter
          </h2>
          <span style={{ fontSize: 12.5, background: '#f1f5f9', border: '1px solid #cbd5e1', padding: '4px 10px', borderRadius: 6, color: '#475569', fontWeight: 600 }}>
            UTC+05:30 India
          </span>
        </div>

        {/* Quick Select Pill Buttons Row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13.5, fontWeight: 700, color: '#475569' }}>Quick Select:</span>
          {[
            ['today', 'Today'],
            ['yesterday', 'Yesterday'],
            ['last_7_days', 'Last 7 Days'],
            ['this_month', 'This Month'],
            ['custom', 'Custom Range']
          ].map(([key, label]) => {
            const isSelected = quickRange === key;
            return (
              <button
                key={key}
                onClick={() => handleQuickSelect(key)}
                style={{
                  padding: '7px 16px', borderRadius: 8, fontSize: 13.5, fontWeight: 700, cursor: 'pointer',
                  border: isSelected ? '1.5px solid #1d4ed8' : '1px solid #cbd5e1',
                  background: isSelected ? '#1d4ed8' : '#ffffff',
                  color: isSelected ? '#ffffff' : '#334155',
                  transition: 'all 0.15s ease'
                }}
              >
                {label}
              </button>
            );
          })}
        </div>

        {/* Date Inputs & Action Buttons Row */}
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 13, fontWeight: 700, color: '#475569' }}>From Date</label>
            <input
              type="date"
              value={filters.date_from || ''}
              onChange={(e) => setF('date_from', e.target.value)}
              style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 14, minWidth: 160 }}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 13, fontWeight: 700, color: '#475569' }}>To Date</label>
            <input
              type="date"
              value={filters.date_to || ''}
              onChange={(e) => setF('date_to', e.target.value)}
              style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 14, minWidth: 160 }}
            />
          </div>

          {name !== 'daily-report' && (
            <>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label style={{ fontSize: 13, fontWeight: 700, color: '#475569' }}>Customer</label>
                <select
                  value={filters.customer_id || ''}
                  onChange={(e) => setF('customer_id', e.target.value)}
                  style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 14, minWidth: 160 }}
                >
                  <option value="">All customers</option>
                  {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label style={{ fontSize: 13, fontWeight: 700, color: '#475569' }}>Chit Code</label>
                <input
                  value={filters.chit_code || ''}
                  onChange={(e) => setF('chit_code', e.target.value)}
                  placeholder="e.g. SM-001"
                  style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 14, width: 130 }}
                />
              </div>
            </>
          )}

          <div style={{ display: 'flex', gap: 8, marginLeft: 'auto' }}>
            <button
              className="btn secondary"
              onClick={clearAll}
              disabled={!hasFilters}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px',
                borderRadius: 8, border: '1px solid #cbd5e1', background: '#ffffff',
                fontSize: 13.5, fontWeight: 700, color: '#334155', cursor: 'pointer'
              }}
            >
              <FiRefreshCw size={14} /> Clear Filters
            </button>

            <button
              className="btn primary"
              onClick={() => apply()}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 20px',
                borderRadius: 8, border: 'none', background: '#1d4ed8',
                fontSize: 13.5, fontWeight: 700, color: '#ffffff', cursor: 'pointer',
                boxShadow: '0 2px 4px rgba(29, 78, 216, 0.25)'
              }}
            >
              <FiSearch size={15} /> Apply Filters
            </button>
          </div>
        </div>

        {/* Active Filter Info Text Line */}
        <div style={{ marginTop: 14, fontSize: 13.5, color: '#475569', display: 'flex', alignItems: 'center', gap: 6 }}>
          <FiInfo size={15} style={{ color: '#1d4ed8' }} />
          <span><strong>Active filter:</strong> {activeFilterSummary}</span>
        </div>
      </div>

      {/* ---------- Report Content Card ---------- */}
      <div className="card rpt-table-card" style={{ borderRadius: 12, overflow: 'hidden', border: '1px solid #e2e8f0', background: '#ffffff' }}>
        {loading && <Spinner />}
        {error && <ErrorState error={error} onRetry={() => apply()} />}
        {!loading && !error && data && (
          <>
            {/* Card Header matching Screenshot */}
            <div style={{
              padding: '16px 20px', borderBottom: '1px solid #e2e8f0',
              display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12
            }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 22 }}>{REPORT_ICONS[name] || <FiFileText />}</span>
                  <h2 style={{ margin: 0, fontSize: 19, fontWeight: 800, color: '#0f172a', textTransform: 'uppercase', letterSpacing: '0.3px' }}>
                    {data.title || activeMeta?.label}
                  </h2>
                </div>
                <div style={{ fontSize: 13, color: '#64748b', marginTop: 4 }}>
                  {data.filters?.period} · generated {new Date(data.generated_at).toLocaleString()}
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span style={{
                    background: '#dcfce7', color: '#15803d', fontWeight: 800, fontSize: 12.5,
                    padding: '5px 12px', borderRadius: 12, display: 'inline-flex', alignItems: 'center', gap: 5
                  }}>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#16a34a' }}></span>
                    {data.total !== undefined ? `${data.total} TOTAL RECORDS` : `${displayRows.length} RECORDS`}
                  </span>

                  <button className="btn sm secondary" onClick={() => window.print()} style={{ padding: '6px 14px', fontSize: 13, fontWeight: 600 }}>
                    <FiPrinter size={14} style={{ marginRight: 4 }} /> Print
                  </button>

                  {can('reports.export') && (
                    <>
                      <button className="btn sm secondary" disabled={pdfBusy}
                        onClick={() => downloadReportPdf(name, exportParams, toast, setPdfBusy)}
                        style={{ padding: '6px 14px', fontSize: 13, fontWeight: 600 }}>
                        <FiDownload size={14} style={{ marginRight: 4 }} /> Download PDF
                      </button>

                      <button className="btn sm secondary"
                        onClick={() => download(`/api/reports/${name}/export`, exportParams)}
                        style={{ padding: '6px 14px', fontSize: 13, fontWeight: 600 }}>
                        <FiDownload size={14} style={{ marginRight: 4 }} /> Export Excel
                      </button>
                    </>
                  )}
                </div>

                {/* Applied Filter Banner Pill on right */}
                <div style={{
                  background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8,
                  padding: '5px 12px', fontSize: 13, color: '#1e40af', fontWeight: 700
                }}>
                  Applied Filters: {activeFilterSummary}
                </div>
              </div>
            </div>

            <div className="print-report">
              {/* Daily Report KPI Cards Grid (7 Cards in 2 Rows matching Screenshot) */}
              {name === 'daily-report' && Array.isArray(data.summary) && (
                <div className="no-print" style={{ padding: 18, background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                  {/* Row 1: 4 Cards */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14, marginBottom: 14 }}>
                    {data.summary.slice(0, 4).map((m) => (
                      <div key={m.label} style={{
                        background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '16px 18px',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
                      }}>
                        <div style={{ fontSize: 12.5, fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                          {m.label}
                        </div>
                        <div style={{ fontSize: 24, fontWeight: 800, color: '#0f172a', marginTop: 4 }}>
                          {money(m.value)}
                        </div>
                        {m.hint && (
                          <div style={{
                            fontSize: 12.5, marginTop: 4, fontWeight: 700,
                            color: m.tone === 'good' ? '#16a34a' : m.tone === 'bad' ? '#dc2626' : '#64748b'
                          }}>
                            {m.hint}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Row 2: 3 Cards */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14 }}>
                    {data.summary.slice(4).map((m) => (
                      <div key={m.label} style={{
                        background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '16px 18px',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
                      }}>
                        <div style={{ fontSize: 12.5, fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                          {m.label}
                        </div>
                        <div style={{
                          fontSize: 24, fontWeight: 800, marginTop: 4,
                          color: m.label === 'Profit / Loss' ? '#16a34a' : '#0f172a'
                        }}>
                          {money(m.value)}
                        </div>
                        {m.hint && (
                          <div style={{
                            fontSize: 12.5, marginTop: 4, fontWeight: 700,
                            color: m.label === 'Profit / Loss' ? '#16a34a' : '#64748b'
                          }}>
                            {m.hint}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Report Data Table */}
              {data.kind === 'summary' ? (
                <div className="card-body" style={{ padding: 18 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
                    {displayRows.map((r) => (
                      <div key={r.Metric} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '16px 18px' }}>
                        <div style={{ fontSize: 12.5, fontWeight: 800, color: '#475569', textTransform: 'uppercase' }}>{r.Metric}</div>
                        <div style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', marginTop: 4 }}>
                          {/^(Chits|Active)/.test(r.Metric) ? new Intl.NumberFormat('en-IN').format(r.Value) : money(r.Value)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : displayRows.length === 0 ? (
                <EmptyState title="NIL — No Data Available" hint="No records match the selected filters. Adjust the date range or clear the filters." />
              ) : (
                <div className="table-wrap rpt-table-wrap" style={{ borderTop: name === 'daily-report' ? 'none' : '1px solid #e2e8f0' }}>
                  <table className="grid rpt-table">
                    <colgroup>
                      {visibleHeaders.map((h, i) => (
                        <col key={h} style={{ width: `${colWidths[i]}%` }} />
                      ))}
                    </colgroup>
                    <thead>
                      <tr>
                        {visibleHeaders.map((h) => (
                          <th key={h} title={h} className={[rightAlign(data.col_types?.[h]) ? 'right' : '', isWrapCol(h) ? 'col-wrap' : ''].filter(Boolean).join(' ')} style={{
                            background: runningCols.has(h) ? '#eef2ff' : undefined,
                            fontSize: 13.5, fontWeight: 800, color: '#334155'
                          }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {displayRows.map((row, i) => (
                        <tr key={i}>
                          {visibleHeaders.map((h) => {
                            const val = row[h];
                            const isStatusCol = h.toLowerCase() === 'status';
                            return (
                              <td key={h} className={[rightAlign(data.col_types?.[h]) ? 'right' : '', isWrapCol(h) ? 'col-wrap' : ''].filter(Boolean).join(' ')} style={{
                                background: runningCols.has(h) ? '#f5f7ff' : undefined,
                                fontVariantNumeric: rightAlign(data.col_types?.[h]) ? 'tabular-nums' : undefined,
                                fontSize: 14
                              }}>
                                {isStatusCol ? (
                                  <span style={{
                                    background: '#dcfce7', color: '#166534', fontWeight: 700, fontSize: 12.5,
                                    padding: '4px 12px', borderRadius: 12, display: 'inline-flex', alignItems: 'center', gap: 5
                                  }}>
                                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#16a34a' }}></span>
                                    {val}
                                  </span>
                                ) : (
                                  fmtCell(data.col_types?.[h], val)
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                    {computedTotals && Object.keys(computedTotals).length > 0 && (
                      <tfoot>
                        <tr className="rpt-total-row">
                          {visibleHeaders.map((h, i) => (
                            <td key={h} className={[i === 0 ? '' : (rightAlign(data.col_types?.[h]) ? 'right' : ''), isWrapCol(h) ? 'col-wrap' : ''].filter(Boolean).join(' ')} style={{ fontSize: 14, fontWeight: 800 }}>
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

            {/* ---------- Server-Side Pagination Bar ---------- */}
            {data && data.total !== undefined && data.total > 0 && (
              <div className="no-print" style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '14px 20px', background: '#ffffff', borderTop: '1px solid #e2e8f0',
                fontSize: 13.5, flexWrap: 'wrap', gap: 10
              }}>
                <div style={{ color: '#64748b', fontWeight: 600 }}>
                  Showing <strong style={{ color: '#0f172a' }}>{data.total === 0 ? 0 : (data.page - 1) * data.per_page + 1}</strong> to{' '}
                  <strong style={{ color: '#0f172a' }}>{Math.min(data.page * data.per_page, data.total)}</strong> of{' '}
                  <strong style={{ color: '#0f172a' }}>{data.total}</strong> records {hasFilters ? '(filtered)' : ''}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 13, color: '#64748b', fontWeight: 600 }}>Per Page:</span>
                    <select
                      value={perPage}
                      onChange={(e) => handlePerPageChange(Number(e.target.value))}
                      style={{ padding: '5px 10px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 13, background: '#fff', cursor: 'pointer' }}
                    >
                      <option value={10}>10</option>
                      <option value={20}>20</option>
                      <option value={50}>50</option>
                      <option value={100}>100</option>
                    </select>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <button
                      className="btn sm secondary"
                      disabled={page <= 1 || loading}
                      onClick={() => handlePageChange(page - 1)}
                      style={{ padding: '5px 12px', display: 'inline-flex', alignItems: 'center', gap: 4, fontWeight: 700, fontSize: 13 }}
                    >
                      <FiChevronLeft size={15} /> Prev
                    </button>

                    <span style={{ padding: '0 10px', fontWeight: 700, color: '#334155', fontSize: 13.5 }}>
                      {data.page} of {data.total_pages || 1}
                    </span>

                    <button
                      className="btn sm secondary"
                      disabled={page >= (data.total_pages || 1) || loading}
                      onClick={() => handlePageChange(page + 1)}
                      style={{ padding: '5px 12px', display: 'inline-flex', alignItems: 'center', gap: 4, fontWeight: 700, fontSize: 13 }}
                    >
                      Next <FiChevronRight size={15} />
                    </button>
                  </div>
                </div>
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
      <button
        className="btn secondary"
        onClick={() => setOpen((o) => !o)}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px',
          borderRadius: 8, border: '1px solid #cbd5e1', background: '#ffffff',
          fontSize: 14, fontWeight: 600, color: '#334155', cursor: 'pointer'
        }}
      >
        <FiFileText size={15} /> Templates ▾
      </button>
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
