import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, money, fmtDate } from '../api/client';
import DataTable from '../components/DataTable';
import { Confirm, Field, Modal, IconView, IconEdit, IconDelete } from '../components/ui';
import { useList } from '../hooks/useList';
import { useAuth } from '../state/AuthContext';
import { useToast } from '../state/ToastContext';

const today = () => new Date().toISOString().slice(0, 10);
const initialForm = {
  customer_id: '', code: '', principal_amount: '', installment_amount: '', tenure: '',
  frequency: 'weekly', start_date: today(), schedule_type: 'WEEKLY', employee_id: '', notes: '',
};

export default function Loans() {
  const { can } = useAuth();
  const toast = useToast();
  const list = useList('/api/loans', { initialPerPage: 10, initialSort: 'created_at', initialDir: 'desc' });
  const [del, setDel] = useState(null);
  const [busy, setBusy] = useState(false);
  const [edit, setEdit] = useState(null);
  const [editBusy, setEditBusy] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);
  const [bulkConfirm, setBulkConfirm] = useState(false);

  // Form states for left-side creation panel
  const [form, setForm] = useState(initialForm);
  const [customers, setCustomers] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [nextCode, setNextCode] = useState('');
  const [formErrors, setFormErrors] = useState({});
  const [formBusy, setFormBusy] = useState(false);

  useEffect(() => {
    if (can('loans.create')) {
      api.get('/api/customers', { params: { per_page: 500, sort_by: 'name' } }).then((r) => setCustomers(r.data)).catch(() => {});
      api.get('/api/employees', { params: { per_page: 200 } }).then((r) => setEmployees(r.data)).catch(() => {});
      api.get('/api/loans/next-code').then((r) => setNextCode(r.data.next_code)).catch(() => {});
    }
  }, [can]);

  const setF = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const selectedCustomer = customers.find((c) => String(c.id) === String(form.customer_id));

  const SCHEDULE_FOR_FREQ = { daily: 'DAILY', weekly: 'WEEKLY', monthly: 'MONTHLY_DAILY' };
  const setFrequency = (v) => setForm((f) => ({
    ...f,
    frequency: v,
    schedule_type: v === 'monthly' && f.schedule_type?.startsWith('MONTHLY_') ? f.schedule_type : SCHEDULE_FOR_FREQ[v],
  }));

  const handleCreateChit = async (e) => {
    e.preventDefault();
    setFormErrors({});
    if (!form.customer_id) {
      setFormErrors({ customer_id: 'Please select a customer' });
      return;
    }
    setFormBusy(true);
    try {
      const payload = {
        customer_id: Number(form.customer_id),
        account_type: 'chit',
        principal_amount: Number(form.principal_amount),
        installment_amount: Number(form.installment_amount),
        tenure: Number(form.tenure),
        frequency: form.frequency,
        start_date: form.start_date,
        schedule_type: form.schedule_type,
        code: form.code.trim() || undefined,
        employee_id: form.employee_id ? Number(form.employee_id) : undefined,
        notes: form.notes || undefined,
      };
      const r = await api.post('/api/loans', payload);
      toast.success(`Chit ${r.data.code} created successfully!`);
      setForm(initialForm);
      api.get('/api/loans/next-code').then((res) => setNextCode(res.data.next_code)).catch(() => {});
      list.reload();
    } catch (err) {
      if (err.errors) setFormErrors(Object.fromEntries(Object.entries(err.errors).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v])));
      else toast.error(err.message);
    } finally {
      setFormBusy(false);
    }
  };

  const openEdit = async (loanRow) => {
    try {
      setBusy(true);
      const res = await api.get(`/api/loans/${loanRow.id}`);
      const data = res.data;
      setEdit({
        id: data.id,
        code: data.code,
        installment_amount: data.installment_amount,
        principal_amount: data.principal_amount,
        tenure: data.tenure,
        start_date: fmtDate(data.start_date),
        schedule_type: data.schedule_type || 'WEEKLY',
        frequency: data.frequency || 'weekly',
        notes: data.notes || '',
      });
    } catch (e) {
      toast.error(e.message || 'Failed to fetch chit details');
    } finally {
      setBusy(false);
    }
  };

  const saveEdit = async () => {
    setEditBusy(true);
    try {
      const body = {
        code: edit.code && edit.code.trim() ? edit.code.trim() : undefined,
        installment_amount: Number(edit.installment_amount),
        principal_amount: Number(edit.principal_amount),
        tenure: Number(edit.tenure),
        start_date: edit.start_date,
        schedule_type: edit.schedule_type,
        frequency: edit.frequency,
        notes: edit.notes || undefined,
      };
      const r = await api.put(`/api/loans/${edit.id}`, body);
      toast.success(`Updated — ${r.data?.schedule_generation?.updated ?? 0} future installment(s) recalculated`);
      setEdit(null);
      list.reload();
    } catch (e) {
      toast.error(e.errors ? Object.values(e.errors)[0][0] : e.message);
    } finally {
      setEditBusy(false);
    }
  };

  const handleBulkDelete = async () => {
    setBusy(true);
    try {
      await Promise.all(selectedIds.map((id) => api.del(`/api/loans/${id}`, { reason: 'bulk delete' })));
      toast.success(`Successfully deleted ${selectedIds.length} chit(s)`);
      setSelectedIds([]);
      setBulkConfirm(false);
      list.reload();
    } catch (e) {
      toast.error(e.message || 'Error during bulk delete');
    } finally {
      setBusy(false);
    }
  };

  const doDelete = async () => {
    setBusy(true);
    try {
      const r = await api.del(`/api/loans/${del.id}`, { reason: 'deleted from list' });
      toast.success(r.message || 'Chit deleted');
      setDel(null); list.reload();
    } catch (e) { toast.error(e.message); } finally { setBusy(false); }
  };

  // Compute page totals from rows for quick stat cards
  const totalPrincipal = (list.rows || []).reduce((acc, r) => acc + Number(r.principal_amount || 0), 0);
  const totalOutstanding = (list.rows || []).reduce((acc, r) => acc + Number(r.outstanding_balance || 0), 0);

  const columns = [
    { 
      key: 'code', 
      header: 'Chit Code & Start', 
      sortable: true, 
      render: (r) => (
        <div>
          <Link to={`/loans/${r.id}`}>
            <span className="badge PENDING" style={{ textTransform: 'none', fontWeight: 700 }}>{r.code}</span>
          </Link>
          <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
            📅 {fmtDate(r.start_date)}
          </div>
        </div>
      ) 
    },
    { 
      key: 'customer_name', 
      header: 'Customer & Location', 
      render: (r) => (
        <div>
          <Link to={`/customers/${r.customer_id}`} style={{ fontWeight: 700, color: '#0f172a', display: 'block' }}>
            {r.customer_name}
          </Link>
          <div style={{ fontSize: '12px', color: '#64748b' }}>
            📍 {r.location_name || '—'} {r.employee_name ? `• 👤 ${r.employee_name}` : ''}
          </div>
        </div>
      ) 
    },
    { 
      key: 'principal_amount', 
      header: 'Amount & Installment', 
      align: 'right', 
      sortable: true, 
      render: (r) => (
        <div>
          <div style={{ fontWeight: 700, color: '#0f172a' }}>{money(r.principal_amount)}</div>
          <div style={{ fontSize: '12px', color: '#2563eb', fontWeight: 600 }}>
            {money(r.installment_amount)} <span className="badge PENDING" style={{ fontSize: '10px', padding: '1px 5px' }}>{r.frequency}</span>
          </div>
        </div>
      ) 
    },
    { 
      key: 'outstanding_balance', 
      header: 'Outstanding Balance', 
      align: 'right', 
      render: (r) => (
        <div>
          <b style={{ color: Number(r.outstanding_balance) > 0 ? '#f43f5e' : '#10b981', fontSize: '14px' }}>
            {money(r.outstanding_balance)}
          </b>
          <div style={{ fontSize: '11px', color: '#64748b' }}>
            Tenure: {r.tenure} installments
          </div>
        </div>
      ) 
    },
    { key: 'status', header: 'Status', render: (r) => <span className={`badge ${r.status}`}>{r.status}</span> },
    {
      key: '_a', header: 'Action', align: 'right', render: (r) => (
        <div className="action-buttons">
          <Link className="btn-icon view" to={`/loans/${r.id}`} title="View Details">
            <IconView />
          </Link>
          {can('loans.edit') && r.status === 'active' && (
            <button className="btn-icon edit" onClick={() => openEdit(r)} title="Edit Chit">
              <IconEdit />
            </button>
          )}
          {can('loans.delete') && (
            <button className="btn-icon delete" onClick={() => setDel(r)} title="Delete Chit">
              <IconDelete />
            </button>
          )}
        </div>
      ),
    },
  ];

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">📜 Chits & Loans Directory</h1>
      </div>

      {/* Main 2-Column Layout: Left Side = New Form, Right Side = List & Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: can('loans.create') ? '340px minmax(0, 1fr)' : '1fr', gap: 20, alignItems: 'start' }}>
        
        {/* Left Side: New Chit Form */}
        {can('loans.create') && (
          <div className="card" style={{ sticky: 'top', top: 80 }}>
            <div className="card-head">
              <h2>✨ Create New Chit</h2>
            </div>
            <div className="card-body">
              <form onSubmit={handleCreateChit}>
                <Field label="Customer *" error={formErrors.customer_id}>
                  <input
                    list="cust-options-inline"
                    placeholder="Search name, code, phone…"
                    value={form._customerLabel ?? (selectedCustomer ? `${selectedCustomer.name} (${selectedCustomer.customer_code})` : '')}
                    onChange={(e) => {
                      const v = e.target.value;
                      const m = customers.find((c) =>
                        `${c.name} (${c.customer_code})` === v ||
                        c.customer_code === v || c.mobile === v ||
                        c.name.toLowerCase() === v.toLowerCase());
                      setForm((f) => ({ ...f, _customerLabel: v, customer_id: m ? m.id : '' }));
                    }}
                    required
                  />
                  <datalist id="cust-options-inline">
                    {customers.map((c) => (
                      <option key={c.id} value={`${c.name} (${c.customer_code})`}>
                        {c.mobile || ''} · {c.address_line1 || 'No address on file'}
                      </option>
                    ))}
                  </datalist>
                </Field>

                <Field label="Chit Code" error={formErrors.code}>
                  <input
                    value={form.code}
                    onChange={(e) => setF('code', e.target.value)}
                    placeholder={nextCode ? `Auto (${nextCode})` : 'Leave blank for auto'}
                  />
                </Field>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <Field label="Chit Amount *" error={formErrors.principal_amount}>
                    <input type="number" min="1" step="0.01" value={form.principal_amount} onChange={(e) => setF('principal_amount', e.target.value)} required placeholder="e.g. 50000" />
                  </Field>

                  <Field label="Installment *" error={formErrors.installment_amount}>
                    <input type="number" min="0.01" step="0.01" value={form.installment_amount} onChange={(e) => setF('installment_amount', e.target.value)} required placeholder="e.g. 2000" />
                  </Field>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <Field label="Tenure *" error={formErrors.tenure}>
                    <input type="number" min="1" step="1" value={form.tenure} onChange={(e) => setF('tenure', e.target.value)} required placeholder="Installments count" />
                  </Field>

                  <Field label="Frequency">
                    <select value={form.frequency} onChange={(e) => setFrequency(e.target.value)}>
                      <option value="daily">Daily</option>
                      <option value="weekly">Weekly</option>
                      <option value="monthly">Monthly</option>
                    </select>
                  </Field>
                </div>

                <Field label="Start Date *" error={formErrors.start_date}>
                  <input type="date" value={form.start_date} onChange={(e) => setF('start_date', e.target.value)} required />
                </Field>

                <Field label="Employee (optional)">
                  <select value={form.employee_id} onChange={(e) => setF('employee_id', e.target.value)}>
                    <option value="">Unassigned</option>
                    {employees.map((emp) => <option key={emp.employee_id} value={emp.employee_id}>{emp.name}</option>)}
                  </select>
                </Field>

                <button className="btn" style={{ width: '100%', marginTop: 8 }} disabled={formBusy || !form.customer_id}>
                  {formBusy ? 'Creating…' : '✨ Create Chit'}
                </button>
              </form>
            </div>
          </div>
        )}

        {/* Right Side: Directory List & Filters */}
        <div>
          <div className="stat-grid" style={{ marginBottom: 20 }}>
            <div className="stat sky">
              <div className="label">Total Chits</div>
              <div className="value">{list.pagination.total || 0}</div>
            </div>
            <div className="stat indigo">
              <div className="label">Total Chit Value (page)</div>
              <div className="value">{money(totalPrincipal)}</div>
            </div>
            <div className="stat rose">
              <div className="label">Total Outstanding (page)</div>
              <div className="value">{money(totalOutstanding)}</div>
            </div>
          </div>

          <div className="toolbar">
            <input type="search" placeholder="Search chit code, customer, mobile…" value={list.q} onChange={(e) => list.setQ(e.target.value)} />
            <select value={list.filters.status || ''} onChange={(e) => list.setFilter('status', e.target.value)}>
              <option value="">Any status</option>
              <option value="active">Active</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </select>
            <select value={list.filters.frequency || ''} onChange={(e) => list.setFilter('frequency', e.target.value)}>
              <option value="">Any frequency</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
            {list.hasFilters && <button className="btn secondary" onClick={list.clear}>Clear filters ✕</button>}
            <div style={{ flex: 1 }} />
            {can('loans.export') && <button className="btn secondary" onClick={() => api.download('/api/export/chits', { q: list.q, ...list.filters }).catch((e) => toast.error(e.message))}>Export Excel</button>}
          </div>

          <DataTable
            columns={columns} rows={list.rows} loading={list.loading} error={list.error} onRetry={list.reload}
            page={list.page} perPage={list.perPage} total={list.pagination.total} totalPages={list.pagination.total_pages}
            sortBy={list.sortBy} sortDir={list.sortDir} onSort={list.onSort} onPage={list.setPage} onPerPage={list.setPerPage}
            emptyTitle="No chits match your filters"
            selectedIds={selectedIds}
            onSelectChange={setSelectedIds}
            selectable={can('loans.delete')}
            bulkActions={
              can('loans.delete') && (
                <button className="btn sm danger" onClick={() => setBulkConfirm(true)}>
                  <IconDelete /> Bulk Delete ({selectedIds.length})
                </button>
              )
            }
          />
        </div>
      </div>

      {del && (
        <Confirm title={`Delete ${del.code}?`} danger busy={busy}
          message="The chit disappears from every list immediately. Posted collections stay in the ledger for audit."
          confirmLabel="Delete" onConfirm={doDelete} onClose={() => setDel(null)} />
      )}

      {bulkConfirm && (
        <Confirm title={`Delete ${selectedIds.length} selected chits?`} danger busy={busy}
          message="All selected chits will disappear from the list immediately. Any posted collections remain in the audit ledger."
          confirmLabel={`Delete (${selectedIds.length})`} onConfirm={handleBulkDelete} onClose={() => setBulkConfirm(false)} />
      )}

      {edit && (
        <Modal title={`Edit ${edit.code}`} onClose={() => setEdit(null)}
          footer={<>
            <button className="btn secondary" onClick={() => setEdit(null)} disabled={editBusy}>Cancel</button>
            <button className="btn" onClick={saveEdit} disabled={editBusy}>{editBusy ? 'Saving…' : 'Save'}</button>
          </>}>
          <div className="form-grid">
            <Field label="Chit Code">
              <input value={edit.code} onChange={(e) => setEdit({ ...edit, code: e.target.value })} />
              <p className="muted" style={{ fontSize: 12, margin: '4px 0 0' }}>
                Leave unchanged to keep existing code.
              </p>
            </Field>
            <Field label="Installment Amount">
              <input type="number" min="0.01" step="0.01" value={edit.installment_amount}
                onChange={(e) => setEdit({ ...edit, installment_amount: e.target.value })} />
            </Field>
            <Field label="Chit / principal amount">
              <input type="number" min="0" step="0.01" value={edit.principal_amount}
                onChange={(e) => setEdit({ ...edit, principal_amount: e.target.value })} />
            </Field>
            <Field label="Tenure">
              <input type="number" min="1" step="1" value={edit.tenure}
                onChange={(e) => setEdit({ ...edit, tenure: e.target.value })} />
            </Field>
            <Field label="Repayment Frequency">
              <select value={edit.frequency} onChange={(e) => {
                const v = e.target.value;
                const st = { daily: 'DAILY', weekly: 'WEEKLY', monthly: 'MONTHLY_DAILY' };
                setEdit({
                  ...edit,
                  frequency: v,
                  schedule_type: v === 'monthly' && String(edit.schedule_type).startsWith('MONTHLY_')
                    ? edit.schedule_type : st[v],
                });
              }}>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>
            </Field>
            <Field label="Start date">
              <input type="date" value={edit.start_date} onChange={(e) => setEdit({ ...edit, start_date: e.target.value })} />
            </Field>
            {edit.frequency === 'monthly' && (
              <Field label="Monthly schedule style">
                <select value={edit.schedule_type} onChange={(e) => setEdit({ ...edit, schedule_type: e.target.value })}>
                  <option value="MONTHLY_DAILY">Calendar month</option>
                  <option value="MONTHLY_WEEKDAY">Weekday cycle</option>
                  <option value="MONTHLY_INTERVAL">Fixed day interval</option>
                </select>
              </Field>
            )}
          </div>
          <Field label="Notes">
            <textarea rows={2} value={edit.notes} onChange={(e) => setEdit({ ...edit, notes: e.target.value })} />
          </Field>
          <p className="muted" style={{ fontSize: 12, margin: 0 }}>
            Changing the installment amount recalculates <b>future unpaid</b> installments only. Paid / partially-paid
            installments and every recorded collection are left exactly as they are.
          </p>
        </Modal>
      )}
    </>
  );
}

