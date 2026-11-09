import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, money, fmtDate } from '../api/client';
import { Field, Modal } from '../components/ui';
import { validateDate, validateAmount, validateInteger, focusFirstError } from '../utils/validation';
import { useAuth } from '../state/AuthContext';
import { useToast } from '../state/ToastContext';
import { FiArrowLeft, FiFileText, FiDollarSign, FiCheckCircle } from 'react-icons/fi';

const today = () => new Date().toISOString().slice(0, 10);
const WEEKDAYS = [
  { v: '1', l: 'Monday' }, { v: '2', l: 'Tuesday' }, { v: '3', l: 'Wednesday' },
  { v: '4', l: 'Thursday' }, { v: '5', l: 'Friday' }, { v: '6', l: 'Saturday' }, { v: '7', l: 'Sunday' },
];
const initial = {
  customer_id: '', code: '', principal_amount: '', installment_amount: '', tenure: '',
  frequency: 'weekly',
  start_date: today(),
  schedule_type: 'WEEKLY', weekday: '', employee_id: '', notes: '',
  due_date_mode: 'auto',
};
const emptyDist = { amount: '', account_id: '', distributed_date: today(), new_emi_amount: '', remarks: '' };

export default function LoanNew() {
  const nav = useNavigate();
  const toast = useToast();
  const { meta, refreshMeta } = useAuth();
  const accounts = meta?.accounts || [];
  const [form, setForm] = useState(initial);
  const [customers, setCustomers] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [nextCode, setNextCode] = useState('');
  const [preview, setPreview] = useState(null);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [dist, setDist] = useState(emptyDist);
  const [distOpen, setDistOpen] = useState(false);
  const [success, setSuccess] = useState(null);   // { chit, distribution } after a create-with-distribution

  useEffect(() => {
    api.get('/api/customers', { params: { per_page: 500, sort_by: 'name' } }).then((r) => setCustomers(r.data)).catch(() => { });
    api.get('/api/employees', { params: { per_page: 200 } }).then((r) => setEmployees(r.data)).catch(() => { });
    api.get('/api/loans/next-code').then((r) => setNextCode(r.data.next_code)).catch(() => { });
  }, []);

  const set = (k, v) => {
    setForm((f) => ({ ...f, [k]: v }));
    if (errors[k]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[k];
        return next;
      });
    }
  };

  // Address/location is NOT chosen here — a chit inherits the customer's own address text.
  const selectedCustomer = customers.find((c) => String(c.id) === String(form.customer_id));

  // Repayment frequency drives the schedule engine key. Monthly keeps whatever
  // MONTHLY_* variant is selected; daily/weekly map 1:1.
  const SCHEDULE_FOR_FREQ = { daily: 'DAILY', weekly: 'WEEKLY', monthly: 'MONTHLY_DAILY' };
  const setFrequency = (v) => setForm((f) => ({
    ...f,
    frequency: v,
    schedule_type: v === 'monthly' && f.schedule_type?.startsWith('MONTHLY_')
      ? f.schedule_type
      : SCHEDULE_FOR_FREQ[v],
  }));

  const wantsWeekday = form.frequency === 'weekly' || form.schedule_type === 'MONTHLY_WEEKDAY';
  const scheduleConfig = wantsWeekday && form.weekday ? { weekday: Number(form.weekday) } : undefined;

  const runPreview = async () => {
    setErrors({});
    try {
      const r = await api.post('/api/loans/preview', {
        principal_amount: Number(form.principal_amount),
        installment_amount: Number(form.installment_amount),
        tenure: Number(form.tenure),
        frequency: form.frequency, start_date: form.start_date, schedule_type: form.schedule_type,
        schedule_config: scheduleConfig,
      });
      setPreview(r.data);
    } catch (e) {
      if (e.errors) setErrors(Object.fromEntries(Object.entries(e.errors).map(([k, v]) => [k, v[0]])));
      else toast.error(e.message);
    }
  };

  const distAmt = Number(dist.amount || 0);
  const wantDist = distOpen && distAmt > 0;
  const principal = Number(form.principal_amount || 0);

  const submit = async (e) => {
    e.preventDefault();
    const errs = {};
    if (!form.customer_id) errs.customer_id = 'Please select a customer.';
    const amtErr = validateAmount(form.principal_amount, { required: true, min: 1, fieldLabel: 'Chit amount' });
    if (amtErr) errs.principal_amount = amtErr;
    const instErr = validateAmount(form.installment_amount, { required: true, min: 0.01, fieldLabel: 'Installment amount' });
    if (instErr) errs.installment_amount = instErr;
    const tenureErr = validateInteger(form.tenure, { required: true, min: 1, fieldLabel: 'Tenure' });
    if (tenureErr) errs.tenure = tenureErr;
    const dateErr = validateDate(form.start_date, { required: true, fieldLabel: 'Start date' });
    if (dateErr) errs.start_date = dateErr;

    if (wantDist) {
      if (!distAmt || distAmt <= 0) {
        errs['distribution.amount'] = 'Enter an amount to distribute.';
      }
      if (!dist.account_id) {
        errs['distribution.account_id'] = 'Choose the account the money comes from.';
      }
      if (dist.new_emi_amount !== '' && Number(dist.new_emi_amount) <= 0) {
        errs['distribution.new_emi_amount'] = 'New EMI must be greater than 0.';
      }
    }

    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      focusFirstError(errs);
      return;
    }
    setErrors({});
    setBusy(true);
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
        // Collection day is OPTIONAL — only sent when the user picked one.
        schedule_config: scheduleConfig,
        // Empty -> backend auto-generates from the Settings prefix. Non-empty -> saved verbatim.
        code: form.code.trim() || undefined,
        // No location field here: the backend copies the customer's own address text.
        employee_id: form.employee_id ? Number(form.employee_id) : undefined,
        notes: form.notes || undefined,
        // Optional: distribute immediately as part of creation (reuses the distribution service).
        distribution: wantDist ? {
          amount: distAmt,
          account_id: Number(dist.account_id),
          distributed_date: dist.distributed_date || undefined,
          new_emi_amount: dist.new_emi_amount !== '' ? Number(dist.new_emi_amount) : undefined,
          remarks: dist.remarks || undefined,
        } : undefined,
      };
      const r = await api.post('/api/loans', payload);

      if (wantDist) {
        await refreshMeta?.();   // Office Cash / Bank / dashboard reflect the transaction
        setSuccess({ chit: r.data, distribution: r.data.distribution });
      } else {
        const instCount = r.data.installments.length;
        toast.success(`${r.data.code} created — ${instCount} installment${instCount === 1 ? '' : 's'} of ${money(r.data.installment_amount)}`);
        nav(`/loans/${r.data.id}`);
      }
    } catch (e2) {
      if (e2.errors) {
        const mapped = Object.fromEntries(Object.entries(e2.errors).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]));
        setErrors(mapped);
        focusFirstError(mapped);
      } else {
        toast.error(e2.message);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit}>
      <div className="toolbar">
        <button type="button" className="btn sm secondary" onClick={() => nav('/loans')} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><FiArrowLeft size={14} /> Chits</button>
        <h1 style={{ margin: 0, fontSize: 18 }}>New chit</h1>
      </div>

      <div className="card chit-form-card" style={{ padding: 0, overflow: 'hidden', borderRadius: 14, boxShadow: '0 4px 16px rgba(0,0,0,0.04)' }}>
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
            width: 36, height: 36, borderRadius: 10,
            background: 'rgba(255, 255, 255, 0.15)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: '1px solid rgba(255, 255, 255, 0.25)',
            color: '#facc15'
          }}>
            <FiFileText size={18} />
          </div>
          <div>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 900, color: '#ffffff' }}>New Chit Details</h2>
            <p style={{ margin: '2px 0 0', fontSize: 11.5, color: 'rgba(255, 255, 255, 0.85)' }}>Enter customer, installment terms, and repayment cycle</p>
          </div>
        </div>
        <div className="card-body" style={{ padding: '16px 20px' }}>
          <div className="form-grid">
            <Field label="Customer *" error={errors.customer_id}>
              <input
                name="customer_id"
                list="cust-options"
                placeholder="Search name, code or mobile…"
                value={form._customerLabel ?? (selectedCustomer ? `${selectedCustomer.name} (${selectedCustomer.customer_code})` : '')}
                onChange={(e) => {
                  const v = e.target.value;
                  const m = customers.find((c) =>
                    `${c.name} (${c.customer_code})` === v ||
                    c.customer_code === v || c.mobile === v ||
                    c.name.toLowerCase() === v.toLowerCase());
                  setForm((f) => ({ ...f, _customerLabel: v, customer_id: m ? m.id : '' }));
                  if (m?.id && errors.customer_id) {
                    setErrors((prev) => { const n = { ...prev }; delete n.customer_id; return n; });
                  }
                }}
                onBlur={() => {
                  if (!form.customer_id) {
                    setErrors((prev) => ({ ...prev, customer_id: 'Please select a customer.' }));
                  }
                }}
                required />
              <datalist id="cust-options">
                {customers.map((c) => (
                  <option key={c.id} value={`${c.name} (${c.customer_code})`}>
                    {c.mobile || ''} · {c.address_line1 || 'No address on file'}
                  </option>
                ))}
              </datalist>
              {selectedCustomer && (
                <p className="muted" style={{ fontSize: 12, margin: '4px 0 0' }}>
                  Address: <b>{selectedCustomer.address_line1 || '—'}</b> (copied from the customer's record)
                </p>
              )}
            </Field>
            <Field label="Chit Code" error={errors.code}>
              <input name="code" value={form.code} onChange={(e) => set('code', e.target.value)}
                placeholder={nextCode ? `Leave blank to auto-generate (next: ${nextCode})` : 'Leave blank to auto-generate'} />
              <p className="muted" style={{ fontSize: 12, margin: '4px 0 0' }}>
                Empty → the server generates the next code. Typed → saved exactly as entered (must be unique).
              </p>
            </Field>
            <Field label="Chit / principal amount *" error={errors.principal_amount}>
              <input
                type="number"
                name="principal_amount"
                min="1"
                step="0.01"
                value={form.principal_amount}
                onChange={(e) => set('principal_amount', e.target.value)}
                onBlur={() => {
                  const err = validateAmount(form.principal_amount, { required: true, min: 1, fieldLabel: 'Chit amount' });
                  if (err) setErrors((prev) => ({ ...prev, principal_amount: err }));
                }}
                required />
            </Field>
            <Field label="Installment Amount *" error={errors.installment_amount}>
              <input
                type="number"
                name="installment_amount"
                min="0.01"
                step="0.01"
                value={form.installment_amount}
                onChange={(e) => set('installment_amount', e.target.value)}
                onBlur={() => {
                  const err = validateAmount(form.installment_amount, { required: true, min: 0.01, fieldLabel: 'Installment amount' });
                  if (err) setErrors((prev) => ({ ...prev, installment_amount: err }));
                }}
                required
                placeholder="e.g. 2000 — used exactly as entered" />
            </Field>
            <Field label="Tenure (number of installments) *" error={errors.tenure}>
              <input
                type="number"
                name="tenure"
                min="1"
                step="1"
                value={form.tenure}
                onChange={(e) => set('tenure', e.target.value)}
                onBlur={() => {
                  const err = validateInteger(form.tenure, { required: true, min: 1, fieldLabel: 'Tenure' });
                  if (err) setErrors((prev) => ({ ...prev, tenure: err }));
                }}
                required />
            </Field>
            <Field label="Due Date Schedule" error={errors.due_date_mode}>
              <select value={form.due_date_mode} onChange={(e) => set('due_date_mode', e.target.value)}>
                <option value="auto">Auto Due Date</option>
                <option value="custom">Custom Due Date</option>
              </select>
              {form.due_date_mode === 'custom' && (
                <p className="muted" style={{ fontSize: 12, margin: '4px 0 0' }}>
                  No due dates are generated automatically. Add each installment from the Collection page once the chit is created.
                </p>
              )}
            </Field>
            {form.due_date_mode === 'auto' && (
              <>
                <Field label="Repayment Frequency">
                  <select value={form.frequency} onChange={(e) => setFrequency(e.target.value)}>
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                  </select>
                </Field>
                {form.frequency === 'monthly' && (
                  <Field label="Monthly schedule style">
                    <select value={form.schedule_type} onChange={(e) => set('schedule_type', e.target.value)}>
                      <option value="MONTHLY_DAILY">Calendar month (same day each month)</option>
                      <option value="MONTHLY_WEEKDAY">Weekday cycle (e.g. every 4th Monday)</option>
                      <option value="MONTHLY_INTERVAL">Fixed day interval</option>
                    </select>
                  </Field>
                )}
                {wantsWeekday && (
                  <Field label="Preferred collection day (optional)">
                    <select value={form.weekday} onChange={(e) => set('weekday', e.target.value)}>
                      <option value="">From start date — no fixed day</option>
                      {WEEKDAYS.map((d) => <option key={d.v} value={d.v}>{d.l}</option>)}
                    </select>
                    <p className="muted" style={{ fontSize: 12, margin: '4px 0 0' }}>
                      Leave as “no fixed day” and the schedule simply runs weekly from the start date.
                    </p>
                  </Field>
                )}
              </>
            )}
            <Field label="Start date *" error={errors.start_date}>
              <input
                type="date"
                name="start_date"
                value={form.start_date}
                onChange={(e) => set('start_date', e.target.value)}
                onBlur={() => {
                  const err = validateDate(form.start_date, { required: true, fieldLabel: 'Start date' });
                  if (err) setErrors((prev) => ({ ...prev, start_date: err }));
                }}
                required />
            </Field>
            <Field label="Assign to employee (optional)">
              <select value={form.employee_id} onChange={(e) => set('employee_id', e.target.value)}>
                <option value="">Unassigned</option>
                {employees.map((emp) => <option key={emp.employee_id} value={emp.employee_id}>{emp.name} ({emp.emp_code})</option>)}
              </select>
            </Field>
          </div>
          <p className="muted" style={{ fontSize: 12 }}>
            This is a chit fund — there is <b>no interest and no EMI formula</b>. Every installment is exactly the
            <b> installment amount</b> you enter above. At collection time the employee can take a partial, exact
            or higher amount; the actual paid amount is stored as-is.
          </p>
          <Field label="Notes" error={errors.notes}>
            <textarea rows={2} value={form.notes} onChange={(e) => set('notes', e.target.value)} />
          </Field>
          <div style={{ display: 'flex', gap: 10 }}>
            {form.due_date_mode === 'auto' && (
              <button type="button" className="btn secondary" onClick={runPreview}
                disabled={!form.installment_amount || !form.tenure}>Preview schedule</button>
            )}
            <button className="btn-save-glow" disabled={busy || !form.customer_id}>
              {busy ? 'Saving…' : (wantDist ? `Create chit + distribute ${money(distAmt)}` : 'Create Chit')}
            </button>
          </div>
        </div>
      </div>

      {/* Optional: distribute the chit immediately on creation */}
      <div className="card chit-form-card" style={{ marginTop: 16 }}>
        <div className="card-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ display: "flex", alignItems: "center", gap: 6 }}><FiDollarSign size={15} /> Distribute now <span className="muted" style={{ fontWeight: 400, fontSize: 13 }}>(optional)</span></h2>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600 }}>
            <input type="checkbox" checked={distOpen} onChange={(e) => { setDistOpen(e.target.checked); if (!e.target.checked) setDist(emptyDist); }} />
            Distribute money to the customer as part of creation
          </label>
        </div>
        {distOpen && (
          <div className="card-body">
            <div className="form-grid">
              <Field label="Distributed Amount *" error={errors['distribution.amount']}>
                <input
                  type="number"
                  name="distribution.amount"
                  min="0.01"
                  step="0.01"
                  value={dist.amount}
                  onChange={(e) => {
                    setDist({ ...dist, amount: e.target.value });
                    if (errors['distribution.amount']) {
                      setErrors((prev) => { const n = { ...prev }; delete n['distribution.amount']; return n; });
                    }
                  }}
                  onBlur={() => {
                    const err = validateAmount(dist.amount, { required: true, min: 0.01, fieldLabel: 'Distributed amount' });
                    if (err) setErrors((prev) => ({ ...prev, 'distribution.amount': err }));
                  }}
                  placeholder="amount handed to the customer" />
                {principal > 0 && distAmt > 0 && (
                  <span className="muted" style={{ fontSize: 12 }}>
                    Principal covered: <b>{money(Math.min(distAmt, principal))}</b>
                    {distAmt > principal && <> · Extra disbursed: <b>{money(distAmt - principal)}</b></>}
                  </span>
                )}
              </Field>
              <Field label="Distribution Account *" error={errors['distribution.account_id']}>
                <select
                  name="distribution.account_id"
                  value={dist.account_id}
                  onChange={(e) => {
                    setDist({ ...dist, account_id: e.target.value });
                    if (errors['distribution.account_id']) {
                      setErrors((prev) => { const n = { ...prev }; delete n['distribution.account_id']; return n; });
                    }
                  }}
                  onBlur={() => {
                    if (!dist.account_id) {
                      setErrors((prev) => ({ ...prev, 'distribution.account_id': 'Choose the account the money comes from.' }));
                    }
                  }}>
                  <option value="">— select account —</option>
                  {accounts.map((a) => <option key={a.id} value={a.id}>{a.name} ({a.type})</option>)}
                </select>
              </Field>
              <Field label="Distribution Date">
                <input type="date" value={dist.distributed_date} onChange={(e) => setDist({ ...dist, distributed_date: e.target.value })} />
              </Field>
              <Field label="New EMI Amount" error={errors['distribution.new_emi_amount']}>
                <input type="number" min="0.01" step="0.01" value={dist.new_emi_amount}
                  onChange={(e) => setDist({ ...dist, new_emi_amount: e.target.value })}
                  placeholder={`blank = keep ${money(Number(form.installment_amount || 0))}`} />
                <span className="muted" style={{ fontSize: 12 }}>Entered manually — no interest calculation. Applies to future dues.</span>
              </Field>
            </div>
            <Field label="Remarks">
              <input value={dist.remarks} onChange={(e) => setDist({ ...dist, remarks: e.target.value })} placeholder="e.g. Initial distribution / 1st tranche" />
            </Field>
            <p className="muted" style={{ fontSize: 12, margin: 0 }}>
              Only the actual distributed amount leaves the selected account — one transaction, recorded in the chit's
              distribution history. Leave this off to create the chit with no money movement.
            </p>
          </div>
        )}
      </div>

      {preview && (
        <div className="card" style={{ marginTop: 16 }}>
          <div className="card-head">
            <h2>Preview — installment {money(preview.installment_amount)}</h2>
            <span className="muted">Scheduled total {money(preview.totals.scheduled)} ({preview.schedule.length} × {money(preview.installment_amount)})</span>
          </div>
          <div className="table-wrap">
            <table className="grid">
              <thead><tr><th>#</th><th>Due date</th><th className="right">Installment Amount</th></tr></thead>
              <tbody>
                {preview.schedule.map((s) => (
                  <tr key={s.installment_no}>
                    <td>{s.installment_no}</td><td>{fmtDate(s.due_date)}</td>
                    <td className="right">{money(s.payable_amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {success && (
        <Modal title={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><FiCheckCircle /> Chit Created Successfully</span>} onClose={() => nav(`/loans/${success.chit.id}`)}
          footer={<button className="btn" onClick={() => nav(`/loans/${success.chit.id}`)}>Open chit details</button>}>
          <dl className="kv" style={{ gridTemplateColumns: '180px 1fr', rowGap: 8 }}>
            <dt>Chit Code</dt><dd style={{ fontWeight: 700 }}>{success.chit.code}</dd>
            <dt>Chit Amount</dt><dd>{money(success.chit.principal_amount)}</dd>
            <dt>Distributed</dt><dd style={{ color: '#15803d', fontWeight: 700 }}>{money(success.distribution?.total_distributed)}</dd>
            <dt>Remaining Undistributed</dt><dd>{money(success.distribution?.remaining_undistributed)}</dd>
            <dt>Current EMI</dt><dd><b>{money(success.distribution?.current_emi ?? success.chit.installment_amount)}</b></dd>
            <dt>Account</dt><dd>{accounts.find((a) => String(a.id) === String(dist.account_id))?.name || '—'}</dd>
          </dl>
          <p className="muted" style={{ fontSize: 12, marginBottom: 0 }}>Office Cash / Bank and the dashboard have been updated.</p>
        </Modal>
      )}
    </form>
  );
}