import { useEffect, useState } from 'react';
import { api, money, fmtDate } from '../api/client';
import DataTable from '../components/DataTable';
import { Field, Modal, Confirm, IconEdit, IconDelete } from '../components/ui';
import { useList } from '../hooks/useList';
import { useAuth } from '../state/AuthContext';
import { useToast } from '../state/ToastContext';
import {
  FiFileText, FiX, FiDownload, FiPlusCircle, FiSearch, FiDollarSign,
  FiCreditCard, FiTrendingUp, FiCalendar, FiFilter
} from 'react-icons/fi';

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
              <button className="btn btn-template" onClick={() => api.download('/api/reports/templates/income').catch((e) => toast.error(e.message))}>
                <FiFileText size={13} style={{ marginRight: 5, verticalAlign: -2 }} />Sample Template
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
      {/* Dashboard-Style Metric Cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
        gap: 14,
        marginBottom: 16
      }}>
        {/* Card 1: TOTAL INCOME */}
        <div className="dash-metric-card" style={{ borderLeft: '4px solid #1d4ed8', borderRadius: 14, padding: '16px 20px', background: '#ffffff', border: '1px solid #edf2f7', borderLeftWidth: 4 }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: '#1d4ed8', letterSpacing: '0.4px', textTransform: 'uppercase' }}>
                TOTAL INCOME (FILTERED)
              </div>
              <div style={{ width: 40, height: 40, borderRadius: '50%', background: '#e0edfd', display: 'grid', placeItems: 'center' }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#1d4ed8" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="7" y1="17" x2="17" y2="7" />
                  <polyline points="7 7 17 7 17 17" />
                </svg>
              </div>
            </div>
            <div style={{ fontSize: 28, fontWeight: 900, color: '#0f172a', marginTop: 4, letterSpacing: '-0.5px' }}>
              {money(s.total_income)}
            </div>
            <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
              Combined total for selected filters
            </div>
          </div>
        </div>

        {/* Card 2: TO OFFICE CASH */}
        <div className="dash-metric-card" style={{ borderLeft: '4px solid #10b981', borderRadius: 14, padding: '16px 20px', background: '#ffffff', border: '1px solid #edf2f7', borderLeftWidth: 4 }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: '#10b981', letterSpacing: '0.4px', textTransform: 'uppercase' }}>
                TO OFFICE CASH
              </div>
              <div style={{ width: 40, height: 40, borderRadius: '50%', background: '#dcfce7', display: 'grid', placeItems: 'center' }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="6" width="20" height="12" rx="2" />
                  <circle cx="12" cy="12" r="2.5" />
                  <line x1="6" y1="12" x2="6.01" y2="12" strokeWidth="2.5" />
                  <line x1="18" y1="12" x2="18.01" y2="12" strokeWidth="2.5" />
                </svg>
              </div>
            </div>
            <div style={{ fontSize: 28, fontWeight: 900, color: '#0f172a', marginTop: 4, letterSpacing: '-0.5px' }}>
              {money(s.cash_income)}
            </div>
            <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
              Received directly as physical cash
            </div>
          </div>
        </div>

        {/* Card 3: TO BANK */}
        <div className="dash-metric-card" style={{ borderLeft: '4px solid #0284c7', borderRadius: 14, padding: '16px 20px', background: '#ffffff', border: '1px solid #edf2f7', borderLeftWidth: 4 }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: '#0284c7', letterSpacing: '0.4px', textTransform: 'uppercase' }}>
                TO BANK ACCOUNT
              </div>
              <div style={{ width: 40, height: 40, borderRadius: '50%', background: '#e0f2fe', display: 'grid', placeItems: 'center' }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#0284c7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 21h18M3 10h18M5 10v11M9 10v11M15 10v11M19 10v11M12 2L2 7h20L12 2z" />
                </svg>
              </div>
            </div>
            <div style={{ fontSize: 28, fontWeight: 900, color: '#0f172a', marginTop: 4, letterSpacing: '-0.5px' }}>
              {money(s.bank_income)}
            </div>
            <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
              Received via UPI / bank transfer
            </div>
          </div>
        </div>
      </div>

      {/* Filter Toolbar matching Screenshot */}
      <div className="toolbar" style={{
        display: 'flex',
        gap: 8,
        alignItems: 'center',
        flexWrap: 'wrap',
        marginBottom: 12,
        background: 'transparent',
        padding: 0
      }}>
        {/* Search */}
        <div className="input-with-icon" style={{ flex: '1 1 200px', minWidth: 170 }}>
          <div className="input-icon-pill" style={{ color: '#64748b' }}><FiSearch size={14} /></div>
          <input
            type="search"
            placeholder="Search category, giver, remarks…"
            value={list.q}
            onChange={(e) => list.setQ(e.target.value)}
            style={{ borderRadius: 20, height: 36, paddingLeft: 34, background: '#ffffff', borderColor: '#e2e8f0' }}
          />
        </div>

        {/* Any Category */}
        <div className="input-with-icon" style={{ width: 'auto', minWidth: 135 }}>
          <div className="input-icon-pill" style={{ color: '#3b82f6' }}><FiFilter size={13} /></div>
          <select
            value={list.filters.category || ''}
            onChange={(e) => list.setFilter('category', e.target.value)}
            style={{ borderRadius: 20, height: 36, paddingLeft: 32, background: '#ffffff', borderColor: '#e2e8f0' }}
          >
            <option value="">Any category</option>
            {categoryOptions.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        {/* Any Destination */}
        <div className="input-with-icon" style={{ width: 'auto', minWidth: 130 }}>
          <div className="input-icon-pill" style={{ color: '#3b82f6' }}><FiCreditCard size={13} /></div>
          <select
            value={list.filters.account_id || ''}
            onChange={(e) => list.setFilter('account_id', e.target.value)}
            style={{ borderRadius: 20, height: 36, paddingLeft: 32, background: '#ffffff', borderColor: '#e2e8f0' }}
          >
            <option value="">Any destination</option>
            {(meta?.accounts || []).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>

        {/* Date From */}
        <div className="input-with-icon" style={{ width: 'auto', minWidth: 140 }}>
          <div className="input-icon-pill" style={{ color: '#3b82f6' }}><FiCalendar size={13} /></div>
          <input
            type="date"
            value={list.filters.date_from || ''}
            onChange={(e) => list.setFilter('date_from', e.target.value)}
            style={{ borderRadius: 20, height: 36, paddingLeft: 32, background: '#ffffff', borderColor: '#e2e8f0' }}
          />
        </div>

        {/* Date To */}
        <div className="input-with-icon" style={{ width: 'auto', minWidth: 140 }}>
          <div className="input-icon-pill" style={{ color: '#3b82f6' }}><FiCalendar size={13} /></div>
          <input
            type="date"
            value={list.filters.date_to || ''}
            onChange={(e) => list.setFilter('date_to', e.target.value)}
            style={{ borderRadius: 20, height: 36, paddingLeft: 32, background: '#ffffff', borderColor: '#e2e8f0' }}
          />
        </div>

        {list.hasFilters && (
          <button className="btn secondary sm" onClick={list.clear} style={{ borderRadius: 18, height: 36, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            Clear filters <FiX size={12} />
          </button>
        )}

        <div style={{ flex: 1 }} />

        {/* Export Excel */}
        {can('income.export') && (
          <button
            className="btn btn-excel"
            onClick={() => api.download('/api/income/export', { q: list.q, ...list.filters }).catch((e) => toast.error(e.message))}
            style={{
              borderRadius: 20,
              height: 36,
              padding: '0 18px',
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

      {/* Row 2: + New Income Button on its own row */}
      <div style={{ marginBottom: 16 }}>
        {can('income.create') && (
          <button
            className="btn-save-glow"
            onClick={() => { setForm(blank); setErrors({}); setModal({ mode: 'create' }); }}
            style={{
              borderRadius: 22,
              padding: '8px 22px',
              fontSize: 13.5,
              fontWeight: 700,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              background: 'linear-gradient(135deg, #0d2856 0%, #1d4ed8 100%)',
              color: '#ffffff',
              boxShadow: '0 4px 14px rgba(13, 40, 86, 0.35)',
              border: 'none',
              cursor: 'pointer'
            }}
          >
            <FiPlusCircle size={16} /> New Income
          </button>
        )}
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
            <button className="btn-save-glow" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save Income'}</button>
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