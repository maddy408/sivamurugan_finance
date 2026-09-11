import { useEffect, useState } from 'react';
import { api, money, fmtDate } from '../api/client';
import DataTable from '../components/DataTable';
import { Field, Modal, Confirm, IconEdit, IconDelete } from '../components/ui';
import { useList } from '../hooks/useList';
import { useAuth } from '../state/AuthContext';
import { useToast } from '../state/ToastContext';

const blank = { amount: '', expense_date: new Date().toISOString().slice(0, 10), category: '', account_id: '', remarks: '' };

// Canonical category list shown in the dropdown, merged with any historical
// categories the API reports (so an older/custom category is never hidden
// from its own record's edit form).
const DEFAULT_EXPENSE_CATEGORIES = [
  'Office Rent', 'Staff Salaries', 'Electricity / Utilities', 'Tea, Snacks & Catering',
  'Travel & Fuel Expenses', 'Office Maintenance', 'Stationery & Printings', 'Miscellaneous',
];

export default function Expenses({ embedded }) {
  const { can, meta } = useAuth();
  const toast = useToast();
  const list = useList('/api/expenses', { initialPerPage: 25, initialSort: 'expense_date', initialDir: 'desc' });
  const [cats, setCats] = useState([]);
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(blank);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);
  const [bulkConfirm, setBulkConfirm] = useState(false);

  useEffect(() => { api.get('/api/expenses/categories').then((r) => setCats(r.data)).catch(() => {}); }, []);
  const s = list.extra?.summary || list.pagination?.summary || {};
  const categoryOptions = [...new Set([...DEFAULT_EXPENSE_CATEGORIES, ...cats])];

  const save = async () => {
    setBusy(true); setErrors({});
    try {
      const payload = { ...form, amount: Number(form.amount), account_id: form.account_id ? Number(form.account_id) : undefined };
      Object.keys(payload).forEach((k) => payload[k] === '' && delete payload[k]);
      if (modal.mode === 'create') { await api.post('/api/expenses', payload); toast.success('Expense recorded'); }
      else { await api.put(`/api/expenses/${modal.row.id}`, payload); toast.success('Expense updated'); }
      setModal(null); list.reload();
    } catch (e) {
      if (e.errors) setErrors(Object.fromEntries(Object.entries(e.errors).map(([k, v]) => [k, v[0]])));
      else toast.error(e.message);
    } finally { setBusy(false); }
  };

  const act = async () => {
    setBusy(true);
    try {
      if (confirm.type === 'cancel') await api.post(`/api/expenses/${confirm.row.id}/cancel`, { reason: confirm.reason || 'cancelled' });
      else await api.del(`/api/expenses/${confirm.row.id}`, { reason: confirm.reason || 'deleted' });
      toast.success('Done'); setConfirm(null); list.reload();
    } catch (e) { toast.error(e.message); } finally { setBusy(false); }
  };

  const handleBulkDelete = async () => {
    setBusy(true);
    try {
      await Promise.all(selectedIds.map((id) => api.del(`/api/expenses/${id}`, { reason: 'bulk delete' })));
      toast.success(`Successfully deleted ${selectedIds.length} expense(s)`);
      setSelectedIds([]);
      setBulkConfirm(false);
      list.reload();
    } catch (e) {
      toast.error(e.message || 'Error deleting selected expenses');
    } finally {
      setBusy(false);
    }
  };

  const columns = [
    { key: 'expense_date', header: 'Date', sortable: true, render: (r) => fmtDate(r.expense_date) },
    { key: 'category', header: 'Category', sortable: true },
    { key: 'account_name', header: 'Source', render: (r) => r.account_name ? `${r.account_name} (${r.account_type})` : '—' },
    { key: 'amount', header: 'Amount', align: 'right', sortable: true, render: (r) => money(r.amount) },
    { key: 'remarks', header: 'Remarks', render: (r) => r.remarks || '—' },
    { key: 'status', header: 'Status', render: (r) => <span className={`badge ${r.status === 'active' ? 'active' : 'cancelled'}`}>{r.status}</span> },
    {
      key: '_a', header: 'Action', align: 'right', render: (r) => r.status === 'active' && (
        <div className="action-buttons">
          {can('expenses.edit') && (
            <button className="btn-icon edit" onClick={() => { setForm({ ...blank, ...r, account_id: r.account_id || '' }); setModal({ mode: 'edit', row: r }); }} title="Edit Expense">
              <IconEdit />
            </button>
          )}
          {can('expenses.delete') && (
            <button className="btn-icon delete" onClick={() => setConfirm({ type: 'delete', row: r, reason: '' })} title="Delete Expense">
              <IconDelete />
            </button>
          )}
        </div>
      ),
    },
  ];

  return (
    <>
      {!embedded && <h1 style={{ marginTop: 0, fontSize: 20 }}>Expenses</h1>}
      <div className="stat-grid">
        <div className="stat rose"><div className="label">Total (filtered)</div><div className="value">{money(s.total_expenses)}</div></div>
        <div className="stat emerald"><div className="label">From office cash</div><div className="value">{money(s.cash_expenses)}</div></div>
        <div className="stat sky"><div className="label">From bank</div><div className="value">{money(s.bank_expenses)}</div></div>
      </div>

      <div className="toolbar">
        <input type="search" placeholder="Search category, remarks…" value={list.q} onChange={(e) => list.setQ(e.target.value)} />
        <select value={list.filters.category || ''} onChange={(e) => list.setFilter('category', e.target.value)}>
          <option value="">Any category</option>
          {categoryOptions.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={list.filters.account_id || ''} onChange={(e) => list.setFilter('account_id', e.target.value)}>
          <option value="">Any source</option>
          {(meta?.accounts || []).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <select value={list.filters.status || ''} onChange={(e) => list.setFilter('status', e.target.value)}>
          <option value="">Any status</option><option value="active">Active</option><option value="cancelled">Cancelled</option>
        </select>
        <input type="date" value={list.filters.date_from || ''} onChange={(e) => list.setFilter('date_from', e.target.value)} />
        <input type="date" value={list.filters.date_to || ''} onChange={(e) => list.setFilter('date_to', e.target.value)} />
        {list.hasFilters && <button className="btn secondary" onClick={list.clear}>Clear filters ✕</button>}
        <div style={{ flex: 1 }} />
        {can('expenses.export') && <button className="btn secondary" onClick={() => api.download('/api/expenses/export', { q: list.q, ...list.filters }).catch((e) => toast.error(e.message))}>Export Excel</button>}
        {can('expenses.create') && <button className="btn" onClick={() => { setForm(blank); setErrors({}); setModal({ mode: 'create' }); }}>+ New expense</button>}
      </div>

      <DataTable
        columns={columns} rows={list.rows} loading={list.loading} error={list.error} onRetry={list.reload}
        page={list.page} perPage={list.perPage} total={list.pagination.total} totalPages={list.pagination.total_pages}
        sortBy={list.sortBy} sortDir={list.sortDir} onSort={list.onSort} onPage={list.setPage} onPerPage={list.setPerPage}
        emptyTitle="No expenses match your filters"
        selectedIds={selectedIds}
        onSelectChange={setSelectedIds}
        selectable={can('expenses.delete')}
        bulkActions={
          can('expenses.delete') && (
            <button className="btn sm danger" onClick={() => setBulkConfirm(true)}>
              <IconDelete /> Bulk Delete ({selectedIds.length})
            </button>
          )
        }
      />

      {modal && (
        <Modal title={modal.mode === 'create' ? 'New expense' : 'Edit expense'} onClose={() => setModal(null)}
          footer={<>
            <button className="btn secondary" onClick={() => setModal(null)} disabled={busy}>Cancel</button>
            <button className="btn" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
          </>}>
          <div className="form-grid">
            <Field label="Amount *" error={errors.amount}><input type="number" min="0.01" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></Field>
            <Field label="Date *" error={errors.expense_date}><input type="date" value={form.expense_date} onChange={(e) => setForm({ ...form, expense_date: e.target.value })} /></Field>
            <Field label="Category *" error={errors.category}>
              <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} required>
                <option value="">Select a category…</option>
                {categoryOptions.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </Field>
            <Field label="Payment source" error={errors.account_id}>
              <select value={form.account_id} onChange={(e) => setForm({ ...form, account_id: e.target.value })}>
                <option value="">—</option>
                {(meta?.accounts || []).map((a) => <option key={a.id} value={a.id}>{a.name} ({a.type})</option>)}
              </select>
            </Field>
          </div>
          <Field label="Remarks" error={errors.remarks}><textarea rows={2} value={form.remarks} onChange={(e) => setForm({ ...form, remarks: e.target.value })} /></Field>
        </Modal>
      )}
      {confirm && (
        <Confirm title={confirm.type === 'delete' ? 'Delete expense?' : 'Cancel expense?'} danger={confirm.type === 'delete'} busy={busy}
          message={<input style={{ width: '100%', padding: 8 }} placeholder="Reason" value={confirm.reason} onChange={(e) => setConfirm({ ...confirm, reason: e.target.value })} />}
          confirmLabel={confirm.type === 'delete' ? 'Delete' : 'Cancel expense'} onConfirm={act} onClose={() => setConfirm(null)} />
      )}
      {bulkConfirm && (
        <Confirm title={`Delete ${selectedIds.length} selected expenses?`} danger busy={busy}
          message="Selected expenses will be permanently deleted."
          confirmLabel={`Delete (${selectedIds.length})`} onConfirm={handleBulkDelete} onClose={() => setBulkConfirm(false)} />
      )}
    </>
  );
}
