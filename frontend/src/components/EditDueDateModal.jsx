import { useState } from 'react';
import { api, money } from '../api/client';
import { Field, Modal } from './ui';
import { useToast } from '../state/ToastContext';
import { FiSave } from 'react-icons/fi';

/**
 * "Edit Due": corrects a single installment's EMI/due date (and, only while
 * unpaid, its amount) — works for any chit, auto-scheduled or custom. This is
 * NOT the collection/paid date, which is set only by recording a payment; the
 * two stay completely separate (see CollectionController::updateDue).
 */
export default function EditDueDateModal({ installment, onClose, onDone }) {
  const toast = useToast();
  const hasPayment = Number(installment.paid_amount) > 0;
  const [form, setForm] = useState({
    due_date: String(installment.due_date).slice(0, 10),
    payable_amount: installment.payable_amount,
  });
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState({});
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async () => {
    setErrors({});
    if (!form.due_date) { setErrors({ due_date: 'Required' }); return; }
    setBusy(true);
    try {
      const payload = { due_date: form.due_date };
      if (!hasPayment) payload.payable_amount = Number(form.payable_amount);
      await api.put(`/api/installments/${installment.id}`, payload);
      toast.success(`Due #${installment.installment_no} updated`);
      onDone?.();
    } catch (e) {
      if (e.errors) setErrors(Object.fromEntries(Object.entries(e.errors).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v])));
      else toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={`Edit Due — #${installment.installment_no}`} onClose={onClose}
      footer={<>
        <button className="btn secondary" onClick={onClose} disabled={busy}>Cancel</button>
        <button className="btn" onClick={submit} disabled={busy || !form.due_date}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <FiSave size={14} /> {busy ? 'Saving…' : 'Save'}
        </button>
      </>}>
      <div className="form-grid">
        <Field label="EMI / Due Date *" error={errors.due_date}>
          <input type="date" value={form.due_date} onChange={(e) => set('due_date', e.target.value)} />
        </Field>
        <Field label="Due Amount" error={errors.payable_amount}>
          <input type="number" min="0.01" step="0.01" value={form.payable_amount} disabled={hasPayment}
            onChange={(e) => set('payable_amount', e.target.value)} />
        </Field>
      </div>
      {hasPayment ? (
        <p className="muted" style={{ fontSize: 12, margin: '10px 0 0' }}>
          {money(installment.paid_amount)} is already paid against this due, so its amount is locked — only the due
          date can be corrected here. To change the amount, edit or cancel the payment instead.
        </p>
      ) : (
        <p className="muted" style={{ fontSize: 12, margin: '10px 0 0' }}>
          This only changes the EMI due date shown on the schedule — it never touches any collection/paid date.
        </p>
      )}
    </Modal>
  );
}
