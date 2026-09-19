import { useState } from 'react';
import { api, money } from '../api/client';
import { Field, Modal, Badge } from './ui';
import { useToast } from '../state/ToastContext';
import { FiPlusCircle, FiSave } from 'react-icons/fi';

const today = () => new Date().toISOString().slice(0, 10);

/** Mirrors the backend's CollectionService::deriveStatus() — preview only;
 * the server always recomputes and persists the authoritative status. */
const previewStatus = (payable, paid, dueDate) => {
  const p = Number(payable) || 0;
  const pd = Number(paid) || 0;
  if (pd > 0 && pd >= p) return 'COMPLETED';
  if (pd > 0) return 'PARTIAL';
  return dueDate && dueDate < today() ? 'OVERDUE' : 'PENDING';
};

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
 *
 * Status is never manually chosen here — it is always derived server-side
 * from Amount Due / Amount Paid / Due Date (see ScheduleService::
 * addCustomInstallment/updateCustomInstallment), so a contradictory state
 * (e.g. fully paid but marked PENDING) can never be saved.
 */
export default function CustomScheduleModal({ loan, onClose, onDone, localOnly = false, nextInstallmentNo, defaultAmount, editInstallment }) {
  const toast = useToast();
  const isEdit = !!editInstallment;
  const hasPayment = isEdit && Number(editInstallment.paid_amount) > 0;
  const nextNo = isEdit
    ? editInstallment.installment_no
    : localOnly
      ? (nextInstallmentNo || 1)
      : (loan?.installments || []).reduce((m, i) => Math.max(m, i.installment_no), 0) + 1;
  const [form, setForm] = useState({
    installment_no: nextNo,
    due_date: isEdit ? String(editInstallment.due_date).slice(0, 10) : today(),
    payable_amount: isEdit ? editInstallment.payable_amount : ((localOnly ? defaultAmount : loan?.installment_amount) || ''),
    paid_amount: isEdit ? editInstallment.paid_amount : '0',
    paid_date: isEdit && editInstallment.last_paid_date ? String(editInstallment.last_paid_date).slice(0, 10) : '',
  });
  const [selectedStatus, setSelectedStatus] = useState(
    isEdit ? (editInstallment.status || previewStatus(editInstallment.payable_amount, editInstallment.paid_amount, editInstallment.due_date)) : 'PENDING'
  );
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState({});

  const set = (k, v) => {
    setForm((f) => {
      const updated = { ...f, [k]: v };
      setSelectedStatus(previewStatus(updated.payable_amount, updated.paid_amount, updated.due_date));
      return updated;
    });
  };

  const handleStatusChange = (newStatus) => {
    setSelectedStatus(newStatus);
    const p = Number(form.payable_amount) || 0;
    if (newStatus === 'COMPLETED') {
      setForm((f) => ({
        ...f,
        paid_amount: String(p),
        paid_date: f.paid_date || f.due_date || today(),
      }));
    } else if (newStatus === 'PENDING') {
      setForm((f) => ({
        ...f,
        paid_amount: '0',
        paid_date: '',
        due_date: f.due_date < today() ? today() : f.due_date,
      }));
    } else if (newStatus === 'OVERDUE') {
      const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
      setForm((f) => ({
        ...f,
        paid_amount: '0',
        paid_date: '',
        due_date: f.due_date >= today() ? yesterday : f.due_date,
      }));
    } else if (newStatus === 'PARTIAL') {
      const half = p > 0 ? Math.round(p / 2) : 0;
      setForm((f) => ({
        ...f,
        paid_amount: String(half > 0 ? half : 1),
        paid_date: f.paid_date || f.due_date || today(),
      }));
    }
  };

  const submit = async () => {
    setErrors({});
    if (!form.due_date) { setErrors({ due_date: 'Required' }); return; }
    if (!form.payable_amount) { setErrors({ payable_amount: 'Required' }); return; }
    if (Number(form.paid_amount) > Number(form.payable_amount)) {
      setErrors({ paid_amount: 'Amount paid cannot exceed the amount due' });
      return;
    }
    const payload = {
      installment_no: Number(form.installment_no),
      due_date: form.due_date,
      payable_amount: Number(form.payable_amount),
      paid_amount: form.paid_amount !== '' ? Number(form.paid_amount) : 0,
      paid_date: Number(form.paid_amount) > 0 ? (form.paid_date || form.due_date) : undefined,
      status: selectedStatus,
    };
    if (localOnly) {
      onDone?.({ ...payload, status: selectedStatus });
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
      <div className="form-grid" style={{ rowGap: 16 }}>
        <Field label="Installment No *" error={errors.installment_no}>
          <input type="number" min="1" step="1" value={form.installment_no} onChange={(e) => set('installment_no', e.target.value)} />
        </Field>
        <Field label="Due Date *" error={errors.due_date}>
          <input type="date" value={form.due_date} onChange={(e) => set('due_date', e.target.value)} />
        </Field>
        <Field label="Amount Due *" error={errors.payable_amount}>
          <input type="number" min="0.01" step="0.01" value={form.payable_amount} onChange={(e) => set('payable_amount', e.target.value)} />
        </Field>
        <Field label="Amount Paid *" error={errors.paid_amount}>
          <input type="number" min="0" step="0.01" value={form.paid_amount} disabled={hasPayment}
            onChange={(e) => set('paid_amount', e.target.value)} />
        </Field>
        <Field label="Paid Date *" error={errors.paid_date}>
          <input type="date" value={form.paid_date} disabled={hasPayment || Number(form.paid_amount) <= 0}
            onChange={(e) => set('paid_date', e.target.value)} />
        </Field>
        <Field label="Status">
          <select value={selectedStatus} onChange={(e) => handleStatusChange(e.target.value)} disabled={hasPayment}>
            <option value="PENDING">PENDING</option>
            <option value="PARTIAL">PARTIAL</option>
            <option value="COMPLETED">COMPLETED</option>
            <option value="OVERDUE">OVERDUE</option>
          </select>
        </Field>
      </div>
      {hasPayment && (
        <p className="muted" style={{ fontSize: 12, margin: '10px 0 0' }}>
          {money(editInstallment.paid_amount)} is already recorded as paid against this due, so Amount Paid/Paid Date
          are locked here — edit that from Collection History instead.
        </p>
      )}
      <p className="muted" style={{ fontSize: 12, margin: '10px 0 0' }}>
        Select the status directly from the dropdown or edit the fields above to define/back-fill the schedule.
      </p>
    </Modal>
  );
}
