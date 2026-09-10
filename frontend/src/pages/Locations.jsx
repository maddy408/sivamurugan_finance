import { useState } from 'react';
import { api } from '../api/client';
import DataTable from '../components/DataTable';
import { Field, Modal, Confirm, Spinner } from '../components/ui';
import { useList } from '../hooks/useList';
import { useAuth } from '../state/AuthContext';
import { useToast } from '../state/ToastContext';

export default function Locations() {
  const { can, refreshMeta } = useAuth();
  const toast = useToast();
  const list = useList('/api/locations', { initialPerPage: 25 });
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({ code: '', name: '', district: '', state: '', pincode: '', notes: '' });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState(null);   // { loading, data }
  const [del, setDel] = useState(null);

  const openCreate = () => { setForm({ code: '', name: '', district: '', state: '', pincode: '', notes: '' }); setErrors({}); setModal({ mode: 'create' }); };
  const openEdit = (r) => { setForm({ ...r }); setErrors({}); setModal({ mode: 'edit', row: r }); };

  const openView = async (r) => {
    setView({ loading: true });
    try {
      const res = await api.get(`/api/locations/${r.id}`);
      setView({ loading: false, data: res.data });
    } catch (e) { toast.error(e.message); setView(null); }
  };

  const save = async () => {
    setBusy(true); setErrors({});
    try {
      if (modal.mode === 'create') await api.post('/api/locations', form);
      else await api.put(`/api/locations/${modal.row.id}`, form);
      toast.success('Saved');
      setModal(null);
      list.reload();
      await refreshMeta();   // so location dropdowns everywhere pick it up immediately
    } catch (e) {
      if (e.errors) setErrors(Object.fromEntries(Object.entries(e.errors).map(([k, v]) => [k, v[0]])));
      else toast.error(e.message);
    } finally { setBusy(false); }
  };

  const doDelete = async () => {
    setBusy(true);
    try {
      await api.del(`/api/locations/${del.id}`, { reason: 'deleted from list' });
      toast.success('Location deleted');
      setDel(null);
      list.reload();
      await refreshMeta();
    } catch (e) { toast.error(e.message); } finally { setBusy(false); }
  };

  const columns = [
    { key: 'code', header: 'Code', sortable: true },
    { key: 'name', header: 'Name', sortable: true },
    { key: 'district', header: 'District' },
    { key: 'state', header: 'State' },
    { key: 'customer_count', header: 'Customers', align: 'right' },
    { key: 'is_active', header: 'Status', render: (r) => <span className={`badge ${r.is_active ? 'active' : 'inactive'}`}>{r.is_active ? 'active' : 'inactive'}</span> },
    {
      key: '_a', header: '', align: 'right', render: (r) => (
        <>
          <button className="btn sm secondary" onClick={() => openView(r)}>View</button>{' '}
          {can('locations.edit') && <button className="btn sm secondary" onClick={() => openEdit(r)}>Edit</button>}{' '}
          {can('locations.delete') && <button className="btn sm danger" onClick={() => setDel(r)}>Delete</button>}
        </>
      ),
    },
  ];

  return (
    <>
      <div className="toolbar">
        <input type="search" placeholder="Search name, code, district…" value={list.q} onChange={(e) => list.setQ(e.target.value)} />
        {list.hasFilters && <button className="btn secondary" onClick={list.clear}>Clear filters ✕</button>}
        <div style={{ flex: 1 }} />
        {can('locations.view') && <button className="btn secondary" onClick={() => api.download('/api/export/locations', {}).catch((e) => toast.error(e.message))}>Export Excel</button>}
        {can('locations.create') && <button className="btn" onClick={openCreate}>+ New location</button>}
      </div>
      <DataTable
        columns={columns} rows={list.rows} loading={list.loading} error={list.error} onRetry={list.reload}
        page={list.page} perPage={list.perPage} total={list.pagination.total} totalPages={list.pagination.total_pages}
        sortBy={list.sortBy} sortDir={list.sortDir} onSort={list.onSort} onPage={list.setPage} onPerPage={list.setPerPage}
      />

      {modal && (
        <Modal title={modal.mode === 'create' ? '📍 New location' : `Edit ${modal.row.name}`} size="lg" onClose={() => setModal(null)}
          footer={<>
            <button className="btn secondary" onClick={() => setModal(null)} disabled={busy}>Cancel</button>
            <button className="btn" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
          </>}>
          <div className="form-grid">
            <Field label="Code *" error={errors.code}>
              <input value={form.code} disabled={modal.mode === 'edit'} onChange={(e) => setForm({ ...form, code: e.target.value })} />
            </Field>
            <Field label="Name *" error={errors.name}><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
            <Field label="District" error={errors.district}><input value={form.district || ''} onChange={(e) => setForm({ ...form, district: e.target.value })} /></Field>
            <Field label="State" error={errors.state}><input value={form.state || ''} onChange={(e) => setForm({ ...form, state: e.target.value })} /></Field>
            <Field label="Pincode" error={errors.pincode}><input value={form.pincode || ''} onChange={(e) => setForm({ ...form, pincode: e.target.value })} /></Field>
            {modal.mode === 'edit' && (
              <Field label="Active">
                <select value={form.is_active ? '1' : '0'} onChange={(e) => setForm({ ...form, is_active: e.target.value === '1' })}>
                  <option value="1">Active</option><option value="0">Inactive</option>
                </select>
              </Field>
            )}
          </div>
          <Field label="Notes" error={errors.notes}><textarea rows={2} value={form.notes || ''} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
        </Modal>
      )}

      {view && (
        <Modal title={view.loading ? 'Location' : view.data.name} onClose={() => setView(null)}
          footer={<button className="btn secondary" onClick={() => setView(null)}>Close</button>}>
          {view.loading ? <Spinner /> : (
            <>
              <dl className="kv">
                <dt>Code</dt><dd>{view.data.code}</dd>
                <dt>Name</dt><dd>{view.data.name}</dd>
                <dt>District</dt><dd>{view.data.district || '—'}</dd>
                <dt>State</dt><dd>{view.data.state || '—'}</dd>
                <dt>Pincode</dt><dd>{view.data.pincode || '—'}</dd>
                <dt>Status</dt><dd>{view.data.is_active ? 'Active' : 'Inactive'}</dd>
                <dt>Customers</dt><dd>{view.data.customer_count}</dd>
                <dt>Chits</dt><dd>{view.data.chit_count}</dd>
                {view.data.notes && <><dt>Notes</dt><dd>{view.data.notes}</dd></>}
              </dl>
              <div className="section-title">Assigned employees</div>
              {view.data.employees?.length ? (
                <ul style={{ margin: 0, paddingLeft: 18 }}>
                  {view.data.employees.map((e) => (
                    <li key={e.employee_id}>{e.name} ({e.emp_code}) {e.is_active ? '' : '— inactive'}</li>
                  ))}
                </ul>
              ) : <p className="muted" style={{ margin: 0 }}>No employees mapped to this location yet.</p>}
            </>
          )}
        </Modal>
      )}

      {del && (
        <Confirm title={`Delete ${del.name}?`} danger busy={busy}
          message="Blocked if customers or chits are still mapped to this location. Employee mappings are removed."
          confirmLabel="Delete" onConfirm={doDelete} onClose={() => setDel(null)} />
      )}
    </>
  );
}
