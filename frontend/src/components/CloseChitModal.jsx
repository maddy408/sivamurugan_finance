import { useState } from 'react';
import { api, money } from '../api/client';
import { Field, Modal } from './ui';
import { useToast } from '../state/ToastContext';
import { FiXCircle } from 'react-icons/fi';

const today = () => new Date().toISOString().slice(0, 10);

/**
 * Close Chit: ends the chit regardless of whether every due was paid.
 * Does NOT touch installments - paid dues stay PAID, unpaid dues stay
 * PENDING/OVERDUE exactly as they are. The Close Amount is stored as a
 * separate settlement collection (collection_type='close_settlement'), never
 * merged into any due/installment amount - see
 * CollectionService::createCloseSettlement. There is deliberately no upper
 * bound on the amount: it is not checked against pending/remaining/principal.
 */
export default function CloseChitModal({ loan, customer, onClose, onDone }) {
  const toast = useToast();
  const defaultAmount = loan?.outstanding_balance ?? loan?.summary?.outstanding_balance ?? '';
  const [form, setForm] = useState({
    close_date: today(),
    close_amount: defaultAmount !== '' && defaultAmount !== null && defaultAmount !== undefined ? String(defaultAmount) : '',
    remarks: '',
  });
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState({});
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const unpaidCount = (loan?.installments || []).filter((i) => i.status !== 'COMPLETED').length;
  const custName = customer?.name || loan?.customer_name || loan?.customer?.name || 'N/A';

  const submit = async () => {
    setErrors({});
    if (!form.close_date) { setErrors({ close_date: 'Required' }); return; }
    if (form.close_amount === '' || Number(form.close_amount) < 0) { setErrors({ close_amount: 'Required' }); return; }
    setBusy(true);
    try {
      await api.post(`/api/loans/${loan.id}/close`, {
        close_date: form.close_date,
        close_amount: Number(form.close_amount),
        remarks: form.remarks || undefined,
      });
      toast.success('Chit closed');
      onDone?.();
    } catch (e) {
      if (e.errors) setErrors(Object.fromEntries(Object.entries(e.errors).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v])));
      else toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Close Chit" onClose={onClose}
      footer={<>
        <button className="btn secondary" onClick={onClose} disabled={busy}>Cancel</button>
        <button className="btn danger" onClick={submit} disabled={busy}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <FiXCircle size={14} /> {busy ? 'Closing...' : 'Close Chit'}
        </button>
      </>}>
      <dl className="kv" style={{ gridTemplateColumns: '140px 1fr', rowGap: 6, marginBottom: 14 }}>
        <dt>Chit</dt><dd><b>{loan?.code}</b></dd>
        <dt>Customer</dt><dd>{custName}</dd>
        <dt>Chit Total Amount</dt><dd>{money(loan?.principal_amount)}</dd>
      </dl>
      {unpaidCount > 0 && (
        <p className="muted" style={{ fontSize: 12, background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '8px 12px', margin: '0 0 14px' }}>
          {unpaidCount} due{unpaidCount === 1 ? '' : 's'} not yet fully paid. Closing will <b>not</b> mark them as paid - they stay exactly as they are, for historical accuracy.
        </p>
      )}
      <div className="form-grid">
        <Field label="Close Date *" error={errors.close_date}>
          <input type="date" value={form.close_date} onChange={(e) => set('close_date', e.target.value)} />
        </Field>
        <Field label="Close Amount *" error={errors.close_amount}>
          <input type="number" min="0" step="0.01" value={form.close_amount} onChange={(e) => set('close_amount', e.target.value)}
            placeholder="Close/Settlement amount collected" />
        </Field>
        <div style={{ gridColumn: '1 / -1' }}>
          <Field label="Remarks" error={errors.remarks}>
            <textarea rows={2} value={form.remarks} onChange={(e) => set('remarks', e.target.value)} />
          </Field>
        </div>
      </div>
      <p className="muted" style={{ fontSize: 12, margin: '10px 0 0' }}>
        The Close Amount is recorded as a separate "Close Chit / Final Settlement" entry in Collection History - it
        does not change Due 3/Due 4/etc.'s amounts or any existing payment. Once closed, no further collections or
        distributions can be recorded until the chit is reopened.
      </p>
    </Modal>
  );
}