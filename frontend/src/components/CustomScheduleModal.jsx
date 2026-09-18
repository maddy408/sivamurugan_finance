import { useState } from 'react';
import { api } from '../api/client';
import { Field, Modal } from './ui';
import { useToast } from '../state/ToastContext';
import { FiPlusCircle, FiSave } from 'react-icons/fi';

const today = () => new Date().toISOString().slice(0, 10);

/**
 * Add OR edit one installment row for a due_date_mode = 'custom' chit.
 * Backend never auto-generates dates for these chits — this IS the schedule.
 *
 * Three modes:
 *  - Add / API mode (default, used on the Collection page): `loan` is an
 *    existing chit; submitting POSTs to /api/loans/{id}/custom-schedule.
 *  - Edit mode: pass `editInstallment` (the existing row) - submitting PUTs
 *    to /api/loans/{id}/custom-schedule/{instId} instead, updating the SAME
 *    row (never creates a duplicate schedule).
 *  - `localOnly` mode (used on the Chit Create form, before the chit exists):
 *    submitting just calls onDone(values) so the caller can queue the row and
 *    send it once the chit itself has been created. No API call is made here.
 */
export default function CustomScheduleModal({ loan, onClose, onDone, localOnly = false, nextInstallmentNo, defaultAmount, editInstallment }) {
  const toast = useToast();
  const isEdit = !!editInstallment;
  const nextNo = isEdit
    ? editInstallment.installment_no
    : localOnly
      ? (nextInstallmentNo || 1)
      : (loan.installments || []).reduce((m, i) => Math.max(m, i.installment_no), 0) + 1;
  const [form, setForm] = useState({
    installment_no: nextNo,
    due_date: isEdit ? String(editInstallment.due_date).slice(0, 10) : today(),
    payable_amount: isEdit ? editInstallment.payable_amount : ((localOnly ? defaultAmount : loan.installment_amount) || ''),
    paid_amount: isEdit ? editInstallment.paid_amount : '',
    paid_date: isEdit && editInstallment.last_paid_date ? String(editInstallment.last_paid_date).slice(0, 10) : '',
    status: isEdit ? editInstallment.status : '',
  });
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState({});
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async () => {
    setErrors({});
    if (!form.due_date) { setErrors({ due_date: 'Required' }); return; }
    if (!form.payable_amount) { setErrors({ payable_amount: 'Required' }); return; }
    const payload = {
      installment_no: Number(form.installment_no),
      due_date: form.due_date,
      payable_amount: Number(form.payable_amount),
      paid_amount: form.paid_amount !== '' ? Number(form.paid_amount) : undefined,
      paid_date: form.paid_date || undefined,
      status: form.status || undefined,
    };
    if (localOnly) {
      onDone?.(payload);
      return;
    }
    setBusy(true);
    try {
      if (isEdit) {
        await api.put(`/api/loans/${loan.id}/custom-schedule/${editInstallment.id}`, payload);
        toast.success(`Installment #${form.installment_no} updated`);
      } else {
        await api.post(`/api/loans/${loan.id}/custom-schedule`, payload);
        toast.success(`Installment #${form.installment_no} added`);
      }
      onDone?.();
    } catch (e) {
      if (e.errors) setErrors(Object.fromEntries(Object.entries(e.errors).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v])));
      else toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={isEdit ? `Edit Custom Schedule — #${editInstallment.installment_no}` : 'Add Custom Schedule'} onClose={onClose}
      footer={<>
        <button className="btn secondary" onClick={onClose} disabled={busy}>Cancel</button>
        <button className="btn" onClick={submit} disabled={busy || !form.due_date || !form.payable_amount}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          {isEdit ? <FiSave size={14} /> : <FiPlusCircle size={14} />} {busy ? 'Saving…' : (isEdit ? 'Save Schedule' : 'Add Installment')}
        </button>
      </>}>
      <div className="form-grid">
        <Field label="Installment No *" error={errors.installment_no}>
          <input type="number" min="1" step="1" value={form.installment_no} onChange={(e) => set('installment_no', e.target.value)} />
        </Field>
        <Field label="Due Date *" error={errors.due_date}>
          <input type="date" value={form.due_date} onChange={(e) => set('due_date', e.target.value)} />
        </Field>
        <Field label="Amount Due *" error={errors.payable_amount}>
          <input type="number" min="0.01" step="0.01" value={form.payable_amount} onChange={(e) => set('payable_amount', e.target.value)} />
        </Field>
        <Field label="Amount Paid (optional)" error={errors.paid_amount}>
          <input type="number" min="0" step="0.01" value={form.paid_amount} onChange={(e) => set('paid_amount', e.target.value)}
            placeholder="Leave blank if unpaid" />
        </Field>
        <Field label="Paid Date (optional)" error={errors.paid_date}>
          <input type="date" value={form.paid_date} onChange={(e) => set('paid_date', e.target.value)} />
        </Field>
        <Field label="Status (optional)" error={errors.status}>
          <select value={form.status} onChange={(e) => set('status', e.target.value)}>
            <option value="">Auto (derive from amount paid / due date)</option>
            <option value="PENDING">PENDING</option>
            <option value="PARTIAL">PARTIAL</option>
            <option value="COMPLETED">COMPLETED</option>
            <option value="OVERDUE">OVERDUE</option>
          </select>
        </Field>
      </div>
      <p className="muted" style={{ fontSize: 12, margin: 0 }}>
        Once added, any real payment collected against this due goes through the normal Collect flow — this form
        only defines/back-fills the schedule itself.
      </p>
    </Modal>
  );
}
