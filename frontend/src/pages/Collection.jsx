import { Link, useNavigate } from 'react-router-dom';
import { api, money, fmtDate } from '../api/client';
import { Spinner, ErrorState, EmptyState } from '../components/ui';
import { useList } from '../hooks/useList';
import { useAuth } from '../state/AuthContext';
import { useToast } from '../state/ToastContext';
import { FiX, FiFileText, FiPhone, FiArrowRight } from 'react-icons/fi';

export default function Collection() {
  const nav = useNavigate();
  const toast = useToast();
  const list = useList('/api/collection/workload', { initialPerPage: 25 });

  const loans = list.extra?.loans || [];

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Collection Workload</h1>
      </div>

      <div className="toolbar">
        <input type="search" placeholder="Search customer, code, mobile, chit code… (Press Enter to open)"
          value={list.q} onChange={(e) => list.setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && loans.length > 0) {
              e.preventDefault();
              nav(`/collection/chit/${loans[0].id}`);
            }
          }} />
        <select value={list.filters.status || ''} onChange={(e) => list.setFilter('status', e.target.value)}>
          <option value="">All Statuses</option>
          <option value="active">Active</option>
          <option value="completed">Completed</option>
          <option value="closed">Closed</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <select value={list.filters.only_due || ''} onChange={(e) => list.setFilter('only_due', e.target.value)}>
          <option value="">All chits</option>
          <option value="1">Only with outstanding</option>
        </select>
        <select value={list.filters.schedule_type || ''} onChange={(e) => list.setFilter('schedule_type', e.target.value)}>
          <option value="">Any schedule</option>
          <option value="DAILY">Daily</option>
          <option value="WEEKLY">Weekly</option>
          <option value="MONTHLY_WEEKDAY">Monthly weekday</option>
          <option value="MONTHLY_DAILY">Monthly daily</option>
          <option value="MONTHLY_INTERVAL">Monthly interval</option>
        </select>
        {list.hasFilters && <button className="btn secondary" onClick={list.clear} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>Clear filters <FiX size={12} /></button>}
        <div style={{ flex: 1 }} />
        <button className="btn secondary" onClick={() => api.download('/api/reports/templates/collection').catch((e) => toast.error(e.message))}>
          <FiFileText size={13} style={{ marginRight: 5, verticalAlign: -2 }} />Sample Template
        </button>
      </div>

      {list.loading && <Spinner />}
      {list.error && <ErrorState error={list.error} onRetry={list.reload} />}
      {!list.loading && !list.error && loans.length === 0 && (
        <EmptyState title="No collection workload" hint="Chits assigned to you will appear here." />
      )}

      {/* Compact collection workload table */}
      {!list.loading && !list.error && loans.length > 0 && (
        <div className="table-wrap">
          <table className="grid">
            <thead>
              <tr>
                <th>Customer</th>
                <th>Chit</th>
                <th className="right">Chit Amount</th>
                <th className="right">Installment</th>
                <th>Next Due</th>
                <th className="right">Fine</th>
                <th className="right">Outstanding</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {loans.map((loan) => {
                const nd = loan.next_due;
                const outstanding = Number(loan.summary?.outstanding_balance || 0);
                const isDue = outstanding > 0;
                const fine = nd ? Number((loan.installments || []).find((i) => i.id === nd.id)?.fine_accrued || 0) : 0;
                const status = (loan.status || '').toLowerCase();
                const isActive = status === 'active';
                const statusBadge = status === 'closed' ? { cls: 'closed', label: 'CLOSED' }
                  : status === 'completed' ? { cls: 'COMPLETED', label: 'COMPLETED' }
                  : status === 'cancelled' ? { cls: 'cancelled', label: 'CANCELLED' }
                  : isDue ? { cls: 'OVERDUE', label: 'DUE' }
                  : { cls: 'active', label: 'ACTIVE' };
                return (
                  <tr key={loan.id} style={{ cursor: 'pointer' }} onClick={() => nav(`/collection/chit/${loan.id}`)}>
                    <td data-label="Customer">
                      <div style={{ fontWeight: 700 }}>{loan.customer_name}</div>
                      <div className="muted" style={{ fontSize: 11 }}>{loan.customer_code} · <FiPhone size={10} style={{ verticalAlign: -1 }} /> {loan.mobile || '—'}</div>
                    </td>
                    <td data-label="Chit"><span className="badge PENDING" style={{ textTransform: 'none' }}>{loan.code}</span></td>
                    <td className="right" data-label="Chit Amount">{money(loan.principal_amount)}</td>
                    <td className="right" data-label="Installment" style={{ fontWeight: 700 }}>{money(loan.installment_amount)}</td>
                    <td data-label="Next Due">
                      {nd ? <>{fmtDate(nd.due_date)} <span className="muted">(#{nd.installment_no})</span></> : '—'}
                    </td>
                    <td className="right" data-label="Fine">{fine > 0 ? money(fine) : '—'}</td>
                    <td className="right" data-label="Outstanding">
                      <b style={{ color: isDue ? '#f43f5e' : '#10b981' }}>{money(outstanding)}</b>
                    </td>
                    <td data-label="Status">
                      <span className={`badge ${statusBadge.cls}`}>{statusBadge.label}</span>
                    </td>
                    <td className="right" data-label="">
                      <Link className="btn sm" to={`/collection/chit/${loan.id}`} onClick={(e) => e.stopPropagation()}>
                        {isActive ? 'Collect' : 'View'}
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {!list.loading && loans.length > 0 && (
        <div className="pagination" style={{ marginTop: 24 }}>
          <span>{list.pagination.total} chit{list.pagination.total === 1 ? '' : 's'}</span>
          <button className="btn sm secondary" disabled={list.page <= 1} onClick={() => list.setPage(list.page - 1)}>Prev</button>
          <span>Page {list.page} of {Math.max(1, list.pagination.total_pages)}</span>
          <button className="btn sm secondary" disabled={list.page >= list.pagination.total_pages} onClick={() => list.setPage(list.page + 1)}>Next</button>
        </div>
      )}

      <p className="muted" style={{ fontSize: 13, marginTop: 16 }}>
        <Link to="/loans" style={{ fontWeight: 600 }}>Open full chit list <FiArrowRight size={12} style={{ verticalAlign: -2 }} /></Link>
      </p>
    </>
  );
}
