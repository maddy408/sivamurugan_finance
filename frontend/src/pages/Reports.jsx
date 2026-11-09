import { useEffect, useMemo, useState } from 'react';
import { api, API_BASE, money, fmtDate } from '../api/client';
import { Spinner, ErrorState, EmptyState } from '../components/ui';
import { useAuth } from '../state/AuthContext';
import { useToast } from '../state/ToastContext';
import { useI18n } from '../state/I18nContext';
import {
  FiBarChart2, FiFileText, FiCheckCircle, FiCreditCard, FiUsers, FiCalendar,
  FiUser, FiDollarSign, FiTrendingUp, FiClipboard, FiBookOpen, FiSearch, FiDownload, FiPrinter, FiSun,
  FiChevronLeft, FiChevronRight, FiRefreshCw, FiInfo, FiClock, FiFilter
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
  'chit-opening': <FiFileText />,
  'chit-closing': <FiCheckCircle />,
  'chit-collection': <FiCreditCard />,
  'customer-collection': <FiUsers />,
  'daily-collection': <FiCalendar />,
  'chit-distribution': (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
      <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
    </svg>
  ),
  'pending-dues': <FiClock />,
  'chit-profit': <FiTrendingUp />,
  'financial-ledger': (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 10v7h3v-7H4zm6 0v7h3v-7h-3zM2 22h19v-3H2v3zm14-12v7h3v-7h-3zm-4.5-9L2 6v2h19V6l-9.5-5z" />
    </svg>
  ),
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
  const { t, lang } = useI18n();

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

    if (p.date_from && p.date_to) parts.push(`${p.date_from} - ${p.date_to}`);
    else if (p.date_from) parts.push(`From ${p.date_from}`);
    else if (p.date_to) parts.push(`To ${p.date_to}`);

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
    <div className="reports-page-wrapper" style={{ maxWidth: '100%', margin: '0 auto', paddingBottom: 24 }}>
      <style>{`
        .reports-page-wrapper {
          color: #0f172a;
        }
        .rpt-card {
          background: #ffffff;
          border-radius: 16px;
          border: 1px solid #cbd5e1;
          box-shadow: 0 4px 20px rgba(13, 40, 86, 0.06);
          margin-bottom: 18px;
          overflow: hidden;
        }
        .rpt-pill-btn {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 8px 18px;
          border-radius: 24px;
          border: 1.5px solid #cbd5e1;
          background: #ffffff;
          color: #0f172a;
          font-weight: 700;
          font-size: 13px;
          cursor: pointer;
          transition: all 0.2s ease;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.03);
        }
        .rpt-pill-btn:hover {
          border-color: #0d2856;
          background: #f1f5f9;
        }
        .rpt-pill-btn.active {
          background: linear-gradient(135deg, #0d2856 0%, #1d4ed8 100%);
          color: #ffffff;
          border-color: #0d2856;
          box-shadow: 0 4px 14px rgba(13, 40, 86, 0.4);
          font-weight: 700;
        }
        .rpt-gradient-btn {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 9px 24px;
          border-radius: 24px;
          border: none;
          background: linear-gradient(135deg, #0d2856 0%, #1d4ed8 100%);
          color: #ffffff;
          font-weight: 700;
          font-size: 13.5px;
          cursor: pointer;
          box-shadow: 0 4px 14px rgba(13, 40, 86, 0.45);
          transition: all 0.2s ease;
        }
        .rpt-gradient-btn:hover {
          transform: translateY(-1px);
          box-shadow: 0 6px 20px rgba(13, 40, 86, 0.55);
        }
        .rpt-white-btn {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 7px 16px;
          border-radius: 20px;
          border: 1.5px solid #cbd5e1;
          background: #ffffff;
          color: #0f172a;
          font-weight: 700;
          font-size: 13px;
          cursor: pointer;
          transition: all 0.15s ease;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
        }
        .rpt-white-btn:hover {
          border-color: #0d2856;
          background: #f8fafc;
        }
        .rpt-kpi-card {
          position: relative;
          border-radius: 14px;
          padding: 18px 20px;
          box-shadow: 0 3px 12px rgba(15, 23, 42, 0.05);
          overflow: hidden;
          display: flex;
          align-items: center;
          gap: 16px;
          transition: transform 0.15s ease, box-shadow 0.15s ease;
        }
        .rpt-kpi-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 6px 18px rgba(15, 23, 42, 0.09);
        }
        .rpt-table thead th {
          background: #f1f5f9;
          color: #1e293b;
          font-size: 12px;
          font-weight: 800;
          letter-spacing: 0.5px;
          text-transform: uppercase;
          padding: 12px 16px;
          border-bottom: 2px solid #cbd5e1;
        }
        .rpt-table tbody td {
          padding: 12px 16px;
          font-size: 13.5px;
          color: #0f172a;
          border-bottom: 1px solid #e2e8f0;
        }
        .rpt-table tbody tr:hover td {
          background: #f8fafc;
        }
        @media (max-width: 1024px) {
          .rpt-kpi-grid {
            grid-template-columns: repeat(2, 1fr) !important;
          }
        }
        @media (max-width: 640px) {
          .rpt-kpi-grid {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>

      {/* ---------- Header Matching Screenshot ---------- */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{
            width: 44, height: 44, borderRadius: 12,
            background: 'linear-gradient(135deg, #0d2856 0%, #1d4ed8 100%)',
            display: 'grid', placeItems: 'center', color: '#ffffff',
            boxShadow: '0 4px 14px rgba(13, 40, 86, 0.35)'
          }}>
            <FiBarChart2 size={24} />
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: '#0f172a', letterSpacing: '-0.3px' }}>
              {t('Reports', 'Reports')}
            </h1>
            <p style={{ margin: '3px 0 0 0', fontSize: 13.5, color: '#64748b', fontWeight: 500 }}>
              {t('Analyze and export your chit fund reports with custom date filters', 'Analyze and export your chit fund reports with custom date filters')}
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {can('reports.export') && (
            <>
              <button
                className="rpt-white-btn"
                onClick={() => download('/api/reports/full-export', exportParams)}
              >
                <FiDownload size={14} style={{ color: '#0d2856' }} />
                <span>{t('Export Full Workbook', 'Export Full Workbook')}</span>
              </button>

              <div style={{ position: 'relative' }}>
                <TemplatesMenu onPick={(t) => download(`/api/reports/templates/${t}`)} />
              </div>
            </>
          )}
        </div>
      </div>

      {/* ---------- Card 1: Select Report Type (10) ---------- */}
      <div className="rpt-card" style={{ padding: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
          <FiFilter size={16} style={{ color: '#0d2856' }} />
          <span style={{ fontSize: 13.5, fontWeight: 800, color: '#0f172a', letterSpacing: '0.2px' }}>
            {t('Select Report Type', 'Select Report Type')} ({reportList.length})
          </span>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          {reportList.map((c) => {
            const isActive = c.name === name;
            return (
              <button
                key={c.name}
                className={`rpt-pill-btn ${isActive ? 'active' : ''}`}
                onClick={() => { setName(c.name); setData(null); }}
              >
                <span style={{ fontSize: 14 }}>{REPORT_ICONS[c.name] || <FiFileText />}</span>
                <span>{t(c.label, c.label)}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ---------- Card 2: Date / Range Filter ---------- */}
      <div className="rpt-card" style={{ padding: 20 }}>
        {/* Header Row */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <div style={{
              width: 32, height: 32, borderRadius: 8,
              background: '#0d2856', display: 'grid', placeItems: 'center', color: '#ffffff',
              boxShadow: '0 2px 6px rgba(13, 40, 86, 0.3)'
            }}>
              <FiCalendar size={17} />
            </div>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#0f172a' }}>
              {t('Date / Range Filter', 'Date / Range Filter')}
            </h2>
          </div>

          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 20,
            padding: '4px 12px', fontSize: 12, fontWeight: 600, color: '#475569'
          }}>
            <FiClock size={13} style={{ color: '#64748b' }} />
            <span>UTC+05:30 India</span>
          </div>
        </div>

        {/* Quick Select Pill Buttons Row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#1e293b', marginRight: 4 }}>{t('Quick Select:', 'Quick Select:')}</span>
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
                className={`rpt-pill-btn ${isSelected ? 'active' : ''}`}
                style={{ padding: '6px 18px', fontSize: 13 }}
              >
                {t(label, label)}
              </button>
            );
          })}
        </div>

        {/* Inputs & Action Buttons Row */}
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: '#475569' }}>{t('From Date', 'From Date')}</label>
              <input
                type="date"
                value={filters.date_from || ''}
                onChange={(e) => setF('date_from', e.target.value)}
                style={{
                  padding: '8px 14px', borderRadius: 10, border: '1px solid #cbd5e1',
                  fontSize: 13.5, fontWeight: 600, color: '#0f172a', background: '#ffffff', minWidth: 155
                }}
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: '#475569' }}>{t('To Date', 'To Date')}</label>
              <input
                type="date"
                value={filters.date_to || ''}
                onChange={(e) => setF('date_to', e.target.value)}
                style={{
                  padding: '8px 14px', borderRadius: 10, border: '1px solid #cbd5e1',
                  fontSize: 13.5, fontWeight: 600, color: '#0f172a', background: '#ffffff', minWidth: 155
                }}
              />
            </div>

            {name !== 'daily-report' && (
              <>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <label style={{ fontSize: 12, fontWeight: 700, color: '#475569' }}>{t('Customer', 'Customer')}</label>
                  <select
                    value={filters.customer_id || ''}
                    onChange={(e) => setF('customer_id', e.target.value)}
                    style={{
                      padding: '8px 14px', borderRadius: 10, border: '1px solid #cbd5e1',
                      fontSize: 13.5, fontWeight: 600, color: '#0f172a', background: '#ffffff', minWidth: 160
                    }}
                  >
                    <option value="">{t('All customers', 'All customers')}</option>
                    {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <label style={{ fontSize: 12, fontWeight: 700, color: '#475569' }}>{t('Chit Code', 'Chit Code')}</label>
                  <input
                    value={filters.chit_code || ''}
                    onChange={(e) => setF('chit_code', e.target.value)}
                    placeholder={t('e.g. SM-001', 'e.g. SM-001')}
                    style={{
                      padding: '8px 14px', borderRadius: 10, border: '1px solid #cbd5e1',
                      fontSize: 13.5, fontWeight: 600, color: '#0f172a', background: '#ffffff', width: 130
                    }}
                  />
                </div>
              </>
            )}
          </div>

          {/* Buttons: Clear Filters & Apply Filters */}
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <button
              onClick={clearAll}
              disabled={!hasFilters}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 20px',
                borderRadius: 24, border: '1px solid #bfdbfe', background: '#ffffff',
                fontSize: 13.5, fontWeight: 700, color: '#1e40af', cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
            >
              <FiRefreshCw size={14} /> {t('Clear Filters', 'Clear Filters')}
            </button>

            <button
              className="rpt-gradient-btn"
              onClick={() => apply()}
            >
              <FiSearch size={15} /> {t('Apply Filters', 'Apply Filters')}
            </button>
          </div>
        </div>

        {/* Info Banner Text */}
        <div style={{
          marginTop: 14, fontSize: 13, color: '#0d2856', fontWeight: 700,
          display: 'flex', alignItems: 'center', gap: 7,
          background: '#f0f7ff', border: '1.5px solid #7dd3fc', borderRadius: 10, padding: '8px 14px'
        }}>
          <FiInfo size={16} style={{ color: '#0d2856' }} />
          <span><strong>{t('Active filter:', 'Active filter:')}</strong> {activeFilterSummary}</span>
        </div>
      </div>

      {/* ---------- Card 3: Report Content Card ---------- */}
      <div className="rpt-card" style={{ padding: 0 }}>
        {loading && <Spinner />}
        {error && <ErrorState error={error} onRetry={() => apply()} />}
        {!loading && !error && data && (
          <>
            {/* Header matching Screenshot */}
            <div style={{
              padding: '18px 20px', borderBottom: '1px solid #edf2f7',
              display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12
            }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 20, color: '#0d2856' }}>{REPORT_ICONS[name] || <FiBarChart2 />}</span>
                  <h2 style={{ margin: 0, fontSize: 18, fontWeight: 900, color: '#0f172a', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                    {t(data.title || activeMeta?.label || '')}
                  </h2>
                </div>
                <div style={{ fontSize: 12.5, color: '#64748b', marginTop: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <FiCalendar size={13} />
                  <span>{data.filters?.period ? t(data.filters.period, data.filters.period) : t('Selected Period', 'Selected Period')} • {t('Generated on', 'Generated on')} {new Date(data.generated_at).toLocaleString()}</span>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <span style={{
                    background: '#dcfce7', color: '#15803d', fontWeight: 800, fontSize: 12,
                    padding: '5px 12px', borderRadius: 20, display: 'inline-flex', alignItems: 'center', gap: 6,
                    border: '1px solid #bbf7d0'
                  }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#16a34a' }}></span>
                    {data.total !== undefined ? `${data.total} ${t('TOTAL RECORDS', 'TOTAL RECORDS')}` : `${displayRows.length} ${t('TOTAL RECORDS', 'TOTAL RECORDS')}`}
                  </span>

                  <button className="btn-print" onClick={() => window.print()} style={{ padding: '6px 16px', fontSize: 13 }}>
                    <FiPrinter size={14} /> {t('Print', 'Print')}
                  </button>

                  {can('reports.export') && (
                    <>
                      <button className="btn-pdf" disabled={pdfBusy} style={{ padding: '6px 16px', fontSize: 13 }}
                        onClick={() => downloadReportPdf(name, exportParams, toast, setPdfBusy)}>
                        <FiDownload size={14} /> {t('Download PDF', 'Download PDF')}
                      </button>

                      <button className="btn-excel" style={{ padding: '6px 16px', fontSize: 13 }}
                        onClick={() => download(`/api/reports/${name}/export`, exportParams)}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z" />
                        </svg>
                        <span>{t('Export Excel', 'Export Excel')} ▾</span>
                      </button>
                    </>
                  )}
                </div>

                {/* Applied Filter Pill */}
                <div style={{
                  background: 'linear-gradient(135deg, #0d2856 0%, #1d4ed8 100%)',
                  borderRadius: 20,
                  padding: '5px 14px', fontSize: 12, color: '#ffffff', fontWeight: 700,
                  boxShadow: '0 2px 8px rgba(13, 40, 86, 0.3)'
                }}>
                  {t('Applied Filters:', 'Applied Filters:')} {activeFilterSummary}
                </div>
              </div>
            </div>

            <div className="print-report">
              {/* Daily Report KPI Cards Grid (4 Top Cards matching Screenshot with Subtle Colors) */}
              {name === 'daily-report' && Array.isArray(data.summary) && (
                <div className="no-print" style={{ padding: '18px 20px', background: '#ffffff', borderBottom: '1px solid #f1f5f9' }}>
                  <div className="rpt-kpi-grid" style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
                    gap: 16
                  }}>
                    {data.summary.slice(0, 4).map((m, idx) => {
                      const style = getKpiCardStyle(idx, m.label);
                      return (
                        <div key={m.label} className="rpt-kpi-card" style={{
                          background: style.bg,
                          border: style.border,
                        }}>
                          {/* Corner wave tint accent */}
                          <div style={{
                            position: 'absolute', right: -15, bottom: -15, width: 80, height: 80,
                            borderRadius: '50%', background: style.wave, opacity: 0.6, pointerEvents: 'none'
                          }} />

                          <div>{style.icon}</div>
                          <div style={{ position: 'relative', zIndex: 2 }}>
                            <div style={{ fontSize: 11, fontWeight: 800, color: '#475569', letterSpacing: '0.4px', textTransform: 'uppercase' }}>
                              {t(m.label === 'Total Collection Amount' ? 'TOTAL COLLECTION' : m.label)}
                            </div>
                            <div style={{ fontSize: 24, fontWeight: 900, color: '#0f172a', marginTop: 2, letterSpacing: '-0.3px' }}>
                              {money(m.value)}
                            </div>
                            <div style={{
                              fontSize: 12, marginTop: 2, fontWeight: 600,
                              color: m.tone === 'good' ? '#16a34a' : m.tone === 'bad' ? '#dc2626' : '#64748b'
                            }}>
                              {m.hint ? t(m.hint) : '—'}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Row 2: remaining summary cards if available */}
                  {data.summary.length > 4 && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16, marginTop: 14 }}>
                      {data.summary.slice(4).map((m, idx) => {
                        const style = getKpiCardStyle(idx + 4, m.label);
                        return (
                          <div key={m.label} className="rpt-kpi-card" style={{
                            background: style.bg,
                            border: style.border,
                          }}>
                            <div>{style.icon}</div>
                            <div style={{ position: 'relative', zIndex: 2 }}>
                              <div style={{ fontSize: 11, fontWeight: 800, color: '#475569', letterSpacing: '0.4px', textTransform: 'uppercase' }}>
                                {t(m.label)}
                              </div>
                              <div style={{ fontSize: 22, fontWeight: 900, color: '#0f172a', marginTop: 2, letterSpacing: '-0.3px' }}>
                                {money(m.value)}
                              </div>
                              <div style={{
                                fontSize: 12, marginTop: 2, fontWeight: 600,
                                color: m.tone === 'good' ? '#16a34a' : m.tone === 'bad' ? '#dc2626' : '#64748b'
                              }}>
                                {m.hint ? t(m.hint) : '—'}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Report Data Table */}
              {data.kind === 'summary' ? (
                <div style={{ padding: 20 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
                    {displayRows.map((r) => (
                      <div key={r.Metric} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12, padding: '16px 18px' }}>
                        <div style={{ fontSize: 12, fontWeight: 800, color: '#475569', textTransform: 'uppercase' }}>{t(r.Metric, r.Metric)}</div>
                        <div style={{ fontSize: 22, fontWeight: 900, color: '#0f172a', marginTop: 4 }}>
                          {/^(Chits|Active)/.test(r.Metric) ? new Intl.NumberFormat('en-IN').format(r.Value) : money(r.Value)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : displayRows.length === 0 ? (
                <div style={{ padding: '40px 20px' }}>
                  <EmptyState
                    title={t("NIL — No Data Available", "NIL — No Data Available")}
                    hint={t("No records match the selected filters. Adjust the date range or clear the filters.", "No records match the selected filters. Adjust the date range or clear the filters.")}
                  />
                </div>
              ) : (
                <div className="table-wrap rpt-table-wrap" style={{ overflowX: 'auto' }}>
                  <table className="rpt-table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                    <colgroup>
                      {visibleHeaders.map((h, i) => (
                        <col key={h} style={{ width: `${colWidths[i]}%` }} />
                      ))}
                    </colgroup>
                    <thead>
                      <tr>
                        {visibleHeaders.map((h) => (
                          <th key={h} title={h} style={{
                            textAlign: rightAlign(data.col_types?.[h]) ? 'right' : 'left',
                            background: runningCols.has(h) ? '#eff6ff' : undefined,
                          }}>{t(h, h)}</th>
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
                              <td key={h} style={{
                                textAlign: rightAlign(data.col_types?.[h]) ? 'right' : 'left',
                                background: runningCols.has(h) ? '#f8faff' : undefined,
                                fontVariantNumeric: rightAlign(data.col_types?.[h]) ? 'tabular-nums' : undefined,
                              }}>
                                {isStatusCol ? (
                                  <span style={{
                                    background: '#dcfce7', color: '#166534', fontWeight: 700, fontSize: 12,
                                    padding: '3px 10px', borderRadius: 12, display: 'inline-flex', alignItems: 'center', gap: 5,
                                    border: '1px solid #bbf7d0'
                                  }}>
                                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#16a34a' }}></span>
                                    {t(val, val)}
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
                        <tr style={{ background: '#f8fafc', borderTop: '2px solid #cbd5e1' }}>
                          {visibleHeaders.map((h, i) => (
                            <td key={h} style={{
                              textAlign: i === 0 ? 'left' : (rightAlign(data.col_types?.[h]) ? 'right' : 'left'),
                              fontSize: 12, fontWeight: 900, color: '#0f172a', padding: '12px 16px'
                            }}>
                              {h in computedTotals
                                ? (typeof computedTotals[h] === 'number' ? fmtCell(data.col_types?.[h], computedTotals[h]) : t(computedTotals[h], computedTotals[h]))
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
                fontSize: 13, flexWrap: 'wrap', gap: 10
              }}>
                <div style={{ color: '#64748b', fontWeight: 600 }}>
                  {t('Showing', 'Showing')} <strong style={{ color: '#0f172a' }}>{data.total === 0 ? 0 : (data.page - 1) * data.per_page + 1}</strong> {t('to', 'to')}{' '}
                  <strong style={{ color: '#0f172a' }}>{Math.min(data.page * data.per_page, data.total)}</strong> {t('of', 'of')}{' '}
                  <strong style={{ color: '#0f172a' }}>{data.total}</strong> {t('records', 'records')} {hasFilters ? `(${t('filtered', 'filtered')})` : ''}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 13, color: '#64748b', fontWeight: 600 }}>{t('Per Page:', 'Per Page:')}</span>
                    <select
                      value={perPage}
                      onChange={(e) => handlePerPageChange(Number(e.target.value))}
                      style={{ padding: '4px 10px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13, background: '#fff', cursor: 'pointer' }}
                    >
                      <option value={10}>10</option>
                      <option value={20}>20</option>
                      <option value={50}>50</option>
                      <option value={100}>100</option>
                    </select>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <button
                      className="rpt-white-btn"
                      disabled={page <= 1 || loading}
                      onClick={() => handlePageChange(page - 1)}
                      style={{ padding: '5px 12px' }}
                    >
                      <FiChevronLeft size={14} /> {t('Prev', 'Prev')}
                    </button>

                    <span style={{ padding: '0 8px', fontWeight: 700, color: '#1e293b', fontSize: 13 }}>
                      {data.page} {t('of', 'of')} {data.total_pages || 1}
                    </span>

                    <button
                      className="rpt-white-btn"
                      disabled={page >= (data.total_pages || 1) || loading}
                      onClick={() => handlePageChange(page + 1)}
                      style={{ padding: '5px 12px' }}
                    >
                      {t('Next', 'Next')} <FiChevronRight size={14} />
                    </button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------- KPI Card Style Helper */

function getKpiCardStyle(index, label) {
  const l = (label || '').toLowerCase();
  if (l.includes('collection') || index === 0) {
    return {
      bg: 'linear-gradient(135deg, #f0f7ff 0%, #e0f2fe 100%)',
      border: '1.5px solid #38bdf8',
      labelColor: '#0369a1',
      icon: (
        <svg width="42" height="38" viewBox="0 0 44 40" fill="none">
          <rect x="2" y="6" width="38" height="28" rx="6" fill="#1d4ed8" />
          <path d="M2 13h38" stroke="#1e40af" strokeWidth="2" opacity="0.4" />
          <path d="M22 14h18a4 4 0 0 1 4 4v8a4 4 0 0 1-4 4H22a2 2 0 0 1-2-2v-12a2 2 0 0 1 2-2z" fill="#1e3a8a" />
          <circle cx="32" cy="22" r="3.5" fill="#ffffff" />
          <circle cx="32" cy="22" r="1.5" fill="#1d4ed8" />
        </svg>
      ),
      wave: '#bae6fd'
    };
  }
  if (l.includes('income') || index === 1) {
    return {
      bg: 'linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)',
      border: '1.5px solid #4ade80',
      labelColor: '#15803d',
      icon: (
        <svg width="42" height="38" viewBox="0 0 44 40" fill="none">
          <circle cx="21" cy="9" r="6" fill="#facc15" />
          <circle cx="21" cy="9" r="4.5" stroke="#ca8a04" strokeWidth="1" fill="#fef08a" />
          <text x="21" y="12.5" textAnchor="middle" fontSize="8" fontWeight="900" fill="#a16207" fontFamily="sans-serif">₹</text>
          <path d="M4 27l10-4 7 2.5c1.8.6 3.6 0 4.8-1.2l8-7c.9-.8 2.3-.6 3 .3.7.9.5 2.3-.4 3.1l-8 7c-1.8 1.5-4.2 2.1-6.5 1.5l-6-1.8-5 3.1H4v-4.5z" fill="#16a34a" />
          <path d="M2 25h4v11H2z" fill="#15803d" rx="1" />
        </svg>
      ),
      wave: '#bbf7d0'
    };
  }
  if (l.includes('expense') || index === 2) {
    return {
      bg: 'linear-gradient(135deg, #fff1f2 0%, #ffe4e6 100%)',
      border: '1.5px solid #fb7185',
      labelColor: '#be123c',
      icon: (
        <svg width="38" height="42" viewBox="0 0 38 42" fill="none">
          <rect x="4" y="6" width="30" height="34" rx="6" fill="#f43f5e" />
          <rect x="9.5" y="3" width="3.5" height="7" rx="1.75" fill="#fecdd3" />
          <rect x="17.25" y="3" width="3.5" height="7" rx="1.75" fill="#fecdd3" />
          <rect x="25" y="3" width="3.5" height="7" rx="1.75" fill="#fecdd3" />
          <rect x="9.5" y="17" width="19" height="3" rx="1.5" fill="#ffffff" />
          <rect x="9.5" y="23" width="19" height="3" rx="1.5" fill="#ffffff" />
          <rect x="9.5" y="29" width="13" height="3" rx="1.5" fill="#ffffff" />
        </svg>
      ),
      wave: '#fecdd3'
    };
  }
  if (l.includes('due') || index === 3) {
    return {
      bg: 'linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%)',
      border: '1.5px solid #facc15',
      labelColor: '#b45309',
      icon: (
        <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
          <circle cx="20" cy="20" r="18" fill="#f97316" />
          <line x1="20" y1="20" x2="20" y2="10" stroke="#ffffff" strokeWidth="3.2" strokeLinecap="round" />
          <line x1="20" y1="20" x2="12" y2="20" stroke="#ffffff" strokeWidth="3.2" strokeLinecap="round" />
          <circle cx="20" cy="20" r="2.5" fill="#ffffff" />
        </svg>
      ),
      wave: '#fde68a'
    };
  }
  return {
    bg: 'linear-gradient(135deg, #faf5ff 0%, #f3e8ff 100%)',
    border: '1.5px solid #c084fc',
    labelColor: '#6b21a8',
    icon: (
      <div style={{ width: 44, height: 44, borderRadius: 12, background: '#7c3aed', display: 'grid', placeItems: 'center', color: '#ffffff', boxShadow: '0 4px 14px rgba(124, 58, 237, 0.4)' }}>
        <FiTrendingUp size={20} />
      </div>
    ),
    wave: '#e9d5ff'
  };
}

/* ------------------------------------------------------------- templates */

function TemplatesMenu({ onPick }) {
  const [open, setOpen] = useState(false);
  const { t } = useI18n();
  return (
    <>
      <button
        className="rpt-white-btn"
        onClick={() => setOpen((o) => !o)}
      >
        <FiFileText size={14} style={{ color: '#0d2856' }} />
        <span>{t('Templates', 'Templates')} ▾</span>
      </button>
      {open && (
        <div style={{
          position: 'absolute', right: 0, top: '115%', background: '#ffffff',
          border: '1px solid #e2e8f0', borderRadius: 12, boxShadow: '0 10px 25px rgba(0,0,0,0.08)',
          zIndex: 30, minWidth: 200, padding: 6
        }}
          onMouseLeave={() => setOpen(false)}>
          {[
            ['chit', 'Chit import template'],
            ['collection', 'Collection import template'],
            ['expense', 'Expense import template']
          ].map(([tKey, lbl]) => (
            <button
              key={tKey}
              style={{
                display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px',
                background: 'none', border: 'none', cursor: 'pointer', fontSize: 13,
                fontWeight: 600, color: '#334155', borderRadius: 8, transition: 'background 0.15s ease'
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = '#f1f5f9'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; }}
              onClick={() => { onPick(tKey); setOpen(false); }}
            >
              {t(lbl, lbl)}
            </button>
          ))}
        </div>
      )}
    </>
  );
}