import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, fmtDate } from '../api/client';
import DataTable from '../components/DataTable';
import { Field, Modal, Confirm, Spinner, IconView, IconEdit } from '../components/ui';
import { useList } from '../hooks/useList';
import { useAuth } from '../state/AuthContext';
import { useToast } from '../state/ToastContext';

const emptyCreate = { name: '', username: '', password: '', email: '', phone: '' };

export default function Employees() {
  const { can } = useAuth();
  const toast = useToast();
  const list = useList('/api/employees', { initialPerPage: 25 });

  // Left-rail create form (always visible — not a modal)
  const [createForm, setCreateForm] = useState(emptyCreate);
  const [createErrors, setCreateErrors] = useState({});
  const [createBusy, setCreateBusy] = useState(false);

  // Edit & view states
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const [viewId, setViewId] = useState(null);       // users.id to show
  const [detail, setDetail] = useState(null);       // fetched employee profile
  const [edit, setEdit] = useState(null);           // edit form state (or null)

  useEffect(() => {
    if (!viewId) { setDetail(null); return; }
    setDetail(null);
    api.get(`/api/employees/${viewId}`).then((r) => setDetail(r.data)).catch((e) => { toast.error(e.message); setViewId(null); });
  }, [viewId]);

  const openEdit = async (row) => {
    try {
      const r = await api.get(`/api/employees/${row.user_id}`);
      setEdit({
        user_id: row.user_id, name: r.data.name || '', email: r.data.email || '',
        phone: r.data.phone || '', is_active: !!r.data.is_active,
      });
    } catch (e) { toast.error(e.message); }
  };

  const saveEdit = async () => {
    setBusy(true); setCreateErrors({});
    try {
      await api.put(`/api/employees/${edit.user_id}`, {
        name: edit.name, email: edit.email || undefined, phone: edit.phone || undefined,
        is_active: edit.is_active,
      });
      toast.success('Employee updated');
      setEdit(null); list.reload();
    } catch (e) {
      if (e.errors) toast.error(Object.values(e.errors)[0][0]);
      else toast.error(e.message);
    } finally { setBusy(false); }
  };

  const handleCreateEmployee = async (e) => {
    e.preventDefault();
    setCreateBusy(true); setCreateErrors({});
    try {
      await api.post('/api/employees', createForm);
      toast.success('Employee created successfully!');
      setCreateForm(emptyCreate);
      list.reload();
    } catch (err) {
      if (err.errors) setCreateErrors(Object.fromEntries(Object.entries(err.errors).map(([k, v]) => [k, v[0]])));
      else toast.error(err.message);
    } finally { setCreateBusy(false); }
  };

  const act = async (row, action) => {
    setBusy(true);
    try {
      if (action === 'force-logout') {
        await api.post(`/api/employees/${row.user_id}/force-logout`, { reason: 'Admin force logout' });
        toast.success('All sessions terminated');
      } else if (action === 'toggle') {
        await api.post(`/api/employees/${row.user_id}/active`, { is_active: !row.is_active });
        toast.success(row.is_active ? 'Deactivated' : 'Activated');
      } else if (action === 'reset') {
        await api.post(`/api/employees/${row.user_id}/reset-password`, { password: confirm.password });
        toast.success('Password reset');
      }
      setConfirm(null); list.reload();
    } catch (e) { toast.error(e.message); } finally { setBusy(false); }
  };

  const columns = [
    { key: 'emp_code', header: 'Code' },
    { key: 'name', header: 'Name', sortable: true },
    { key: 'username', header: 'Username' },
    { key: 'phone', header: 'Phone' },
    { key: 'loan_count', header: 'Assigned chits', align: 'right' },
    { key: 'last_login_at', header: 'Last login', render: (r) => fmtDate(r.last_login_at) },
    { key: 'is_active', header: 'Status', render: (r) => <span className={`badge ${r.is_active ? 'active' : 'inactive'}`}>{r.is_active ? 'active' : 'inactive'}</span> },
    {
      key: '_a', header: 'Action', align: 'right', render: (r) => (
        <div className="action-buttons">
          <button className="btn-icon view" onClick={() => setViewId(r.user_id)} title="View Employee">
            <IconView />
          </button>
          {can('employees.edit') && (
            <button className="btn-icon edit" onClick={() => openEdit(r)} title="Edit Employee">
              <IconEdit />
            </button>
          )}
          {can('permissions.view') && <Link className="btn sm secondary" to={`/employees/${r.user_id}/permissions`}>Access</Link>}
          {can('employees.edit') && <button className="btn sm secondary" onClick={() => act(r, 'toggle')} disabled={busy}>{r.is_active ? 'Deactivate' : 'Activate'}</button>}
          {can('employees.edit') && <button className="btn sm secondary" onClick={() => setConfirm({ type: 'reset', row: r, password: '' })}>Reset PW</button>}
          {can('permissions.edit') && <button className="btn sm danger" onClick={() => setConfirm({ type: 'force', row: r })}>Force logout</button>}
        </div>
      ),
    },
  ];

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">👨‍💼 Employee Management</h1>
      </div>

      {/* Main 2-column layout: LEFT = permanent Add Employee form, RIGHT = directory */}
      <div className={can('employees.create') ? 'split-panel' : ''}>
        {can('employees.create') && (
          <div className="card form-rail">
            <div className="card-head">
              <h2>✨ Add New Employee</h2>
            </div>
            <div className="card-body">
              <form onSubmit={handleCreateEmployee}>
                <Field label="Name *" error={createErrors.name}>
                  <input value={createForm.name} onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })} required placeholder="Full Name" />
                </Field>
                <Field label="Username *" error={createErrors.username}>
                  <input value={createForm.username} onChange={(e) => setCreateForm({ ...createForm, username: e.target.value })} required placeholder="Login username" />
                </Field>
                <Field label="Password *" error={createErrors.password}>
                  <input type="password" value={createForm.password} onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })} required placeholder="Min 8 characters" />
                </Field>
                <Field label="Email" error={createErrors.email}>
                  <input value={createForm.email} onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })} placeholder="name@example.com" />
                </Field>
                <Field label="Phone" error={createErrors.phone}>
                  <input value={createForm.phone} onChange={(e) => setCreateForm({ ...createForm, phone: e.target.value })} placeholder="Mobile number" />
                </Field>
                <p className="muted" style={{ fontSize: 12, margin: '0 0 10px' }}>
                  Role is <b>Employee</b>. Employees see all customers, loans and pending dues —
                  module access is controlled from the <b>Access</b> screen.
                </p>
                <button type="submit" className="btn" style={{ width: '100%' }} disabled={createBusy}>
                  {createBusy ? 'Creating…' : '✨ Add Employee'}
                </button>
              </form>
            </div>
          </div>
        )}

        <div>
          <div className="toolbar">
            <input type="search" placeholder="Search name, username, code…" value={list.q} onChange={(e) => list.setQ(e.target.value)} />
            {list.hasFilters && <button className="btn secondary" onClick={list.clear}>Clear filters ✕</button>}
          </div>

          <DataTable
            columns={columns} rows={list.rows} loading={list.loading} error={list.error} onRetry={list.reload}
            page={list.page} perPage={list.perPage} total={list.pagination.total} totalPages={list.pagination.total_pages}
            sortBy={list.sortBy} sortDir={list.sortDir} onSort={list.onSort} onPage={list.setPage} onPerPage={list.setPerPage}
          />
        </div>
      </div>

      {viewId && (
        <Modal title="Employee details" onClose={() => setViewId(null)}
          footer={<button className="btn secondary" onClick={() => setViewId(null)}>Close</button>}>
          {!detail ? <Spinner /> : (
            <dl className="kv" style={{ gridTemplateColumns: '160px 1fr', rowGap: 8 }}>
              <dt>Name</dt><dd style={{ fontWeight: 700 }}>{detail.name}</dd>
              <dt>Employee code</dt><dd>{detail.emp_code || '—'}</dd>
              <dt>Username</dt><dd>{detail.username}</dd>
              <dt>Mobile</dt><dd>{detail.phone || '—'}</dd>
              <dt>Email</dt><dd>{detail.email || '—'}</dd>
              <dt>Role</dt><dd>Employee</dd>
              <dt>Active loans/chits</dt><dd>{detail.assigned_loans ?? 0}</dd>
              <dt>Status</dt><dd><span className={`badge ${detail.is_active ? 'active' : 'inactive'}`}>{detail.is_active ? 'Active' : 'Inactive'}</span></dd>
              <dt>Joined on</dt><dd>{fmtDate(detail.joined_on)}</dd>
              <dt>Last login</dt><dd>{fmtDate(detail.last_login_at) || 'Never'}</dd>
              <dt>Created</dt><dd>{fmtDate(detail.created_at)}</dd>
            </dl>
          )}
        </Modal>
      )}

      {edit && (
        <Modal title={`Edit ${edit.name || 'employee'}`} onClose={() => setEdit(null)}
          footer={<>
            <button className="btn secondary" onClick={() => setEdit(null)} disabled={busy}>Cancel</button>
            <button className="btn" onClick={saveEdit} disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</button>
          </>}>
          <div className="form-grid">
            <Field label="Name *" error={createErrors.name}><input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
            <Field label="Mobile" error={createErrors.phone}><input value={edit.phone} onChange={(e) => setEdit({ ...edit, phone: e.target.value })} /></Field>
            <Field label="Email" error={createErrors.email}><input value={edit.email} onChange={(e) => setEdit({ ...edit, email: e.target.value })} /></Field>
            <Field label="Status">
              <select value={edit.is_active ? '1' : '0'} onChange={(e) => setEdit({ ...edit, is_active: e.target.value === '1' })}>
                <option value="1">Active</option>
                <option value="0">Inactive</option>
              </select>
            </Field>
          </div>
        </Modal>
      )}

      {confirm?.type === 'force' && (
        <Confirm title="Force logout?" danger busy={busy}
          message={`Immediately invalidate every active session for ${confirm.row.name}. Next API call from that account is rejected with the "session terminated" message.`}
          confirmLabel="Force logout" onConfirm={() => act(confirm.row, 'force-logout')} onClose={() => setConfirm(null)} />
      )}
      {confirm?.type === 'reset' && (
        <Confirm title={`Reset password — ${confirm.row.name}`} busy={busy}
          message={<input type="password" style={{ width: '100%', padding: 8 }} placeholder="New password (min 8 chars)"
            value={confirm.password} onChange={(e) => setConfirm({ ...confirm, password: e.target.value })} />}
          confirmLabel="Reset & sign out" onConfirm={() => act(confirm.row, 'reset')} onClose={() => setConfirm(null)} />
      )}
    </>
  );
}
