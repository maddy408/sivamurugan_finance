import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import DataTable from '../components/DataTable';
import { Modal, Confirm, IconView, IconEdit, IconDelete, FieldError } from '../components/ui';
import {
  FiUser, FiPhone, FiFileText, FiUsers, FiMapPin, FiMail,
  FiSave, FiSearch, FiX, FiDownload, FiCalendar, FiShield
} from 'react-icons/fi';
import { useList } from '../hooks/useList';
import { useAuth } from '../state/AuthContext';
import { useToast } from '../state/ToastContext';
import { useI18n } from '../state/I18nContext';
import {
  validatePhone, validateAadhaar, validateEmail,
  validateText, validateDate, focusFirstError, validateIndianMobile,
  handleNumericKeyDown
} from '../utils/validation';

const emptyForm = {
  name: '', mobile: '', aadhar_number: '', alt_mobile: '', email: '', gender: '', dob: '',
  address_line1: '', nominee_name: '', nominee_relation: '', nominee_mobile: '', notes: '',
};

export default function Customers() {
  const { can } = useAuth();
  const { t, lang } = useI18n();
  const toast = useToast();
  const list = useList('/api/customers', { initialPerPage: 10, initialSort: 'name' });

  // Left-rail create form (always visible — styled like Settings Organization / Users form)
  const [createForm, setCreateForm] = useState(emptyForm);
  const [createErrors, setCreateErrors] = useState({});
  const [createBusy, setCreateBusy] = useState(false);

  // Edit modal & delete confirm state
  const [editModal, setEditModal] = useState(null);
  const [editForm, setEditForm] = useState(emptyForm);
  const [editErrors, setEditErrors] = useState({});
  const [editBusy, setEditBusy] = useState(false);
  const [del, setDel] = useState(null);
  const [busy, setBusy] = useState(false);

  const handleCreateCustomer = async (e) => {
    e.preventDefault();
    const errs = {};
    const nameErr = validateText(createForm.name, { required: true, min: 2, max: 128, fieldLabel: 'Full name' });
    if (nameErr) errs.name = nameErr;
    const mobileErr = validatePhone(createForm.mobile, false, 'Mobile number');
    if (mobileErr) errs.mobile = mobileErr;
    const aadharErr = validateAadhaar(createForm.aadhar_number, false);
    if (aadharErr) errs.aadhar_number = aadharErr;

    if (Object.keys(errs).length > 0) {
      setCreateErrors(errs);
      focusFirstError(errs);
      return;
    }

    setCreateBusy(true); setCreateErrors({});
    try {
      const payload = { ...createForm };
      Object.keys(payload).forEach((k) => payload[k] === '' && delete payload[k]);
      const r = await api.post('/api/customers', payload);
      toast.success(r.message || 'Customer created successfully!');
      setCreateForm(emptyForm);
      list.reload();
    } catch (err) {
      if (err.errors) {
        const mapped = Object.fromEntries(Object.entries(err.errors).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]));
        setCreateErrors(mapped);
        focusFirstError(mapped);
      } else {
        toast.error(err.message);
      }
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
    const errs = {};
    const nameErr = validateText(editForm.name, { required: true, min: 2, max: 128, fieldLabel: 'Full name' });
    if (nameErr) errs.name = nameErr;
    const mobileErr = validatePhone(editForm.mobile, false, 'Mobile number');
    if (mobileErr) errs.mobile = mobileErr;
    const altErr = validatePhone(editForm.alt_mobile, false, 'Alternate mobile');
    if (altErr) errs.alt_mobile = altErr;
    const aadharErr = validateAadhaar(editForm.aadhar_number, false);
    if (aadharErr) errs.aadhar_number = aadharErr;
    const emailErr = validateEmail(editForm.email, false);
    if (emailErr) errs.email = emailErr;
    const dobErr = validateDate(editForm.dob, { required: false, notFuture: true, fieldLabel: 'Date of birth' });
    if (dobErr) errs.dob = dobErr;
    const nomineeErr = validatePhone(editForm.nominee_mobile, false, 'Nominee mobile');
    if (nomineeErr) errs.nominee_mobile = nomineeErr;

    if (Object.keys(errs).length > 0) {
      setEditErrors(errs);
      focusFirstError(errs);
      return;
    }

    setEditBusy(true); setEditErrors({});
    try {
      const payload = { ...editForm };
      Object.keys(payload).forEach((k) => payload[k] === '' && delete payload[k]);
      await api.put(`/api/customers/${editModal.id}`, payload);
      toast.success('Customer updated');
      setEditModal(null);
      list.reload();
    } catch (e) {
      if (e.errors) {
        const mapped = Object.fromEntries(Object.entries(e.errors).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]));
        setEditErrors(mapped);
        focusFirstError(mapped);
      } else {
        toast.error(e.message);
      }
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
    {
      key: 'name', header: 'Customer Name', sortable: true,
      render: (r) => (
        <Link to={`/customers/${r.id}`} style={{ fontWeight: 700, color: '#1d4ed8' }}>
          {r.name}
        </Link>
      )
    },
    { key: 'mobile', header: 'Mobile Number', render: (r) => r.mobile || '—' },
    { key: 'customer_code', header: 'Customer Code', sortable: true, render: (r) => <code>{r.customer_code}</code> },
    {
      key: 'address_line1',
      header: 'Address',
      render: (r) => (
        <span style={{ display: 'inline-block', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', verticalAlign: 'middle' }} title={r.address_line1}>
          {r.address_line1 || '—'}
        </span>
      )
    },
    { key: 'active_loans', header: 'Active Loans', align: 'right' },
    { key: 'status', header: 'Status', render: (r) => <span className={`badge ${r.status}`}>{r.status}</span> },
    {
      key: '_a', header: 'Action', align: 'right', width: 96, render: (r) => (
        <div className="action-buttons" style={{ display: 'flex', gap: 4, justifyContent: 'flex-end', alignItems: 'center' }}>
          <Link className="btn-icon view" to={`/customers/${r.id}`} title={t('View Profile', 'View Profile')}>
            <IconView />
          </Link>
          {can('customers.edit') && (
            <button className="btn-icon edit" onClick={() => openEdit(r)} title={t('Edit Customer', 'Edit Customer')}>
              <IconEdit />
            </button>
          )}
          {can('customers.delete') && (
            <button className="btn-icon delete" onClick={() => setDel(r)} title={t('Delete Customer', 'Delete Customer')}>
              <IconDelete />
            </button>
          )}
        </div>
      ),
    },
  ];

  const totalMembersCount = list.pagination.total || list.rows.length;
  const activeLoansCount = list.rows.reduce((sum, r) => sum + Number(r.active_loans || 0), 0);

  return (
    <>
      {/* Page Header (Matching Settings / Expenses / Pending Theme) */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 10,
            background: '#e0edfd', color: '#1d4ed8',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 20, fontWeight: 900, flexShrink: 0
          }}>
            <FiUsers size={20} />
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em' }}>
              {t('Customers Directory', 'Customers Directory')}
            </h1>
            <p style={{ margin: '2px 0 0', fontSize: 12.5, color: '#64748b', fontWeight: 500 }}>
              {t('Manage member profiles, nominee details & contact records', 'Manage member profiles, nominee details & contact records')}
            </p>
          </div>
        </div>
      </div>

      {/* 2 Executive Stat Cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 280px))',
        gap: 12,
        marginBottom: 14,
        maxWidth: 600
      }}>
        {/* TOTAL MEMBERS */}
        <div className="card" style={{
          position: 'relative', overflow: 'hidden', padding: '10px 16px',
          borderLeft: '4px solid #2563eb', background: '#ffffff',
          borderRadius: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.03)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 10.5, fontWeight: 800, color: '#1d4ed8', letterSpacing: '0.5px', textTransform: 'uppercase' }}>
                {t('TOTAL REGISTERED MEMBERS', 'TOTAL REGISTERED MEMBERS')}
              </div>
              <div style={{ fontSize: 20, fontWeight: 900, color: '#0f172a', margin: '2px 0 1px' }}>
                {totalMembersCount}
              </div>
              <div style={{ fontSize: 11, color: '#64748b' }}>
                {t('Member profiles in directory', 'Member profiles in directory')}
              </div>
            </div>
            <div style={{
              width: 32, height: 32, borderRadius: '50%',
              background: '#e0edfd', color: '#1d4ed8',
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
              <FiUsers size={16} />
            </div>
          </div>
          <div style={{ position: 'absolute', right: -6, bottom: -8, opacity: 0.05, pointerEvents: 'none' }}>
            <FiUsers size={56} color="#1d4ed8" />
          </div>
        </div>

        {/* ACTIVE LOANS */}
        <div className="card" style={{
          position: 'relative', overflow: 'hidden', padding: '10px 16px',
          borderLeft: '4px solid #10b981', background: '#ffffff',
          borderRadius: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.03)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 10.5, fontWeight: 800, color: '#059669', letterSpacing: '0.5px', textTransform: 'uppercase' }}>
                {t('ACTIVE RUNNING CHITS', 'ACTIVE RUNNING CHITS')}
              </div>
              <div style={{ fontSize: 20, fontWeight: 900, color: '#0f172a', margin: '2px 0 1px' }}>
                {activeLoansCount}
              </div>
              <div style={{ fontSize: 11, color: '#64748b' }}>
                {t('Currently active subscriptions', 'Currently active subscriptions')}
              </div>
            </div>
            <div style={{
              width: 32, height: 32, borderRadius: '50%',
              background: '#dcfce7', color: '#059669',
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
              <FiCalendar size={16} />
            </div>
          </div>
          <div style={{ position: 'absolute', right: -6, bottom: -8, opacity: 0.05, pointerEvents: 'none' }}>
            <FiCalendar size={56} color="#059669" />
          </div>
        </div>
      </div>

      {/* Main 2-column layout: LEFT = Register form, RIGHT = Directory */}
      <div className="users-page-grid">
        {can('customers.create') && (
          <div className="card" style={{ padding: 0, overflow: 'hidden', borderRadius: 14, boxShadow: '0 4px 16px rgba(0,0,0,0.04)' }}>
            {/* Header Banner Matching Settings Theme */}
            <div style={{
              background: 'linear-gradient(135deg, #0d2856 0%, #1d4ed8 100%)',
              padding: '12px 18px',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              color: '#ffffff',
              position: 'relative',
              overflow: 'hidden'
            }}>
              <div style={{
                width: 34, height: 34, borderRadius: 9,
                background: 'rgba(255, 255, 255, 0.15)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                border: '1px solid rgba(255, 255, 255, 0.25)',
                color: '#facc15'
              }}>
                <FiUser size={16} />
              </div>
              <div>
                <h2 style={{ margin: 0, fontSize: 15, fontWeight: 900, color: '#ffffff' }}>{t('Register New Customer', 'Register New Customer')}</h2>
                <p style={{ margin: '1px 0 0', fontSize: 11.5, color: 'rgba(255, 255, 255, 0.85)' }}>{t('Create member profile & nominee', 'Create member profile & nominee')}</p>
              </div>
            </div>

            <div style={{ padding: '14px 18px' }}>
              <form onSubmit={handleCreateCustomer}>
                {/* Full Name */}
                <div className="form-field-group">
                  <label className="form-field-label">{t('Full Name *', 'Full Name *')}</label>
                  <div className="input-with-icon">
                    <div className="input-icon-pill"><FiUser size={13} /></div>
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
                      placeholder={t('Customer full name', 'Customer full name')}
                    />
                  </div>
                  <FieldError error={createErrors.name} />
                </div>

                {/* Mobile */}
                <div className="form-field-group">
                  <label className="form-field-label">{t('Mobile Number', 'Mobile Number')}</label>
                  <div className="input-with-icon">
                    <div className="input-icon-pill"><FiPhone size={13} /></div>
                    <input
                      name="mobile"
                      type="tel"
                      inputMode="numeric"
                      maxLength={10}
                      value={createForm.mobile}
                      onKeyDown={handleNumericKeyDown}
                      onChange={(e) => {
                        const v = e.target.value.replace(/\D/g, '').slice(0, 10);
                        setCreateForm({ ...createForm, mobile: v });
                        if (createErrors.mobile && !validatePhone(v, false, 'Mobile number')) {
                          setCreateErrors((errs) => {
                            const next = { ...errs };
                            delete next.mobile;
                            return next;
                          });
                        }
                      }}
                      onBlur={(e) => {
                        const err = validatePhone(e.target.value, false, 'Mobile number');
                        setCreateErrors((errs) => {
                          const next = { ...errs };
                          if (err) next.mobile = err;
                          else delete next.mobile;
                          return next;
                        });
                      }}
                      aria-invalid={!!createErrors.mobile}
                      className={createErrors.mobile ? 'is-invalid' : ''}
                      placeholder={t('10-digit mobile number', '10-digit mobile number')}
                    />
                  </div>
                  <FieldError error={createErrors.mobile} />
                </div>

                {/* Aadhar Number */}
                <div className="form-field-group">
                  <label className="form-field-label">{t('Aadhar Number', 'Aadhar Number')}</label>
                  <div className="input-with-icon">
                    <div className="input-icon-pill"><FiFileText size={13} /></div>
                    <input
                      name="aadhar_number"
                      type="text"
                      inputMode="numeric"
                      maxLength={12}
                      value={createForm.aadhar_number}
                      onKeyDown={handleNumericKeyDown}
                      onChange={(e) => {
                        const v = e.target.value.replace(/\D/g, '').slice(0, 12);
                        setCreateForm({ ...createForm, aadhar_number: v });
                        if (createErrors.aadhar_number && !validateAadhaar(v, false)) {
                          setCreateErrors((errs) => {
                            const next = { ...errs };
                            delete next.aadhar_number;
                            return next;
                          });
                        }
                      }}
                      onBlur={(e) => {
                        const err = validateAadhaar(e.target.value, false);
                        setCreateErrors((errs) => {
                          const next = { ...errs };
                          if (err) next.aadhar_number = err;
                          else delete next.aadhar_number;
                          return next;
                        });
                      }}
                      aria-invalid={!!createErrors.aadhar_number}
                      className={createErrors.aadhar_number ? 'is-invalid' : ''}
                      placeholder={t('12-digit Aadhar number', '12-digit Aadhar number')}
                    />
                  </div>
                  <FieldError error={createErrors.aadhar_number} />
                </div>

                {/* Nominee Name */}
                <div className="form-field-group">
                  <label className="form-field-label">{t('Nominee Name', 'Nominee Name')}</label>
                  <div className="input-with-icon">
                    <div className="input-icon-pill"><FiUsers size={13} /></div>
                    <input
                      value={createForm.nominee_name}
                      onChange={(e) => setCreateForm({ ...createForm, nominee_name: e.target.value })}
                      placeholder={t('Nominee / contact person', 'Nominee / contact person')}
                    />
                  </div>
                  {createErrors.nominee_name && <span className="err" style={{ fontSize: 10.5, color: '#f43f5e', marginTop: 2 }}>{createErrors.nominee_name}</span>}
                </div>

                {/* Address */}
                <div className="form-field-group">
                  <label className="form-field-label">{t('Address', 'Address')}</label>
                  <div className="input-with-icon">
                    <div className="input-icon-pill"><FiMapPin size={13} /></div>
                    <input
                      value={createForm.address_line1}
                      onChange={(e) => setCreateForm({ ...createForm, address_line1: e.target.value })}
                      placeholder={t('Town / City, Tamil Nadu', 'Town / City, Tamil Nadu')}
                    />
                  </div>
                  {createErrors.address_line1 && <span className="err" style={{ fontSize: 10.5, color: '#f43f5e', marginTop: 2 }}>{createErrors.address_line1}</span>}
                </div>

                <button
                  type="submit"
                  className="btn-save-glow"
                  style={{ width: '100%', marginTop: 8, justifyContent: 'center' }}
                  disabled={createBusy}
                >
                  <FiSave size={14} /> {createBusy ? t('Saving…', 'Saving…') : t('Save Customer', 'Register Customer')}
                </button>
              </form>
            </div>
          </div>
        )}

        <div>
          {/* Toolbar with Single Icon Search */}
          <div className="toolbar" style={{ marginBottom: 10 }}>
            <div className="input-with-icon" style={{ flex: 1 }}>
              <div className="input-icon-pill"><FiSearch size={13} /></div>
              <input
                type="search"
                placeholder={t('Search name, code, mobile, address, loan code…', 'Search name, code, mobile, address, loan code…')}
                value={list.q}
                onChange={(e) => list.setQ(e.target.value)}
              />
            </div>
            <select
              value={list.filters.status || ''}
              onChange={(e) => list.setFilter('status', e.target.value)}
              style={{ height: 36, borderRadius: 18, border: '1.5px solid #cbd5e1', fontSize: 12.5, padding: '0 12px', background: '#fff' }}
            >
              <option value="">{t('Any status', 'Any status')}</option>
              <option value="active">{t('Active', 'Active')}</option>
              <option value="inactive">{t('Inactive', 'Inactive')}</option>
              <option value="blacklisted">{t('Blacklisted', 'Blacklisted')}</option>
            </select>
            {list.hasFilters && (
              <button className="btn secondary sm" onClick={list.clear} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                {t('Clear', 'Clear')} <FiX size={12} />
              </button>
            )}
            <div style={{ flex: 1 }} />
            {can('customers.export') && (
              <button
                type="button"
                onClick={() => api.download('/api/export/customers', { q: list.q, ...list.filters }).catch((e) => toast.error(e.message))}
                style={{
                  height: 36, borderRadius: 18, border: '1.5px solid #10b981',
                  background: '#f0fdf4', color: '#059669', fontSize: 12, fontWeight: 700,
                  padding: '0 14px', display: 'inline-flex', alignItems: 'center', gap: 6,
                  cursor: 'pointer', transition: 'all 0.15s ease'
                }}
              >
                <FiDownload size={13} style={{ color: '#059669' }} /> {t('Export Excel', 'Export Excel')}
              </button>
            )}
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
            emptyTitle={t("No customers match your filters", "No customers match your filters")}
            emptyHint={t("Register a new member using the form on the left or clear your search criteria.", "Register a new member using the form on the left or clear your search criteria.")}
          />
        </div>
      </div>

      {/* Edit Customer Modal with Settings Theme */}
      {editModal && (
        <Modal
          title={`${t('Edit', 'Edit')} ${editModal.name}`}
          size="lg"
          onClose={() => setEditModal(null)}
          footer={
            <>
              <button className="btn secondary sm" onClick={() => setEditModal(null)} disabled={editBusy}>{t('Cancel', 'Cancel')}</button>
              <button className="btn-save-glow" onClick={handleSaveEdit} disabled={editBusy}>
                <FiSave size={14} /> {editBusy ? t('Saving…', 'Saving…') : t('Save Changes', 'Save Changes')}
              </button>
            </>
          }
        >
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '8px 16px' }}>
            <div className="form-field-group">
              <label className="form-field-label">Full Name *</label>
              <div className="input-with-icon">
                <div className="input-icon-pill"><FiUser size={13} /></div>
                <input
                  name="name"
                  value={editForm.name}
                  onChange={(e) => {
                    const v = e.target.value;
                    setEditForm({ ...editForm, name: v });
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
              <label className="form-field-label">Mobile Number</label>
              <div className="input-with-icon">
                <div className="input-icon-pill"><FiPhone size={13} /></div>
                <input
                  name="mobile"
                  type="tel"
                  inputMode="numeric"
                  maxLength={10}
                  value={editForm.mobile || ''}
                  onKeyDown={handleNumericKeyDown}
                  onChange={(e) => {
                    const v = e.target.value.replace(/\D/g, '').slice(0, 10);
                    setEditForm({ ...editForm, mobile: v });
                    if (editErrors.mobile && !validatePhone(v, false, 'Mobile number')) {
                      setEditErrors((errs) => {
                        const next = { ...errs };
                        delete next.mobile;
                        return next;
                      });
                    }
                  }}
                  onBlur={(e) => {
                    const err = validatePhone(e.target.value, false, 'Mobile number');
                    setEditErrors((errs) => {
                      const next = { ...errs };
                      if (err) next.mobile = err;
                      else delete next.mobile;
                      return next;
                    });
                  }}
                  aria-invalid={!!editErrors.mobile}
                  className={editErrors.mobile ? 'is-invalid' : ''}
                  placeholder={t('10-digit mobile number', '10-digit mobile number')}
                />
              </div>
              <FieldError error={editErrors.mobile} />
            </div>

            <div className="form-field-group">
              <label className="form-field-label">{t('Aadhar Number', 'Aadhar Number')}</label>
              <div className="input-with-icon">
                <div className="input-icon-pill"><FiFileText size={13} /></div>
                <input
                  name="aadhar_number"
                  type="text"
                  inputMode="numeric"
                  maxLength={12}
                  value={editForm.aadhar_number || ''}
                  onKeyDown={handleNumericKeyDown}
                  onChange={(e) => {
                    const v = e.target.value.replace(/\D/g, '').slice(0, 12);
                    setEditForm({ ...editForm, aadhar_number: v });
                    if (editErrors.aadhar_number && !validateAadhaar(v, false)) {
                      setEditErrors((errs) => {
                        const next = { ...errs };
                        delete next.aadhar_number;
                        return next;
                      });
                    }
                  }}
                  onBlur={(e) => {
                    const err = validateAadhaar(e.target.value, false);
                    setEditErrors((errs) => {
                      const next = { ...errs };
                      if (err) next.aadhar_number = err;
                      else delete next.aadhar_number;
                      return next;
                    });
                  }}
                  aria-invalid={!!editErrors.aadhar_number}
                  className={editErrors.aadhar_number ? 'is-invalid' : ''}
                  placeholder={t('12-digit Aadhar number', '12-digit Aadhar number')}
                />
              </div>
              <FieldError error={editErrors.aadhar_number} />
            </div>

            <div className="form-field-group">
              <label className="form-field-label">{t('Alternate Mobile', 'Alternate Mobile')}</label>
              <div className="input-with-icon">
                <div className="input-icon-pill"><FiPhone size={13} /></div>
                <input
                  name="alt_mobile"
                  type="tel"
                  inputMode="numeric"
                  maxLength={10}
                  value={editForm.alt_mobile || ''}
                  onKeyDown={handleNumericKeyDown}
                  onChange={(e) => {
                    const v = e.target.value.replace(/\D/g, '').slice(0, 10);
                    setEditForm({ ...editForm, alt_mobile: v });
                    if (editErrors.alt_mobile && !validatePhone(v, false, 'Alternate mobile')) {
                      setEditErrors((errs) => {
                        const next = { ...errs };
                        delete next.alt_mobile;
                        return next;
                      });
                    }
                  }}
                  onBlur={(e) => {
                    const err = validatePhone(e.target.value, false, 'Alternate mobile');
                    setEditErrors((errs) => {
                      const next = { ...errs };
                      if (err) next.alt_mobile = err;
                      else delete next.alt_mobile;
                      return next;
                    });
                  }}
                  aria-invalid={!!editErrors.alt_mobile}
                  className={editErrors.alt_mobile ? 'is-invalid' : ''}
                  placeholder={t('10-digit mobile number', '10-digit mobile number')}
                />
              </div>
              <FieldError error={editErrors.alt_mobile} />
            </div>

            <div className="form-field-group">
              <label className="form-field-label">Email Address</label>
              <div className="input-with-icon">
                <div className="input-icon-pill"><FiMail size={13} /></div>
                <input
                  name="email"
                  type="email"
                  value={editForm.email || ''}
                  onChange={(e) => {
                    const v = e.target.value;
                    setEditForm({ ...editForm, email: v });
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
              <label className="form-field-label">Gender</label>
              <div className="input-with-icon">
                <div className="input-icon-pill"><FiUser size={13} /></div>
                <select value={editForm.gender} onChange={(e) => setEditForm({ ...editForm, gender: e.target.value })}>
                  <option value="">—</option><option value="male">Male</option>
                  <option value="female">Female</option><option value="other">Other</option>
                </select>
              </div>
            </div>

            <div className="form-field-group">
              <label className="form-field-label">Date of Birth</label>
              <div className="input-with-icon">
                <div className="input-icon-pill"><FiCalendar size={13} /></div>
                <input
                  name="dob"
                  type="date"
                  value={editForm.dob || ''}
                  onChange={(e) => {
                    const v = e.target.value;
                    setEditForm({ ...editForm, dob: v });
                    if (editErrors.dob && !validateDate(v, { required: false, notFuture: true, fieldLabel: 'Date of birth' })) {
                      setEditErrors((errs) => {
                        const next = { ...errs };
                        delete next.dob;
                        return next;
                      });
                    }
                  }}
                  onBlur={(e) => {
                    const err = validateDate(e.target.value, { required: false, notFuture: true, fieldLabel: 'Date of birth' });
                    setEditErrors((errs) => {
                      const next = { ...errs };
                      if (err) next.dob = err;
                      else delete next.dob;
                      return next;
                    });
                  }}
                  aria-invalid={!!editErrors.dob}
                  className={editErrors.dob ? 'is-invalid' : ''}
                />
              </div>
              <FieldError error={editErrors.dob} />
            </div>

            <div className="form-field-group">
              <label className="form-field-label">Address</label>
              <div className="input-with-icon">
                <div className="input-icon-pill"><FiMapPin size={13} /></div>
                <input value={editForm.address_line1 || ''} onChange={(e) => setEditForm({ ...editForm, address_line1: e.target.value })} placeholder="Town, Tamil Nadu" />
              </div>
            </div>

            <div className="form-field-group">
              <label className="form-field-label">Nominee Name</label>
              <div className="input-with-icon">
                <div className="input-icon-pill"><FiUsers size={13} /></div>
                <input value={editForm.nominee_name} onChange={(e) => setEditForm({ ...editForm, nominee_name: e.target.value })} />
              </div>
            </div>

            <div className="form-field-group">
              <label className="form-field-label">Nominee Relation</label>
              <div className="input-with-icon">
                <div className="input-icon-pill"><FiUsers size={13} /></div>
                <input value={editForm.nominee_relation} onChange={(e) => setEditForm({ ...editForm, nominee_relation: e.target.value })} />
              </div>
            </div>

            <div className="form-field-group">
              <label className="form-field-label">Nominee Mobile</label>
              <div className="input-with-icon">
                <div className="input-icon-pill"><FiPhone size={13} /></div>
                <input
                  name="nominee_mobile"
                  type="tel"
                  inputMode="numeric"
                  maxLength={10}
                  value={editForm.nominee_mobile || ''}
                  onKeyDown={handleNumericKeyDown}
                  onChange={(e) => {
                    const v = e.target.value.replace(/\D/g, '').slice(0, 10);
                    setEditForm({ ...editForm, nominee_mobile: v });
                    if (editErrors.nominee_mobile && !validateIndianMobile(v, false)) {
                      setEditErrors((errs) => {
                        const next = { ...errs };
                        delete next.nominee_mobile;
                        return next;
                      });
                    }
                  }}
                  onBlur={(e) => {
                    const err = validateIndianMobile(e.target.value, false);
                    setEditErrors((errs) => {
                      const next = { ...errs };
                      if (err) next.nominee_mobile = err;
                      else delete next.nominee_mobile;
                      return next;
                    });
                  }}
                  aria-invalid={!!editErrors.nominee_mobile}
                  className={editErrors.nominee_mobile ? 'is-invalid' : ''}
                  placeholder={t('10-digit mobile number', '10-digit mobile number')}
                />
              </div>
              {editErrors.nominee_mobile && <span className="field-error-msg err">{editErrors.nominee_mobile}</span>}
            </div>

            <div className="form-field-group">
              <label className="form-field-label">{t('Status', 'Status')}</label>
              <div className="input-with-icon">
                <div className="input-icon-pill"><FiShield size={13} /></div>
                <select value={editForm.status || 'active'} onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}>
                  <option value="active">{t('Active', 'Active')}</option>
                  <option value="inactive">{t('Inactive', 'Inactive')}</option>
                  <option value="blacklisted">{t('Blacklisted', 'Blacklisted')}</option>
                </select>
              </div>
            </div>
          </div>
          <div className="form-field-group" style={{ marginTop: 10 }}>
            <label className="form-field-label">{t('Notes', 'Notes')}</label>
            <div className="input-with-icon">
              <div className="input-icon-pill"><FiFileText size={13} /></div>
              <input value={editForm.notes} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} placeholder={t('Customer remarks', 'Customer remarks')} />
            </div>
          </div>
        </Modal>
      )}

      {del && (
        <Confirm title={`${t('Delete', 'Delete')} ${del.name}?`} danger busy={busy}
          message={t("The customer record will be removed.", "The customer record will be removed.")}
          confirmLabel={t("Delete", "Delete")} onConfirm={doDelete} onClose={() => setDel(null)} />
      )}
    </>
  );
}
