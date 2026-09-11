import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, money, fmtDate } from '../api/client';
import { Spinner, ErrorState, EmptyState } from '../components/ui';
import { useList } from '../hooks/useList';
import { useAuth } from '../state/AuthContext';
import { useToast } from '../state/ToastContext';

export default function Pending({ hideTitle = false }) {
  const { can } = useAuth();
  const toast = useToast();
  const list = useList('/api/pending-dues', { initialPerPage: 25 });
  const [activeTab, setActiveTab] = useState('all');
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
          <h1 className="page-title">⏳ Pending Dues & Outstanding</h1>
        </div>
      )}

      {/* Single-Row Sub Navbar for Pending Dues */}
      <div className="pending-sub-nav">
        <button
          className={`pending-sub-nav-item ${activeTab === 'all' ? 'active' : ''}`}
          onClick={() => setActiveTab('all')}
        >
          📋 All Pending Dues ({rawCustomers.length})
        </button>
        <button
          className={`pending-sub-nav-item ${activeTab === 'overdue' ? 'active' : ''}`}
          onClick={() => setActiveTab('overdue')}
        >
          🚨 Overdue Only ({totalOverdueCustomers})
        </button>
        {!hideTitle && (
          <>
            <div style={{ flex: 1 }} />
            <Link className="pending-sub-nav-item" to="/reports" style={{ color: 'var(--blue-primary)' }}>
              📊 Detailed Dues Report ↗
            </Link>
          </>
        )}
      </div>

      <div className="stat-grid">
        <div className="stat emerald">
          <div className="label">Pending Customers</div>
          <div className="value">{s.pending_customers ?? '—'}</div>
          <div className="sub">Accounts with unpaid balances</div>
        </div>
        <div className="stat rose">
          <div className="label">Total Outstanding</div>
          <div className="value">{money(s.total_outstanding)}</div>
          <div className="sub">Combined pending installments</div>
        </div>
      </div>

      <div className="toolbar">
        <input type="search" placeholder="Search customer, code, phone, chit, address…"
          value={list.q} onChange={(e) => list.setQ(e.target.value)} />
        {list.hasFilters && <button className="btn secondary" onClick={list.clear}>Clear filters ✕</button>}
        <div style={{ flex: 1 }} />
        <button className="btn secondary" onClick={() => api.download('/api/pending-dues/export', { q: list.q, ...list.filters }).catch((e) => toast.error(e.message))}>Export Excel</button>
      </div>

      {list.loading && <Spinner />}
      {list.error && <ErrorState error={list.error} onRetry={list.reload} />}
      {!list.loading && !list.error && customers.length === 0 && (
        <EmptyState title={activeTab === 'overdue' ? "No overdue installments" : "No pending dues"} hint="Every scheduled installment has been fully paid." />
      )}

      {customers.map((c) => (
        <div className="card" key={c.customer_id} style={{ marginBottom: 14 }}>
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
              <div className="muted" style={{ fontSize: 11 }}>Total outstanding</div>
              <b style={{ fontSize: 16, color: 'var(--rose)' }}>{money(c.total_outstanding)}</b>
            </div>
          </div>
          <div className="table-wrap">
            <table className="grid">
              <thead>
                <tr>
                  <th>Chit Code</th><th className="right">Chit Amount</th><th className="right">Installment Amount</th>
                  <th className="right">Paid</th><th className="right">Outstanding</th>
                  <th className="right">Overdue</th><th>Next Due</th><th></th>
                </tr>
              </thead>
              <tbody>
                {c.chits.map((ch) => (
                  <tr key={ch.chit_id}>
                    <td><Link to={`/loans/${ch.chit_id}`}>{ch.chit_code}</Link></td>
                    <td className="right">{money(ch.principal_amount)}</td>
                    <td className="right">{money(ch.installment_amount)}</td>
                    <td className="right">{money(ch.paid_total)}</td>
                    <td className="right"><b>{money(ch.outstanding)}</b></td>
                    <td className="right">{ch.overdue_count > 0
                      ? <span className="badge OVERDUE">{ch.overdue_count}</span> : '—'}</td>
                    <td className="nowrap">
                      {ch.next_due
                        ? <>{fmtDate(ch.next_due.due_date)} <span className="muted">(#{ch.next_due.installment_no}, {money(ch.next_due.balance_amount)})</span></>
                        : '—'}
                    </td>
                    <td className="right nowrap">
                      {can('collection.create') && (
                        <Link className="btn sm" to={`/collection/chit/${ch.chit_id}`}>⚡ Collect</Link>
                      )}{' '}
                      <Link className="btn sm secondary" to={`/collection/chit/${ch.chit_id}`}>Open</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}

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

