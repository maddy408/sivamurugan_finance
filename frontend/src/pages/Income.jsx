import { useEffect, useState } from 'react';
import { api, money, fmtDate } from '../api/client';
import DataTable from '../components/DataTable';
import { Field, Modal, Confirm, IconEdit, IconDelete } from '../components/ui';
import { useList } from '../hooks/useList';
import { useAuth } from '../state/AuthContext';
import { useToast } from '../state/ToastContext';

const blank = { amount: '', received_date: new Date().toISOString().slice(0, 10), category: '', account_id: '', giver_details: '', remarks: '' };

const DEFAULT_INCOME_CATEGORIES = ['Moi', 'Gift', 'Donation', 'Investment', 'Interest', 'Miscellaneous'];

export default function Income({ embedded }) {
  const { can, meta } = useAuth();
  const toast = useToast();
  const list = useList('/api/income', { initialPerPage: 25, initialSort: 'received_date', initialDir: 'desc' });
  const [cats, setCats] = useState([]);
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(blank);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);
  const [bulkConfirm, setBulkConfirm] = useState(false);

  useEffect(() => { api.get('/api/income/categories').then((r) => setCats(r.data)).catch(() => {}); }, []);
  const s = list.pagination?.summary || {};
  const categoryOptions = [...new Set([...DEFAULT_INCOME_CATEGORIES, ...cats])];

  const save = async () => {
    setBusy(true); setErrors({});
    try {
      const payload = { ...form, amount: Number(form.amount), account_id: form.account_id ? Number(form.account_id) : undefined };
      Object.keys(payload).forEach((k) => payload[k] === '' && delete payload[k]);
      if (modal.mode === 'create') { await api.post('/api/income', payload); toast.success('Income recorded'); }
      else { await api.put(`/api/income/${modal.row.id}`, payload); toast.success('Income updated'); }
      setModal(null); list.reload();
    } catch (e) {
      if (e.errors) setErrors(Object.fromEntries(Object.entries(e.errors).map(([k, v]) => [k, v[0]])));
      else toast.error(e.message);
    } finally { setBusy(false); }
  };

  const act = async () => {
    setBusy(true);
    try {
      if (confirm.type === 'cancel') await api.post(`/api/income/${confirm.row.id}/cancel`, { reason: confirm.reason || 'cancelled' });
      else await api.del(`/api/income/${confirm.row.id}`, { reason: confirm.reason || 'deleted' });
      toast.success('Done'); setConfirm(null); list.reload();
    } catch (e) { toast.error(e.message); } finally { setBusy(false); }
  };

  const handleBulkDelete = async () => {
    setBusy(true);
    try {
      await Promise.all(selectedIds.map((id) => api.del(`/api/income/${id}`, { reason: 'bulk delete' })));
      toast.success(`Successfully deleted ${selectedIds.length} income entry(ies)`);
      setSelectedIds([]);
      setBulkConfirm(false);
      list.reload();
    } catch (e) {
      toast.error(e.message || 'Error deleting selected income entries');
    } finally {
      setBusy(false);
    }
  };

  const columns = [
    { key: 'received_date', header: 'Date', sortable: true, render: (r) => fmtDate(r.received_date) },
    { key: 'category', header: 'Category', sortable: true },
    { key: 'account_name', header: 'Destination', render: (r) => r.account_name ? `${r.account_name} (${r.account_type})` : '—' },
    { key: 'giver_details', header: 'From', render: (r) => r.giver_details || '—' },
    { key: 'amount', header: 'Amount', align: 'right', sortable: true, render: (r) => money(r.amount) },
    { key: 'status', header: 'Status', render: (r) => <span className={`badge ${r.status === 'active' ? 'active' : 'cancelled'}`}>{r.status}</span> },
    {
      key: '_a', header: 'Action', align: 'right', render: (r) => r.status === 'active' && (
        <div className="action-buttons">
          {can('income.edit') && (
            <button className="btn-icon edit" onClick={() => { setForm({ ...blank, ...r, account_id: r.account_id || '' }); setModal({ mode: 'edit', row: r }); }} title="Edit Income">
              <IconEdit />
            </button>
          )}
          {can('income.delete') && (
            <button className="btn-icon delete" onClick={() => setConfirm({ type: 'delete', row: r, reason: '' })} title="Delete Income">
              <IconDelete />
            </button>
          )}
        </div>
      ),
    },
  ];

  return (
    <>
      {!embedded && (
        <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h1 className="page-title" style={{ margin: 0, fontSize: 20 }}>Office Income</h1>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {can('income.export') && (
              <button className="btn secondary" onClick={() => api.download('/api/reports/templates/income').catch((e) => toast.error(e.message))}>
                📄 Sample Template
              </button>
            )}
            {can('income.create') && (
              <button className="btn" onClick={() => { setForm(blank); setErrors({}); setModal({ mode: 'create' }); }}>
                + New income
              </button>
            )}
          </div>
        </div>
      )}
      <div className="stat-grid">
        <div className="stat indigo"><div className="label">Total (filtered)</div><div className="value">{money(s.total_income)}</div></div>
        <div className="stat emerald"><div className="label">To office cash</div><div className="value">{money(s.cash_income)}</div></div>
        <div className="stat sky"><div className="label">To bank</div><div className="value">{money(s.bank_income)}</div></div>
      </div>

      <div className="toolbar">
        <input type="search" placeholder="Search category, giver, remarks…" value={list.q} onChange={(e) => list.setQ(e.target.value)} />
        <select value={list.filters.category || ''} onChange={(e) => list.setFilter('category', e.target.value)}>
          <option value="">Any category</option>
          {categoryOptions.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={list.filters.account_id || ''} onChange={(e) => list.setFilter('account_id', e.target.value)}>
          <option value="">Any destination</option>
          {(meta?.accounts || []).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <input type="date" value={list.filters.date_from || ''} onChange={(e) => list.setFilter('date_from', e.target.value)} />
        <input type="date" value={list.filters.date_to || ''} onChange={(e) => list.setFilter('date_to', e.target.value)} />
        {list.hasFilters && <button className="btn secondary" onClick={list.clear}>Clear filters ✕</button>}
        <div style={{ flex: 1 }} />
        {can('income.export') && <button className="btn secondary" onClick={() => api.download('/api/income/export', { q: list.q, ...list.filters }).catch((e) => toast.error(e.message))}>Export Excel</button>}
        {can('income.create') && <button className="btn" onClick={() => { setForm(blank); setErrors({}); setModal({ mode: 'create' }); }}>+ New income</button>}
      </div>

      <DataTable
        columns={columns} rows={list.rows} loading={list.loading} error={list.error} onRetry={list.reload}
        page={list.page} perPage={list.perPage} total={list.pagination.total} totalPages={list.pagination.total_pages}
        sortBy={list.sortBy} sortDir={list.sortDir} onSort={list.onSort} onPage={list.setPage} onPerPage={list.setPerPage}
        emptyTitle="No income entries match your filters"
        selectedIds={selectedIds}
        onSelectChange={setSelectedIds}
        selectable={can('income.delete')}
        bulkActions={
          can('income.delete') && (
            <button className="btn sm danger" onClick={() => setBulkConfirm(true)}>
              <IconDelete /> Bulk Delete ({selectedIds.length})
            </button>
          )
        }
      />

      {modal && (
        <Modal title={modal.mode === 'create' ? 'New income' : 'Edit income'} onClose={() => setModal(null)}
          footer={<>
            <button className="btn secondary" onClick={() => setModal(null)} disabled={busy}>Cancel</button>
            <button className="btn" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
          </>}>
          <div className="form-grid">
            <Field label="Amount *" error={errors.amount}><input type="number" min="0.01" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></Field>
            <Field label="Received date *" error={errors.received_date}><input type="date" value={form.received_date} onChange={(e) => setForm({ ...form, received_date: e.target.value })} /></Field>
            <Field label="Category *" error={errors.category}>
              <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} required>
                <option value="">Select a category…</option>
                {categoryOptions.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </Field>
            <Field label="Destination account" error={errors.account_id}>
              <select value={form.account_id} onChange={(e) => setForm({ ...form, account_id: e.target.value })}>
                <option value="">—</option>
                {(meta?.accounts || []).map((a) => <option key={a.id} value={a.id}>{a.name} ({a.type})</option>)}
              </select>
            </Field>
            <Field label="Giver / details" error={errors.giver_details}><input value={form.giver_details} onChange={(e) => setForm({ ...form, giver_details: e.target.value })} /></Field>
          </div>
          <Field label="Remarks" error={errors.remarks}><textarea rows={2} value={form.remarks} onChange={(e) => setForm({ ...form, remarks: e.target.value })} /></Field>
        </Modal>
      )}
      {confirm && (
        <Confirm title={confirm.type === 'delete' ? 'Delete income entry?' : 'Cancel income entry?'} danger={confirm.type === 'delete'} busy={busy}
          message={<input style={{ width: '100%', padding: 8 }} placeholder="Reason" value={confirm.reason} onChange={(e) => setConfirm({ ...confirm, reason: e.target.value })} />}
          confirmLabel={confirm.type === 'delete' ? 'Delete' : 'Cancel entry'} onConfirm={act} onClose={() => setConfirm(null)} />
      )}
      {bulkConfirm && (
        <Confirm title={`Delete ${selectedIds.length} selected income entries?`} danger busy={busy}
          message="Selected income entries will be permanently deleted."
          confirmLabel={`Delete (${selectedIds.length})`} onConfirm={handleBulkDelete} onClose={() => setBulkConfirm(false)} />
      )}
    </>
  );
}
