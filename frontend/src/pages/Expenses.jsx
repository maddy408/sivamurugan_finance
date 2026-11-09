import { useEffect, useState } from 'react';
import { api, money, fmtDate } from '../api/client';
import DataTable from '../components/DataTable';
import { Field, Modal, Confirm, IconEdit, IconDelete } from '../components/ui';
import { validateAmount, validateDate, validateSelect, focusFirstError } from '../utils/validation';
import { useList } from '../hooks/useList';
import { useAuth } from '../state/AuthContext';
import { useToast } from '../state/ToastContext';
import { useI18n } from '../state/I18nContext';
import {
  FiFileText, FiX, FiDownload, FiPlusCircle, FiSearch, FiDollarSign,
  FiCreditCard, FiTrendingDown, FiCalendar, FiFilter
} from 'react-icons/fi';

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
  const { t } = useI18n();
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
    const errs = {};
    const amtErr = validateAmount(form.amount, { required: true, min: 0.01, fieldLabel: 'Amount' });
    if (amtErr) errs.amount = amtErr;
    const dateErr = validateDate(form.expense_date, { required: true, fieldLabel: 'Date' });
    if (dateErr) errs.expense_date = dateErr;
    const catErr = validateSelect(form.category, 'Category');
    if (catErr) errs.category = catErr;

    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      focusFirstError(errs);
      return;
    }
    setBusy(true); setErrors({});
    try {
      const payload = { ...form, amount: Number(form.amount), account_id: form.account_id ? Number(form.account_id) : undefined };
      Object.keys(payload).forEach((k) => payload[k] === '' && delete payload[k]);
      if (modal.mode === 'create') { await api.post('/api/expenses', payload); toast.success('Expense recorded'); }
      else { await api.put(`/api/expenses/${modal.row.id}`, payload); toast.success('Expense updated'); }
      setModal(null); list.reload();
    } catch (e) {
      if (e.errors) {
        const mapped = Object.fromEntries(Object.entries(e.errors).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]));
        setErrors(mapped);
        focusFirstError(mapped);
      } else {
        toast.error(e.message);
      }
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
    { key: 'category', header: 'Category', sortable: true, render: (r) => t(r.category, r.category) },
    { key: 'account_name', header: 'Source', render: (r) => r.account_name ? `${r.account_name} (${t(r.account_type, r.account_type)})` : '—' },
    { key: 'amount', header: 'Amount', align: 'right', sortable: true, render: (r) => money(r.amount) },
    { key: 'remarks', header: 'Remarks', render: (r) => r.remarks || '—' },
    { key: 'status', header: 'Status', render: (r) => <span className={`badge ${r.status === 'active' ? 'active' : 'cancelled'}`}>{t(r.status, r.status)}</span> },
    {
      key: '_a', header: 'Action', align: 'right', render: (r) => r.status === 'active' && (
        <div className="action-buttons">
          {can('expenses.edit') && (
            <button className="btn-icon edit" onClick={() => { setForm({ ...blank, ...r, account_id: r.account_id || '' }); setModal({ mode: 'edit', row: r }); }} title={t('Edit Expense', 'Edit Expense')}>
              <IconEdit />
            </button>
          )}
          {can('expenses.delete') && (
            <button className="btn-icon delete" onClick={() => setConfirm({ type: 'delete', row: r, reason: '' })} title={t('Delete Expense', 'Delete Expense')}>
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
          <h1 className="page-title" style={{ margin: 0, fontSize: 20 }}>{t('Expenses', 'Expenses')}</h1>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {can('expenses.export') && (
              <button className="btn btn-template" onClick={() => api.download('/api/reports/templates/expense').catch((e) => toast.error(e.message))}>
                <FiFileText size={13} style={{ marginRight: 5, verticalAlign: -2 }} />{t('Sample Template', 'Sample Template')}
              </button>
            )}
            {can('expenses.create') && (
              <button className="btn" onClick={() => { setForm(blank); setErrors({}); setModal({ mode: 'create' }); }}>
                + {t('Add Expense', 'New expense')}
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
        {/* Card 1: TOTAL (FILTERED) */}
        <div className="dash-metric-card" style={{ borderLeft: '4px solid #ef4444', borderRadius: 14, padding: '16px 20px', background: '#ffffff', border: '1px solid #edf2f7', borderLeftWidth: 4 }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: '#ef4444', letterSpacing: '0.4px', textTransform: 'uppercase' }}>
                {t('TOTAL EXPENSE (FILTERED)', 'TOTAL EXPENSE (FILTERED)')}
              </div>
              <div style={{ width: 40, height: 40, borderRadius: '50%', background: '#fee2e2', display: 'grid', placeItems: 'center' }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="7" y1="7" x2="17" y2="17" />
                  <polyline points="17 7 17 17 7 17" />
                </svg>
              </div>
            </div>
            <div style={{ fontSize: 28, fontWeight: 900, color: '#0f172a', marginTop: 4, letterSpacing: '-0.5px' }}>
              {money(s.total_expenses)}
            </div>
            <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
              {t('Combined total for selected filters', 'Combined total for selected filters')}
            </div>
          </div>
        </div>

        {/* Card 2: FROM OFFICE CASH */}
        <div className="dash-metric-card" style={{ borderLeft: '4px solid #10b981', borderRadius: 14, padding: '16px 20px', background: '#ffffff', border: '1px solid #edf2f7', borderLeftWidth: 4 }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: '#10b981', letterSpacing: '0.4px', textTransform: 'uppercase' }}>
                {t('FROM OFFICE CASH', 'FROM OFFICE CASH')}
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
              {money(s.cash_expenses)}
            </div>
            <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
              {t('Disbursed from petty & office cash', 'Disbursed from petty & office cash')}
            </div>
          </div>
        </div>

        {/* Card 3: FROM BANK ACCOUNT */}
        <div className="dash-metric-card" style={{ borderLeft: '4px solid #1d4ed8', borderRadius: 14, padding: '16px 20px', background: '#ffffff', border: '1px solid #edf2f7', borderLeftWidth: 4 }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: '#1d4ed8', letterSpacing: '0.4px', textTransform: 'uppercase' }}>
                {t('FROM BANK ACCOUNT', 'FROM BANK ACCOUNT')}
              </div>
              <div style={{ width: 40, height: 40, borderRadius: '50%', background: '#e0edfd', display: 'grid', placeItems: 'center' }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#1d4ed8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 21h18M3 10h18M5 10v11M9 10v11M15 10v11M19 10v11M12 2L2 7h20L12 2z" />
                </svg>
              </div>
            </div>
            <div style={{ fontSize: 28, fontWeight: 900, color: '#0f172a', marginTop: 4, letterSpacing: '-0.5px' }}>
              {money(s.bank_expenses)}
            </div>
            <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
              {t('Paid via bank transfer / cheque / UPI', 'Paid via bank transfer / cheque / UPI')}
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
            placeholder={t('Search category, remarks…', 'Search category, remarks…')}
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
            <option value="">{t('Any category', 'Any category')}</option>
            {categoryOptions.map((c) => <option key={c} value={c}>{t(c, c)}</option>)}
          </select>
        </div>

        {/* Any Source */}
        <div className="input-with-icon" style={{ width: 'auto', minWidth: 130 }}>
          <div className="input-icon-pill" style={{ color: '#3b82f6' }}><FiCreditCard size={13} /></div>
          <select
            value={list.filters.account_id || ''}
            onChange={(e) => list.setFilter('account_id', e.target.value)}
            style={{ borderRadius: 20, height: 36, paddingLeft: 32, background: '#ffffff', borderColor: '#e2e8f0' }}
          >
            <option value="">{t('Any source', 'Any source')}</option>
            {(meta?.accounts || []).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>

        {/* Any Status */}
        <div className="input-with-icon" style={{ width: 'auto', minWidth: 120 }}>
          <div className="input-icon-pill" style={{ color: '#3b82f6' }}><FiFilter size={13} /></div>
          <select
            value={list.filters.status || ''}
            onChange={(e) => list.setFilter('status', e.target.value)}
            style={{ borderRadius: 20, height: 36, paddingLeft: 32, background: '#ffffff', borderColor: '#e2e8f0' }}
          >
            <option value="">{t('Any status', 'Any status')}</option>
            <option value="active">{t('Active', 'Active')}</option>
            <option value="cancelled">{t('Cancelled', 'Cancelled')}</option>
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
            {t('Clear filters', 'Clear filters')} <FiX size={12} />
          </button>
        )}

        <div style={{ flex: 1 }} />

        {/* Export Excel */}
        {can('expenses.export') && (
          <button
            className="btn btn-excel"
            onClick={() => api.download('/api/expenses/export', { q: list.q, ...list.filters }).catch((e) => toast.error(e.message))}
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
            <FiDownload size={14} style={{ color: '#16a34a' }} /> {t('Export Excel', 'Export Excel')}
          </button>
        )}
      </div>

      {/* Row 2: + New Expense Button on its own row */}
      <div style={{ marginBottom: 16 }}>
        {can('expenses.create') && (
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
            <FiPlusCircle size={16} /> {t('Add Expense', 'New Expense')}
          </button>
        )}
      </div>

      <DataTable
        columns={columns} rows={list.rows} loading={list.loading} error={list.error} onRetry={list.reload}
        page={list.page} perPage={list.perPage} total={list.pagination.total} totalPages={list.pagination.total_pages}
        sortBy={list.sortBy} sortDir={list.sortDir} onSort={list.onSort} onPage={list.setPage} onPerPage={list.setPerPage}
        emptyTitle={t('No expenses match your filters', 'No expenses match your filters')}
        selectedIds={selectedIds}
        onSelectChange={setSelectedIds}
        selectable={can('expenses.delete')}
        bulkActions={
          can('expenses.delete') && (
            <button className="btn sm danger" onClick={() => setBulkConfirm(true)}>
              <IconDelete /> {t('Bulk Delete', 'Bulk Delete')} ({selectedIds.length})
            </button>
          )
        }
      />

      {modal && (
        <Modal title={modal.mode === 'create' ? t('Add Expense', 'New expense') : t('Edit Expense', 'Edit expense')} onClose={() => setModal(null)}
          footer={<>
            <button className="btn secondary" onClick={() => setModal(null)} disabled={busy}>{t('Cancel', 'Cancel')}</button>
            <button className="btn-save-glow" onClick={save} disabled={busy}>{busy ? t('Saving…', 'Saving…') : t('Save Expense', 'Save Expense')}</button>
          </>}>
          <div className="form-grid">
            <Field label="Amount *" error={errors.amount}>
              <input
                name="amount"
                type="number"
                min="0.01"
                step="0.01"
                value={form.amount}
                onChange={(e) => {
                  setForm({ ...form, amount: e.target.value });
                  if (errors.amount) setErrors((prev) => { const n = { ...prev }; delete n.amount; return n; });
                }}
                onBlur={() => {
                  const err = validateAmount(form.amount, { required: true, min: 0.01, fieldLabel: 'Amount' });
                  if (err) setErrors((prev) => ({ ...prev, amount: err }));
                }}
              />
            </Field>
            <Field label="Date *" error={errors.expense_date}>
              <input
                name="expense_date"
                type="date"
                value={form.expense_date}
                onChange={(e) => {
                  setForm({ ...form, expense_date: e.target.value });
                  if (errors.expense_date) setErrors((prev) => { const n = { ...prev }; delete n.expense_date; return n; });
                }}
                onBlur={() => {
                  const err = validateDate(form.expense_date, { required: true, fieldLabel: 'Date' });
                  if (err) setErrors((prev) => ({ ...prev, expense_date: err }));
                }}
              />
            </Field>
            <Field label="Category *" error={errors.category}>
              <select
                name="category"
                value={form.category}
                onChange={(e) => {
                  setForm({ ...form, category: e.target.value });
                  if (errors.category) setErrors((prev) => { const n = { ...prev }; delete n.category; return n; });
                }}
                onBlur={() => {
                  const err = validateSelect(form.category, 'Category');
                  if (err) setErrors((prev) => ({ ...prev, category: err }));
                }}
                required>
                <option value="">{t('Select Category', 'Select a category…')}</option>
                {categoryOptions.map((c) => <option key={c} value={c}>{t(c, c)}</option>)}
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
        <Confirm title={confirm.type === 'delete' ? t('Delete expense?', 'Delete expense?') : t('Cancel expense?', 'Cancel expense?')} danger={confirm.type === 'delete'} busy={busy}
          message={<input style={{ width: '100%', padding: 8 }} placeholder={t('Reason', 'Reason')} value={confirm.reason} onChange={(e) => setConfirm({ ...confirm, reason: e.target.value })} />}
          confirmLabel={confirm.type === 'delete' ? t('Delete', 'Delete') : t('Cancel expense', 'Cancel expense')} onConfirm={act} onClose={() => setConfirm(null)} />
      )}
      {bulkConfirm && (
        <Confirm title={`${t('Delete', 'Delete')} ${selectedIds.length} ${t('selected expenses?', 'selected expenses?')}`} danger busy={busy}
          message={t('Selected expenses will be permanently deleted.', 'Selected expenses will be permanently deleted.')}
          confirmLabel={`${t('Delete', 'Delete')} (${selectedIds.length})`} onConfirm={handleBulkDelete} onClose={() => setBulkConfirm(false)} />
      )}
    </>
  );
}