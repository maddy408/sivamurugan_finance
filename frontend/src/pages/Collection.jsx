import { Link, useNavigate } from 'react-router-dom';
import { api, money, fmtDate } from '../api/client';
import { Spinner, ErrorState, EmptyState } from '../components/ui';
import { useList } from '../hooks/useList';
import { useAuth } from '../state/AuthContext';
import { useToast } from '../state/ToastContext';
import { FiCheckSquare, FiX, FiFileText, FiPhone, FiArrowRight, FiSearch } from 'react-icons/fi';

export default function Collection() {
  const nav = useNavigate();
  const toast = useToast();
  const list = useList('/api/collection/workload', { initialPerPage: 25 });

  const loans = list.extra?.loans || [];
  const totalAssignedChits = loans.length;
  const totalPendingDueSum = loans.reduce((sum, l) => sum + Number(l.summary?.pending_due_amount || 0), 0);
  const overdueChitsCount = loans.filter((l) => Number(l.summary?.overdue_count || 0) > 0).length;

  return (
    <>
      {/* Page Header (Matching Settings / Expenses / Pending Theme) */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 10,
            background: '#e0edfd', color: '#1d4ed8',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 20, fontWeight: 900, flexShrink: 0
          }}>
            <FiCheckSquare size={20} />
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em' }}>
              Collection Workload
            </h1>
            <p style={{ margin: '2px 0 0', fontSize: 12.5, color: '#64748b', fontWeight: 500 }}>
              Assigned chit collection schedule &amp; due follow-ups
            </p>
          </div>
        </div>
      </div>

      {/* 2 Executive Stat Cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 280px))',
        gap: 12,
        marginBottom: 14,
        maxWidth: 600
      }}>
        {/* ASSIGNED CHITS */}
        <div className="card" style={{
          position: 'relative', overflow: 'hidden', padding: '10px 16px',
          borderLeft: '4px solid #2563eb', background: '#ffffff',
          borderRadius: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.03)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 10.5, fontWeight: 800, color: '#1d4ed8', letterSpacing: '0.5px', textTransform: 'uppercase' }}>
                ASSIGNED CHITS
              </div>
              <div style={{ fontSize: 20, fontWeight: 900, color: '#0f172a', margin: '2px 0 1px' }}>
                {totalAssignedChits}
              </div>
              <div style={{ fontSize: 11, color: '#64748b' }}>
                Chits assigned for collection
              </div>
            </div>
            <div style={{
              width: 32, height: 32, borderRadius: '50%',
              background: '#e0edfd', color: '#1d4ed8',
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
              <FiCheckSquare size={16} />
            </div>
          </div>
          <div style={{ position: 'absolute', right: -6, bottom: -8, opacity: 0.05, pointerEvents: 'none' }}>
            <FiCheckSquare size={56} color="#1d4ed8" />
          </div>
        </div>

        {/* PENDING DUE */}
        <div className="card" style={{
          position: 'relative', overflow: 'hidden', padding: '10px 16px',
          borderLeft: '4px solid #f43f5e', background: '#ffffff',
          borderRadius: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.03)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 10.5, fontWeight: 800, color: '#e11d48', letterSpacing: '0.5px', textTransform: 'uppercase' }}>
                TOTAL PENDING DUE
              </div>
              <div style={{ fontSize: 20, fontWeight: 900, color: '#0f172a', margin: '2px 0 1px' }}>
                {money(totalPendingDueSum)}
              </div>
              <div style={{ fontSize: 11, color: '#64748b' }}>
                {overdueChitsCount} chit(s) with overdue dues
              </div>
            </div>
            <div style={{
              width: 32, height: 32, borderRadius: '50%',
              background: '#fee2e2', color: '#e11d48',
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
              <b style={{ fontSize: 15 }}>₹</b>
            </div>
          </div>
          <div style={{
            position: 'absolute', right: 4, bottom: -10, opacity: 0.06,
            fontSize: 56, fontWeight: 900, color: '#e11d48', pointerEvents: 'none'
          }}>
            ₹
          </div>
        </div>
      </div>

      {/* Toolbar with Single Icon Search */}
      <div className="toolbar" style={{ marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
        <div className="input-with-icon" style={{ flex: 1, minWidth: 220 }}>
          <div className="input-icon-pill"><FiSearch size={13} /></div>
          <input
            type="search"
            placeholder="Search customer, code, mobile, chit code… (Press Enter to open)"
            value={list.q}
            onChange={(e) => list.setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && loans.length > 0) {
                e.preventDefault();
                nav(`/collection/chit/${loans[0].id}`);
              }
            }}
          />
        </div>
        <select
          value={list.filters.status || ''}
          onChange={(e) => list.setFilter('status', e.target.value)}
          style={{ height: 36, borderRadius: 18, border: '1.5px solid #cbd5e1', fontSize: 12, padding: '0 12px', background: '#fff' }}
        >
          <option value="">All Statuses</option>
          <option value="active">Active</option>
          <option value="completed">Completed</option>
          <option value="closed">Closed</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <select
          value={list.filters.only_due || ''}
          onChange={(e) => list.setFilter('only_due', e.target.value)}
          style={{ height: 36, borderRadius: 18, border: '1.5px solid #cbd5e1', fontSize: 12, padding: '0 12px', background: '#fff' }}
        >
          <option value="">All chits</option>
          <option value="1">Only with pending dues</option>
        </select>
        <select
          value={list.filters.schedule_type || ''}
          onChange={(e) => list.setFilter('schedule_type', e.target.value)}
          style={{ height: 36, borderRadius: 18, border: '1.5px solid #cbd5e1', fontSize: 12, padding: '0 12px', background: '#fff' }}
        >
          <option value="">Any schedule</option>
          <option value="DAILY">Daily</option>
          <option value="WEEKLY">Weekly</option>
          <option value="MONTHLY_WEEKDAY">Monthly weekday</option>
          <option value="MONTHLY_DAILY">Monthly daily</option>
          <option value="MONTHLY_INTERVAL">Monthly interval</option>
        </select>
        {list.hasFilters && (
          <button className="btn secondary sm" onClick={list.clear} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            Clear filters <FiX size={12} />
          </button>
        )}
        <div style={{ flex: 1 }} />
        <button
          type="button"
          onClick={() => api.download('/api/reports/templates/collection').catch((e) => toast.error(e.message))}
          style={{
            height: 36, borderRadius: 18, border: '1.5px solid #cbd5e1',
            background: '#ffffff', color: '#0d2856', fontSize: 12, fontWeight: 700,
            padding: '0 14px', display: 'inline-flex', alignItems: 'center', gap: 6,
            cursor: 'pointer'
          }}
        >
          <FiFileText size={13} style={{ color: '#1d4ed8' }} /> Sample Template
        </button>
      </div>

      {list.loading && <Spinner />}
      {list.error && <ErrorState error={list.error} onRetry={list.reload} />}
      {!list.loading && !list.error && loans.length === 0 && (
        <EmptyState title="No collection workload" hint="Chits assigned to you will appear here." />
      )}

      {/* Compact collection workload table wrapped in card */}
      {!list.loading && !list.error && loans.length > 0 && (
        <div className="card" style={{ padding: 0, overflow: 'hidden', borderRadius: 14, boxShadow: '0 4px 16px rgba(0,0,0,0.04)' }}>
          <div className="table-wrap">
            <table className="grid">
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>Chit</th>
                  <th className="right">Installment</th>
                  <th>Next Due</th>
                  <th className="right">Fine</th>
                  <th className="right">Pending Due</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {loans.map((loan) => {
                  const nd = loan.next_due;
                  const pendingDue = Number(loan.summary?.pending_due_amount || 0);
                  const overdueCount = Number(loan.summary?.overdue_count || 0);
                  const isDue = pendingDue > 0;
                  const fine = nd ? Number((loan.installments || []).find((i) => i.id === nd.id)?.fine_accrued || 0) : 0;
                  const status = (loan.status || '').toLowerCase();
                  const isActive = status === 'active';
                  const statusBadge = status === 'closed' ? { cls: 'closed', label: 'CLOSED' }
                    : status === 'completed' ? { cls: 'COMPLETED', label: 'COMPLETED' }
                    : status === 'cancelled' ? { cls: 'cancelled', label: 'CANCELLED' }
                    : overdueCount > 0 ? { cls: 'OVERDUE', label: `${overdueCount} OVERDUE` }
                    : isDue ? { cls: 'pending', label: 'DUE' }
                    : { cls: 'active', label: 'ALL CLEAR' };
                  return (
                    <tr key={loan.id} style={{ cursor: 'pointer' }} onClick={() => nav(`/collection/chit/${loan.id}`)}>
                      <td data-label="Customer">
                        <div style={{ fontWeight: 700, color: '#0f172a' }}>{loan.customer_name}</div>
                        <div className="muted" style={{ fontSize: 11 }}>{loan.customer_code} · <FiPhone size={10} style={{ verticalAlign: -1 }} /> {loan.mobile || '—'}</div>
                      </td>
                      <td data-label="Chit"><span className="badge PENDING" style={{ textTransform: 'none' }}>{loan.code}</span></td>
                      <td className="right" data-label="Installment" style={{ fontWeight: 700 }}>{money(loan.installment_amount)}</td>
                      <td data-label="Next Due">
                        {nd ? <>{fmtDate(nd.due_date)} <span className="muted">(#{nd.installment_no}, {money(nd.balance_amount)})</span></> : '—'}
                      </td>
                      <td className="right" data-label="Fine">{fine > 0 ? money(fine) : '—'}</td>
                      <td className="right" data-label="Pending Due">
                        <b style={{ color: isDue ? '#e11d48' : '#10b981' }}>{isDue ? money(pendingDue) : '₹0.00'}</b>
                      </td>
                      <td data-label="Status">
                        <span className={`badge ${statusBadge.cls}`}>{statusBadge.label}</span>
                      </td>
                      <td className="right" data-label="">
                        <Link
                          className="btn-save-glow"
                          to={`/collection/chit/${loan.id}`}
                          onClick={(e) => e.stopPropagation()}
                          style={{ height: 26, padding: '2px 12px', fontSize: 11, textDecoration: 'none' }}
                        >
                          {isActive ? 'Collect' : 'View'}
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="pagination">
            <div className="pagination-info">
              <span className="pagination-total">{list.pagination.total} chit{list.pagination.total === 1 ? '' : 's'}</span>
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
        </div>
      )}

      <p className="muted" style={{ fontSize: 12, marginTop: 12 }}>
        <Link to="/loans" style={{ fontWeight: 600, color: '#1d4ed8' }}>Open full chit list <FiArrowRight size={12} style={{ verticalAlign: -2 }} /></Link>
      </p>
    </>
  );
}
