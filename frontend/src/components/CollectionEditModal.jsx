import { useState } from 'react';
import { api, money } from '../api/client';
import { Field, Modal } from './ui';
import { useAuth } from '../state/AuthContext';
import { useToast } from '../state/ToastContext';
import { FiSave } from 'react-icons/fi';

/**
 * Edit a posted collection IN PLACE. Which dues it covers can't be re-chosen
 * here (that stays fixed to what the payment originally started from) - only
 * the payment's own fields are editable, matching what the backend accepts.
 */
export default function CollectionEditModal({ collection, onClose, onDone }) {
  const { meta } = useAuth();
  const toast = useToast();
  const modes = meta?.payment_modes || [];
  const accounts = meta?.accounts || [];
  const splitMode = modes.find((m) => String(m.code).toUpperCase() === 'SPLIT');

  const [form, setForm] = useState({
    amount: collection.amount ?? '',
    fine_amount: collection.fine_amount ?? '0',
    collection_date: (collection.collection_date || '').slice(0, 10),
    payment_mode_id: collection.payment_mode_id ?? '',
    account_id: collection.account_id ?? '',
    cash_amount: collection.cash_amount ?? '',
    upi_amount: collection.upi_amount ?? '',
    reference_no: collection.reference_no ?? '',
    bill_no: collection.bill_no ?? '',
    remarks: collection.remarks ?? '',
  });
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState({});
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const isSplit = splitMode && String(form.payment_mode_id) === String(splitMode.id);
  const total = isSplit
    ? Number(form.cash_amount || 0) + Number(form.upi_amount || 0) + Number(form.fine_amount || 0)
    : Number(form.amount || 0) + Number(form.fine_amount || 0);

  const submit = async () => {
    setBusy(true); setErrors({});
    try {
      await api.put(`/api/collections/${collection.id}`, {
        amount: isSplit ? Number(form.cash_amount || 0) + Number(form.upi_amount || 0) : Number(form.amount),
        fine_amount: Number(form.fine_amount || 0),
        collection_date: form.collection_date,
        payment_mode_id: Number(form.payment_mode_id),
        account_id: isSplit ? undefined : (form.account_id ? Number(form.account_id) : undefined),
        cash_amount: isSplit ? Number(form.cash_amount || 0) : undefined,
        upi_amount: isSplit ? Number(form.upi_amount || 0) : undefined,
        reference_no: form.reference_no || undefined,
        bill_no: form.bill_no || undefined,
        remarks: form.remarks || undefined,
      });
      toast.success('Collection updated');
      onDone?.();
    } catch (e) {
      if (e.errors) setErrors(Object.fromEntries(Object.entries(e.errors).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v])));
      else toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={`Edit Collection — ${collection.receipt_no}`} onClose={onClose}
      footer={<>
        <button type="button" className="btn secondary" onClick={onClose} disabled={busy}>Cancel</button>
        <button type="submit" form="edit-collection-form" className="btn" disabled={busy} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <FiSave size={14} /> {busy ? 'Saving…' : `Save (${money(total)})`}
        </button>
      </>}>
      <form id="edit-collection-form" onSubmit={(e) => { e.preventDefault(); if (!busy) submit(); }}>
        <div className="form-grid">
          <Field label="Collection Date" error={errors.collection_date}>
            <input type="date" value={form.collection_date} onChange={(e) => set('collection_date', e.target.value)} />
          </Field>
          <Field label="Payment Mode" error={errors.payment_mode_id}>
            <select value={form.payment_mode_id} onChange={(e) => set('payment_mode_id', e.target.value)}>
              {modes.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </Field>
          {isSplit ? (
            <>
              <Field label="Cash Amount" error={errors.cash_amount}>
                <input type="number" min="0" step="0.01" value={form.cash_amount} onChange={(e) => set('cash_amount', e.target.value)} />
              </Field>
              <Field label="UPI Amount" error={errors.upi_amount}>
                <input type="number" min="0" step="0.01" value={form.upi_amount} onChange={(e) => set('upi_amount', e.target.value)} />
              </Field>
            </>
          ) : (
            <>
              <Field label="Amount Paid" error={errors.amount}>
                <input type="number" min="0" step="0.01" value={form.amount} onChange={(e) => set('amount', e.target.value)} />
              </Field>
              <Field label="Cash / Bank Account" error={errors.account_id}>
                <select value={form.account_id} onChange={(e) => set('account_id', e.target.value)}>
                  <option value="">(unchanged)</option>
                  {accounts.map((a) => <option key={a.id} value={a.id}>{a.name} ({a.type})</option>)}
                </select>
              </Field>
            </>
          )}
          <Field label="Fine / Charges" error={errors.fine_amount}>
            <input type="number" min="0" step="0.01" value={form.fine_amount} onChange={(e) => set('fine_amount', e.target.value)} />
          </Field>
          <Field label="Reference / Receipt No." error={errors.reference_no}>
            <input value={form.reference_no} onChange={(e) => set('reference_no', e.target.value)} />
          </Field>
          <Field label="Bill No" error={errors.bill_no}>
            <input value={form.bill_no} onChange={(e) => set('bill_no', e.target.value)} placeholder="e.g. BILL-1025" />
          </Field>
        </div>
        <Field label="Remarks" error={errors.remarks}>
          <textarea rows={2} value={form.remarks} onChange={(e) => set('remarks', e.target.value)} />
        </Field>
        <p className="muted" style={{ fontSize: 12, margin: 0 }}>
          The old payment effect is fully reversed and replaced by the new amount — the dues it covers stay the same;
          nothing is added on top of the previous effect.
        </p>
      </form>
    </Modal>
  );
}