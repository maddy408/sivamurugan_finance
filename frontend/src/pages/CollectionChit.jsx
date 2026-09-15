import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, money, fmtDate } from '../api/client';
import { Spinner, ErrorState, Badge, Confirm } from '../components/ui';
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

export default function CollectionChit() {
  const { id } = useParams();
  const { can, refreshMeta } = useAuth();
  const toast = useToast();
  const [loan, setLoan] = useState(null);
  const [error, setError] = useState(null);
  const [collectIds, setCollectIds] = useState(null); // array of installment ids being paid, or null
  const [checked, setChecked] = useState(() => new Set()); // checkboxes ticked in the due list
  const [distribute, setDistribute] = useState(false);
  const [act, setAct] = useState(null);              // { type:'cancel'|'delete', id, reason }
  const [busy, setBusy] = useState(false);
  const [receipt, setReceipt] = useState(null);       // collection row being printed, or null

  const load = () => {
    setError(null);
    api.get(`/api/loans/${id}`).then((r) => { setLoan(r.data); setChecked(new Set()); }).catch(setError);
  };
  useEffect(load, [id]);

  if (error) return <ErrorState error={error} onRetry={load} />;
  if (!loan) return <Spinner />;
  const s = loan.summary || {};
  const c = loan.customer || {};
  const d = loan.distribution || {};
  const initial = c.name ? c.name.charAt(0).toUpperCase() : 'C';

  const toggleDue = (instId) => setChecked((prev) => {
    const n = new Set(prev);
    n.has(instId) ? n.delete(instId) : n.add(instId);
    return n;
  });

  const runAct = async () => {
    setBusy(true);
    try {
      if (act.type === 'cancel') {
        await api.post(`/api/collections/${act.id}/cancel`, { reason: act.reason || 'Cancelled' });
        toast.success('Collection cancelled — cash, totals and outstanding reversed');
      } else {
        await api.del(`/api/collections/${act.id}`, { reason: act.reason || 'Deleted' });
        toast.success('Collection deleted');
      }
      setAct(null); load();
    } catch (e) { toast.error(e.message); } finally { setBusy(false); }
  };

  return (
    <>
      <div className="toolbar" style={{ justifyContent: 'space-between', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Link to="/collection" className="btn sm secondary">← Collection Workload</Link>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>Collect — {loan.code}</h1>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button className="btn sm secondary" onClick={() => window.print()}>🖨️ Print Statement</button>
          <Badge value={loan.status} />
        </div>
      </div>

      {/* Side-by-Side Main Grid — left rail is a compact ~25% details column,
          right side (~75%) is the primary working area: dues + collection. */}
      <div className="collection-detail-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 3fr', gap: 20, alignItems: 'start' }}>

        {/* LEFT COLUMN: Customer + Chit + Distribution in ONE combined card,
            so every detail is visible at once with no internal scrolling. */}
        <div className="card">
         
          <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* Customer */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div className="customer-avatar-box">{initial}</div>
              <div>
                <Link to={`/customers/${loan.customer_id}`} style={{ fontWeight: 800, fontSize: 15, color: '#0f172a' }}>
                  {c.name}
                </Link>
                <div style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>{c.customer_code}</div>
              </div>
            </div>
          

            <div className="section-title" style={{ margin: '2px 0 0' }}>📄 Chit</div>
            <dl className="kv" style={{ gridTemplateColumns: '110px 1fr', rowGap: 4 }}>
              <dt>Chit Code</dt><dd><span className="badge PENDING">{loan.code}</span></dd>
              <dt>Principal</dt><dd>{money(loan.principal_amount)}</dd>
              <dt>Installment</dt><dd><b style={{ color: '#2563eb' }}>{money(loan.installment_amount)}</b></dd>
              <dt>Tenure / Freq</dt><dd>{loan.tenure} · {loan.frequency}</dd>
              <dt>Total Paid</dt><dd style={{ color: '#10b981', fontWeight: 700 }}>{money(s.collected_principal)}</dd>
              <dt>Outstanding</dt><dd><b style={{ color: '#f43f5e' }}>{money(s.outstanding_balance)}</b></dd>
            </dl>

            {can('distributions.view') && (
              <>
                <div className="section-title" style={{ margin: '2px 0 6px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span>💸 Distribution</span>
                  {loan.status === 'active' && can('distributions.create') && (
                    <button className="btn sm" style={{ padding: '3px 10px', fontSize: 12 }} onClick={() => setDistribute(true)}>
                      💸 {d.status === 'not_distributed' ? 'Disburse Chit' : 'Edit Distribution'}
                    </button>
                  )}
                </div>
                <dl className="kv" style={{ gridTemplateColumns: '110px 1fr', rowGap: 4 }}>
                  <dt>Status</dt><dd><b>{DIST_STATUS_LABEL[d.status] || 'Not Distributed'}</b></dd>
                  <dt>Current EMI</dt><dd><b style={{ color: '#2563eb' }}>{money(d.current_emi ?? loan.installment_amount)}</b></dd>
                  <dt>Distributed</dt><dd style={{ color: '#15803d', fontWeight: 700 }}>{money(d.total_distributed ?? 0)}</dd>
                  <dt>Remaining</dt>
                  <dd style={{ color: Number(d.remaining_undistributed ?? loan.principal_amount) > 0 ? '#b45309' : '#64748b', fontWeight: 700 }}>
                    {money(d.remaining_undistributed ?? loan.principal_amount)}
                  </dd>
                </dl>
              </>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: Collection Actions & Installment Schedule */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Quick Collect Action Header & Installment Schedule Table */}
          <div className="card">
            <div className="card-head">
              <h2>📅 Installment Schedule & Collect</h2>
              {can('collection.create') && loan.status === 'active' && checked.size >= 2 && (
                <button className="btn" onClick={() => setCollectIds([...checked])}>
                  ⚡ Pay Multiple Due ({checked.size})
                </button>
              )}
            </div>
            <div className="table-wrap">
              <table className="grid">
                <thead>
                  <tr>
                    <th></th>
                    <th>#</th>
                    <th>Due date</th>
                    <th className="right">Installment Amount</th>
                    <th className="right">Paid</th>
                    <th className="right">Balance</th>
                    <th>Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {loan.installments.map((i) => {
                    const payable = i.status !== 'COMPLETED' && loan.status === 'active';
                    return (
                      <tr key={i.id}>
                        <td data-label="" style={{ width: 30 }}>
                          {can('collection.create') && payable && (
                            <input type="checkbox" checked={checked.has(i.id)} onChange={() => toggleDue(i.id)}
                              style={{ width: 16, height: 16, cursor: 'pointer' }} aria-label={`Select due #${i.installment_no}`} />
                          )}
                        </td>
                        <td style={{ fontWeight: 700 }}>#{i.installment_no}</td>
                        <td>{fmtDate(i.due_date)}</td>
                        <td className="right">{money(i.payable_amount)}</td>
                        <td className="right" style={{ color: '#10b981', fontWeight: 600 }}>{money(i.paid_amount)}</td>
                        <td className="right" style={{ fontWeight: 700, color: Number(i.balance_amount) > 0 ? '#f43f5e' : '#64748b' }}>
                          {money(i.balance_amount)}
                        </td>
                        <td><Badge value={i.status} /></td>
                        <td className="right">
                          {can('collection.create') && payable && (
                            <button className="btn sm" onClick={() => setCollectIds([i.id])}> Collect</button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Collection History Table */}
          <div className="card">
            <div className="card-head">
              <h2>🧾 Collection History</h2>
            </div>
            <div className="table-wrap">
              <table className="grid">
                <thead>
                  <tr>
                    <th>Receipt</th>
                    <th>Date</th>
                    <th>Mode</th>
                    <th className="right">Paid (actual)</th>
                    <th>Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {loan.collections.map((col) => {
                    const isRev = String(col.receipt_no).endsWith('-REV');
                    return (
                      <tr key={col.id} style={col.status !== 'posted' ? { opacity: 0.6 } : undefined}>
                        <td style={{ fontWeight: 700 }}>{col.receipt_no}</td>
                        <td>{fmtDate(col.collection_date)}</td>
                        <td><span className="badge PENDING">{col.payment_mode}</span></td>
                        <td className="right">
                          <div style={{ fontWeight: 800, color: '#10b981', fontSize: 14 }}>
                            {money(col.total_amount || (Number(col.amount) + Number(col.fine_amount || 0)))}
                          </div>
                          {Number(col.fine_amount) > 0 && (
                            <div className="muted" style={{ fontSize: 11 }}>
                              EMI {money(col.amount)} + Fine {money(col.fine_amount)}
                            </div>
                          )}
                        </td>
                        <td><Badge value={col.status === 'posted' ? 'COMPLETED' : col.status} /></td>
                        <td className="right nowrap">
                          <div style={{ display: 'inline-flex', gap: 6, justifyContent: 'flex-end', alignItems: 'center' }}>
                            <button className="btn-icon" title="Print Receipt" onClick={() => setReceipt(col)}>
                              🖨️
                            </button>
                            <button className="btn-icon" title="View / Edit Statement" onClick={() => setReceipt(col)}>
                              ✏️
                            </button>
                            {col.status === 'posted' && !isRev && (
                              <>
                                {can('collection.cancel') && (
                                  <button className="btn-icon warning" title="Cancel Collection" onClick={() => setAct({ type: 'cancel', id: col.id, reason: '' })}>
                                    🚫
                                  </button>
                                )}
                                {can('collection.delete') && (
                                  <button className="btn-icon danger" title="Delete Collection" onClick={() => setAct({ type: 'delete', id: col.id, reason: '' })}>
                                    🗑️
                                  </button>
                                )}
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {loan.collections.length === 0 && (
                    <tr><td colSpan={6} className="muted" style={{ textAlign: 'center', padding: 20 }}>No collections recorded yet</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {collectIds && (
        <CollectModal selectedIds={collectIds} loan={loan}
          onClose={() => setCollectIds(null)} onDone={() => { setCollectIds(null); load(); }} />
      )}

      {distribute && (
        <DistributeModal loan={loan}
          onClose={() => setDistribute(false)}
          onDone={() => { load(); refreshMeta?.(); }} />
      )}

      {receipt && (
        <ReceiptModal collection={receipt} loan={loan} customer={c} onClose={() => setReceipt(null)} />
      )}

      {act && (
        <Confirm
          title={act.type === 'cancel' ? 'Cancel this collection?' : 'Delete this collection?'}
          danger={act.type === 'delete'} busy={busy}
          message={
            <>
              <p style={{ marginTop: 0 }}>
                {act.type === 'cancel'
                  ? 'The collection is kept as a cancelled history record. Its cash, total-collection and outstanding effects are reversed automatically.'
                  : 'The collection record is removed. Its financial effect is reversed once (no double reversal).'}
              </p>
              <input style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid var(--line)' }} placeholder="Reason (optional)"
                value={act.reason} onChange={(e) => setAct({ ...act, reason: e.target.value })} />
            </>
          }
          confirmLabel={act.type === 'cancel' ? 'Cancel collection' : 'Delete'}
          onConfirm={runAct} onClose={() => setAct(null)}
        />
      )}
    </>
  );
}
