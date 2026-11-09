import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, money, fmtDate } from '../api/client';
import DataTable from '../components/DataTable';
import { Confirm, Field, FieldError, Modal, IconView, IconEdit, IconDelete } from '../components/ui';
import CustomScheduleModal from '../components/CustomScheduleModal';
import { validateSelect, validateDate, validateAmount, validateInteger, focusFirstError } from '../utils/validation';
import { useList } from '../hooks/useList';
import { useAuth } from '../state/AuthContext';
import { useToast } from '../state/ToastContext';
import { useI18n } from '../state/I18nContext';
import {
  FiFileText, FiX, FiPlusCircle, FiDownload, FiUser, FiCalendar,
  FiDollarSign, FiClock, FiSearch, FiFilter, FiCheckCircle, FiGrid, FiPieChart
} from 'react-icons/fi';

const today = () => new Date().toISOString().slice(0, 10);
const initialForm = {
  customer_id: '', code: '', principal_amount: '', installment_amount: '', tenure: '',
  frequency: 'weekly', start_date: today(), schedule_type: 'WEEKLY', notes: '',
  due_date_mode: 'auto',
};

export default function Loans() {
  const { can } = useAuth();
  const { t, lang } = useI18n();
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
  const [nextCode, setNextCode] = useState('');
  const [formErrors, setFormErrors] = useState({});
  const [formBusy, setFormBusy] = useState(false);
  const [customRows, setCustomRows] = useState([]);
  const [addCustomRow, setAddCustomRow] = useState(false);
  const [editErrors, setEditErrors] = useState({});

  useEffect(() => {
    if (can('loans.create')) {
      api.get('/api/customers', { params: { per_page: 500, sort_by: 'name' } }).then((r) => setCustomers(r.data)).catch(() => {});
      api.get('/api/loans/next-code').then((r) => setNextCode(r.data.next_code)).catch(() => {});
    }
  }, [can]);

  const setF = (k, v) => {
    setForm((f) => ({ ...f, [k]: v }));
    if (formErrors[k]) {
      setFormErrors((prev) => {
        const next = { ...prev };
        delete next[k];
        return next;
      });
    }
  };
  const selectedCustomer = customers.find((c) => String(c.id) === String(form.customer_id));

  const SCHEDULE_FOR_FREQ = { daily: 'DAILY', weekly: 'WEEKLY', monthly: 'MONTHLY_DAILY' };
  const setFrequency = (v) => setForm((f) => ({
    ...f,
    frequency: v,
    schedule_type: v === 'monthly' && f.schedule_type?.startsWith('MONTHLY_') ? f.schedule_type : SCHEDULE_FOR_FREQ[v],
  }));

  const handleCreateChit = async (e) => {
    e.preventDefault();
    const errs = {};
    if (!form.customer_id) errs.customer_id = 'Please select a customer.';
    const dateErr = validateDate(form.start_date, { required: true, fieldLabel: 'Start date' });
    if (dateErr) errs.start_date = dateErr;
    const amtErr = validateAmount(form.principal_amount, { required: true, min: 1, fieldLabel: 'Chit amount' });
    if (amtErr) errs.principal_amount = amtErr;
    const instErr = validateAmount(form.installment_amount, { required: true, min: 0.01, fieldLabel: 'Installment amount' });
    if (instErr) errs.installment_amount = instErr;
    const tenureErr = validateInteger(form.tenure, { required: true, min: 1, fieldLabel: 'Tenure' });
    if (tenureErr) errs.tenure = tenureErr;

    if (Object.keys(errs).length > 0) {
      setFormErrors(errs);
      focusFirstError(errs);
      return;
    }
    setFormErrors({});
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
        due_date_mode: form.due_date_mode,
        code: form.code.trim() || undefined,
        notes: form.notes || undefined,
      };
      const r = await api.post('/api/loans', payload);

      // Custom Due Date: send every queued installment row now that the chit exists.
      if (form.due_date_mode === 'custom' && customRows.length) {
        for (const row of customRows) {
          try {
            await api.post(`/api/loans/${r.data.id}/custom-schedule`, row);
          } catch (rowErr) {
            toast.error(`Installment #${row.installment_no}: ${rowErr.message}`);
          }
        }
      }

      toast.success(`Chit ${r.data.code} created successfully!`);
      setForm(initialForm);
      setCustomRows([]);
      api.get('/api/loans/next-code').then((res) => setNextCode(res.data.next_code)).catch(() => {});
      list.reload();
    } catch (err) {
      if (err.errors) {
        const mapped = Object.fromEntries(Object.entries(err.errors).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]));
        setFormErrors(mapped);
        focusFirstError(mapped);
      } else {
        toast.error(err.message);
      }
    } finally {
      setFormBusy(false);
    }
  };

  const openEdit = async (loanRow) => {
    try {
      setBusy(true);
      setEditErrors({});
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
    const errs = {};
    const instErr = validateAmount(edit.installment_amount, { required: true, min: 0.01, fieldLabel: 'Installment amount' });
    if (instErr) errs.installment_amount = instErr;
    const amtErr = validateAmount(edit.principal_amount, { required: true, min: 0, fieldLabel: 'Chit amount' });
    if (amtErr) errs.principal_amount = amtErr;
    const tenureErr = validateInteger(edit.tenure, { required: true, min: 1, fieldLabel: 'Tenure' });
    if (tenureErr) errs.tenure = tenureErr;
    const dateErr = validateDate(edit.start_date, { required: true, fieldLabel: 'Start date' });
    if (dateErr) errs.start_date = dateErr;

    if (Object.keys(errs).length > 0) {
      setEditErrors(errs);
      focusFirstError(errs);
      return;
    }
    setEditErrors({});
    setEditBusy(true);
    try {
      const body = {
        code: edit.code && edit.code.trim() ? edit.code.trim() : undefined,
        status: edit.status,
        installment_amount: Number(edit.installment_amount),
        principal_amount: Number(edit.principal_amount),
        tenure: Number(edit.tenure),
        start_date: edit.start_date,
        schedule_type: edit.schedule_type,
        frequency: edit.frequency,
        notes: edit.notes || undefined,
      };
      const r = await api.put(`/api/loans/${edit.id}`, body);
      toast.success(`Updated chit`);
      setEdit(null);
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

        </div>
      )
    },
    {
      key: 'customer_name',
      header: 'Customer & Address',
      render: (r) => (
        <div>
          <Link to={`/customers/${r.customer_id}`} style={{ fontWeight: 700, color: '#0f172a', display: 'block' }}>
            {r.customer_name}
          </Link>
          <div style={{ fontSize: '12px', color: '#64748b' }}>

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

          </div>
        </div>
      )
    },
    {
      key: 'outstanding_balance',
      header: 'Remaining Balance',
      align: 'right',
      render: (r) => (
        <div>
          <b style={{ color: Number(r.outstanding_balance) > 0 ? '#f43f5e' : '#10b981', fontSize: '12px' }}>
            {money(r.outstanding_balance)}
          </b>

        </div>
      )
    },
    { key: 'status', header: 'Status', render: (r) => <span className={`badge ${r.status}`}>{r.status}</span> },
    {
      key: '_a', header: 'Action', align: 'right', width: 96, render: (r) => (
        <div className="action-buttons" style={{ display: 'flex', gap: 4, justifyContent: 'flex-end', alignItems: 'center' }}>
          <Link className="btn-icon view" to={`/loans/${r.id}`} title={t('View Details', 'View Details')}>
            <IconView />
          </Link>
          {can('loans.edit') && (
            <button className="btn-icon edit" onClick={() => openEdit(r)} title={t('Edit Chit & Status', 'Edit Chit & Status')}>
              <IconEdit />
            </button>
          )}
          {can('loans.delete') && (
            <button className="btn-icon delete" onClick={() => setDel(r)} title={t('Delete Chit', 'Delete Chit')}>
              <IconDelete />
            </button>
          )}
        </div>
      ),
    },
  ];

  const totalChitsCount = list.pagination.total || list.rows.length;
  const activeChitsCount = list.rows.filter((r) => String(r.status).toLowerCase() === 'active').length;
  const totalOutstandingSum = list.rows.reduce((sum, r) => sum + Number(r.outstanding_balance || 0), 0);

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
            <FiPieChart size={20} />
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em' }}>
              {t('Chits Management', 'Chits Management')}
            </h1>
            <p style={{ margin: '2px 0 0', fontSize: 12.5, color: '#64748b', fontWeight: 500 }}>
              {t('Create new chits, track active chit schedules & manage repayments', 'Create new chits, track active chit schedules & manage repayments')}
            </p>
          </div>
        </div>
      </div>

      {/* 3 Executive Stat Cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 280px))',
        gap: 12,
        marginBottom: 14,
        maxWidth: 880
      }}>
        {/* TOTAL CHITS */}
        <div className="card" style={{
          position: 'relative', overflow: 'hidden', padding: '10px 16px',
          borderLeft: '4px solid #2563eb', background: '#ffffff',
          borderRadius: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.03)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 10.5, fontWeight: 800, color: '#1d4ed8', letterSpacing: '0.5px', textTransform: 'uppercase' }}>
                {t('TOTAL CHITS', 'TOTAL CHITS')}
              </div>
              <div style={{ fontSize: 20, fontWeight: 900, color: '#0f172a', margin: '2px 0 1px' }}>
                {totalChitsCount}
              </div>
              <div style={{ fontSize: 11, color: '#64748b' }}>
                {t('Total registered chits in portfolio', 'Total registered chits in portfolio')}
              </div>
            </div>
            <div style={{
              width: 32, height: 32, borderRadius: '50%',
              background: '#e0edfd', color: '#1d4ed8',
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
              <FiPieChart size={16} />
            </div>
          </div>
          <div style={{ position: 'absolute', right: -6, bottom: -8, opacity: 0.05, pointerEvents: 'none' }}>
            <FiPieChart size={56} color="#1d4ed8" />
          </div>
        </div>

        {/* ACTIVE CHITS */}
        <div className="card" style={{
          position: 'relative', overflow: 'hidden', padding: '10px 16px',
          borderLeft: '4px solid #10b981', background: '#ffffff',
          borderRadius: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.03)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 10.5, fontWeight: 800, color: '#059669', letterSpacing: '0.5px', textTransform: 'uppercase' }}>
                {t('ACTIVE CHITS', 'ACTIVE CHITS')}
              </div>
              <div style={{ fontSize: 20, fontWeight: 900, color: '#0f172a', margin: '2px 0 1px' }}>
                {activeChitsCount}
              </div>
              <div style={{ fontSize: 11, color: '#64748b' }}>
                {t('Currently active ongoing chits', 'Currently active ongoing chits')}
              </div>
            </div>
            <div style={{
              width: 32, height: 32, borderRadius: '50%',
              background: '#dcfce7', color: '#059669',
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
              <FiCheckCircle size={16} />
            </div>
          </div>
          <div style={{ position: 'absolute', right: -6, bottom: -8, opacity: 0.05, pointerEvents: 'none' }}>
            <FiCheckCircle size={56} color="#059669" />
          </div>
        </div>

        {/* OUTSTANDING BALANCE */}
        <div className="card" style={{
          position: 'relative', overflow: 'hidden', padding: '10px 16px',
          borderLeft: '4px solid #f43f5e', background: '#ffffff',
          borderRadius: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.03)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 10.5, fontWeight: 800, color: '#e11d48', letterSpacing: '0.5px', textTransform: 'uppercase' }}>
                {t('TOTAL OUTSTANDING', 'TOTAL OUTSTANDING')}
              </div>
              <div style={{ fontSize: 20, fontWeight: 900, color: '#0f172a', margin: '2px 0 1px' }}>
                {money(totalOutstandingSum)}
              </div>
              <div style={{ fontSize: 11, color: '#64748b' }}>
                {t('Remaining balance across listed chits', 'Remaining balance across listed chits')}
              </div>
            </div>
            <div style={{
              width: 32, height: 32, borderRadius: '50%',
              background: '#fee2e2', color: '#e11d48',
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
              <FiDollarSign size={16} />
            </div>
          </div>
          <div style={{
            position: 'absolute', right: 4, bottom: -10, opacity: 0.06,
            fontSize: 56, fontWeight: 900, color: '#e11d48', pointerEvents: 'none'
          }}>
            ₹
          </div>
        </div>
      </div>

      {/* Main 2-column layout: LEFT = permanent Create form, RIGHT = ledger */}
      <div className={can('loans.create') ? 'users-page-grid' : ''}>
        {can('loans.create') && (
          <div className="card" style={{ padding: 0, overflow: 'hidden', borderRadius: 14, boxShadow: '0 4px 16px rgba(0,0,0,0.04)' }}>
            {/* Header Banner Matching Settings & Customers Theme */}
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
                <FiPlusCircle size={16} />
              </div>
              <div>
                <h2 style={{ margin: 0, fontSize: 15, fontWeight: 900, color: '#ffffff' }}>{t('Create New Chit', 'Create New Chit')}</h2>
                <p style={{ margin: '1px 0 0', fontSize: 11.5, color: 'rgba(255, 255, 255, 0.85)' }}>{t('Enter customer, installment terms & schedule', 'Enter customer, installment terms & schedule')}</p>
              </div>
            </div>

            <div style={{ padding: '14px 18px' }}>
              <form onSubmit={handleCreateChit}>
                {/* Customer */}
                <div className="form-field-group">
                  <label className="form-field-label">{t('Customer *', 'Customer *')}</label>
                  <div className="input-with-icon">
                    <div className="input-icon-pill"><FiUser size={13} /></div>
                    <input
                      name="customer_id"
                      list="cust-options-inline"
                      placeholder={t('Search name, code, phone…', 'Search name, code, phone…')}
                      value={form._customerLabel ?? (selectedCustomer ? `${selectedCustomer.name} (${selectedCustomer.customer_code})` : '')}
                      onChange={(e) => {
                        const v = e.target.value;
                        const m = customers.find((c) =>
                          `${c.name} (${c.customer_code})` === v ||
                          c.customer_code === v || c.mobile === v ||
                          c.name.toLowerCase() === v.toLowerCase());
                        setForm((f) => ({ ...f, _customerLabel: v, customer_id: m ? m.id : '' }));
                        if (m?.id && formErrors.customer_id) {
                          setFormErrors((prev) => { const next = { ...prev }; delete next.customer_id; return next; });
                        }
                      }}
                      onBlur={() => {
                        if (!form.customer_id) {
                          setFormErrors((prev) => ({ ...prev, customer_id: 'Please select a customer.' }));
                        }
                      }}
                      className={formErrors.customer_id ? 'is-invalid' : ''}
                      required
                    />
                  </div>
                  <datalist id="cust-options-inline">
                    {customers.map((c) => (
                      <option key={c.id} value={`${c.name} (${c.customer_code})`}>
                        {c.mobile || ''} · {c.address_line1 || 'No address on file'}
                      </option>
                    ))}
                  </datalist>
                  <FieldError error={formErrors.customer_id} />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  {/* Chit Code */}
                  <div className="form-field-group">
                    <label className="form-field-label">{t('Chit Code', 'Chit Code')}</label>
                    <div className="input-with-icon">
                      <div className="input-icon-pill"><FiGrid size={13} /></div>
                      <input
                        name="code"
                        value={form.code}
                        onChange={(e) => setF('code', e.target.value)}
                        placeholder={nextCode ? `Auto (${nextCode})` : 'Auto'}
                        className={formErrors.code ? 'is-invalid' : ''}
                      />
                    </div>
                    <FieldError error={formErrors.code} />
                  </div>

                  {/* Start Date */}
                  <div className="form-field-group">
                    <label className="form-field-label">{t('Start Date *', 'Start Date *')}</label>
                    <div className="input-with-icon">
                      <div className="input-icon-pill"><FiCalendar size={13} /></div>
                      <input
                        type="date"
                        name="start_date"
                        value={form.start_date}
                        onChange={(e) => setF('start_date', e.target.value)}
                        onBlur={() => {
                          const err = validateDate(form.start_date, { required: true, fieldLabel: 'Start date' });
                          if (err) setFormErrors((prev) => ({ ...prev, start_date: err }));
                        }}
                        className={formErrors.start_date ? 'is-invalid' : ''}
                        required
                      />
                    </div>
                    <FieldError error={formErrors.start_date} />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  {/* Chit Amount */}
                  <div className="form-field-group">
                    <label className="form-field-label">{t('Chit Amount *', 'Chit Amount *')}</label>
                    <div className="input-with-icon">
                      <div className="input-icon-pill"><FiDollarSign size={13} /></div>
                      <input
                        type="number"
                        name="principal_amount"
                        min="1"
                        step="0.01"
                        value={form.principal_amount}
                        onChange={(e) => setF('principal_amount', e.target.value)}
                        onBlur={() => {
                          const err = validateAmount(form.principal_amount, { required: true, min: 1, fieldLabel: 'Chit amount' });
                          if (err) setFormErrors((prev) => ({ ...prev, principal_amount: err }));
                        }}
                        className={formErrors.principal_amount ? 'is-invalid' : ''}
                        required
                        placeholder="e.g. 50000"
                      />
                    </div>
                    <FieldError error={formErrors.principal_amount} />
                  </div>

                  {/* Installment */}
                  <div className="form-field-group">
                    <label className="form-field-label">{t('Installment *', 'Installment *')}</label>
                    <div className="input-with-icon">
                      <div className="input-icon-pill"><FiDollarSign size={13} /></div>
                      <input
                        type="number"
                        name="installment_amount"
                        min="0.01"
                        step="0.01"
                        value={form.installment_amount}
                        onChange={(e) => setF('installment_amount', e.target.value)}
                        onBlur={() => {
                          const err = validateAmount(form.installment_amount, { required: true, min: 0.01, fieldLabel: 'Installment amount' });
                          if (err) setFormErrors((prev) => ({ ...prev, installment_amount: err }));
                        }}
                        className={formErrors.installment_amount ? 'is-invalid' : ''}
                        required
                        placeholder="e.g. 2000"
                      />
                    </div>
                    <FieldError error={formErrors.installment_amount} />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  {/* Tenure */}
                  <div className="form-field-group">
                    <label className="form-field-label">{t('Tenure *', 'Tenure *')}</label>
                    <div className="input-with-icon">
                      <div className="input-icon-pill"><FiCalendar size={13} /></div>
                      <input
                        type="number"
                        name="tenure"
                        min="1"
                        step="1"
                        value={form.tenure}
                        onChange={(e) => setF('tenure', e.target.value)}
                        onBlur={() => {
                          const err = validateInteger(form.tenure, { required: true, min: 1, fieldLabel: 'Tenure' });
                          if (err) setFormErrors((prev) => ({ ...prev, tenure: err }));
                        }}
                        className={formErrors.tenure ? 'is-invalid' : ''}
                        required
                        placeholder={t('Installments count', 'Installments count')}
                      />
                    </div>
                    <FieldError error={formErrors.tenure} />
                  </div>

                  {/* Frequency */}
                  <div className="form-field-group">
                    <label className="form-field-label">{t('Frequency', 'Frequency')}</label>
                    <div className="input-with-icon">
                      <div className="input-icon-pill"><FiClock size={13} /></div>
                      <select value={form.frequency} onChange={(e) => setFrequency(e.target.value)}>
                        <option value="daily">{t('Daily', 'Daily')}</option>
                        <option value="weekly">{t('Weekly', 'Weekly')}</option>
                        <option value="monthly">{t('Monthly', 'Monthly')}</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* Due Date Schedule */}
                <div className="form-field-group">
                  <label className="form-field-label">{t('Due Date Schedule', 'Due Date Schedule')}</label>
                  <div className="input-with-icon">
                    <div className="input-icon-pill"><FiCalendar size={13} /></div>
                    <select value={form.due_date_mode} onChange={(e) => { setF('due_date_mode', e.target.value); setCustomRows([]); }}>
                      <option value="auto">{t('Auto Due Date', 'Auto Due Date')}</option>
                      <option value="custom">{t('Custom Due Date', 'Custom Due Date')}</option>
                    </select>
                  </div>
                </div>

                {form.due_date_mode === 'custom' && (
                  <div style={{ marginBottom: 10 }}>
                    {customRows.length > 0 ? (
                      <div style={{ border: '1px solid var(--line)', borderRadius: 8, overflow: 'hidden' }}>
                        {customRows.map((row, idx) => (
                          <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 10px', fontSize: 12, borderBottom: '1px solid #f1f5f9' }}>
                            <span>#{row.installment_no} · {row.due_date} · {money(row.payable_amount)}</span>
                            <button type="button" className="btn-icon danger" title={t('Remove', 'Remove')} style={{ width: 22, height: 22 }}
                              onClick={() => setCustomRows((rows) => rows.filter((_, i) => i !== idx))}>
                              <FiX size={12} />
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                )}

                <button className="btn-save-glow" style={{ width: '100%', marginTop: 8, justifyContent: 'center' }} disabled={formBusy || !form.customer_id}>
                  <FiCheckCircle size={14} /> {formBusy ? t('Saving…', 'Creating…') : t('Create Chit', 'Create Chit')}
                </button>
              </form>
            </div>
          </div>
        )}

        {/* Right Side: Directory List & Filters */}
        <div>
          <div className="toolbar" style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <div className="input-with-icon" style={{ flex: '1 1 200px', minWidth: 160 }}>
              <div className="input-icon-pill"><FiSearch size={13} /></div>
              <input type="search" placeholder={t('Search chit code, customer, mobile…', 'Search chit code, customer, mobile…')} value={list.q} onChange={(e) => list.setQ(e.target.value)} />
            </div>
            <div className="input-with-icon" style={{ width: 'auto', minWidth: 120 }}>
              <div className="input-icon-pill"><FiFilter size={13} /></div>
              <select value={list.filters.status || ''} onChange={(e) => list.setFilter('status', e.target.value)}>
                <option value="">{t('Any status', 'Any status')}</option>
                <option value="active">{t('Active', 'Active')}</option>
                <option value="completed">{t('Completed', 'Completed')}</option>
                <option value="closed">{t('Closed', 'Closed')}</option>
              </select>
            </div>
            <div className="input-with-icon" style={{ width: 'auto', minWidth: 130 }}>
              <div className="input-icon-pill"><FiClock size={13} /></div>
              <select value={list.filters.frequency || ''} onChange={(e) => list.setFilter('frequency', e.target.value)}>
                <option value="">{t('Any frequency', 'Any frequency')}</option>
                <option value="daily">{t('Daily', 'Daily')}</option>
                <option value="weekly">{t('Weekly', 'Weekly')}</option>
                <option value="monthly">{t('Monthly', 'Monthly')}</option>
              </select>
            </div>
            {list.hasFilters && (
              <button className="btn secondary sm" onClick={list.clear} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                {t('Clear', 'Clear')} <FiX size={12} />
              </button>
            )}
            <div style={{ flex: 1 }} />
            {can('loans.export') && (
              <>
                <button
                  type="button"
                  onClick={() => api.download('/api/reports/templates/chit').catch((e) => toast.error(e.message))}
                  style={{
                    height: 36, borderRadius: 18, border: '1.5px solid #cbd5e1',
                    background: '#ffffff', color: '#0d2856', fontSize: 12, fontWeight: 700,
                    padding: '0 14px', display: 'inline-flex', alignItems: 'center', gap: 6,
                    cursor: 'pointer', transition: 'all 0.15s ease'
                  }}
                >
                  <FiFileText size={13} style={{ color: '#1d4ed8' }} /> {t('Sample Template', 'Sample Template')}
                </button>
                <button
                  type="button"
                  onClick={() => api.download('/api/export/chits', { q: list.q, ...list.filters }).catch((e) => toast.error(e.message))}
                  style={{
                    height: 36, borderRadius: 18, border: '1.5px solid #10b981',
                    background: '#f0fdf4', color: '#059669', fontSize: 12, fontWeight: 700,
                    padding: '0 14px', display: 'inline-flex', alignItems: 'center', gap: 6,
                    cursor: 'pointer', transition: 'all 0.15s ease'
                  }}
                >
                  <FiDownload size={13} style={{ color: '#059669' }} /> {t('Export Excel', 'Export Excel')}
                </button>
              </>
            )}
          </div>

          <DataTable
            columns={columns} rows={list.rows} loading={list.loading} error={list.error} onRetry={list.reload}
            page={list.page} perPage={list.perPage} total={list.pagination.total} totalPages={list.pagination.total_pages}
            sortBy={list.sortBy} sortDir={list.sortDir} onSort={list.onSort} onPage={list.setPage} onPerPage={list.setPerPage}
            emptyTitle={t("No chits match your filters", "No chits match your filters")}
            emptyHint={t("Create a new chit using the form on the left or clear your search filters.", "Create a new chit using the form on the left or clear your search filters.")}
            selectedIds={selectedIds}
            onSelectChange={setSelectedIds}
            selectable={can('loans.delete')}
            bulkActions={
              can('loans.delete') && (
                <button className="btn sm danger" onClick={() => setBulkConfirm(true)}>
                  <IconDelete /> {t(`Bulk Delete (${selectedIds.length})`, `Bulk Delete (${selectedIds.length})`)}
                </button>
              )
            }
          />
        </div>
      </div>

      {del && (
        <Confirm title={t(`Delete ${del.code}?`, `Delete ${del.code}?`)} danger busy={busy}
          message={t("The chit disappears from every list immediately. Posted collections stay in the ledger for audit.", "The chit disappears from every list immediately. Posted collections stay in the ledger for audit.")}
          confirmLabel={t("Delete", "Delete")} onConfirm={doDelete} onClose={() => setDel(null)} />
      )}

      {bulkConfirm && (
        <Confirm title={t(`Delete ${selectedIds.length} selected chits?`, `Delete ${selectedIds.length} selected chits?`)} danger busy={busy}
          message={t("All selected chits will disappear from the list immediately. Any posted collections remain in the audit ledger.", "All selected chits will disappear from the list immediately. Any posted collections remain in the audit ledger.")}
          confirmLabel={t(`Delete (${selectedIds.length})`, `Delete (${selectedIds.length})`)} onConfirm={handleBulkDelete} onClose={() => setBulkConfirm(false)} />
      )}

      {edit && (
        <Modal title={t(`Edit ${edit.code}`, `Edit ${edit.code}`)} onClose={() => setEdit(null)}
          footer={<>
            <button className="btn secondary" onClick={() => setEdit(null)} disabled={editBusy}>{t('Cancel', 'Cancel')}</button>
            <button className="btn-save-glow" onClick={saveEdit} disabled={editBusy}>{editBusy ? t('Saving…', 'Saving…') : t('Save Changes', 'Save Changes')}</button>
          </>}>
          <div className="form-grid">
            <Field label={t('Chit Code', 'Chit Code')}>
              <input value={edit.code} onChange={(e) => setEdit({ ...edit, code: e.target.value })} />
              <p className="muted" style={{ fontSize: 12, margin: '4px 0 0' }}>
                {t('Leave unchanged to keep existing code.', 'Leave unchanged to keep existing code.')}
              </p>
            </Field>
            <Field label={t('Chit Status', 'Chit Status')}>
              <select value={edit.status} onChange={(e) => setEdit({ ...edit, status: e.target.value })}>
                <option value="active">{t('Active', 'Active')}</option>
                <option value="completed">{t('Completed', 'Completed')}</option>
                <option value="closed">{t('Closed', 'Closed / Cancelled')}</option>
              </select>
            </Field>
            <Field label="Installment Amount *" error={editErrors.installment_amount}>
              <input
                type="number"
                name="installment_amount"
                min="0.01"
                step="0.01"
                value={edit.installment_amount}
                onChange={(e) => {
                  setEdit({ ...edit, installment_amount: e.target.value });
                  if (editErrors.installment_amount) setEditErrors((prev) => { const n = { ...prev }; delete n.installment_amount; return n; });
                }}
                onBlur={() => {
                  const err = validateAmount(edit.installment_amount, { required: true, min: 0.01, fieldLabel: 'Installment amount' });
                  if (err) setEditErrors((prev) => ({ ...prev, installment_amount: err }));
                }}
              />
            </Field>
            <Field label="Chit / principal amount *" error={editErrors.principal_amount}>
              <input
                type="number"
                name="principal_amount"
                min="0"
                step="0.01"
                value={edit.principal_amount}
                onChange={(e) => {
                  setEdit({ ...edit, principal_amount: e.target.value });
                  if (editErrors.principal_amount) setEditErrors((prev) => { const n = { ...prev }; delete n.principal_amount; return n; });
                }}
                onBlur={() => {
                  const err = validateAmount(edit.principal_amount, { required: true, min: 0, fieldLabel: 'Chit amount' });
                  if (err) setEditErrors((prev) => ({ ...prev, principal_amount: err }));
                }}
              />
            </Field>
            <Field label="Tenure *" error={editErrors.tenure}>
              <input
                type="number"
                name="tenure"
                min="1"
                step="1"
                value={edit.tenure}
                onChange={(e) => {
                  setEdit({ ...edit, tenure: e.target.value });
                  if (editErrors.tenure) setEditErrors((prev) => { const n = { ...prev }; delete n.tenure; return n; });
                }}
                onBlur={() => {
                  const err = validateInteger(edit.tenure, { required: true, min: 1, fieldLabel: 'Tenure' });
                  if (err) setEditErrors((prev) => ({ ...prev, tenure: err }));
                }}
              />
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
                <option value="daily">{t('Daily', 'Daily')}</option>
                <option value="weekly">{t('Weekly', 'Weekly')}</option>
                <option value="monthly">{t('Monthly', 'Monthly')}</option>
              </select>
            </Field>
            <Field label={t('Start date *', 'Start date *')} error={editErrors.start_date}>
              <input
                type="date"
                name="start_date"
                value={edit.start_date}
                onChange={(e) => {
                  setEdit({ ...edit, start_date: e.target.value });
                  if (editErrors.start_date) setEditErrors((prev) => { const n = { ...prev }; delete n.start_date; return n; });
                }}
                onBlur={() => {
                  const err = validateDate(edit.start_date, { required: true, fieldLabel: 'Start date' });
                  if (err) setEditErrors((prev) => ({ ...prev, start_date: err }));
                }}
              />
            </Field>
            {edit.frequency === 'monthly' && (
              <Field label={t('Monthly schedule style', 'Monthly schedule style')}>
                <select value={edit.schedule_type} onChange={(e) => setEdit({ ...edit, schedule_type: e.target.value })}>
                  <option value="MONTHLY_DAILY">{t('Calendar month', 'Calendar month')}</option>
                  <option value="MONTHLY_WEEKDAY">{t('Weekday cycle', 'Weekday cycle')}</option>
                  <option value="MONTHLY_INTERVAL">{t('Fixed day interval', 'Fixed day interval')}</option>
                </select>
              </Field>
            )}
          </div>
          <Field label={t('Notes', 'Notes')}>
            <textarea rows={2} value={edit.notes} onChange={(e) => setEdit({ ...edit, notes: e.target.value })} />
          </Field>
          <p className="muted" style={{ fontSize: 12, margin: 0 }}>
            {t('Changing the installment amount recalculates future unpaid installments only. Paid / partially-paid installments and every recorded collection are left exactly as they are.', 'Changing the installment amount recalculates future unpaid installments only. Paid / partially-paid installments and every recorded collection are left exactly as they are.')}
          </p>
        </Modal>
      )}

      {addCustomRow && (
        <CustomScheduleModal
          localOnly
          nextInstallmentNo={customRows.reduce((m, r) => Math.max(m, r.installment_no), 0) + 1}
          defaultAmount={form.installment_amount}
          onClose={() => setAddCustomRow(false)}
          onDone={(row) => { setCustomRows((rows) => [...rows, row]); setAddCustomRow(false); }}
        />
      )}
    </>
  );
}
