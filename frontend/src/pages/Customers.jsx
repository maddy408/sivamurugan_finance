import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import DataTable from '../components/DataTable';
import { Field, Modal, Confirm, IconView, IconEdit, IconDelete } from '../components/ui';
import { useList } from '../hooks/useList';
import { useAuth } from '../state/AuthContext';
import { useToast } from '../state/ToastContext';

const emptyForm = {
  name: '', mobile: '', aadhar_number: '', alt_mobile: '', email: '', gender: '', dob: '',
  address_line1: '', nominee_name: '', nominee_relation: '', nominee_mobile: '', notes: '',
};

export default function Customers() {
  const { can } = useAuth();
  const toast = useToast();
  const list = useList('/api/customers', { initialPerPage: 10, initialSort: 'name' });

  // Left-rail create form (always visible — not a modal)
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

  const handleCreateCustomer = async (e) => {
    e.preventDefault();
    setCreateBusy(true); setCreateErrors({});
    try {
      const payload = { ...createForm };
      Object.keys(payload).forEach((k) => payload[k] === '' && delete payload[k]);
      const r = await api.post('/api/customers', payload);
      toast.success(r.message || 'Customer created successfully!');
      setCreateForm(emptyForm);
      list.reload();
    } catch (err) {
      if (err.errors) setCreateErrors(Object.fromEntries(Object.entries(err.errors).map(([k, v]) => [k, v[0]])));
      else toast.error(err.message);
    } finally {
      setCreateBusy(false);
    }
  };

  const openEdit = (row) => {
    setEditForm({ ...emptyForm, ...row });
    setEditErrors({});
    setEditModal(row);
  };

  const handleSaveEdit = async () => {
    setEditBusy(true); setEditErrors({});
    try {
      const payload = { ...editForm };
      Object.keys(payload).forEach((k) => payload[k] === '' && delete payload[k]);
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

  const doDelete = async () => {
    setBusy(true);
    try {
      await api.del(`/api/customers/${del.id}`, { reason: 'deleted from list' });
      toast.success('Customer removed');
      setDel(null); list.reload();
    } catch (e) { toast.error(e.message); } finally { setBusy(false); }
  };

  const columns = [
    { key: '_sno', header: 'S.No', render: (r, i) => (list.page - 1) * list.perPage + i + 1 },
    { key: 'name', header: 'Customer Name', sortable: true, render: (r) => <Link to={`/customers/${r.id}`}>{r.name}</Link> },
    { key: 'mobile', header: 'Mobile Number', render: (r) => r.mobile || '—' },
    { key: 'customer_code', header: 'Customer Code', sortable: true },
    { key: 'address_line1', header: 'Address', render: (r) => r.address_line1 || '—' },
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
        <h1 className="page-title"> Customers Directory</h1>
      </div>

      {/* Main 2-column layout: LEFT = permanent Register form, RIGHT = directory */}
      <div className={can('customers.create') ? 'split-panel' : ''}>
        {can('customers.create') && (
          <div className="card form-rail">
            <div className="card-head">
              <h2>Register New Customer</h2>
            </div>
            <div className="card-body">
              <form onSubmit={handleCreateCustomer}>
                {/* Full Name in its own single row */}
                <div className="floating-group">
                  <input id="c-name" value={createForm.name} onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })} required placeholder=" " />
                  <label htmlFor="c-name">Full Name *</label>
                  {createErrors.name && <span className="err" style={{ fontSize: 11, color: '#f43f5e' }}>{createErrors.name}</span>}
                </div>

                {/* Mobile in its own single row */}
                <div className="floating-group" style={{ marginTop: 8 }}>
                  <input id="c-mobile" value={createForm.mobile} onChange={(e) => setCreateForm({ ...createForm, mobile: e.target.value })} required placeholder=" " />
                  <label htmlFor="c-mobile">Mobile *</label>
                  {createErrors.mobile && <span className="err" style={{ fontSize: 11, color: '#f43f5e' }}>{createErrors.mobile}</span>}
                </div>

                {/* Aadhar Number in its own single row */}
                <div className="floating-group" style={{ marginTop: 8 }}>
                  <input id="c-aadhar" value={createForm.aadhar_number} onChange={(e) => setCreateForm({ ...createForm, aadhar_number: e.target.value })} placeholder=" " />
                  <label htmlFor="c-aadhar">Aadhar Number (Optional)</label>
                  {createErrors.aadhar_number && <span className="err" style={{ fontSize: 11, color: '#f43f5e' }}>{createErrors.aadhar_number}</span>}
                </div>

                {/* Nominee Name in its own single row */}
                <div className="floating-group" style={{ marginTop: 8 }}>
                  <input id="c-nominee" value={createForm.nominee_name} onChange={(e) => setCreateForm({ ...createForm, nominee_name: e.target.value })} placeholder=" " />
                  <label htmlFor="c-nominee">Nominee Name</label>
                  {createErrors.nominee_name && <span className="err" style={{ fontSize: 11, color: '#f43f5e' }}>{createErrors.nominee_name}</span>}
                </div>

                {/* Address in its own single row */}
                <div className="floating-group" style={{ marginTop: 8 }}>
                  <input id="c-address" value={createForm.address_line1} onChange={(e) => setCreateForm({ ...createForm, address_line1: e.target.value })} placeholder=" " />
                  <label htmlFor="c-address">Address</label>
                  {createErrors.address_line1 && <span className="err" style={{ fontSize: 11, color: '#f43f5e' }}>{createErrors.address_line1}</span>}
                </div>

                <button type="submit" className="btn" style={{ width: '100%', marginTop: 10 }} disabled={createBusy}>
                  {createBusy ? 'Saving…' : ' Register Customer'}
                </button>
              </form>
            </div>
          </div>
        )}

        <div>
          <div className="toolbar">
            <input type="search" placeholder="Search name, code, mobile, address, loan code…"
              value={list.q} onChange={(e) => list.setQ(e.target.value)} />
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
          />
        </div>
      </div>

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
            <Field label="Aadhar number (optional)" error={editErrors.aadhar_number}>
              <input value={editForm.aadhar_number || ''} onChange={(e) => setEditForm({ ...editForm, aadhar_number: e.target.value })} placeholder="12-digit Aadhar" />
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
              <input value={editForm.address_line1 || ''} onChange={(e) => setEditForm({ ...editForm, address_line1: e.target.value })} placeholder="e.g. 12 Main Road, Surandai, Tenkasi" />
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
    </>
  );
}
