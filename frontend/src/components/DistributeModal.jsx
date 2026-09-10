import { useEffect, useMemo, useState } from 'react';
import { api, money, fmtDate } from '../api/client';
import { Field, Modal, Confirm } from './ui';
import { useAuth } from '../state/AuthContext';
import { useToast } from '../state/ToastContext';

const today = () => new Date().toISOString().slice(0, 10);
const STATUS_LABEL = {
  not_distributed: 'Not Distributed',
  partially_distributed: 'Partially Distributed',
  fully_distributed: 'Fully Distributed',
};

/**
 * Disburse / Distribute Chit.
 *   - Creating a chit moves no money. Confirming a row here is the ONLY thing that
 *     reduces the selected Office Cash / Bank account and raises "Distributed Amount".
 *   - "New EMI Amount" is entered by the user and applied to future installments.
 *   - Edit/Cancel a history row: the backend reconciles balances (net difference only).
 */
export default function DistributeModal({ loan, onClose, onDone }) {
  const { meta } = useAuth();
  const toast = useToast();
  const accounts = meta?.accounts || [];
  const officeCash = accounts.find((a) => a.type === 'cash') || accounts[0];

  const [data, setData] = useState(null);        // { summary, distributions }
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState({});
  const [editing, setEditing] = useState(null);  // distribution row being edited, or null = add mode
  const [cancelRow, setCancelRow] = useState(null);

  const [form, setForm] = useState({
    distributed_date: today(),
    amount: '',
    new_emi_amount: String(loan?.installment_amount ?? ''),
    account_id: officeCash?.id ? String(officeCash.id) : '',
    remarks: '',
  });

  const reload = () => api.get(`/api/loans/${loan.id}/distributions`).then((r) => setData(r.data)).catch((e) => toast.error(e.message));
  useEffect(() => { reload(); /* eslint-disable-next-line */ }, [loan.id]);

  const s = data?.summary;
  const remaining = Number(s?.remaining_undistributed ?? loan.principal_amount);

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

  const Stat = ({ label, value, accent }) => (
    <div className="card" style={{ flex: 1, background: '#f8fafc' }}>
      <div className="card-body" style={{ padding: '10px 14px' }}>
        <div className="muted" style={{ fontSize: 11, textTransform: 'uppercase' }}>{label}</div>
        <div style={{ fontSize: 18, fontWeight: 700, color: accent || 'inherit' }}>{money(value)}</div>
      </div>
    </div>
  );

  const canSubmit = !editing
    ? Number(form.amount) > 0 && form.account_id && Number(form.amount) <= remaining + 0.001
    : Number(form.amount) > 0 && form.account_id;

  return (
    <>
    <Modal title={`Disburse Chit — ${loan.code}`} size="lg" onClose={onClose}
      footer={<button className="btn secondary" onClick={onClose} disabled={busy}>Close</button>}>
      {!data ? <p className="muted">Loading…</p> : (
        <>
          <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
            <Stat label="Total Chit Amount" value={s.chit_amount} />
            <Stat label="Total Distributed So Far" value={s.total_distributed} accent="#15803d" />
            <Stat label="Remaining Undistributed" value={s.remaining_undistributed} accent={Number(s.remaining_undistributed) > 0 ? '#b45309' : undefined} />
          </div>
          <p className="muted" style={{ fontSize: 12, margin: '0 0 10px' }}>
            Initial EMI <b>{money(s.initial_emi)}</b> &nbsp;·&nbsp; Current EMI <b>{money(s.current_emi)}</b>
            &nbsp;·&nbsp; Status <b>{STATUS_LABEL[s.status] || s.status}</b>
          </p>

          <div className="card" style={{ marginBottom: 12 }}>
            <div className="card-head"><h4 style={{ margin: 0 }}>Disbursement History Log ({data.distributions.length})</h4></div>
            <div className="table-wrap">
              <table className="grid">
                <thead><tr>
                  <th>#</th><th>Disbursed Date</th><th className="right">Disbursed Amount</th>
                  <th className="right">New EMI</th><th>Account</th><th>Remarks</th><th>Status</th><th></th>
                </tr></thead>
                <tbody>
                  {data.distributions.map((d, i) => (
                    <tr key={d.id} style={d.status !== 'active' ? { opacity: 0.55 } : undefined}>
                      <td>{i + 1}</td>
                      <td>{fmtDate(d.distributed_date)}</td>
                      <td className="right"><b>{money(d.amount)}</b></td>
                      <td className="right">{d.new_emi_amount != null ? money(d.new_emi_amount) : '—'}</td>
                      <td>{d.account_name || '—'}</td>
                      <td>{d.remarks || '—'}</td>
                      <td><span className={`badge ${d.status === 'active' ? 'active' : 'cancelled'}`}>{d.status}</span></td>
                      <td className="right nowrap">
                        {d.status === 'active' && (
                          <>
                            <button className="btn sm secondary" onClick={() => startEdit(d)}>Edit</button>{' '}
                            <button className="btn sm danger" onClick={() => setCancelRow({ ...d, reason: '' })}>Cancel</button>
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                  {data.distributions.length === 0 && (
                    <tr><td colSpan={8} className="muted" style={{ textAlign: 'center' }}>No disbursement yet — creating the chit did not move any money.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <h4 style={{ margin: '6px 0' }}>{editing ? `Edit disbursement #${editing.id}` : '＋ Add Disbursement Payment'}</h4>
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
              <span className="muted" style={{ fontSize: 12 }}>Applies to future EMIs after the disbursed date. Entered manually — no interest calculation.</span>
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
          <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
            {editing && <button className="btn secondary" onClick={resetForm} disabled={busy}>Cancel edit</button>}
            <div style={{ flex: 1 }} />
            <button className="btn" onClick={submit} disabled={busy || !canSubmit}>
              {busy ? 'Saving…' : (editing ? 'Save changes' : `Confirm Disbursement${form.amount ? ` — ${money(Number(form.amount))}` : ''}`)}
            </button>
          </div>

        </>
      )}
    </Modal>
    {cancelRow && (
      <Confirm title={`Cancel disbursement of ${money(cancelRow.amount)}?`} danger busy={busy}
        message={`${money(cancelRow.amount)} returns to ${cancelRow.account_name}. Distributed total drops, remaining undistributed rises, and the current EMI is recomputed from the remaining history.`}
        confirmLabel="Cancel disbursement" onConfirm={doCancel} onClose={() => setCancelRow(null)} />
    )}
    </>
  );
}
