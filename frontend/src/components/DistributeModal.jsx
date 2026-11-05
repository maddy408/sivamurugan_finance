import { useEffect, useState } from 'react';
import { api, money, fmtDate } from '../api/client';
import { Field, Modal, Confirm } from './ui';
import { useAuth } from '../state/AuthContext';
import { useToast } from '../state/ToastContext';
import { FiEdit2, FiXCircle, FiTrash2, FiList, FiPlusCircle } from 'react-icons/fi';

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
      if (e.errors) setErrors(Object.fromEntries(Object.entries(e.errors).map(([k, v]) => [k, v[0]])));
      else toast.error(e.message);
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
    <div className="card" style={{ flex: 1, background: '#f8fafc' }}>
      <div className="card-body" style={{ padding: '10px 14px' }}>
        <div className="muted" style={{ fontSize: 11, textTransform: 'uppercase' }}>{label}</div>
        <div style={{ fontSize: 18, fontWeight: 700, color: accent || 'inherit' }}>{money(value)}</div>
      </div>
    </div>
  );

  const canSubmit = Number(form.amount) > 0 && form.account_id;

  const distributions = data?.distributions || [];

  return (
    <>
      <Modal title={`Disburse Chit — ${loan.code}`} size="lg" onClose={onClose}
        footer={<button className="btn secondary" onClick={onClose} disabled={busy}>Close</button>}>
        {!data ? <p className="muted">Loading…</p> : (
          <>
            <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
              <Stat label="Chit Amount" value={s.chit_amount ?? loan.principal_amount} />
              <Stat label="Total Distributed" value={s.total_distributed ?? 0} accent="#15803d" />
              <Stat label="Principal Covered" value={principalCovered} accent="#2563eb" />
              <Stat label="Extra Disbursed" value={extraDisbursed} accent={extraDisbursed > 0 ? '#f59e0b' : '#64748b'} />
            </div>
            <p className="muted" style={{ fontSize: 12, margin: '0 0 14px' }}>
              Remaining undistributed: <b>{money(remaining)}</b> · Status: <b>{STATUS_LABEL[s.status] || s.status}</b>
            </p>

            <p className="muted" style={{ fontSize: 12, margin: '0 0 14px' }}>
              Initial EMI <b>{money(s.initial_emi)}</b> &nbsp;·&nbsp; Current EMI <b>{money(s.current_emi)}</b>
            </p>

            <h4 style={{ margin: '6px 0 10px', display: 'flex', alignItems: 'center', gap: 6 }}>
              {editing ? <><FiEdit2 size={14} /> Edit disbursement #{editing.id}</> : <><FiPlusCircle size={14} /> Add Disbursement Payment</>}
            </h4>
            <div className="form-grid">
              <Field label="Disbursed Date *" error={errors.distributed_date}>
                <input type="date" value={form.distributed_date} onChange={(e) => setForm({ ...form, distributed_date: e.target.value })} />
              </Field>
              <Field label="Disbursed Amount (₹) *" error={errors.amount}>
                <input type="number" min="0.01" step="0.01" value={form.amount} autoFocus
                  placeholder={`Amount to disburse (remaining ${money(remaining)})`}
                  onChange={(e) => setForm({ ...form, amount: e.target.value })} />
              </Field>
              <Field label="New EMI Amount (₹)" error={errors.new_emi_amount}>
                <input type="number" min="0.01" step="0.01" value={form.new_emi_amount}
                  onChange={(e) => setForm({ ...form, new_emi_amount: e.target.value })} placeholder="leave blank to keep current EMI" />
                <span className="muted" style={{ fontSize: 11 }}>Applies to future EMIs after the disbursed date. Entered manually — no interest calculation.</span>
              </Field>
              <Field label="Disburse From *" error={errors.account_id}>
                <select value={form.account_id} onChange={(e) => setForm({ ...form, account_id: e.target.value })}>
                  <option value="">— select account —</option>
                  {accounts.map((a) => <option key={a.id} value={a.id}>{a.name} ({a.type})</option>)}
                </select>
              </Field>
              <Field label="Remarks / Notes" error={errors.remarks}>
                <input value={form.remarks} onChange={(e) => setForm({ ...form, remarks: e.target.value })} placeholder="e.g. 1st Tranche / Cheque payment…" />
              </Field>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 10, marginBottom: distributions.length > 0 ? 20 : 6 }}>
              {editing && <button className="btn secondary" onClick={resetForm} disabled={busy}>Cancel edit</button>}
              <div style={{ flex: 1 }} />
              <button className="btn" onClick={submit} disabled={busy || !canSubmit}>
                {busy ? 'Saving…' : (editing ? 'Save changes' : `Confirm Disbursement${form.amount ? ` — ${money(Number(form.amount))}` : ''}`)}
              </button>
            </div>

            {distributions.length > 0 && (
              <div style={{ marginTop: 16, borderTop: '1px solid var(--line)', paddingTop: 14 }}>
                <h4 style={{ margin: '0 0 10px', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <FiList size={14} /> Disbursement History &amp; Actions
                </h4>
                <div className="table-wrap">
                  <table className="grid">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Date</th>
                        <th>Account</th>
                        <th className="right">Disbursed Amount</th>
                        <th className="right">New EMI</th>
                        <th>Remarks</th>
                        <th>Status</th>
                        <th className="right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {distributions.map((row) => {
                        const isActive = row.status === 'active';
                        return (
                          <tr key={row.id} style={!isActive ? { opacity: 0.55 } : undefined}>
                            <td style={{ fontWeight: 700 }}>#{row.id}</td>
                            <td>{fmtDate(row.distributed_date)}</td>
                            <td>{row.account_name}</td>
                            <td className="right" style={{ fontWeight: 700, color: '#15803d' }}>{money(row.amount)}</td>
                            <td className="right">{row.new_emi_amount != null ? money(row.new_emi_amount) : '—'}</td>
                            <td>{row.remarks || '—'}</td>
                            <td>
                              <span className={`badge ${isActive ? 'COMPLETED' : 'CANCELLED'}`}>
                                {isActive ? 'Active' : 'Cancelled'}
                              </span>
                            </td>
                            <td className="right nowrap">
                              <div style={{ display: 'inline-flex', gap: 6, justifyContent: 'flex-end' }}>
                                {isActive && can('distributions.edit') && (
                                  <button className="btn-icon" title="Edit Distribution" onClick={() => startEdit(row)}>
                                    <FiEdit2 size={14} />
                                  </button>
                                )}
                                {isActive && can('distributions.cancel') && (
                                  <button className="btn-icon warning" title="Cancel Distribution" onClick={() => setCancelRow({ ...row, reason: '' })}>
                                    <FiXCircle size={14} />
                                  </button>
                                )}
                                {can('distributions.delete') && (
                                  <button className="btn-icon danger" title="Delete Distribution" onClick={() => setDeleteRow({ ...row, reason: '' })}>
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
        <Confirm title={`Cancel disbursement of ${money(cancelRow.amount)}?`} danger busy={busy}
          message={`${money(cancelRow.amount)} returns to ${cancelRow.account_name}. Distributed total drops, remaining undistributed rises, and the current EMI is recomputed from the remaining history.`}
          confirmLabel="Cancel disbursement" onConfirm={doCancel} onClose={() => setCancelRow(null)} />
      )}
      {deleteRow && (
        <Confirm title={`Delete disbursement of ${money(deleteRow.amount)}?`} danger busy={busy}
          message={
            deleteRow.status === 'active'
              ? `This will first reverse its financial effect (${money(deleteRow.amount)} returns to ${deleteRow.account_name}), then remove it from the history list. This cannot be undone from the UI.`
              : 'This record is already cancelled and contributes nothing financially. It will be removed from the history list.'
          }
          confirmLabel="Delete" onConfirm={doDelete} onClose={() => setDeleteRow(null)} />
      )}
    </>
  );
}