import { useEffect, useState } from 'react';
import { api, fmtDate } from '../api/client';
import DataTable from '../components/DataTable';
import { Modal, Confirm, Spinner, FieldError } from '../components/ui';
import {
  FiUsers, FiX, FiUser, FiLock, FiPhone, FiMail, FiShield,
  FiSave, FiCheckCircle, FiSearch, FiEdit2, FiEye, FiTrash2, FiPower
} from 'react-icons/fi';
import { useList } from '../hooks/useList';
import { useAuth } from '../state/AuthContext';
import { useToast } from '../state/ToastContext';
import { useI18n } from '../state/I18nContext';
import {
  validatePhone, validateEmail, validateText,
  validatePassword, validateSelect, focusFirstError, validateIndianMobile,
  handleNumericKeyDown
} from '../utils/validation';

const emptyCreate = { name: '', username: '', password: '', email: '', phone: '', role: 'EMPLOYEE' };

export default function Employees() {
  const { can } = useAuth();
  const { t, lang } = useI18n();
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
  const [editErrors, setEditErrors] = useState({});

  useEffect(() => {
    if (!viewId) { setDetail(null); return; }
    setDetail(null);
    api.get(`/api/employees/${viewId}`).then((r) => setDetail(r.data)).catch((e) => { toast.error(e.message); setViewId(null); });
  }, [viewId]);

  const openEdit = async (row) => {
    setEditErrors({});
    try {
      const r = await api.get(`/api/employees/${row.user_id}`);
      setEdit({
        user_id: row.user_id, name: r.data.name || '', email: r.data.email || '',
        phone: r.data.phone || '', is_active: !!r.data.is_active,
      });
    } catch (e) { toast.error(e.message); }
  };

  const saveEdit = async () => {
    const errs = {};
    const nameErr = validateText(edit.name, { required: true, min: 2, max: 128, fieldLabel: 'Full name' });
    if (nameErr) errs.name = nameErr;
    const phoneErr = validatePhone(edit.phone, false, 'Mobile number');
    if (phoneErr) errs.phone = phoneErr;
    const emailErr = validateEmail(edit.email, false);
    if (emailErr) errs.email = emailErr;

    if (Object.keys(errs).length > 0) {
      setEditErrors(errs);
      focusFirstError(errs);
      return;
    }
    setBusy(true); setEditErrors({});
    try {
      await api.put(`/api/employees/${edit.user_id}`, {
        name: edit.name, email: edit.email || undefined, phone: edit.phone || undefined,
        is_active: edit.is_active,
      });
      toast.success('User updated');
      setEdit(null); list.reload();
    } catch (e) {
      if (e.errors) {
        const mapped = Object.fromEntries(Object.entries(e.errors).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]));
        setEditErrors(mapped);
        focusFirstError(mapped);
        toast.error(Object.values(mapped)[0]);
      } else {
        toast.error(e.message);
      }
    } finally { setBusy(false); }
  };

  const handleCreateEmployee = async (e) => {
    e.preventDefault();
    const errs = {};
    const nameErr = validateText(createForm.name, { required: true, min: 2, max: 128, fieldLabel: 'Full name' });
    if (nameErr) errs.name = nameErr;
    const usernameErr = validateText(createForm.username, { required: true, min: 3, max: 64, fieldLabel: 'Username' });
    if (usernameErr) errs.username = usernameErr;
    else if (/\s/.test(createForm.username)) errs.username = 'Username cannot contain spaces.';
    const passwordErr = validatePassword(createForm.password, { required: true, min: 8, fieldLabel: 'Password' });
    if (passwordErr) errs.password = passwordErr;
    const roleErr = validateSelect(createForm.role, 'System role');
    if (roleErr) errs.role = roleErr;
    const phoneErr = validatePhone(createForm.phone, false, 'Phone number');
    if (phoneErr) errs.phone = phoneErr;
    const emailErr = validateEmail(createForm.email, false);
    if (emailErr) errs.email = emailErr;

    if (Object.keys(errs).length > 0) {
      setCreateErrors(errs);
      focusFirstError(errs);
      return;
    }

    setCreateBusy(true); setCreateErrors({});
    try {
      await api.post('/api/employees', createForm);
      toast.success('User created successfully!');
      setCreateForm(emptyCreate);
      list.reload();
    } catch (err) {
      if (err.errors) {
        const mapped = Object.fromEntries(Object.entries(err.errors).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]));
        setCreateErrors(mapped);
        focusFirstError(mapped);
      } else {
        toast.error(err.message);
      }
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
    { key: 'emp_code', header: t('Code', 'Code'), render: (r) => r.emp_code || '—' },
    { key: 'name', header: t('Name', 'Name'), sortable: true },
    { key: 'username', header: t('Username', 'Username') },
    { key: 'role', header: t('Role', 'Role'), render: (r) => <span className={`badge ${r.role === 'ADMIN' ? 'COMPLETED' : 'PENDING'}`}>{t(r.role_name || r.role, r.role_name || r.role)}</span> },
    { key: 'phone', header: t('Phone', 'Phone') },
    { key: 'is_active', header: t('Status', 'Status'), render: (r) => <span className={`badge ${r.is_active ? 'active' : 'inactive'}`}>{r.is_active ? t('Active', 'Active') : t('Inactive', 'Inactive')}</span> },
    {
      key: '_a', header: t('Action', 'Action'), align: 'right', render: (r) => (
        <div className="action-buttons">
          <button className="btn-icon view" onClick={() => setViewId(r.user_id)} title={t('View User', 'View User')}><FiEye size={13} /></button>
          {can('employees.edit') && (
            <button className="btn-icon edit" onClick={() => openEdit(r)} title={t('Edit User', 'Edit User')}><FiEdit2 size={13} /></button>
          )}
          {can('employees.delete') && (
            <button className="btn-icon" onClick={() => act(r, 'toggle')} title={r.is_active ? t('Deactivate', 'Deactivate') : t('Activate', 'Activate')}>
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
              <h2 style={{ margin: 0, fontSize: 16, fontWeight: 900, color: '#ffffff' }}>{t('Register New User', 'Register New User')}</h2>
              <p style={{ margin: '2px 0 0', fontSize: 11.5, color: 'rgba(255, 255, 255, 0.85)' }}>{t('Create user account & assign role', 'Create user account & assign role')}</p>
            </div>
          </div>

          <div style={{ padding: '16px 18px' }}>
            <form onSubmit={handleCreateEmployee}>
              {/* Full Name */}
              <div className="form-field-group">
                <label className="form-field-label">{t('Full Name *', 'Full Name *')}</label>
                <div className="input-with-icon">
                  <div className="input-icon-pill"><FiUser /></div>
                  <input
                    name="name"
                    value={createForm.name}
                    onChange={(e) => {
                      const v = e.target.value;
                      setCreateForm({ ...createForm, name: v });
                      if (createErrors.name && !validateText(v, { required: true, min: 2, max: 128, fieldLabel: 'Full name' })) {
                        setCreateErrors((errs) => {
                          const next = { ...errs };
                          delete next.name;
                          return next;
                        });
                      }
                    }}
                    onBlur={(e) => {
                      const err = validateText(e.target.value, { required: true, min: 2, max: 128, fieldLabel: 'Full name' });
                      setCreateErrors((errs) => {
                        const next = { ...errs };
                        if (err) next.name = err;
                        else delete next.name;
                        return next;
                      });
                    }}
                    aria-invalid={!!createErrors.name}
                    className={createErrors.name ? 'is-invalid' : ''}
                    placeholder={t('Full Name', 'Full Name')}
                  />
                </div>
                <FieldError error={createErrors.name} />
              </div>

              {/* Username */}
              <div className="form-field-group">
                <label className="form-field-label">{t('Login Username *', 'Login Username *')}</label>
                <div className="input-with-icon">
                  <div className="input-icon-pill"><FiLock /></div>
                  <input
                    name="username"
                    value={createForm.username}
                    onChange={(e) => {
                      const v = e.target.value;
                      setCreateForm({ ...createForm, username: v });
                      if (createErrors.username) {
                        const textErr = validateText(v, { required: true, min: 3, max: 64, fieldLabel: 'Username' });
                        const spaceErr = /\s/.test(v) ? 'Username cannot contain spaces.' : '';
                        if (!textErr && !spaceErr) {
                          setCreateErrors((errs) => {
                            const next = { ...errs };
                            delete next.username;
                            return next;
                          });
                        }
                      }
                    }}
                    onBlur={(e) => {
                      const textErr = validateText(e.target.value, { required: true, min: 3, max: 64, fieldLabel: 'Username' });
                      const spaceErr = /\s/.test(e.target.value) ? 'Username cannot contain spaces.' : '';
                      const err = textErr || spaceErr;
                      setCreateErrors((errs) => {
                        const next = { ...errs };
                        if (err) next.username = err;
                        else delete next.username;
                        return next;
                      });
                    }}
                    aria-invalid={!!createErrors.username}
                    className={createErrors.username ? 'is-invalid' : ''}
                    placeholder={t('Username', 'Username')}
                  />
                </div>
                <FieldError error={createErrors.username} />
              </div>

              {/* Password */}
              <div className="form-field-group">
                <label className="form-field-label">{t('Password *', 'Password *')}</label>
                <div className="input-with-icon">
                  <div className="input-icon-pill"><FiLock /></div>
                  <input
                    name="password"
                    type="password"
                    value={createForm.password}
                    onChange={(e) => {
                      const v = e.target.value;
                      setCreateForm({ ...createForm, password: v });
                      if (createErrors.password && !validatePassword(v, { required: true, min: 8, fieldLabel: 'Password' })) {
                        setCreateErrors((errs) => {
                          const next = { ...errs };
                          delete next.password;
                          return next;
                        });
                      }
                    }}
                    onBlur={(e) => {
                      const err = validatePassword(e.target.value, { required: true, min: 8, fieldLabel: 'Password' });
                      setCreateErrors((errs) => {
                        const next = { ...errs };
                        if (err) next.password = err;
                        else delete next.password;
                        return next;
                      });
                    }}
                    aria-invalid={!!createErrors.password}
                    className={createErrors.password ? 'is-invalid' : ''}
                    placeholder={t('Min 8 characters', 'Min 8 characters')}
                  />
                </div>
                <FieldError error={createErrors.password} />
              </div>

              {/* Role */}
              <div className="form-field-group">
                <label className="form-field-label">{t('System Role *', 'System Role *')}</label>
                <div className="input-with-icon">
                  <div className="input-icon-pill"><FiShield /></div>
                  <select
                    name="role"
                    value={createForm.role}
                    onChange={(e) => {
                      setCreateForm({ ...createForm, role: e.target.value });
                      if (createErrors.role) {
                        setCreateErrors((errs) => {
                          const next = { ...errs };
                          delete next.role;
                          return next;
                        });
                      }
                    }}
                    className={createErrors.role ? 'is-invalid' : ''}
                  >
                    <option value="ADMIN">{t('Admin (Full Access)', 'Admin (Full Access)')}</option>
                    <option value="EMPLOYEE">{t('Employee (Staff)', 'Employee (Staff)')}</option>
                  </select>
                </div>
                <FieldError error={createErrors.role} />
              </div>

              {/* Phone */}
              <div className="form-field-group">
                <label className="form-field-label">{t('Phone Number', 'Phone Number')}</label>
                <div className="input-with-icon">
                  <div className="input-icon-pill"><FiPhone /></div>
                  <input
                    name="phone"
                    type="tel"
                    inputMode="numeric"
                    maxLength={10}
                    value={createForm.phone || ''}
                    onKeyDown={handleNumericKeyDown}
                    onChange={(e) => {
                      const v = e.target.value.replace(/\D/g, '').slice(0, 10);
                      setCreateForm({ ...createForm, phone: v });
                      if (createErrors.phone && !validatePhone(v, false, 'Phone number')) {
                        setCreateErrors((errs) => {
                          const next = { ...errs };
                          delete next.phone;
                          return next;
                        });
                      }
                    }}
                    onBlur={(e) => {
                      const err = validatePhone(e.target.value, false, 'Phone number');
                      setCreateErrors((errs) => {
                        const next = { ...errs };
                        if (err) next.phone = err;
                        else delete next.phone;
                        return next;
                      });
                    }}
                    aria-invalid={!!createErrors.phone}
                    className={createErrors.phone ? 'is-invalid' : ''}
                    placeholder="10-digit mobile number"
                  />
                </div>
                <FieldError error={createErrors.phone} />
              </div>

              <button
                type="submit"
                className="btn-save-glow"
                style={{ width: '100%', marginTop: 8, justifyContent: 'center' }}
                disabled={createBusy}
              >
                <FiSave size={15} /> {createBusy ? t('Creating…', 'Creating…') : t('Create User', 'Create User')}
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
              placeholder={t('Search name, username, code, phone…', 'Search name, username, code, phone…')}
              value={list.q}
              onChange={(e) => list.setQ(e.target.value)}
            />
          </div>
          {list.hasFilters && (
            <button className="btn secondary sm" onClick={list.clear} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              {t('Clear', 'Clear')} <FiX size={12} />
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
        <Modal title={t('User Details', 'User Details')} onClose={() => setViewId(null)}
          footer={<button className="btn secondary sm" onClick={() => setViewId(null)}>{t('Close', 'Close')}</button>}>
          {!detail ? <Spinner /> : (
            <dl className="kv" style={{ gridTemplateColumns: '150px 1fr', rowGap: 8 }}>
              <dt>{t('Name', 'Name')}</dt><dd style={{ fontWeight: 700 }}>{detail.name}</dd>
              <dt>{t('Code', 'Employee code')}</dt><dd>{detail.emp_code || '—'}</dd>
              <dt>{t('Username', 'Username')}</dt><dd>{detail.username}</dd>
              <dt>{t('Mobile', 'Mobile')}</dt><dd>{detail.phone || '—'}</dd>
              <dt>{t('Email', 'Email')}</dt><dd>{detail.email || '—'}</dd>
              <dt>{t('Role', 'Role')}</dt><dd>{t(detail.role_name || detail.role, detail.role_name || detail.role)}</dd>
              <dt>{t('Active Loans', 'Active loans/chits')}</dt><dd>{detail.assigned_loans ?? 0}</dd>
              <dt>{t('Status', 'Status')}</dt><dd><span className={`badge ${detail.is_active ? 'active' : 'inactive'}`}>{detail.is_active ? t('Active', 'Active') : t('Inactive', 'Inactive')}</span></dd>
              <dt>{t('Joined on', 'Joined on')}</dt><dd>{fmtDate(detail.joined_on)}</dd>
              <dt>{t('Last login', 'Last login')}</dt><dd>{fmtDate(detail.last_login_at) || t('Never', 'Never')}</dd>
            </dl>
          )}
        </Modal>
      )}

      {/* Edit User Modal with Single-Icon Inputs & Glowing Button */}
      {edit && (
        <Modal title={t(`Edit ${edit.name || 'User'}`, `Edit ${edit.name || 'User'}`)} onClose={() => setEdit(null)}
          footer={<>
            <button className="btn secondary" onClick={() => setEdit(null)} disabled={busy}>{t('Cancel', 'Cancel')}</button>
            <button className="btn-save-glow" onClick={saveEdit} disabled={busy}>{busy ? t('Saving…', 'Saving…') : t('Save Changes', 'Save Changes')}</button>
          </>}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="form-field-group">
              <label className="form-field-label">Name *</label>
              <div className="input-with-icon">
                <div className="input-icon-pill"><FiUser /></div>
                <input
                  name="name"
                  value={edit.name}
                  onChange={(e) => {
                    const v = e.target.value;
                    setEdit({ ...edit, name: v });
                    if (editErrors.name && !validateText(v, { required: true, min: 2, max: 128, fieldLabel: 'Full name' })) {
                      setEditErrors((errs) => {
                        const next = { ...errs };
                        delete next.name;
                        return next;
                      });
                    }
                  }}
                  onBlur={(e) => {
                    const err = validateText(e.target.value, { required: true, min: 2, max: 128, fieldLabel: 'Full name' });
                    setEditErrors((errs) => {
                      const next = { ...errs };
                      if (err) next.name = err;
                      else delete next.name;
                      return next;
                    });
                  }}
                  aria-invalid={!!editErrors.name}
                  className={editErrors.name ? 'is-invalid' : ''}
                />
              </div>
              <FieldError error={editErrors.name} />
            </div>
            <div className="form-field-group">
              <label className="form-field-label">Mobile</label>
              <div className="input-with-icon">
                <div className="input-icon-pill"><FiPhone /></div>
                <input
                  name="phone"
                  type="tel"
                  inputMode="numeric"
                  maxLength={10}
                  value={edit.phone || ''}
                  onKeyDown={handleNumericKeyDown}
                  onChange={(e) => {
                    const v = e.target.value.replace(/\D/g, '').slice(0, 10);
                    setEdit({ ...edit, phone: v });
                    if (editErrors.phone && !validatePhone(v, false, 'Mobile number')) {
                      setEditErrors((errs) => {
                        const next = { ...errs };
                        delete next.phone;
                        return next;
                      });
                    }
                  }}
                  onBlur={(e) => {
                    const err = validatePhone(e.target.value, false, 'Mobile number');
                    setEditErrors((errs) => {
                      const next = { ...errs };
                      if (err) next.phone = err;
                      else delete next.phone;
                      return next;
                    });
                  }}
                  aria-invalid={!!editErrors.phone}
                  className={editErrors.phone ? 'is-invalid' : ''}
                  placeholder="10-digit mobile number"
                />
              </div>
              <FieldError error={editErrors.phone} />
            </div>
            <div className="form-field-group">
              <label className="form-field-label">Email</label>
              <div className="input-with-icon">
                <div className="input-icon-pill"><FiMail /></div>
                <input
                  name="email"
                  type="email"
                  value={edit.email}
                  onChange={(e) => {
                    const v = e.target.value;
                    setEdit({ ...edit, email: v });
                    if (editErrors.email && !validateEmail(v, false)) {
                      setEditErrors((errs) => {
                        const next = { ...errs };
                        delete next.email;
                        return next;
                      });
                    }
                  }}
                  onBlur={(e) => {
                    const err = validateEmail(e.target.value, false);
                    setEditErrors((errs) => {
                      const next = { ...errs };
                      if (err) next.email = err;
                      else delete next.email;
                      return next;
                    });
                  }}
                  aria-invalid={!!editErrors.email}
                  className={editErrors.email ? 'is-invalid' : ''}
                />
              </div>
              <FieldError error={editErrors.email} />
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