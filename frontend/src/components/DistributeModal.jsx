import { useEffect, useState } from 'react';
import { api, money, fmtDate } from '../api/client';
import { Field, Modal, Confirm } from './ui';
import { validateAmount, validateDate, validateSelect, focusFirstError } from '../utils/validation';
import { useAuth } from '../state/AuthContext';
import { useToast } from '../state/ToastContext';
import { useI18n } from '../state/I18nContext';
import { FiEdit2, FiXCircle, FiTrash2, FiList, FiPlusCircle, FiCheck } from 'react-icons/fi';

const today = () => new Date().toISOString().slice(0, 10);
const STATUS_LABEL = {
  not_distributed: 'Not Distributed',
  partially_distributed: 'Partially Distributed',
  fully_distributed: 'Fully Distributed',
  fully_distributed_extra: 'Fully Distributed + Extra',
};

/**
 * Disburse / Distribute Chit.
 *   - Creating a chit moves no money. Confirming a row here is the ONLY thing that
 *     reduces the selected Office Cash / Bank account and raises "Distributed Amount".
 *   - "New EMI Amount" is entered by the user and applied to future installments.
 *   - Edit/Cancel/Delete a history row: the backend reconciles balances (net
 *     difference only) — editing an amount UPDATES the same row, it never
 *     inserts a second distribution.
 *
 * `editRowId` — optionally open already focused on editing that row (used when
 * the caller jumps here from the page-level Disbursement History table).
 */
