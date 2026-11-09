import { api, money, fmtDate } from '../api/client';
import DataTable from '../components/DataTable';
import { useList } from '../hooks/useList';
import { useAuth } from '../state/AuthContext';
import { useToast } from '../state/ToastContext';
import { useI18n } from '../state/I18nContext';
import { FiX } from 'react-icons/fi';

const TYPE_LABEL = { collection: 'Collection', distribution: 'Distribution', expense: 'Expense', income: 'Income' };

export default function Transactions() {
  const { can } = useAuth();
  const { t, lang } = useI18n();
  const toast = useToast();
  const list = useList('/api/transactions', { initialPerPage: 25, initialSort: 'txn_date', initialDir: 'desc' });
  const s = list.extra?.summary || list.pagination?.summary || {};

  const columns = [
    { key: 'txn_date', header: t('Date', 'Date'), sortable: true, render: (r) => fmtDate(r.txn_date) },
    { key: 'transaction_no', header: t('Txn No', 'Txn No') },
    { key: 'txn_type', header: t('Type', 'Type'), sortable: true, render: (r) => t(TYPE_LABEL[r.txn_type] || r.txn_type, TYPE_LABEL[r.txn_type] || r.txn_type) },
    {
      key: 'amount', header: t('Amount', 'Amount'), align: 'right', sortable: true,
      render: (r) => <span className={r.direction === 'credit' ? 'amount-credit' : 'amount-debit'}>
        {r.direction === 'credit' ? '+' : '-'}{money(r.amount)}
      </span>,
    },
    { key: 'account_name', header: t('Account', 'Account'), render: (r) => r.account_name ? `${r.account_name} (${t(r.account_type, r.account_type)})` : '—' },
    { key: 'customer_name', header: t('Customer', 'Customer'), render: (r) => r.customer_name || '—' },
    { key: 'chit_code', header: t('Chit', 'Chit'), render: (r) => r.chit_code || '—' },
    { key: 'remarks', header: t('Remarks', 'Remarks'), render: (r) => r.remarks || '—' },
    { key: 'status', header: t('Status', 'Status'), render: (r) => <span className={`badge ${r.status === 'posted' ? 'active' : 'cancelled'}`}>{r.status === 'posted' ? t('Completed', 'Completed') : t(r.status, r.status)}</span> },
    { key: 'created_by_name', header: t('By', 'By'), render: (r) => r.created_by_name || '—' },
  ];

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">{t('Transactions', 'Transactions')}</h1>
      </div>

      <div className="stat-grid">
        <div className="stat emerald"><div className="label">{t('Total credit (filtered)', 'Total credit (filtered)')}</div><div className="value">{money(s.total_credit)}</div></div>
        <div className="stat rose"><div className="label">{t('Total debit (filtered)', 'Total debit (filtered)')}</div><div className="value">{money(s.total_debit)}</div></div>
        <div className="stat sky"><div className="label">{t('Net (filtered)', 'Net (filtered)')}</div><div className="value">{money((Number(s.total_credit) || 0) - (Number(s.total_debit) || 0))}</div></div>
      </div>

      <div className="toolbar">
        <input type="search" placeholder={t('Search txn no, remarks, customer, chit…', 'Search txn no, remarks, customer, chit…')} value={list.q} onChange={(e) => list.setQ(e.target.value)} />
        <select value={list.filters.txn_type || ''} onChange={(e) => list.setFilter('txn_type', e.target.value)}>
          <option value="">{t('Any type', 'Any type')}</option>
          {Object.entries(TYPE_LABEL).map(([v, l]) => <option key={v} value={v}>{t(l, l)}</option>)}
        </select>
        <select value={list.filters.direction || ''} onChange={(e) => list.setFilter('direction', e.target.value)}>
          <option value="">{t('Any direction', 'Any direction')}</option>
          <option value="credit">{t('Credit', 'Credit')}</option>
          <option value="debit">{t('Debit', 'Debit')}</option>
        </select>
        <select value={list.filters.status || ''} onChange={(e) => list.setFilter('status', e.target.value)}>
          <option value="">{t('Any status', 'Any status')}</option>
          <option value="posted">{t('Completed', 'Completed')}</option>
          <option value="cancelled">{t('Cancelled', 'Cancelled')}</option>
        </select>
        <input type="date" value={list.filters.date_from || ''} onChange={(e) => list.setFilter('date_from', e.target.value)} />
        <input type="date" value={list.filters.date_to || ''} onChange={(e) => list.setFilter('date_to', e.target.value)} />
        {list.hasFilters && <button className="btn secondary" onClick={list.clear} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>{t('Clear filters', 'Clear filters')} <FiX size={12} /></button>}
        <div style={{ flex: 1 }} />
        {can('transactions.export') && (
          <button className="btn secondary" onClick={() => api.download('/api/transactions/export', { q: list.q, ...list.filters }).catch((e) => toast.error(e.message))}>
            {t('Export Excel', 'Export Excel')}
          </button>
        )}
      </div>

      <DataTable
        columns={columns} rows={list.rows} loading={list.loading} error={list.error} onRetry={list.reload}
        page={list.page} perPage={list.perPage} total={list.pagination.total} totalPages={list.pagination.total_pages}
        sortBy={list.sortBy} sortDir={list.sortDir} onSort={list.onSort} onPage={list.setPage} onPerPage={list.setPerPage}
        emptyTitle={t("No transactions match your filters", "No transactions match your filters")}
      />
    </>
  );
}