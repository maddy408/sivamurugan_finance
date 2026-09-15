import { api, money, fmtDate } from '../api/client';
import DataTable from '../components/DataTable';
import { useList } from '../hooks/useList';
import { useAuth } from '../state/AuthContext';
import { useToast } from '../state/ToastContext';

const TYPE_LABEL = { collection: 'Collection', distribution: 'Distribution', expense: 'Expense', income: 'Income' };

export default function Transactions() {
  const { can } = useAuth();
  const toast = useToast();
  const list = useList('/api/transactions', { initialPerPage: 25, initialSort: 'txn_date', initialDir: 'desc' });
  const s = list.extra?.summary || list.pagination?.summary || {};

  const columns = [
    { key: 'txn_date', header: 'Date', sortable: true, render: (r) => fmtDate(r.txn_date) },
    { key: 'transaction_no', header: 'Txn No' },
    { key: 'txn_type', header: 'Type', sortable: true, render: (r) => TYPE_LABEL[r.txn_type] || r.txn_type },
    {
      key: 'amount', header: 'Amount', align: 'right', sortable: true,
      render: (r) => <span className={r.direction === 'credit' ? 'amount-credit' : 'amount-debit'}>
        {r.direction === 'credit' ? '+' : '-'}{money(r.amount)}
      </span>,
    },
    { key: 'account_name', header: 'Account', render: (r) => r.account_name ? `${r.account_name} (${r.account_type})` : '—' },
    { key: 'customer_name', header: 'Customer', render: (r) => r.customer_name || '—' },
    { key: 'chit_code', header: 'Chit', render: (r) => r.chit_code || '—' },
    { key: 'remarks', header: 'Remarks', render: (r) => r.remarks || '—' },
    { key: 'status', header: 'Status', render: (r) => <span className={`badge ${r.status === 'posted' ? 'active' : 'cancelled'}`}>{r.status}</span> },
    { key: 'created_by_name', header: 'By', render: (r) => r.created_by_name || '—' },
  ];

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Transactions</h1>
      </div>

      <div className="stat-grid">
        <div className="stat emerald"><div className="label">Total credit (filtered)</div><div className="value">{money(s.total_credit)}</div></div>
        <div className="stat rose"><div className="label">Total debit (filtered)</div><div className="value">{money(s.total_debit)}</div></div>
        <div className="stat sky"><div className="label">Net (filtered)</div><div className="value">{money((Number(s.total_credit) || 0) - (Number(s.total_debit) || 0))}</div></div>
      </div>

      <div className="toolbar">
        <input type="search" placeholder="Search txn no, remarks, customer, chit…" value={list.q} onChange={(e) => list.setQ(e.target.value)} />
        <select value={list.filters.txn_type || ''} onChange={(e) => list.setFilter('txn_type', e.target.value)}>
          <option value="">Any type</option>
          {Object.entries(TYPE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <select value={list.filters.direction || ''} onChange={(e) => list.setFilter('direction', e.target.value)}>
          <option value="">Any direction</option><option value="credit">Credit</option><option value="debit">Debit</option>
        </select>
        <select value={list.filters.status || ''} onChange={(e) => list.setFilter('status', e.target.value)}>
          <option value="">Any status</option><option value="posted">Posted</option><option value="cancelled">Cancelled</option>
        </select>
        <input type="date" value={list.filters.date_from || ''} onChange={(e) => list.setFilter('date_from', e.target.value)} />
        <input type="date" value={list.filters.date_to || ''} onChange={(e) => list.setFilter('date_to', e.target.value)} />
        {list.hasFilters && <button className="btn secondary" onClick={list.clear}>Clear filters ✕</button>}
        <div style={{ flex: 1 }} />
        {can('transactions.export') && (
          <button className="btn secondary" onClick={() => api.download('/api/transactions/export', { q: list.q, ...list.filters }).catch((e) => toast.error(e.message))}>
            Export Excel
          </button>
        )}
      </div>

      <DataTable
        columns={columns} rows={list.rows} loading={list.loading} error={list.error} onRetry={list.reload}
        page={list.page} perPage={list.perPage} total={list.pagination.total} totalPages={list.pagination.total_pages}
        sortBy={list.sortBy} sortDir={list.sortDir} onSort={list.onSort} onPage={list.setPage} onPerPage={list.setPerPage}
        emptyTitle="No transactions match your filters"
      />
    </>
  );
}