export default function DistributeModal({ loan, onClose, onDone, editRowId }) {
  const { meta, can } = useAuth();
  const toast = useToast();
  const { t } = useI18n();
  const accounts = meta?.accounts || [];
  const officeCash = accounts.find((a) => a.type === 'cash') || accounts[0];

  const [data, setData] = useState(null);        // { summary, distributions }
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState({});
  const [editing, setEditing] = useState(null);  // distribution row being edited, or null = add mode
  const [cancelRow, setCancelRow] = useState(null);
  const [deleteRow, setDeleteRow] = useState(null);

  const [form, setForm] = useState({
    distributed_date: today(),
    amount: '',
    new_emi_amount: String(loan?.installment_amount ?? ''),
    account_id: officeCash?.id ? String(officeCash.id) : '',
    remarks: '',
  });

  const reload = () => api.get(`/api/loans/${loan.id}/distributions`).then((r) => setData(r.data)).catch((e) => toast.error(e.message));
  useEffect(() => { reload(); /* eslint-disable-next-line */ }, [loan.id]);

  // Jump straight into editing the requested row once its data has loaded.
  useEffect(() => {
    if (editRowId && data?.distributions && !editing) {
      const row = data.distributions.find((r) => r.id === editRowId);
      if (row) startEdit(row);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editRowId, data]);

  const s = data?.summary;
  const principal = Number(loan?.principal_amount ?? 0);
  const totalDistributed = Number(s?.total_distributed ?? 0);
  const principalCovered = Number(s?.principal_covered ?? Math.min(totalDistributed, principal));
  const extraDisbursed = Number(s?.extra_disbursed ?? Math.max(totalDistributed - principal, 0));
  const remaining = Number(s?.remaining_undistributed ?? Math.max(principal - totalDistributed, 0));

  const startEdit = (row) => {
    setEditing(row);
    setErrors({});
    setForm({
      distributed_date: fmtDate(row.distributed_date),
      amount: String(row.amount),
      new_emi_amount: row.new_emi_amount != null ? String(row.new_emi_amount) : '',
      account_id: String(row.account_id),
      remarks: row.remarks || '',
    });
  };

  const resetForm = () => {
    setEditing(null); setErrors({});
    setForm({
      distributed_date: today(), amount: '',
      new_emi_amount: String((data?.summary?.current_emi) ?? loan?.installment_amount ?? ''),
      account_id: officeCash?.id ? String(officeCash.id) : '', remarks: '',
    });
  };

  const submit = async () => {
    const errs = {};
    const amtErr = validateAmount(form.amount, { required: true, min: 0.01, fieldLabel: 'Disbursed amount' });
    if (amtErr) errs.amount = amtErr;
    const dateErr = validateDate(form.distributed_date, { required: true, fieldLabel: 'Disbursed date' });
    if (dateErr) errs.distributed_date = dateErr;
    const accErr = validateSelect(form.account_id, 'Account');
    if (accErr) errs.account_id = accErr;
    if (form.new_emi_amount !== '' && Number(form.new_emi_amount) <= 0) {
      errs.new_emi_amount = 'New EMI amount must be greater than 0.';
    }

    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      focusFirstError(errs);
      return;
    }

    setBusy(true); setErrors({});
    const body = {
      distributed_date: form.distributed_date,
      amount: Number(form.amount),
      new_emi_amount: form.new_emi_amount === '' ? null : Number(form.new_emi_amount),
      account_id: Number(form.account_id),
      remarks: form.remarks || undefined,
    };
    try {
      if (editing) {
        await api.put(`/api/distributions/${editing.id}`, body);
        toast.success('Distribution updated');
      } else {
        const r = await api.post(`/api/loans/${loan.id}/distributions`, body);
        toast.success(`Distributed ${money(r.data.amount)} from ${r.data.account_name}`);
      }
      resetForm();
      await reload();
      onDone?.();
      onClose?.(); // Auto close modal on success
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

  const doCancel = async () => {
    setBusy(true);
    try {
      await api.post(`/api/distributions/${cancelRow.id}/cancel`, { reason: cancelRow.reason || 'Cancelled' });
      toast.success('Distribution cancelled — the amount is back in its account.');
      setCancelRow(null);
      resetForm();
      await reload();
      onDone?.();
    } catch (e) { toast.error(e.message); } finally { setBusy(false); }
  };

  const doDelete = async () => {
    setBusy(true);
    try {
      await api.del(`/api/distributions/${deleteRow.id}`, { reason: deleteRow.reason || 'Deleted' });
      toast.success('Distribution deleted');
      setDeleteRow(null);
      resetForm();
      await reload();
      onDone?.();
    } catch (e) { toast.error(e.message); } finally { setBusy(false); }
  };

  const Stat = ({ label, value, accent }) => (
    <div className="distribute-stat-card">
      <div className="stat-label" title={label}>{label}</div>
      <div className="stat-value" style={{ color: accent || 'inherit' }}>{money(value)}</div>
    </div>
  );

  const canSubmit = Number(form.amount) > 0 && form.account_id;

  const distributions = data?.distributions || [];

  return (
    <>
      <Modal
        title={`${t('Disburse Chit', 'Disburse Chit')} — ${loan.code}`}
        size="lg"
        onClose={onClose}
        footer={
          <div style={{ display: 'flex', gap: 8, width: '100%', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
            <button type="button" className="btn secondary" onClick={onClose} disabled={busy} style={{ flex: '1 1 auto' }}>
              {t('Close', 'Close')}
            </button>
            {editing && (
              <button type="button" className="btn secondary" onClick={resetForm} disabled={busy} style={{ flex: '1 1 auto' }}>
                {t('Cancel edit', 'Cancel edit')}
              </button>
            )}
            <button
              type="button"
              className="btn"
              onClick={submit}
              disabled={busy || !canSubmit}
              style={{ flex: '2 1 auto', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontWeight: 700 }}
            >
              <FiCheck size={15} />
              {busy ? t('Saving…', 'Saving…') : (editing ? t('Save changes', 'Save changes') : `${t('Confirm Disbursement', 'Confirm Disbursement')}${form.amount ? ` — ${money(Number(form.amount))}` : ''}`)}
            </button>
          </div>
        }
      >
        {!data ? <p className="muted">{t('Loading…', 'Loading…')}</p> : (
          <>
            <div className="distribute-stats-grid">
              <Stat label={t('Chit Amount', 'Chit Amount')} value={s.chit_amount ?? loan.principal_amount} />
              <Stat label={t('Total Distributed', 'Total Distributed')} value={s.total_distributed ?? 0} accent="#15803d" />
              <Stat label={t('Principal Covered', 'Principal Covered')} value={principalCovered} accent="#2563eb" />
              <Stat label={t('Extra Disbursed', 'Extra Disbursed')} value={extraDisbursed} accent={extraDisbursed > 0 ? '#f59e0b' : '#64748b'} />
            </div>

            <div style={{
              background: '#f8fafc',
              border: '1px solid var(--line-subtle, #e2e8f0)',
              borderRadius: 8,
              padding: '8px 12px',
              fontSize: 12,
              marginBottom: 14,
              display: 'flex',
              flexDirection: 'column',
              gap: 6
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
                <span className="muted">{t('Remaining undistributed', 'Remaining undistributed')}: <strong style={{ color: '#0f172a' }}>{money(remaining)}</strong></span>
                <span className="muted">{t('Status', 'Status')}: <strong style={{ color: '#0f172a' }}>{t(STATUS_LABEL[s.status] || s.status, STATUS_LABEL[s.status] || s.status)}</strong></span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6, borderTop: '1px dashed var(--line-subtle, #e2e8f0)', paddingTop: 5 }}>
                <span className="muted">{t('Initial EMI', 'Initial EMI')}: <strong>{money(s.initial_emi)}</strong></span>
                <span className="muted">{t('Current EMI', 'Current EMI')}: <strong style={{ color: '#2563eb' }}>{money(s.current_emi)}</strong></span>
              </div>
            </div>

            <h4 style={{ margin: '6px 0 10px', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13.5 }}>
              {editing ? <><FiEdit2 size={14} /> {t('Edit disbursement', 'Edit disbursement')} #{editing.id}</> : <><FiPlusCircle size={14} /> {t('Add Disbursement Payment', 'Add Disbursement Payment')}</>}
            </h4>
            <div className="form-grid">
              <Field label={`${t('Disbursed Date', 'Disbursed Date')} *`} error={errors.distributed_date}>
                <input
                  name="distributed_date"
                  type="date"
                  value={form.distributed_date}
                  onChange={(e) => {
                    setForm({ ...form, distributed_date: e.target.value });
                    if (errors.distributed_date) setErrors((prev) => { const n = { ...prev }; delete n.distributed_date; return n; });
                  }}
                  onBlur={() => {
                    const err = validateDate(form.distributed_date, { required: true, fieldLabel: 'Disbursed date' });
                    if (err) setErrors((prev) => ({ ...prev, distributed_date: err }));
                  }}
                />
              </Field>
              <Field label={`${t('Disbursed Amount', 'Disbursed Amount')} (₹) *`} error={errors.amount}>
                <input
                  name="amount"
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={form.amount}
                  autoFocus
                  placeholder={`${t('Amount to disburse', 'Amount to disburse')} (${t('remaining', 'remaining')} ${money(remaining)})`}
                  onChange={(e) => {
                    setForm({ ...form, amount: e.target.value });
                    if (errors.amount) setErrors((prev) => { const n = { ...prev }; delete n.amount; return n; });
                  }}
                  onBlur={() => {
                    const err = validateAmount(form.amount, { required: true, min: 0.01, fieldLabel: 'Disbursed amount' });
                    if (err) setErrors((prev) => ({ ...prev, amount: err }));
                  }}
                />
              </Field>
              <Field label={`${t('New EMI Amount', 'New EMI Amount')} (₹)`} error={errors.new_emi_amount}>
                <input
                  name="new_emi_amount"
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={form.new_emi_amount}
                  onChange={(e) => {
                    setForm({ ...form, new_emi_amount: e.target.value });
                    if (errors.new_emi_amount) setErrors((prev) => { const n = { ...prev }; delete n.new_emi_amount; return n; });
                  }}
                  onBlur={() => {
                    if (form.new_emi_amount !== '' && Number(form.new_emi_amount) <= 0) {
                      setErrors((prev) => ({ ...prev, new_emi_amount: 'New EMI amount must be greater than 0.' }));
                    }
                  }}
                  placeholder={t('leave blank to keep current EMI', 'leave blank to keep current EMI')}
                />
                <span className="muted" style={{ fontSize: 11 }}>{t('Applies to future EMIs after the disbursed date. Entered manually — no interest calculation.', 'Applies to future EMIs after the disbursed date. Entered manually — no interest calculation.')}</span>
              </Field>
              <Field label={`${t('Disburse From', 'Disburse From')} *`} error={errors.account_id}>
                <select
                  name="account_id"
                  value={form.account_id}
                  onChange={(e) => {
                    setForm({ ...form, account_id: e.target.value });
                    if (errors.account_id) setErrors((prev) => { const n = { ...prev }; delete n.account_id; return n; });
                  }}
                  onBlur={() => {
                    const err = validateSelect(form.account_id, 'Account');
                    if (err) setErrors((prev) => ({ ...prev, account_id: err }));
                  }}>
                  <option value="">— {t('select account', 'select account')} —</option>
                  {accounts.map((a) => <option key={a.id} value={a.id}>{a.name} ({a.type})</option>)}
                </select>
              </Field>
              <div style={{ gridColumn: '1 / -1' }}>
                <Field label={t('Remarks / Notes', 'Remarks / Notes')} error={errors.remarks}>
                  <input value={form.remarks} onChange={(e) => setForm({ ...form, remarks: e.target.value })} placeholder={t('e.g. 1st Tranche / Cheque payment…', 'e.g. 1st Tranche / Cheque payment…')} />
                </Field>
              </div>
            </div>

            {distributions.length > 0 && (
              <div style={{ marginTop: 18, borderTop: '1px solid var(--line)', paddingTop: 14 }}>
                <h4 style={{ margin: '0 0 10px', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13.5 }}>
                  <FiList size={14} /> {t('Disbursement History & Actions', 'Disbursement History & Actions')}
                </h4>
                <div className="table-wrap">
                  <table className="grid">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>{t('Date', 'Date')}</th>
                        <th>{t('Account', 'Account')}</th>
                        <th className="right">{t('Disbursed Amount', 'Disbursed Amount')}</th>
                        <th className="right">{t('New EMI', 'New EMI')}</th>
                        <th>{t('Remarks', 'Remarks')}</th>
                        <th>{t('Status', 'Status')}</th>
                        <th className="right">{t('Actions', 'Actions')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {distributions.map((row) => {
                        const isActive = row.status === 'active';
                        return (
                          <tr key={row.id} style={!isActive ? { opacity: 0.55 } : undefined}>
                            <td data-label="#" style={{ fontWeight: 700 }}>#{row.id}</td>
                            <td data-label={t('Date', 'Date')}>{fmtDate(row.distributed_date)}</td>
                            <td data-label={t('Account', 'Account')}>{row.account_name}</td>
                            <td data-label={t('Disbursed Amount', 'Disbursed Amount')} className="right" style={{ fontWeight: 700, color: '#15803d' }}>{money(row.amount)}</td>
                            <td data-label={t('New EMI', 'New EMI')} className="right">{row.new_emi_amount != null ? money(row.new_emi_amount) : '—'}</td>
                            <td data-label={t('Remarks', 'Remarks')}>{row.remarks || '—'}</td>
                            <td data-label={t('Status', 'Status')}>
                              <span className={`badge ${isActive ? 'COMPLETED' : 'CANCELLED'}`}>
                                {isActive ? t('Active', 'Active') : t('Cancelled', 'Cancelled')}
                              </span>
                            </td>
                            <td data-label="" className="right nowrap">
                              <div style={{ display: 'inline-flex', gap: 6, justifyContent: 'flex-end' }}>
                                {isActive && can('distributions.edit') && (
                                  <button className="btn-icon" title={t('Edit Distribution', 'Edit Distribution')} onClick={() => startEdit(row)}>
                                    <FiEdit2 size={14} />
                                  </button>
                                )}
                                {isActive && can('distributions.cancel') && (
                                  <button className="btn-icon warning" title={t('Cancel Distribution', 'Cancel Distribution')} onClick={() => setCancelRow({ ...row, reason: '' })}>
                                    <FiXCircle size={14} />
                                  </button>
                                )}
                                {can('distributions.delete') && (
                                  <button className="btn-icon danger" title={t('Delete Distribution', 'Delete Distribution')} onClick={() => setDeleteRow({ ...row, reason: '' })}>
                                    <FiTrash2 size={14} />
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </Modal>
      {cancelRow && (
        <Confirm title={`${t('Cancel disbursement of', 'Cancel disbursement of')} ${money(cancelRow.amount)}?`} danger busy={busy}
          message={t(`${money(cancelRow.amount)} returns to ${cancelRow.account_name}. Distributed total drops, remaining undistributed rises, and the current EMI is recomputed from the remaining history.`, `${money(cancelRow.amount)} returns to ${cancelRow.account_name}. Distributed total drops, remaining undistributed rises, and the current EMI is recomputed from the remaining history.`)}
          confirmLabel={t("Cancel disbursement", "Cancel disbursement")} onConfirm={doCancel} onClose={() => setCancelRow(null)} />
      )}
      {deleteRow && (
        <Confirm title={`${t('Delete disbursement of', 'Delete disbursement of')} ${money(deleteRow.amount)}?`} danger busy={busy}
          message={
            deleteRow.status === 'active'
              ? t(`This will first reverse its financial effect (${money(deleteRow.amount)} returns to ${deleteRow.account_name}), then remove it from the history list. This cannot be undone from the UI.`, `This will first reverse its financial effect (${money(deleteRow.amount)} returns to ${deleteRow.account_name}), then remove it from the history list. This cannot be undone from the UI.`)
              : t('This record is already cancelled and contributes nothing financially. It will be removed from the history list.', 'This record is already cancelled and contributes nothing financially. It will be removed from the history list.')
          }
          confirmLabel={t("Delete", "Delete")} onConfirm={doDelete} onClose={() => setDeleteRow(null)} />
      )}
    </>
  );
}