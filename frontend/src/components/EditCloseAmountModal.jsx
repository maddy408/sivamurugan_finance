import { useState } from 'react';
import { api } from '../api/client';
import { Field, Modal } from './ui';
import { validateDate, validateAmount, focusFirstError } from '../utils/validation';
import { useToast } from '../state/ToastContext';
import { useI18n } from '../state/I18nContext';
import { FiSave } from 'react-icons/fi';

/**
 * Edit Close Settlement: updates the SAME close-settlement collection row in
 * place (never creates a second one) — see CollectionService::updateCloseSettlement.
 */
export default function EditCloseAmountModal({ loan, settlement, onClose, onDone }) {
  const toast = useToast();
  const { t } = useI18n();
  const [form, setForm] = useState({
    close_date: String(settlement.collection_date).slice(0, 10),
    close_amount: settlement.amount,
    remarks: settlement.remarks || '',
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

  const submit = async () => {
    const errs = {};
    const dateErr = validateDate(form.close_date, { required: true, fieldLabel: 'Close date' });
    if (dateErr) errs.close_date = dateErr;
    if (form.close_amount === '') {
      errs.close_amount = t('Close amount is required.', 'Close amount is required.');
    } else if (Number(form.close_amount) < 0) {
      errs.close_amount = t('Close amount cannot be negative.', 'Close amount cannot be negative.');
    }

    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      focusFirstError(errs);
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      await api.put(`/api/loans/${loan.id}/close`, {
        close_date: form.close_date,
        close_amount: Number(form.close_amount),
        remarks: form.remarks || undefined,
      });
      toast.success(t('Close settlement updated', 'Close settlement updated'));
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
    <Modal title={t('Edit Close Settlement', 'Edit Close Settlement')} onClose={onClose}
      footer={<>
        <button className="btn secondary" onClick={onClose} disabled={busy}>{t('Cancel', 'Cancel')}</button>
        <button className="btn" onClick={submit} disabled={busy}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <FiSave size={14} /> {busy ? t('Saving…', 'Saving…') : t('Save', 'Save')}
        </button>
      </>}>
      <div className="form-grid">
        <Field label={`${t('Close Date', 'Close Date')} *`} error={errors.close_date}>
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
        <Field label={`${t('Close Amount', 'Close Amount')} *`} error={errors.close_amount}>
          <input
            name="close_amount"
            type="number"
            min="0"
            step="0.01"
            value={form.close_amount}
            onChange={(e) => set('close_amount', e.target.value)}
            onBlur={() => {
              if (form.close_amount === '') setErrors((prev) => ({ ...prev, close_amount: t('Close amount is required.', 'Close amount is required.') }));
              else if (Number(form.close_amount) < 0) setErrors((prev) => ({ ...prev, close_amount: t('Close amount cannot be negative.', 'Close amount cannot be negative.') }));
            }}
          />
        </Field>
        <div style={{ gridColumn: '1 / -1' }}>
          <Field label={t('Remarks', 'Remarks')} error={errors.remarks}>
            <textarea rows={2} value={form.remarks} onChange={(e) => set('remarks', e.target.value)} />
          </Field>
        </div>
      </div>
      <p className="muted" style={{ fontSize: 12, margin: '10px 0 0' }}>
        {t('This updates the existing close settlement record in place — financial totals reflect this new amount only, with no double counting.', 'This updates the existing close settlement record in place — financial totals reflect this new amount only, with no double counting.')}
      </p>
    </Modal>
  );
}