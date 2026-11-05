import { useState } from 'react';
import { api } from '../api/client';
import { Field, Modal } from './ui';
import { useToast } from '../state/ToastContext';
import { FiSave } from 'react-icons/fi';

/**
 * Edit Close Settlement: updates the SAME close-settlement collection row in
 * place (never creates a second one) — see CollectionService::updateCloseSettlement.
 */
export default function EditCloseAmountModal({ loan, settlement, onClose, onDone }) {
  const toast = useToast();
  const [form, setForm] = useState({
    close_date: String(settlement.collection_date).slice(0, 10),
    close_amount: settlement.amount,
    remarks: settlement.remarks || '',
  });
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState({});
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async () => {
    setErrors({});
    if (form.close_amount === '' || Number(form.close_amount) < 0) { setErrors({ close_amount: 'Required' }); return; }
    setBusy(true);
    try {
      await api.put(`/api/loans/${loan.id}/close`, {
        close_date: form.close_date,
        close_amount: Number(form.close_amount),
        remarks: form.remarks || undefined,
      });
      toast.success('Close settlement updated');
      onDone?.();
    } catch (e) {
      if (e.errors) setErrors(Object.fromEntries(Object.entries(e.errors).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v])));
      else toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Edit Close Settlement" onClose={onClose}
      footer={<>
        <button className="btn secondary" onClick={onClose} disabled={busy}>Cancel</button>
        <button className="btn" onClick={submit} disabled={busy}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <FiSave size={14} /> {busy ? 'Saving…' : 'Save'}
        </button>
      </>}>
      <div className="form-grid">
        <Field label="Close Date *" error={errors.close_date}>
          <input type="date" value={form.close_date} onChange={(e) => set('close_date', e.target.value)} />
        </Field>
        <Field label="Close Amount *" error={errors.close_amount}>
          <input type="number" min="0" step="0.01" value={form.close_amount} onChange={(e) => set('close_amount', e.target.value)} />
        </Field>
        <div style={{ gridColumn: '1 / -1' }}>
          <Field label="Remarks" error={errors.remarks}>
            <textarea rows={2} value={form.remarks} onChange={(e) => set('remarks', e.target.value)} />
          </Field>
        </div>
      </div>
      <p className="muted" style={{ fontSize: 12, margin: '10px 0 0' }}>
        This updates the existing close settlement record in place — financial totals reflect this new amount only,
        with no double counting.
      </p>
    </Modal>
  );
}