import { useEffect, useState } from 'react';
import { api, fmtDate } from '../api/client';
import DataTable from '../components/DataTable';
import { Modal, Confirm, Spinner } from '../components/ui';
import {
  FiUsers, FiX, FiUser, FiLock, FiPhone, FiMail, FiShield,
  FiSave, FiCheckCircle, FiSearch, FiEdit2, FiEye, FiTrash2, FiPower
} from 'react-icons/fi';
import { useList } from '../hooks/useList';
import { useAuth } from '../state/AuthContext';
import { useToast } from '../state/ToastContext';

const emptyCreate = { name: '', username: '', password: '', email: '', phone: '', role: 'EMPLOYEE' };

export default function Employees() {
  const { can } = useAuth();
  const toast = useToast();
  const list = useList('/api/employees', { initialPerPage: 25 });

  const [createForm, setCreateForm] = useState(emptyCreate);
  const [createErrors, setCreateErrors] = useState({});
  const [createBusy, setCreateBusy] = useState(false);

  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const [viewId, setViewId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [edit, setEdit] = useState(null);

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
      toast.success('User updated');
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
      toast.success('User created successfully!');
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
    { key: 'emp_code', header: 'Code', render: (r) => r.emp_code || '—' },
    { key: 'name', header: 'Name', sortable: true },
    { key: 'username', header: 'Username' },
    { key: 'role', header: 'Role', render: (r) => <span className={`badge ${r.role === 'ADMIN' ? 'COMPLETED' : 'PENDING'}`}>{r.role_name || r.role}</span> },
    { key: 'phone', header: 'Phone' },
    { key: 'is_active', header: 'Status', render: (r) => <span className={`badge ${r.is_active ? 'active' : 'inactive'}`}>{r.is_active ? 'Active' : 'Inactive'}</span> },
    {
      key: '_a', header: 'Action', align: 'right', render: (r) => (
        <div className="action-buttons">
          <button className="btn-icon view" onClick={() => setViewId(r.user_id)} title="View User"><FiEye size={13} /></button>
          {can('employees.edit') && (
            <button className="btn-icon edit" onClick={() => openEdit(r)} title="Edit User"><FiEdit2 size={13} /></button>
          )}
          {can('employees.delete') && (
            <button className="btn-icon" onClick={() => act(r, 'toggle')} title={r.is_active ? 'Deactivate' : 'Activate'}>
              <FiPower size={13} style={{ color: r.is_active ? '#dc2626' : '#16a34a' }} />
            </button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div style={{ display: 'grid', gridTemplateColumns: can('employees.create') ? 'minmax(300px, 360px) 1fr' : '1fr', gap: 16, alignItems: 'start' }}>
      {/* Create User Form Rail (Designed Exactly Like Organization Page) */}
      {can('employees.create') && (
        <div className="card" style={{ padding: 0, overflow: 'hidden', borderRadius: 16, boxShadow: '0 4px 16px rgba(0,0,0,0.04)' }}>
          {/* Header Banner */}
          <div style={{
            background: 'linear-gradient(135deg, #0d2856 0%, #1d4ed8 100%)',
            padding: '12px 18px',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            color: '#ffffff',
            position: 'relative',
            overflow: 'hidden'
          }}>
            <div style={{
              width: 38, height: 38, borderRadius: 10,
              background: 'rgba(255, 255, 255, 0.15)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              border: '1px solid rgba(255, 255, 255, 0.25)',
              color: '#facc15'
            }}>
              <FiUsers size={18} />
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: 16, fontWeight: 900, color: '#ffffff' }}>Register New User</h2>
              <p style={{ margin: '2px 0 0', fontSize: 11.5, color: 'rgba(255, 255, 255, 0.85)' }}>Create user account &amp; assign role</p>
            </div>
          </div>

          <div style={{ padding: '16px 18px' }}>
            <form onSubmit={handleCreateEmployee}>
              {/* Full Name */}
              <div className="form-field-group">
                <label className="form-field-label">Full Name *</label>
                <div className="input-with-icon">
                  <div className="input-icon-pill"><FiUser /></div>
                  <input
                    value={createForm.name}
                    onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                    required
                    placeholder="Full Name"
                  />
                </div>
                {createErrors.name && <span className="err" style={{ fontSize: 11, color: '#f43f5e', marginTop: 4 }}>{createErrors.name}</span>}
              </div>

              {/* Username */}
              <div className="form-field-group">
                <label className="form-field-label">Login Username *</label>
                <div className="input-with-icon">
                  <div className="input-icon-pill"><FiLock /></div>
                  <input
                    value={createForm.username}
                    onChange={(e) => setCreateForm({ ...createForm, username: e.target.value })}
                    required
                    placeholder="Username"
                  />
                </div>
                {createErrors.username && <span className="err" style={{ fontSize: 11, color: '#f43f5e', marginTop: 4 }}>{createErrors.username}</span>}
              </div>

              {/* Password */}
              <div className="form-field-group">
                <label className="form-field-label">Password *</label>
                <div className="input-with-icon">
                  <div className="input-icon-pill"><FiLock /></div>
                  <input
                    type="password"
                    value={createForm.password}
                    onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })}
                    required
                    placeholder="Min 8 characters"
                  />
                </div>
                {createErrors.password && <span className="err" style={{ fontSize: 11, color: '#f43f5e', marginTop: 4 }}>{createErrors.password}</span>}
              </div>

              {/* Role */}
              <div className="form-field-group">
                <label className="form-field-label">System Role *</label>
                <div className="input-with-icon">
                  <div className="input-icon-pill"><FiShield /></div>
                  <select
                    value={createForm.role}
                    onChange={(e) => setCreateForm({ ...createForm, role: e.target.value })}
                    required
                  >
                    <option value="ADMIN">Admin (Full Access)</option>
                    <option value="EMPLOYEE">Employee (Staff)</option>
                  </select>
                </div>
                {createErrors.role && <span className="err" style={{ fontSize: 11, color: '#f43f5e', marginTop: 4 }}>{createErrors.role}</span>}
              </div>

              {/* Phone */}
              <div className="form-field-group">
                <label className="form-field-label">Phone Number</label>
                <div className="input-with-icon">
                  <div className="input-icon-pill"><FiPhone /></div>
                  <input
                    value={createForm.phone}
                    onChange={(e) => setCreateForm({ ...createForm, phone: e.target.value })}
                    placeholder="Mobile number"
                  />
                </div>
                {createErrors.phone && <span className="err" style={{ fontSize: 11, color: '#f43f5e', marginTop: 4 }}>{createErrors.phone}</span>}
              </div>

              <button
                type="submit"
                className="btn-save-glow"
                style={{ width: '100%', marginTop: 8, justifyContent: 'center' }}
                disabled={createBusy}
              >
                <FiSave size={15} /> {createBusy ? 'Creating…' : 'Create User'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Right Column: Users List Table */}
      <div>
        <div className="toolbar" style={{ marginBottom: 12 }}>
          <div className="input-with-icon" style={{ flex: 1 }}>
            <div className="input-icon-pill"><FiSearch /></div>
            <input
              type="search"
              placeholder="Search name, username, code, phone…"
              value={list.q}
              onChange={(e) => list.setQ(e.target.value)}
            />
          </div>
          {list.hasFilters && (
            <button className="btn secondary sm" onClick={list.clear} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              Clear <FiX size={12} />
            </button>
          )}
        </div>

        <DataTable
          columns={columns} rows={list.rows} loading={list.loading} error={list.error} onRetry={list.reload}
          page={list.page} perPage={list.perPage} total={list.pagination.total} totalPages={list.pagination.total_pages}
          sortBy={list.sortBy} sortDir={list.sortDir} onSort={list.onSort} onPage={list.setPage} onPerPage={list.setPerPage}
        />
      </div>

      {/* View User Modal */}
      {viewId && (
        <Modal title="User Details" onClose={() => setViewId(null)}
          footer={<button className="btn secondary sm" onClick={() => setViewId(null)}>Close</button>}>
          {!detail ? <Spinner /> : (
            <dl className="kv" style={{ gridTemplateColumns: '150px 1fr', rowGap: 8 }}>
              <dt>Name</dt><dd style={{ fontWeight: 700 }}>{detail.name}</dd>
              <dt>Employee code</dt><dd>{detail.emp_code || '—'}</dd>
              <dt>Username</dt><dd>{detail.username}</dd>
              <dt>Mobile</dt><dd>{detail.phone || '—'}</dd>
              <dt>Email</dt><dd>{detail.email || '—'}</dd>
              <dt>Role</dt><dd>{detail.role_name || detail.role}</dd>
              <dt>Active loans/chits</dt><dd>{detail.assigned_loans ?? 0}</dd>
              <dt>Status</dt><dd><span className={`badge ${detail.is_active ? 'active' : 'inactive'}`}>{detail.is_active ? 'Active' : 'Inactive'}</span></dd>
              <dt>Joined on</dt><dd>{fmtDate(detail.joined_on)}</dd>
              <dt>Last login</dt><dd>{fmtDate(detail.last_login_at) || 'Never'}</dd>
            </dl>
          )}
        </Modal>
      )}

      {/* Edit User Modal with Single-Icon Inputs & Glowing Button */}
      {edit && (
        <Modal title={`Edit ${edit.name || 'User'}`} onClose={() => setEdit(null)}
          footer={<>
            <button className="btn secondary" onClick={() => setEdit(null)} disabled={busy}>Cancel</button>
            <button className="btn-save-glow" onClick={saveEdit} disabled={busy}>{busy ? 'Saving…' : 'Save Changes'}</button>
          </>}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="form-field-group">
              <label className="form-field-label">Name *</label>
              <div className="input-with-icon">
                <div className="input-icon-pill"><FiUser /></div>
                <input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
              </div>
            </div>
            <div className="form-field-group">
              <label className="form-field-label">Mobile</label>
              <div className="input-with-icon">
                <div className="input-icon-pill"><FiPhone /></div>
                <input value={edit.phone} onChange={(e) => setEdit({ ...edit, phone: e.target.value })} />
              </div>
            </div>
            <div className="form-field-group">
              <label className="form-field-label">Email</label>
              <div className="input-with-icon">
                <div className="input-icon-pill"><FiMail /></div>
                <input value={edit.email} onChange={(e) => setEdit({ ...edit, email: e.target.value })} />
              </div>
            </div>
            <div className="form-field-group">
              <label className="form-field-label">Status</label>
              <div className="input-with-icon">
                <div className="input-icon-pill"><FiCheckCircle /></div>
                <select value={edit.is_active ? '1' : '0'} onChange={(e) => setEdit({ ...edit, is_active: e.target.value === '1' })}>
                  <option value="1">Active</option>
                  <option value="0">Inactive</option>
                </select>
              </div>
            </div>
          </div>
        </Modal>
      )}

      {confirm?.type === 'force' && (
        <Confirm title="Force logout?" danger busy={busy}
          message={`Immediately invalidate every active session for ${confirm.row.name}.`}
          confirmLabel="Force logout" onConfirm={() => act(confirm.row, 'force-logout')} onClose={() => setConfirm(null)} />
      )}
      {confirm?.type === 'reset' && (
        <Confirm title={`Reset password — ${confirm.row.name}`} busy={busy}
          message={<input type="password" style={{ width: '100%', padding: 8 }} placeholder="New password (min 8 chars)"
            value={confirm.password} onChange={(e) => setConfirm({ ...confirm, password: e.target.value })} />}
          confirmLabel="Reset & sign out" onConfirm={() => act(confirm.row, 'reset')} onClose={() => setConfirm(null)} />
      )}
    </div>
  );
}