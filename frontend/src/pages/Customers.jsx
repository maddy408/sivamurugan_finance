import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import DataTable from '../components/DataTable';
import { Field, Modal, Confirm, IconView, IconEdit, IconDelete } from '../components/ui';
import { useList } from '../hooks/useList';
import { useAuth } from '../state/AuthContext';
import { useToast } from '../state/ToastContext';

const emptyForm = {
  name: '', mobile: '', alt_mobile: '', email: '', gender: '', dob: '',
  address_line1: '', primary_location_id: '', new_location: '', nominee_name: '', nominee_relation: '', nominee_mobile: '', notes: '',
};

export default function Customers() {
  const { can, meta, refreshMeta } = useAuth();
  const toast = useToast();
  const list = useList('/api/customers', { initialPerPage: 10, initialSort: 'name' });
  
  // Create-customer modal state
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState(emptyForm);
  const [createErrors, setCreateErrors] = useState({});
  const [createBusy, setCreateBusy] = useState(false);

  // Edit modal & delete confirm state
  const [editModal, setEditModal] = useState(null); // { mode:'edit', row }
  const [editForm, setEditForm] = useState(emptyForm);
  const [editErrors, setEditErrors] = useState({});
  const [editBusy, setEditBusy] = useState(false);
  const [del, setDel] = useState(null);
  const [busy, setBusy] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);
  const [bulkConfirm, setBulkConfirm] = useState(false);

  const handleCreateCustomer = async (e) => {
    e.preventDefault();
    setCreateBusy(true); setCreateErrors({});
    try {
      const payload = { ...createForm };
      Object.keys(payload).forEach((k) => payload[k] === '' && delete payload[k]);
      const r = await api.post('/api/customers', payload);
      toast.success(r.message || 'Customer created successfully!');
      if (r.data?.created_location) await refreshMeta();
      setCreateForm(emptyForm);
      setCreateOpen(false);
      list.reload();
    } catch (err) {
      if (err.errors) setCreateErrors(Object.fromEntries(Object.entries(err.errors).map(([k, v]) => [k, v[0]])));
      else toast.error(err.message);
    } finally {
      setCreateBusy(false);
    }
  };

  const openEdit = (row) => {
    setEditForm({ ...emptyForm, ...row, primary_location_id: row.primary_location_id || '' });
    setEditErrors({});
    setEditModal(row);
  };

  const handleSaveEdit = async () => {
    setEditBusy(true); setEditErrors({});
    try {
      const payload = { ...editForm };
      Object.keys(payload).forEach((k) => payload[k] === '' && delete payload[k]);
      delete payload.new_location;
      await api.put(`/api/customers/${editModal.id}`, payload);
      toast.success('Customer updated');
      setEditModal(null);
      list.reload();
    } catch (e) {
      if (e.errors) setEditErrors(Object.fromEntries(Object.entries(e.errors).map(([k, v]) => [k, v[0]])));
      else toast.error(e.message);
    } finally {
      setEditBusy(false);
    }
  };

  const handleBulkDelete = async () => {
    setBusy(true);
    try {
      await Promise.all(selectedIds.map((id) => api.del(`/api/customers/${id}`, { reason: 'bulk delete' })));
      toast.success(`Successfully deleted ${selectedIds.length} customer(s)`);
      setSelectedIds([]);
      setBulkConfirm(false);
      list.reload();
    } catch (e) {
      toast.error(e.message || 'Error deleting selected customers');
    } finally {
      setBusy(false);
    }
  };

  const doDelete = async () => {
    setBusy(true);
    try {
      await api.del(`/api/customers/${del.id}`, { reason: 'deleted from list' });
      toast.success('Customer removed');
      setDel(null); list.reload();
    } catch (e) { toast.error(e.message); } finally { setBusy(false); }
  };

  const columns = [
    { key: 'customer_code', header: 'Code', sortable: true },
    { key: 'name', header: 'Name', sortable: true, render: (r) => <Link to={`/customers/${r.id}`}>{r.name}</Link> },
    { key: 'mobile', header: 'Mobile' },
    { key: 'location_name', header: 'Location', render: (r) => r.location_name || '—' },
    { key: 'active_loans', header: 'Active loans', align: 'right' },
    { key: 'status', header: 'Status', render: (r) => <span className={`badge ${r.status}`}>{r.status}</span> },
    {
      key: '_a', header: 'Action', align: 'right', render: (r) => (
        <div className="action-buttons">
          <Link className="btn-icon view" to={`/customers/${r.id}`} title="View Profile">
            <IconView />
          </Link>
          {can('customers.edit') && (
            <button className="btn-icon edit" onClick={() => openEdit(r)} title="Edit Customer">
              <IconEdit />
            </button>
          )}
          {can('customers.delete') && (
            <button className="btn-icon delete" onClick={() => setDel(r)} title="Delete Customer">
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
        <h1 className="page-title">👥 Customers Directory</h1>
        {can('customers.create') && (
          <button className="btn" onClick={() => { setCreateForm(emptyForm); setCreateErrors({}); setCreateOpen(true); }}>
            ＋ New Customer
          </button>
        )}
      </div>

      <div>
          <div className="toolbar">
            <input type="search" placeholder="Search name, code, mobile, village, loan code…"
              value={list.q} onChange={(e) => list.setQ(e.target.value)} />
            <select value={list.filters.location_id || ''} onChange={(e) => list.setFilter('location_id', e.target.value)}>
              <option value="">All locations</option>
              {(meta?.locations || []).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
            <select value={list.filters.status || ''} onChange={(e) => list.setFilter('status', e.target.value)}>
              <option value="">Any status</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="blacklisted">Blacklisted</option>
            </select>
            {list.hasFilters && <button className="btn secondary" onClick={list.clear}>Clear filters ✕</button>}
            <div style={{ flex: 1 }} />
            {can('customers.export') && <button className="btn secondary" onClick={() => api.download('/api/export/customers', { q: list.q, ...list.filters }).catch((e) => toast.error(e.message))}>Export Excel</button>}
          </div>

          <DataTable
            columns={columns}
            rows={list.rows}
            loading={list.loading}
            error={list.error}
            onRetry={list.reload}
            page={list.page}
            perPage={list.perPage}
            total={list.pagination.total}
            totalPages={list.pagination.total_pages}
            sortBy={list.sortBy}
            sortDir={list.sortDir}
            onSort={list.onSort}
            onPage={list.setPage}
            onPerPage={list.setPerPage}
            emptyTitle="No customers match your filters"
            selectedIds={selectedIds}
            onSelectChange={setSelectedIds}
            selectable={can('customers.delete')}
            bulkActions={
              can('customers.delete') && (
                <button className="btn sm danger" onClick={() => setBulkConfirm(true)}>
                  <IconDelete /> Bulk Delete ({selectedIds.length})
                </button>
              )
            }
          />
      </div>

      {/* Create Customer Modal */}
      {createOpen && (
        <Modal
          title="👤 Register New Customer"
          size="lg"
          onClose={() => setCreateOpen(false)}
          footer={
            <>
              <button className="btn secondary" onClick={() => setCreateOpen(false)} disabled={createBusy}>Cancel</button>
              <button className="btn" onClick={handleCreateCustomer} disabled={createBusy}>{createBusy ? 'Saving…' : 'Register Customer'}</button>
            </>
          }
        >
          <form onSubmit={handleCreateCustomer}>
            <div className="form-grid">
              <Field label="Full Name *" error={createErrors.name}>
                <input value={createForm.name} onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })} required placeholder="e.g. Ramesh Kumar" autoFocus />
              </Field>
              <Field label="Mobile *" error={createErrors.mobile}>
                <input value={createForm.mobile} onChange={(e) => setCreateForm({ ...createForm, mobile: e.target.value })} required placeholder="10-digit phone" />
              </Field>
              <Field label="Alt Mobile" error={createErrors.alt_mobile}>
                <input value={createForm.alt_mobile} onChange={(e) => setCreateForm({ ...createForm, alt_mobile: e.target.value })} placeholder="Secondary phone" />
              </Field>
              <Field label="Email" error={createErrors.email}>
                <input value={createForm.email} onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })} placeholder="name@example.com" />
              </Field>
              <Field label="Location" error={createErrors.primary_location_id || createErrors.new_location}>
                <select
                  value={createForm.primary_location_id}
                  onChange={(e) => setCreateForm({ ...createForm, primary_location_id: e.target.value, new_location: e.target.value ? '' : createForm.new_location })}
                >
                  <option value="">— Select location —</option>
                  {(meta?.locations || []).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
                {!createForm.primary_location_id && (
                  <input style={{ marginTop: 6 }} placeholder="…or type a new location name"
                    value={createForm.new_location || ''}
                    onChange={(e) => setCreateForm({ ...createForm, new_location: e.target.value })} />
                )}
              </Field>
              <Field label="Gender" error={createErrors.gender}>
                <select value={createForm.gender} onChange={(e) => setCreateForm({ ...createForm, gender: e.target.value })}>
                  <option value="">—</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="other">Other</option>
                </select>
              </Field>
              <Field label="Date of Birth" error={createErrors.dob}>
                <input type="date" value={createForm.dob || ''} onChange={(e) => setCreateForm({ ...createForm, dob: e.target.value })} />
              </Field>
              <Field label="Address" error={createErrors.address_line1}>
                <input value={createForm.address_line1} onChange={(e) => setCreateForm({ ...createForm, address_line1: e.target.value })} placeholder="Door no, street, area" />
              </Field>
              <Field label="Nominee Name" error={createErrors.nominee_name}>
                <input value={createForm.nominee_name} onChange={(e) => setCreateForm({ ...createForm, nominee_name: e.target.value })} />
              </Field>
              <Field label="Nominee Relation" error={createErrors.nominee_relation}>
                <input value={createForm.nominee_relation} onChange={(e) => setCreateForm({ ...createForm, nominee_relation: e.target.value })} placeholder="e.g. Spouse / Son" />
              </Field>
              <Field label="Nominee Mobile" error={createErrors.nominee_mobile}>
                <input value={createForm.nominee_mobile} onChange={(e) => setCreateForm({ ...createForm, nominee_mobile: e.target.value })} />
              </Field>
            </div>
            <Field label="Notes" error={createErrors.notes}>
              <textarea rows={2} value={createForm.notes} onChange={(e) => setCreateForm({ ...createForm, notes: e.target.value })} />
            </Field>
            <button type="submit" style={{ display: 'none' }} />
          </form>
        </Modal>
      )}

      {/* Edit Customer Modal */}
      {editModal && (
        <Modal
          title={`Edit ${editModal.name}`}
          size="lg"
          onClose={() => setEditModal(null)}
          footer={
            <>
              <button className="btn secondary" onClick={() => setEditModal(null)} disabled={editBusy}>Cancel</button>
              <button className="btn" onClick={handleSaveEdit} disabled={editBusy}>{editBusy ? 'Saving…' : 'Save Changes'}</button>
            </>
          }
        >
          <div className="form-grid">
            <Field label="Full name *" error={editErrors.name}>
              <input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
            </Field>
            <Field label="Mobile *" error={editErrors.mobile}>
              <input value={editForm.mobile} onChange={(e) => setEditForm({ ...editForm, mobile: e.target.value })} />
            </Field>
            <Field label="Alternate mobile" error={editErrors.alt_mobile}>
              <input value={editForm.alt_mobile} onChange={(e) => setEditForm({ ...editForm, alt_mobile: e.target.value })} />
            </Field>
            <Field label="Email" error={editErrors.email}>
              <input value={editForm.email} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} />
            </Field>
            <Field label="Gender" error={editErrors.gender}>
              <select value={editForm.gender} onChange={(e) => setEditForm({ ...editForm, gender: e.target.value })}>
                <option value="">—</option><option value="male">Male</option>
                <option value="female">Female</option><option value="other">Other</option>
              </select>
            </Field>
            <Field label="Date of birth" error={editErrors.dob}>
              <input type="date" value={editForm.dob || ''} onChange={(e) => setEditForm({ ...editForm, dob: e.target.value })} />
            </Field>
            <Field label="Address" error={editErrors.address_line1}>
              <input value={editForm.address_line1} onChange={(e) => setEditForm({ ...editForm, address_line1: e.target.value })} />
            </Field>
            <Field label="Location" error={editErrors.primary_location_id}>
              <select value={editForm.primary_location_id}
                onChange={(e) => setEditForm({ ...editForm, primary_location_id: e.target.value })}>
                <option value="">— select existing —</option>
                {(meta?.locations || []).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </Field>
            <Field label="Nominee name" error={editErrors.nominee_name}>
              <input value={editForm.nominee_name} onChange={(e) => setEditForm({ ...editForm, nominee_name: e.target.value })} />
            </Field>
            <Field label="Nominee relation" error={editErrors.nominee_relation}>
              <input value={editForm.nominee_relation} onChange={(e) => setEditForm({ ...editForm, nominee_relation: e.target.value })} />
            </Field>
            <Field label="Status" error={editErrors.status}>
              <select value={editForm.status || 'active'} onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="blacklisted">Blacklisted</option>
              </select>
            </Field>
          </div>
          <Field label="Notes" error={editErrors.notes}>
            <textarea rows={2} value={editForm.notes} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} />
          </Field>
        </Modal>
      )}

      {del && (
        <Confirm title={`Delete ${del.name}?`} danger busy={busy}
          message="The customer record will be removed."
          confirmLabel="Delete" onConfirm={doDelete} onClose={() => setDel(null)} />
      )}

      {bulkConfirm && (
        <Confirm title={`Delete ${selectedIds.length} selected customers?`} danger busy={busy}
          message="All selected customer records will be removed from the system."
          confirmLabel={`Delete (${selectedIds.length})`} onConfirm={handleBulkDelete} onClose={() => setBulkConfirm(false)} />
      )}
    </>
  );
}
