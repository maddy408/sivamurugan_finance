import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, money, fmtDate } from '../api/client';
import { Spinner, ErrorState, EmptyState } from '../components/ui';
import { useList } from '../hooks/useList';
import { useAuth } from '../state/AuthContext';
import { useToast } from '../state/ToastContext';
import { FiBarChart2, FiExternalLink, FiX } from 'react-icons/fi';

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
      {!hideTitle && (
        <div className="page-header">
          <h1 className="page-title">Pending Dues &amp; Arrears</h1>
        </div>
      )}

      {/* Single-Row Sub Navbar for Pending Dues */}
      <div className="pending-sub-nav">
        <button
          className={`pending-sub-nav-item ${activeTab === 'all' ? 'active' : ''}`}
          onClick={() => setActiveTab('all')}
        >
           All Pending Dues ({rawCustomers.length})
        </button>
        <button
          className={`pending-sub-nav-item ${activeTab === 'overdue' ? 'active' : ''}`}
          onClick={() => setActiveTab('overdue')}
        >
           Overdue Only ({totalOverdueCustomers})
        </button>
        {!hideTitle && (
          <>
            <div style={{ flex: 1 }} />
            <Link className="pending-sub-nav-item" to="/reports" style={{ color: 'var(--blue-primary)' }}>
              <FiBarChart2 size={13} /> Detailed Dues Report <FiExternalLink size={11} />
            </Link>
          </>
        )}
      </div>

      <div className="stat-grid">
        <div className="stat emerald">
          <div className="label">Pending Customers</div>
          <div className="value">{s.pending_customers ?? '—'}</div>
          <div className="sub">Accounts with unpaid dues</div>
        </div>
        <div className="stat rose">
          <div className="label">Total Pending Dues</div>
          <div className="value">{money(s.total_pending_dues || s.total_outstanding)}</div>
          <div className="sub">Actual dues payable up to today</div>
        </div>
      </div>

      <div className="toolbar">
        <input type="search" placeholder="Search customer, code, phone, chit, address…"
          value={list.q} onChange={(e) => list.setQ(e.target.value)} />
        {list.hasFilters && <button className="btn secondary" onClick={list.clear} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>Clear filters <FiX size={12} /></button>}
        <div style={{ flex: 1 }} />
        <button className="btn secondary" onClick={() => api.download('/api/pending-dues/export', { q: list.q, ...list.filters }).catch((e) => toast.error(e.message))}>Export Excel</button>
      </div>

      <div className="date-range-filter">
        <label className="mini">From Date
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        </label>
        <label className="mini">To Date
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        </label>
        <button className="btn sm" onClick={applyDateFilter}>Apply Filter</button>
        {(list.filters.date_from || list.filters.date_to) && (
          <button className="btn sm secondary" onClick={clearDateFilter}>Clear</button>
        )}
        {dateError && <span className="err">{dateError}</span>}
      </div>

      {list.loading && <Spinner />}
      {list.error && <ErrorState error={list.error} onRetry={list.reload} />}
      {!list.loading && !list.error && customers.length === 0 && (
        <EmptyState title={activeTab === 'overdue' ? "No overdue installments" : "No pending dues"} hint="Every scheduled installment up to today has been fully paid." />
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
          <div className="card" key={c.customer_id} style={{ marginBottom: 16 }}>
            <div className="card-head">
              <div>
                <h2 style={{ marginBottom: 2 }}>
                  <Link to={`/customers/${c.customer_id}`}>{c.customer_name}</Link>{' '}
                  <span className="muted">· {c.customer_code} · {c.mobile || '—'}</span>
                </h2>
                <div className="muted" style={{ fontSize: 12 }}>
                  {c.location || '—'}{c.address ? ` · ${c.address}` : ''}
                </div>
              </div>
              <div className="right">
                <div className="muted" style={{ fontSize: 11 }}>Customer Pending Due</div>
                <b style={{ fontSize: 17, color: 'var(--rose)' }}>{money(totalCustomerPending)}</b>
                <div style={{ fontSize: 11, color: overdueCount > 0 ? '#e11d48' : '#64748b', marginTop: 2, fontWeight: 600 }}>
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
                        <Link to={`/loans/${d.chit_id}`} style={{ fontWeight: 700 }}>
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
                        <b style={{ fontSize: 14, color: '#e11d48' }}>{money(d.balance_amount)}</b>
                      </td>
                      <td className="center">
                        <span className={`badge ${d.status}`}>
                          {d.status}
                        </span>
                      </td>
                      <td className="right nowrap">
                        {can('collection.create') ? (
                          <Link className="btn sm" to={`/collection/chit/${d.chit_id}`}>
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
                    <td className="right" style={{ fontSize: 15, color: '#e11d48' }}>
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
        <div className="pagination">
          <span>{list.pagination.total} customer{list.pagination.total === 1 ? '' : 's'}</span>
          <button className="btn sm secondary" disabled={list.page <= 1} onClick={() => list.setPage(list.page - 1)}>Prev</button>
          <span>Page {list.page} of {Math.max(1, list.pagination.total_pages)}</span>
          <button className="btn sm secondary" disabled={list.page >= list.pagination.total_pages} onClick={() => list.setPage(list.page + 1)}>Next</button>
        </div>
      )}
    </>
  );
}
