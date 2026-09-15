import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, money, fmtDate } from '../api/client';
import { Spinner, ErrorState, Badge, Confirm, Modal, Field } from '../components/ui';
import CollectModal from '../components/CollectModal';
import DistributeModal from '../components/DistributeModal';
import ReceiptModal from '../components/ReceiptModal';
import { useAuth } from '../state/AuthContext';
import { useToast } from '../state/ToastContext';

const DIST_STATUS_LABEL = {
  not_distributed: 'Not Distributed',
  partially_distributed: 'Partially Distributed',
  fully_distributed: 'Fully Distributed',
};

export default function LoanDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const { can, meta, refreshMeta } = useAuth();
  const toast = useToast();
  const [loan, setLoan] = useState(null);
  const [error, setError] = useState(null);
  const [collect, setCollect] = useState(null);
  const [distribute, setDistribute] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const [receipt, setReceipt] = useState(null);
  const [edit, setEdit] = useState(null);       // edit form state
  const [busy, setBusy] = useState(false);

  const load = () => {
    setError(null);
    api.get(`/api/loans/${id}`).then((r) => setLoan(r.data)).catch(setError);
  };
  useEffect(load, [id]);

  if (error) return <ErrorState error={error} onRetry={load} />;
  if (!loan) return <Spinner />;
  const s = loan.summary || {};
  const d = loan.distribution || {};

  const scheduleCfg = (() => {
    try { return loan.schedule_config ? JSON.parse(loan.schedule_config) : {}; } catch { return {}; }
  })();

  const openEdit = () => setEdit({
    code: loan.code,
    installment_amount: loan.installment_amount,
    principal_amount: loan.principal_amount,
    tenure: loan.tenure,
    start_date: fmtDate(loan.start_date),
    schedule_type: loan.schedule_type,
    frequency: loan.frequency,
    weekday: scheduleCfg.weekday ? String(scheduleCfg.weekday) : '',
    notes: loan.notes || '',
  });

  const saveEdit = async () => {
    setBusy(true);
    try {
      const wantsWeekday = edit.frequency === 'weekly' || edit.schedule_type === 'MONTHLY_WEEKDAY';
      const body = {
        code: edit.code && edit.code.trim() && edit.code.trim() !== loan.code ? edit.code.trim() : undefined,
        installment_amount: Number(edit.installment_amount),
        principal_amount: Number(edit.principal_amount),
        tenure: Number(edit.tenure),
        start_date: edit.start_date,
        schedule_type: edit.schedule_type,
        frequency: edit.frequency,
        // Optional collection day — sends {} to clear, {weekday} to set.
        schedule_config: wantsWeekday && edit.weekday ? { weekday: Number(edit.weekday) } : {},
        notes: edit.notes || undefined,
      };
      const r = await api.put(`/api/loans/${id}`, body);
      toast.success(`Updated — ${r.data.schedule_generation.updated} future installment(s) recalculated`);
      setEdit(null); load();
    } catch (e) {
      toast.error(e.errors ? Object.values(e.errors)[0][0] : e.message);
    } finally { setBusy(false); }
  };

  const doDelete = async () => {
    setBusy(true);
    try {
      const r = await api.del(`/api/loans/${id}`, { reason: confirm.reason || 'deleted by admin' });
      toast.success(r.message || 'Chit deleted');
      setConfirm(null);
      nav('/loans');
    } catch (e) { toast.error(e.message); } finally { setBusy(false); }
  };

  const doCancel = async () => {
    setBusy(true);
    try {
      await api.post(`/api/loans/${id}/cancel`, { reason: confirm.reason || 'Cancelled by admin' });
      toast.success('Chit cancelled');
      setConfirm(null); load();
    } catch (e) { toast.error(e.message); } finally { setBusy(false); }
  };

  return (
    <>
      <div className="toolbar">
        <Link to="/loans" className="btn sm secondary">← Chits</Link>
        <h1 style={{ margin: 0, fontSize: 18 }}>{loan.code}</h1>
        <Badge value={loan.status} />
        <div style={{ flex: 1 }} />
        {can('distributions.view') && loan.status === 'active' &&
          <button className="btn" disabled={busy} onClick={() => setDistribute(true)}>Disburse Chit</button>}
        {can('loans.edit') && loan.status === 'active' &&
          <button className="btn secondary" disabled={busy} onClick={openEdit}>Edit</button>}
        {can('loans.cancel') && loan.status === 'active' &&
          <button className="btn secondary" onClick={() => setConfirm({ type: 'cancel', reason: '' })}>Cancel</button>}
        {can('loans.delete') &&
          <button className="btn danger" onClick={() => setConfirm({ type: 'delete', reason: '' })}>Delete</button>}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div className="card">
          <div className="card-head"><h2>Chit</h2></div>
          <div className="card-body">
            <dl className="kv">
              <dt>Customer</dt><dd><Link to={`/customers/${loan.customer_id}`}>{loan.customer?.name}</Link></dd>
              <dt>Chit / principal amount</dt><dd>{money(loan.principal_amount)}</dd>
              <dt><b>Installment Amount</b></dt><dd><b>{money(loan.installment_amount)}</b></dd>
              <dt>Tenure</dt><dd>{loan.tenure}</dd>
              <dt>Repayment Frequency</dt><dd style={{ textTransform: 'capitalize' }}>{loan.frequency}</dd>
              <dt>Schedule type</dt><dd>{loan.schedule_type}</dd>
              <dt>Start date</dt><dd>{fmtDate(loan.start_date)}</dd>
              <dt>Location</dt><dd>{loan.location?.name || '—'}</dd>
              <dt>Collector</dt><dd>{loan.assignment?.employee_name || 'Unassigned'}</dd>
              {loan.notes && <><dt>Notes</dt><dd>{loan.notes}</dd></>}
            </dl>
          </div>
        </div>
        <div className="card">
          <div className="card-head"><h2>Ledger summary</h2></div>
          <div className="card-body">
            <dl className="kv">
              <dt>Installments</dt><dd>{s.installments_total} ({s.completed_count} completed, {s.overdue_count} overdue)</dd>
              <dt>Scheduled total</dt><dd>{money(s.scheduled_total)}</dd>
              <dt>Collected (actual)</dt><dd>{money(s.collected_principal)}</dd>
              <dt>Outstanding balance</dt><dd><b>{money(s.outstanding_balance)}</b></dd>
            </dl>
          </div>
        </div>
      </div>

      {can('distributions.view') && (
        <div className="card" style={{ marginTop: 16 }}>
          <div className="card-head">
            <h2>Distribution</h2>
            {loan.status === 'active' && can('distributions.create') && (
              <button className="btn sm" onClick={() => setDistribute(true)}>
                {d.status === 'not_distributed' ? 'Distribute Chit' : 'Edit / Add Distribution'}
              </button>
            )}
          </div>
          <div className="card-body">
            <dl className="kv" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2px 24px' }}>
              <dt>Chit Amount</dt><dd>{money(d.chit_amount ?? loan.principal_amount)}</dd>
              <dt>Distribution Status</dt><dd><b>{DIST_STATUS_LABEL[d.status] || 'Not Distributed'}</b></dd>
              <dt>Initial EMI</dt><dd>{money(d.initial_emi ?? loan.initial_emi_amount ?? loan.installment_amount)}</dd>
              <dt><b>Current EMI</b></dt><dd><b>{money(d.current_emi ?? loan.installment_amount)}</b></dd>
              <dt>Total Distributed</dt><dd style={{ color: '#15803d' }}>{money(d.total_distributed ?? 0)}</dd>
              <dt>Remaining Undistributed</dt><dd style={{ color: Number(d.remaining_undistributed ?? loan.principal_amount) > 0 ? '#b45309' : undefined }}>
                {money(d.remaining_undistributed ?? loan.principal_amount)}
              </dd>
            </dl>
            <p className="muted" style={{ fontSize: 12, margin: '6px 0 0' }}>
              Creating a chit moves no money. Office Cash / Bank changes only when a distribution is saved.
            </p>
          </div>
        </div>
      )}

      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-head"><h2>Installment schedule</h2></div>
        <div className="table-wrap">
          <table className="grid">
            <thead>
              <tr>
                <th>#</th><th>Due date</th><th className="right">Installment Amount</th>
                <th className="right">Paid</th><th className="right">Balance</th>
                <th>Last paid</th><th>Status</th><th></th>
              </tr>
            </thead>
            <tbody>
              {loan.installments.map((i) => (
                <tr key={i.id}>
                  <td>{i.installment_no}</td>
                  <td>{fmtDate(i.due_date)}</td>
                  <td className="right">{money(i.payable_amount)}</td>
                  <td className="right">{money(i.paid_amount)}</td>
                  <td className="right">{money(i.balance_amount)}</td>
                  <td>{fmtDate(i.last_paid_date)}</td>
                  <td><Badge value={i.status} /></td>
                  <td className="right">
                    {can('collection.create') && i.status !== 'COMPLETED' && loan.status === 'active' && (
                      <button className="btn sm" onClick={() => setCollect(i)}>Collect</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-head"><h2>Collection history</h2></div>
        <div className="table-wrap">
          <table className="grid">
            <thead><tr><th>Receipt</th><th>Date</th><th>Mode</th><th className="right">Fine</th><th className="right">Paid (actual)</th><th className="right">Total</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {loan.collections.map((c) => (
                <tr key={c.id} style={c.status !== 'posted' ? { opacity: 0.6 } : undefined}>
                  <td>{c.receipt_no}</td><td>{fmtDate(c.collection_date)}</td><td>{c.payment_mode}</td>
                  <td className="right">{money(c.fine_amount)}</td>
                  <td className="right">{money(c.amount)}</td>
                  <td className="right"><b style={{ color: '#10b981', fontSize: 14 }}>{money(c.total_amount || (Number(c.amount) + Number(c.fine_amount || 0)))}</b></td>
                  <td><Badge value={c.status === 'posted' ? 'COMPLETED' : c.status} /></td>
                  <td className="right nowrap">
                    <div style={{ display: 'inline-flex', gap: 6, justifyContent: 'flex-end', alignItems: 'center' }}>
                      <button className="btn-icon" title="Print Receipt" onClick={() => setReceipt(c)}>
                        🖨️
                      </button>
                      <button className="btn-icon" title="View / Edit Statement" onClick={() => setReceipt(c)}>
                        ✏️
                      </button>
                      {c.status === 'posted' && !String(c.receipt_no).endsWith('-REV') && (
                        <>
                          {can('collection.cancel') && (
                            <button className="btn-icon warning" title="Cancel Collection" onClick={() => setConfirm({ type: 'cancel', id: c.id, reason: '' })}>
                              🚫
                            </button>
                          )}
                          {can('collection.delete') && (
                            <button className="btn-icon danger" title="Delete Collection" onClick={() => setConfirm({ type: 'delete_col', id: c.id, reason: '' })}>
                              🗑️
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {loan.collections.length === 0 && <tr><td colSpan={8} className="muted" style={{ textAlign: 'center' }}>No collections yet</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {collect && (
        <CollectModal installment={collect} loan={loan}
          onClose={() => setCollect(null)} onDone={() => { setCollect(null); load(); }} />
      )}

      {distribute && (
        <DistributeModal loan={loan}
          onClose={() => setDistribute(false)}
          onDone={() => { load(); refreshMeta?.(); }} />
      )}

      {edit && (
        <Modal title={`Edit ${loan.code}`} onClose={() => setEdit(null)}
          footer={<>
            <button className="btn secondary" onClick={() => setEdit(null)} disabled={busy}>Cancel</button>
            <button className="btn" onClick={saveEdit} disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
          </>}>
          <div className="form-grid">
            <Field label="Chit Code">
              <input value={edit.code} onChange={(e) => setEdit({ ...edit, code: e.target.value })} />
              <p className="muted" style={{ fontSize: 12, margin: '4px 0 0' }}>
                Leave unchanged to keep <b>{loan.code}</b>. A new value must be unique.
              </p>
            </Field>
            <Field label="Due / Installment Amount">
              <input type="number" min="0.01" step="0.01" value={edit.installment_amount}
                onChange={(e) => setEdit({ ...edit, installment_amount: e.target.value })} />
              <p className="muted" style={{ fontSize: 12, margin: '4px 0 0' }}>
                Changes future unpaid dues only. Chit amount, distributed amount and paid installments stay exactly as recorded.
              </p>
            </Field>
            <Field label="Chit / principal amount">
              <input type="number" min="0" step="0.01" value={edit.principal_amount}
                onChange={(e) => setEdit({ ...edit, principal_amount: e.target.value })} />
            </Field>
            <Field label="Tenure">
              <input type="number" min="1" step="1" value={edit.tenure}
                onChange={(e) => setEdit({ ...edit, tenure: e.target.value })} />
            </Field>
            <Field label="Repayment Frequency">
              <select value={edit.frequency} onChange={(e) => {
                const v = e.target.value;
                const st = { daily: 'DAILY', weekly: 'WEEKLY', monthly: 'MONTHLY_DAILY' };
                setEdit({
                  ...edit,
                  frequency: v,
                  schedule_type: v === 'monthly' && String(edit.schedule_type).startsWith('MONTHLY_')
                    ? edit.schedule_type : st[v],
                });
              }}>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>
            </Field>
            <Field label="Start date">
              <input type="date" value={edit.start_date} onChange={(e) => setEdit({ ...edit, start_date: e.target.value })} />
            </Field>
            {edit.frequency === 'monthly' && (
              <Field label="Monthly schedule style">
                <select value={edit.schedule_type} onChange={(e) => setEdit({ ...edit, schedule_type: e.target.value })}>
                  <option value="MONTHLY_DAILY">Calendar month</option>
                  <option value="MONTHLY_WEEKDAY">Weekday cycle</option>
                  <option value="MONTHLY_INTERVAL">Fixed day interval</option>
                </select>
              </Field>
            )}
            {(edit.frequency === 'weekly' || edit.schedule_type === 'MONTHLY_WEEKDAY') && (
              <Field label="Preferred collection day (optional)">
                <select value={edit.weekday} onChange={(e) => setEdit({ ...edit, weekday: e.target.value })}>
                  <option value="">From start date — no fixed day</option>
                  {[['1','Monday'],['2','Tuesday'],['3','Wednesday'],['4','Thursday'],['5','Friday'],['6','Saturday'],['7','Sunday']].map(([v,l]) => (
                    <option key={v} value={v}>{l}</option>
                  ))}
                </select>
              </Field>
            )}
          </div>
          <Field label="Notes">
            <textarea rows={2} value={edit.notes} onChange={(e) => setEdit({ ...edit, notes: e.target.value })} />
          </Field>
          <p className="muted" style={{ fontSize: 12, margin: 0 }}>
            Changing the installment amount recalculates <b>future unpaid</b> installments only. Paid / partially-paid
            installments and every recorded collection are left exactly as they are.
          </p>
        </Modal>
      )}

      {confirm?.type === 'cancel' && (
        <Confirm title="Cancel this chit?" danger busy={busy}
          message={<>
            <p>Historical collections are preserved. Future unpaid installments become void.</p>
            <input style={{ width: '100%', padding: 8 }} placeholder="Reason (required)"
              value={confirm.reason} onChange={(e) => setConfirm({ ...confirm, reason: e.target.value })} />
          </>}
          confirmLabel="Cancel chit" onConfirm={doCancel} onClose={() => setConfirm(null)} />
      )}
      {confirm?.type === 'delete' && (
        <Confirm title="Delete this chit?" danger busy={busy}
          message={<>
            <p>The chit disappears from every list. Any posted collections stay in the ledger for audit.</p>
            <input style={{ width: '100%', padding: 8 }} placeholder="Reason (optional)"
              value={confirm.reason} onChange={(e) => setConfirm({ ...confirm, reason: e.target.value })} />
          </>}
          confirmLabel="Delete" onConfirm={doDelete} onClose={() => setConfirm(null)} />
      )}
      {(confirm?.type === 'cancel' || confirm?.type === 'delete_col') && (
        <Confirm
          title={confirm.type === 'cancel' ? 'Cancel this collection?' : 'Delete this collection?'}
          danger={confirm.type === 'delete_col'} busy={busy}
          message={<>
            <p>{confirm.type === 'cancel'
              ? 'Kept as a cancelled history record. Cash, total collection and outstanding are reversed automatically.'
              : 'The record is removed. Its financial effect is reversed once (no double reversal).'}</p>
            <input style={{ width: '100%', padding: 8 }} placeholder="Reason (optional)"
              value={confirm.reason} onChange={(e) => setConfirm({ ...confirm, reason: e.target.value })} />
          </>}
          confirmLabel={confirm.type === 'cancel' ? 'Cancel collection' : 'Delete'}
          onConfirm={async () => {
            setBusy(true);
            try {
              if (confirm.type === 'cancel') {
                await api.post(`/api/collections/${confirm.id}/cancel`, { reason: confirm.reason || 'Cancelled' });
                toast.success('Collection cancelled — cash & totals reversed');
              } else {
                await api.del(`/api/collections/${confirm.id}`, { reason: confirm.reason || 'Deleted' });
                toast.success('Collection deleted');
              }
              setConfirm(null); load();
            } catch (e) { toast.error(e.message); } finally { setBusy(false); }
          }}
          onClose={() => setConfirm(null)} />
      )}
      {receipt && (
        <ReceiptModal collection={receipt} loan={loan} customer={loan.customer} onClose={() => setReceipt(null)} />
      )}
    </>
  );
}
