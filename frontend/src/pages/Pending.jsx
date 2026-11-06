import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, money, fmtDate } from '../api/client';
import { Spinner, ErrorState, EmptyState } from '../components/ui';
import { useList } from '../hooks/useList';
import { useAuth } from '../state/AuthContext';
import { useToast } from '../state/ToastContext';
import {
  FiCheckSquare, FiBarChart2, FiExternalLink, FiX, FiDownload,
  FiSearch, FiCalendar, FiUsers, FiCreditCard, FiArrowRight
} from 'react-icons/fi';

export default function Pending({ hideTitle = false }) {
  const { can } = useAuth();
  const toast = useToast();
  const list = useList('/api/pending-dues', { initialPerPage: 25 });
  const [activeTab, setActiveTab] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [dateError, setDateError] = useState('');

  const applyDateFilter = () => {
    if (dateFrom && dateTo && dateFrom > dateTo) {
      setDateError('From Date cannot be later than To Date');
      return;
    }
    setDateError('');
    list.setFilter('date_from', dateFrom);
    list.setFilter('date_to', dateTo);
  };
  const clearDateFilter = () => {
    setDateFrom(''); setDateTo(''); setDateError('');
    list.setFilter('date_from', '');
    list.setFilter('date_to', '');
  };
  const s = list.pagination?.summary || {};
  const rawCustomers = list.rows || [];

  const customers = activeTab === 'overdue'
    ? rawCustomers.filter((c) => (c.chits || []).some((ch) => ch.overdue_count > 0))
    : rawCustomers;

  const totalOverdueCustomers = rawCustomers.filter((c) => (c.chits || []).some((ch) => ch.overdue_count > 0)).length;

  return (
    <>
      {/* Top Header matching Screenshot */}
      {!hideTitle && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{
              width: 44, height: 44, borderRadius: 12,
              background: '#e0edfd',
              display: 'grid', placeItems: 'center',
              color: '#1d4ed8'
            }}>
              <FiCheckSquare size={22} />
            </div>
            <div>
              <h1 style={{ margin: 0, fontSize: 22, fontWeight: 900, color: '#0f172a', letterSpacing: '-0.3px' }}>
                Pending Dues &amp; Arrears
              </h1>
              <div style={{ fontSize: 13, color: '#64748b', marginTop: 2, fontWeight: 500 }}>
                Track overdue chit installments and customer balances
              </div>
            </div>
          </div>
          <Link
            to="/reports"
            style={{
              border: '1.5px solid #dbeafe',
              borderRadius: 20,
              padding: '7px 18px',
              background: '#ffffff',
              color: '#1d4ed8',
              fontWeight: 700,
              fontSize: 12.5,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              textDecoration: 'none',
              boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
            }}
          >
            <FiBarChart2 size={14} /> Detailed Dues Report <FiExternalLink size={12} />
          </Link>
        </div>
      )}

      {/* Single-Row Sub Navbar matching Settings Tab Pills */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <button
          onClick={() => setActiveTab('all')}
          style={{
            borderRadius: 20,
            padding: '7px 20px',
            fontSize: 13,
            fontWeight: 700,
            border: activeTab === 'all' ? 'none' : '1px solid #e2e8f0',
            background: activeTab === 'all' ? 'linear-gradient(135deg, #0d2856 0%, #1d4ed8 100%)' : '#ffffff',
            color: activeTab === 'all' ? '#ffffff' : '#475569',
            boxShadow: activeTab === 'all' ? '0 4px 12px rgba(13, 40, 86, 0.25)' : 'none',
            cursor: 'pointer'
          }}
        >
          All Pending Dues ({rawCustomers.length})
        </button>
        <button
          onClick={() => setActiveTab('overdue')}
          style={{
            borderRadius: 20,
            padding: '7px 20px',
            fontSize: 13,
            fontWeight: 700,
            border: activeTab === 'overdue' ? 'none' : '1px solid #e2e8f0',
            background: activeTab === 'overdue' ? 'linear-gradient(135deg, #0d2856 0%, #1d4ed8 100%)' : '#ffffff',
            color: activeTab === 'overdue' ? '#ffffff' : '#475569',
            boxShadow: activeTab === 'overdue' ? '0 4px 12px rgba(13, 40, 86, 0.25)' : 'none',
            cursor: 'pointer'
          }}
        >
          Overdue Only ({totalOverdueCustomers})
        </button>
      </div>

      {/* Sleek Stats Cards matching Screenshot */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 280px))',
        gap: 12,
        marginBottom: 12,
        maxWidth: 600
      }}>
        {/* Card 1: PENDING CUSTOMERS */}
        <div className="dash-metric-card" style={{
          background: '#ffffff',
          borderRadius: 12,
          padding: '10px 16px',
          border: '1px solid #edf2f7',
          borderLeft: '4px solid #1d4ed8',
          boxShadow: '0 2px 8px rgba(15, 23, 42, 0.03)',
          position: 'relative',
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'center',
          gap: 12
        }}>
          <div style={{
            width: 38, height: 38, borderRadius: 10,
            background: '#eff6ff',
            display: 'grid', placeItems: 'center',
            flexShrink: 0
          }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#1d4ed8" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
          </div>
          <div style={{ position: 'relative', zIndex: 1 }}>
            <div style={{ fontSize: 10.5, fontWeight: 800, color: '#1d4ed8', letterSpacing: '0.5px', textTransform: 'uppercase' }}>
              PENDING CUSTOMERS
            </div>
            <div style={{ fontSize: 22, fontWeight: 900, color: '#0f172a', marginTop: 1, letterSpacing: '-0.3px' }}>
              {s.pending_customers ?? 0}
            </div>
            <div style={{ fontSize: 11, color: '#64748b', marginTop: 1 }}>
              Accounts with unpaid dues
            </div>
          </div>
          {/* Faint right watermark */}
          <div style={{ opacity: 0.1, position: 'absolute', right: 12, pointerEvents: 'none' }}>
            <svg width="54" height="54" viewBox="0 0 24 24" fill="none" stroke="#1d4ed8" strokeWidth="1.5">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
          </div>
        </div>

        {/* Card 2: TOTAL PENDING DUES */}
        <div className="dash-metric-card" style={{
          background: '#ffffff',
          borderRadius: 12,
          padding: '10px 16px',
          border: '1px solid #edf2f7',
          borderLeft: '4px solid #ef4444',
          boxShadow: '0 2px 8px rgba(15, 23, 42, 0.03)',
          position: 'relative',
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'center',
          gap: 12
        }}>
          <div style={{
            width: 38, height: 38, borderRadius: 10,
            background: '#fee2e2',
            display: 'grid', placeItems: 'center',
            flexShrink: 0
          }}>
            <div style={{
              width: 26, height: 26, borderRadius: '50%',
              background: 'rgba(239, 68, 68, 0.15)',
              border: '1.5px solid rgba(239, 68, 68, 0.35)',
              display: 'grid', placeItems: 'center',
              color: '#ef4444', fontSize: 14, fontWeight: 900
            }}>
              ₹
            </div>
          </div>
          <div style={{ position: 'relative', zIndex: 1 }}>
            <div style={{ fontSize: 10.5, fontWeight: 800, color: '#ef4444', letterSpacing: '0.5px', textTransform: 'uppercase' }}>
              TOTAL PENDING DUES
            </div>
            <div style={{ fontSize: 22, fontWeight: 900, color: '#0f172a', marginTop: 1, letterSpacing: '-0.3px' }}>
              {money(s.total_pending_dues || s.total_outstanding || 0)}
            </div>
            <div style={{ fontSize: 11, color: '#64748b', marginTop: 1 }}>
              Actual dues payable up to today
            </div>
          </div>
          {/* Faint right watermark */}
          <div style={{ opacity: 0.08, position: 'absolute', right: 16, pointerEvents: 'none', fontSize: 54, fontWeight: 900, color: '#ef4444', lineHeight: 1 }}>
            ₹
          </div>
        </div>
      </div>

      {/* Search Input & Export Excel Row matching Screenshot */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 14, flexWrap: 'wrap' }}>
        <div className="input-with-icon" style={{ flex: 1, minWidth: 260 }}>
          <div className="input-icon-pill" style={{ color: '#64748b' }}><FiSearch size={15} /></div>
          <input
            type="search"
            placeholder="Search customer, code, phone, chit, address…"
            value={list.q}
            onChange={(e) => list.setQ(e.target.value)}
            style={{ borderRadius: 24, height: 40, paddingLeft: 38, background: '#ffffff', borderColor: '#e2e8f0' }}
          />
        </div>
        {list.hasFilters && (
          <button className="btn secondary sm" onClick={list.clear} style={{ borderRadius: 20, height: 38, padding: '0 16px', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            Clear <FiX size={12} />
          </button>
        )}
        {can('loans.export') && (
          <button
            className="btn btn-excel"
            onClick={() => api.download('/api/pending-dues/export', { q: list.q, ...list.filters }).catch((e) => toast.error(e.message))}
            style={{
              borderRadius: 20,
              height: 38,
              padding: '0 20px',
              fontSize: 12.5,
              fontWeight: 700,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              background: '#f0fdf4',
              color: '#16a34a',
              border: '1.5px solid #86efac',
              boxShadow: 'none'
            }}
          >
            <FiDownload size={14} style={{ color: '#16a34a' }} /> Export Excel
          </button>
        )}
      </div>

      {/* Date Range Filter Bar matching Screenshot */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: '#1d4ed8', display: 'flex', alignItems: 'center', gap: 6 }}>
          <FiCalendar size={14} /> Filter Date:
        </span>
        <span style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>From</span>
        <input
          type="date"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          style={{ height: 34, borderRadius: 20, border: '1.5px solid #e2e8f0', padding: '0 12px', fontSize: 12, background: '#ffffff' }}
        />
        <span style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>To</span>
        <input
          type="date"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
          style={{ height: 34, borderRadius: 20, border: '1.5px solid #e2e8f0', padding: '0 12px', fontSize: 12, background: '#ffffff' }}
        />
        <button
          className="btn-save-glow"
          onClick={applyDateFilter}
          style={{
            height: 34,
            padding: '0 22px',
            fontSize: 12.5,
            fontWeight: 700,
            borderRadius: 20,
            background: 'linear-gradient(135deg, #0d2856 0%, #1d4ed8 100%)',
            color: '#ffffff',
            border: 'none',
            cursor: 'pointer',
            boxShadow: '0 4px 12px rgba(13, 40, 86, 0.25)'
          }}
        >
          Apply
        </button>
        {(list.filters.date_from || list.filters.date_to) && (
          <button className="btn sm secondary" onClick={clearDateFilter} style={{ height: 34, borderRadius: 20, padding: '0 14px', fontSize: 12 }}>
            Clear <FiX size={12} />
          </button>
        )}
        {dateError && <span className="err" style={{ fontSize: 11, color: '#f43f5e', marginLeft: 8 }}>{dateError}</span>}
      </div>

      {list.loading && <Spinner />}
      {list.error && <ErrorState error={list.error} onRetry={list.reload} />}
      {!list.loading && !list.error && customers.length === 0 && (
        <div className="card" style={{
          padding: '48px 24px',
          textAlign: 'center',
          background: '#ffffff',
          borderRadius: 14,
          border: '1px solid #edf2f7',
          boxShadow: '0 2px 12px rgba(15, 23, 42, 0.03)',
          marginBottom: 16
        }}>
          <div style={{ position: 'relative', width: 68, height: 68, margin: '0 auto 16px' }}>
            {/* Circular soft blue background glow */}
            <div style={{ position: 'absolute', inset: -8, borderRadius: '50%', background: '#f0f7ff', zIndex: 0 }} />
            {/* Document paper */}
            <svg width="60" height="60" viewBox="0 0 48 48" fill="none" style={{ position: 'relative', zIndex: 1 }}>
              {/* Page base */}
              <path d="M12 6C10.8954 6 10 6.89543 10 8V40C10 41.1046 10.8954 42 12 42H36C37.1046 42 38 41.1046 38 40V16L28 6H12Z" fill="#FFFFFF" stroke="#3b82f6" strokeWidth="2" strokeLinejoin="round" />
              {/* Folded corner */}
              <path d="M28 6V16H38" stroke="#3b82f6" strokeWidth="2" strokeLinejoin="round" fill="#eff6ff" />
              {/* Horizontal text lines */}
              <line x1="16" y1="22" x2="32" y2="22" stroke="#1d4ed8" strokeWidth="2" strokeLinecap="round" />
              <line x1="16" y1="28" x2="28" y2="28" stroke="#93c5fd" strokeWidth="2" strokeLinecap="round" />
              <line x1="16" y1="34" x2="24" y2="34" stroke="#93c5fd" strokeWidth="2" strokeLinecap="round" />
              {/* Blue circle badge on bottom right with white cross (X) */}
              <circle cx="34" cy="34" r="7.5" fill="#1d4ed8" stroke="#FFFFFF" strokeWidth="2" />
              <path d="M31.5 31.5L36.5 36.5M36.5 31.5L31.5 36.5" stroke="#FFFFFF" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </div>
          <div style={{ fontSize: 17, fontWeight: 800, color: '#0f172a' }}>
            {activeTab === 'overdue' ? 'No overdue installments' : 'No pending dues'}
          </div>
          <div style={{ fontSize: 13, color: '#64748b', marginTop: 6 }}>
            Every scheduled installment up to today has been fully paid.
          </div>
        </div>
      )}

      {customers.map((c) => {
        const dues = (c.chits || []).flatMap((ch) =>
          (ch.due_installments || []).map((d) => ({
            ...d,
            chit_id: ch.chit_id,
            chit_code: ch.chit_code,
            chit_installment: ch.installment_amount,
          }))
        );

        const displayDues = activeTab === 'overdue'
          ? dues.filter((d) => d.status === 'OVERDUE')
          : dues;

        if (displayDues.length === 0) return null;

        const totalCustomerPending = displayDues.reduce((sum, d) => sum + Number(d.balance_amount || 0), 0);
        const overdueCount = displayDues.filter((d) => d.status === 'OVERDUE').length;

        return (
          <div className="card" key={c.customer_id} style={{ marginBottom: 10, borderRadius: 12, overflow: 'hidden', padding: 0 }}>
            {/* Card Header Banner */}
            <div style={{
              padding: '8px 14px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8
            }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 14, fontWeight: 800 }}>
                  <Link to={`/customers/${c.customer_id}`} style={{ color: '#1d4ed8' }}>{c.customer_name}</Link>{' '}
                  <span className="muted" style={{ fontWeight: 500, fontSize: 12 }}>· {c.customer_code} · {c.mobile || '—'}</span>
                </h2>
                <div className="muted" style={{ fontSize: 11, marginTop: 1 }}>
                  {c.location || '—'}{c.address ? ` · ${c.address}` : ''}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div className="muted" style={{ fontSize: 10, textTransform: 'uppercase', fontWeight: 700 }}>Customer Pending Due</div>
                <b style={{ fontSize: 15, color: '#e11d48' }}>{money(totalCustomerPending)}</b>
                <div style={{ fontSize: 10.5, color: overdueCount > 0 ? '#e11d48' : '#64748b', fontWeight: 600 }}>
                  {displayDues.length} due{displayDues.length === 1 ? '' : 's'} pending {overdueCount > 0 ? `(${overdueCount} overdue)` : ''}
                </div>
              </div>
            </div>

            <div className="table-wrap">
              <table className="grid">
                <thead>
                  <tr>
                    <th>Chit Code</th>
                    <th>Due No.</th>
                    <th>Due Date</th>
                    <th className="right">Installment Amount</th>
                    <th className="right">Paid</th>
                    <th className="right">Due Balance</th>
                    <th className="center">Status</th>
                    <th className="right"></th>
                  </tr>
                </thead>
                <tbody>
                  {displayDues.map((d, idx) => (
                    <tr key={`${d.chit_id}-${d.id || idx}`}>
                      <td>
                        <Link to={`/loans/${d.chit_id}`} style={{ fontWeight: 700, color: '#1d4ed8' }}>
                          {d.chit_code}
                        </Link>
                      </td>
                      <td>
                        <b style={{ color: '#0f172a' }}>Due #{d.installment_no}</b>
                      </td>
                      <td className="nowrap">{fmtDate(d.due_date)}</td>
                      <td className="right">{money(d.payable_amount || d.chit_installment)}</td>
                      <td className="right" style={{ color: Number(d.paid_amount) > 0 ? '#10b981' : '#64748b', fontWeight: 600 }}>
                        {money(d.paid_amount)}
                      </td>
                      <td className="right">
                        <b style={{ fontSize: 12, color: '#e11d48' }}>{money(d.balance_amount)}</b>
                      </td>
                      <td className="center">
                        <span className={`badge ${d.status}`}>
                          {d.status}
                        </span>
                      </td>
                      <td className="right nowrap">
                        {can('collection.create') ? (
                          <Link
                            className="btn-save-glow"
                            to={`/collection/chit/${d.chit_id}`}
                            style={{ height: 26, padding: '2px 10px', fontSize: 11, textDecoration: 'none' }}
                          >
                            Collect Due #{d.installment_no}
                          </Link>
                        ) : (
                          <Link className="btn sm secondary" to={`/collection/chit/${d.chit_id}`}>
                            View
                          </Link>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ background: '#f8fafc', fontWeight: 700 }}>
                    <td colSpan={5} style={{ textAlign: 'right', color: '#64748b', fontSize: 12 }}>
                      Total Pending for Customer ({displayDues.length} dues):
                    </td>
                    <td className="right" style={{ fontSize: 12, color: '#e11d48' }}>
                      {money(totalCustomerPending)}
                    </td>
                    <td colSpan={2}></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        );
      })}

      {!list.loading && customers.length > 0 && (
        <div className="pagination" style={{ marginTop: 12 }}>
          <div className="pagination-info">
            <span className="pagination-total">{list.pagination.total} customer{list.pagination.total === 1 ? '' : 's'}</span>
          </div>
          <div className="pagination-controls">
            <button className="btn sm secondary pagination-btn" disabled={list.page <= 1} onClick={() => list.setPage(list.page - 1)}>
              Prev
            </button>
            <span className="pagination-page-indicator">
              Page {list.page} of {Math.max(1, list.pagination.total_pages)}
            </span>
            <button className="btn sm secondary pagination-btn" disabled={list.page >= list.pagination.total_pages} onClick={() => list.setPage(list.page + 1)}>
              Next
            </button>
          </div>
        </div>
      )}
    </>
  );
}
