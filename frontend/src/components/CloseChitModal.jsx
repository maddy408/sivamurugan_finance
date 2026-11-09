import { useState } from 'react';
import { api, money } from '../api/client';
import { Field, Modal } from './ui';
import { validateDate, validateAmount, focusFirstError } from '../utils/validation';
import { useToast } from '../state/ToastContext';
import { useI18n } from '../state/I18nContext';
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
  const { t, lang } = useI18n();
  const defaultAmount = loan?.outstanding_balance ?? loan?.summary?.outstanding_balance ?? '';
  const [form, setForm] = useState({
    close_date: today(),
    close_amount: defaultAmount !== '' && defaultAmount !== null && defaultAmount !== undefined ? String(defaultAmount) : '',
    remarks: '',
  });
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState({});
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

  const unpaidCount = (loan?.installments || []).filter((i) => i.status !== 'COMPLETED').length;
  const custName = customer?.name || loan?.customer_name || loan?.customer?.name || 'N/A';

  const submit = async () => {
    const errs = {};
    const dateErr = validateDate(form.close_date, { required: true, fieldLabel: 'Close date' });
    if (dateErr) errs.close_date = dateErr;
    if (form.close_amount === '') {
      errs.close_amount = 'Close amount is required.';
    } else if (Number(form.close_amount) < 0) {
      errs.close_amount = 'Close amount cannot be negative.';
    }

    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      focusFirstError(errs);
      return;
    }
    setErrors({});
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
      if (e.errors) {
        const mapped = Object.fromEntries(Object.entries(e.errors).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]));
        setErrors(mapped);
        focusFirstError(mapped);
      } else {
        toast.error(e.message);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={t("Close Chit", "Close Chit")} onClose={onClose}
      footer={<>
        <button className="btn secondary" onClick={onClose} disabled={busy}>{t("Cancel", "Cancel")}</button>
        <button className="btn danger" onClick={submit} disabled={busy}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <FiXCircle size={14} /> {busy ? t('Closing...', 'Closing...') : t('Close Chit', 'Close Chit')}
        </button>
      </>}>
      <dl className="kv" style={{ gridTemplateColumns: '140px 1fr', rowGap: 6, marginBottom: 14 }}>
        <dt>{t("Chit", "Chit")}</dt><dd><b>{loan?.code}</b></dd>
        <dt>{t("Customer", "Customer")}</dt><dd>{custName}</dd>
        <dt>{t("Chit Total Amount", "Chit Total Amount")}</dt><dd>{money(loan?.principal_amount)}</dd>
      </dl>
      {unpaidCount > 0 && (
        <p className="muted" style={{ fontSize: 12, background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '8px 12px', margin: '0 0 14px' }}>
          {lang === 'ta'
            ? `${unpaidCount} தவணைகள் இன்னும் முழுமையாக செலுத்தப்படவில்லை.`
            : `${unpaidCount} due${unpaidCount === 1 ? '' : 's'} not yet fully paid. Closing will not mark them as paid - they stay exactly as they are, for historical accuracy.`}
        </p>
      )}
      <div className="form-grid">
        <Field label={t("Close Date *", "Close Date *")} error={errors.close_date}>
          <input
            name="close_date"
            type="date"
            value={form.close_date}
            onChange={(e) => set('close_date', e.target.value)}
            onBlur={() => {
              const err = validateDate(form.close_date, { required: true, fieldLabel: 'Close date' });
              if (err) setErrors((prev) => ({ ...prev, close_date: err }));
            }}
          />
        </Field>
        <Field label={t("Close Amount *", "Close Amount *")} error={errors.close_amount}>
          <input
            name="close_amount"
            type="number"
            min="0"
            step="0.01"
            value={form.close_amount}
            onChange={(e) => set('close_amount', e.target.value)}
            onBlur={() => {
              if (form.close_amount === '') setErrors((prev) => ({ ...prev, close_amount: 'Close amount is required.' }));
              else if (Number(form.close_amount) < 0) setErrors((prev) => ({ ...prev, close_amount: 'Close amount cannot be negative.' }));
            }}
            placeholder={t("Close/Settlement amount collected", "Close/Settlement amount collected")}
          />
        </Field>
        <div style={{ gridColumn: '1 / -1' }}>
          <Field label={t("Remarks", "Remarks")} error={errors.remarks}>
            <textarea rows={2} value={form.remarks} onChange={(e) => set('remarks', e.target.value)} />
          </Field>
        </div>
      </div>
      <p className="muted" style={{ fontSize: 12, margin: '10px 0 0' }}>
        {t("The Close Amount is recorded as a separate \"Close Chit / Final Settlement\" entry in Collection History - it does not change Due 3/Due 4/etc.'s amounts or any existing payment. Once closed, no further collections or distributions can be recorded until the chit is reopened.", "The Close Amount is recorded as a separate \"Close Chit / Final Settlement\" entry in Collection History - it does not change Due 3/Due 4/etc.'s amounts or any existing payment. Once closed, no further collections or distributions can be recorded until the chit is reopened.")}
      </p>
    </Modal>
  );
}