import { useEffect, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { api, money, fmtDate } from '../api/client';
import { Spinner, ErrorState, Badge, Confirm } from '../components/ui';
import CollectModal from '../components/CollectModal';
import DistributeModal from '../components/DistributeModal';
import ReceiptModal from '../components/ReceiptModal';
import StatementModal from '../components/StatementModal';
import CustomScheduleModal from '../components/CustomScheduleModal';
import CollectionEditModal from '../components/CollectionEditModal';
import InstallmentStatementModal from '../components/InstallmentStatementModal';
import CloseChitModal from '../components/CloseChitModal';
import EditCloseAmountModal from '../components/EditCloseAmountModal';
import EditDueDateModal from '../components/EditDueDateModal';
import { useAuth } from '../state/AuthContext';
import { useToast } from '../state/ToastContext';
import { useI18n } from '../state/I18nContext';
import {
  FiArrowLeft, FiPrinter, FiFileText, FiDollarSign, FiCalendar, FiZap,
  FiEdit2, FiXCircle, FiTrash2, FiClipboard, FiList, FiPlusCircle, FiDownload, FiRefreshCw,
} from 'react-icons/fi';

const CLOSED_LIKE = ['cancelled', 'closed', 'deactivated'];

const DIST_STATUS_LABEL = {
  not_distributed: 'Not Distributed',
  partially_distributed: 'Partially Distributed',
  fully_distributed: 'Fully Distributed',
  fully_distributed_extra: 'Fully Distributed + Extra',
};

export default function CollectionChit() {
  const { id } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const { can, refreshMeta } = useAuth();
  const { t, lang } = useI18n();
  const toast = useToast();
  const [loan, setLoan] = useState(null);
  const [error, setError] = useState(null);
  const [collectIds, setCollectIds] = useState(null); // array of installment ids being paid, or null
  const [checked, setChecked] = useState(() => new Set()); // checkboxes ticked in the due list
  const [distribute, setDistribute] = useState(false);
  const [distEditId, setDistEditId] = useState(null);  // open Distribute modal pre-focused on this row's edit
  const [act, setAct] = useState(null);              // { type:'cancel'|'delete', id, reason }  (collection)
  const [distAct, setDistAct] = useState(null);       // { type:'cancel'|'delete', row, reason }  (distribution)
  const [busy, setBusy] = useState(false);
  const [receipt, setReceipt] = useState(null);       // collection row being printed, or null
  const [statement, setStatement] = useState(false);   // printable statement modal
  const [customSchedule, setCustomSchedule] = useState(false); // Add Custom Schedule modal
  const [editCollection, setEditCollection] = useState(null);  // collection row being edited, or null
  const [printInstId, setPrintInstId] = useState(null);        // installment id being printed, or null
  const [editCustomInst, setEditCustomInst] = useState(null);  // custom-schedule installment row being edited
  const [deleteCustomInst, setDeleteCustomInst] = useState(null); // custom-schedule installment row pending delete
  const [customDeleteBusy, setCustomDeleteBusy] = useState(false);
  const [closeChit, setCloseChit] = useState(false);            // Close Chit modal
  const [editCloseAmount, setEditCloseAmount] = useState(false); // Edit Close Settlement modal
  const [reopenBusy, setReopenBusy] = useState(false);
  const [editDue, setEditDue] = useState(null);                 // installment row being edited (due date/amount)

  const load = () => {
    setError(null);
    api.get(`/api/loans/${id}`).then((r) => { setLoan(r.data); setChecked(new Set()); }).catch(setError);
  };
  useEffect(load, [id]);

  // Deep-link from anywhere else in the app (chiefly the Chit "View Details"
  // page): ?due=<installmentId> pre-opens Collect for that exact due, and
  // ?action=close|distribute pre-opens the matching modal — so "Collect" /
  // "Close Chit" / "Disburse Chit" clicked elsewhere land here with the
  // right thing already selected instead of making the user search/pick
  // again. Consumed (stripped from the URL) once handled, and guarded to
  // fire only on the FIRST successful load of this chit, not on every
  // subsequent refresh this page does after an action completes.
  const autoActionRef = useRef(false);
  useEffect(() => {
    if (!loan || autoActionRef.current) return;
    autoActionRef.current = true;
    const dueId = searchParams.get('due');
    const action = searchParams.get('action');
    if (dueId) {
      const inst = (loan.installments || []).find((i) => String(i.id) === dueId);
      if (inst && inst.status !== 'COMPLETED' && loan.status === 'active') {
        setCollectIds([inst.id]);
      } else if (inst) {
        toast.error('That due is not currently collectable (already paid, or the chit is not active).');
      }
    } else if (action === 'close' && loan.status === 'active') {
      setCloseChit(true);
    } else if (action === 'distribute' && loan.status === 'active') {
      setDistribute(true);
    }
    if (dueId || action) {
      const next = new URLSearchParams(searchParams);
      next.delete('due');
      next.delete('action');
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loan]);

  if (error) return <ErrorState error={error} onRetry={load} />;
  if (!loan) return <Spinner />;
  const s = loan.summary || {};
  const c = loan.customer || {};
  const d = loan.distribution || {};
  const distributions = loan.distributions || [];
  const initial = c.name ? c.name.charAt(0).toUpperCase() : 'C';
  // The Close Chit amount is a normal collection (collection_type='close_settlement'),
  // never a field on the loan itself — this is the single source of truth for it.
  const settlement = (loan.collections || []).find((col) => col.collection_type === 'close_settlement' && col.status === 'posted');

  const toggleDue = (instId) => setChecked((prev) => {
    const n = new Set(prev);
    n.has(instId) ? n.delete(instId) : n.add(instId);
    return n;
  });

  const runReopen = async () => {
    setReopenBusy(true);
    try {
      await api.post(`/api/loans/${loan.id}/reopen`, {});
      toast.success('Chit reopened');
      load();
    } catch (e) { toast.error(e.message); } finally { setReopenBusy(false); }
  };

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

  const openReceipt = async (col) => {
    try {
      const r = await api.get(`/api/collections/${col.id}`);
      setReceipt(r.data);
    } catch (e) { toast.error(e.message); }
  };

  const downloadCollectionPdf = async (col) => {
    try { await api.download(`/api/collections/${col.id}/receipt.pdf`, null, `Receipt-${col.receipt_no}.pdf`); }
    catch (e) { toast.error(e.message); }
  };

  const runDeleteCustomInst = async () => {
    setCustomDeleteBusy(true);
    try {
      await api.del(`/api/loans/${loan.id}/custom-schedule/${deleteCustomInst.id}`);
      toast.success(`Installment #${deleteCustomInst.installment_no} deleted`);
      setDeleteCustomInst(null);
      load();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setCustomDeleteBusy(false);
    }
  };

  const runDistAct = async () => {
    setBusy(true);
    try {
      if (distAct.type === 'cancel') {
        await api.post(`/api/distributions/${distAct.row.id}/cancel`, { reason: distAct.reason || 'Cancelled' });
        toast.success('Distribution cancelled — the amount is back in its account');
      } else {
        await api.del(`/api/distributions/${distAct.row.id}`, { reason: distAct.reason || 'Deleted' });
        toast.success('Distribution deleted');
      }
      setDistAct(null); load(); refreshMeta?.();
    } catch (e) { toast.error(e.message); } finally { setBusy(false); }
  };

  return (
    <>
      <div className="toolbar" style={{ justifyContent: 'space-between', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Link to="/collection" className="btn sm secondary" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <FiArrowLeft size={14} /> {t('Collection Workload', 'Collection Workload')}
          </Link>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>{t(`Collect — ${loan.code}`, `Collect — ${loan.code}`)}</h1>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button className="btn sm secondary" onClick={() => setStatement(true)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <FiPrinter size={14} /> {t('Print Statement', 'Print Statement')}
          </button>
          {loan.status === 'active' && can('loans.cancel') && (
            <button className="btn sm danger" onClick={() => setCloseChit(true)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <FiXCircle size={14} /> {t('Close Chit', 'Close Chit')}
            </button>
          )}
          {loan.status === 'closed' && can('loans.cancel') && (
            <>
              {settlement && (
                <button className="btn sm secondary" onClick={() => setEditCloseAmount(true)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <FiEdit2 size={14} /> {t('Edit Close Settlement', 'Edit Close Settlement')}
                </button>
              )}
              <button className="btn sm" onClick={runReopen} disabled={reopenBusy} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <FiRefreshCw size={14} /> {reopenBusy ? t('Reopening…', 'Reopening…') : t('Reopen Chit', 'Reopen Chit')}
              </button>
            </>
          )}
          <Badge value={loan.status} />
        </div>
      </div>

      {loan.status === 'closed' && (
        <div className="muted" style={{ fontSize: 12, background: '#eef2ff', border: '1px solid #c7d2fe', borderRadius: 8, padding: '8px 14px', marginBottom: 16 }}>
          {lang === 'ta'
            ? `இந்த சீட்டு ${fmtDate(loan.closed_at)} அன்று நிறைவடைந்தது${settlement ? ` (முடிவுத் தொகை ${money(settlement.amount)})` : ''}${settlement?.remarks ? ` — ${settlement.remarks}` : ''}.`
            : `This chit was closed on ${fmtDate(loan.closed_at)}${settlement ? ` (close amount ${money(settlement.amount)})` : ''}${settlement?.remarks ? ` — ${settlement.remarks}` : ''}.`}
        </div>
      )}

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


            <div className="section-title" style={{ margin: '2px 0 0', display: 'flex', alignItems: 'center', gap: 6 }}>
              <FiFileText size={13} /> {t('Chit', 'Chit')}
            </div>
            <dl className="kv" style={{ gridTemplateColumns: '110px 1fr', rowGap: 4 }}>
              <dt>{t('Chit Code', 'Chit Code')}</dt><dd><span className="badge PENDING">{loan.code}</span></dd>
              <dt>{t('Principal', 'Principal')}</dt><dd>{money(loan.principal_amount)}</dd>
              <dt>{t('Installment', 'Installment')}</dt><dd><b style={{ color: '#2563eb' }}>{money(loan.installment_amount)}</b></dd>
              <dt>{t('Tenure / Freq', 'Tenure / Freq')}</dt><dd>{loan.tenure} · {t(loan.frequency, loan.frequency)}</dd>
              <dt>{t('Total Paid', 'Total Paid')}</dt><dd style={{ color: '#10b981', fontWeight: 700 }}>{money(s.collected_principal)}</dd>
              <dt>{t('Pending Due', 'Pending Due')}</dt><dd><b style={{ color: Number(s.pending_due_amount || 0) > 0 ? '#f43f5e' : '#10b981' }}>{money(s.pending_due_amount || 0)}</b></dd>
              <dt>{t('Chit Balance', 'Chit Balance')}</dt><dd style={{ color: '#64748b', fontWeight: 600 }}>{money(s.outstanding_balance)}</dd>
            </dl>

            {can('distributions.view') && (
              <>
                <div className="section-title" style={{ margin: '2px 0 6px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><FiDollarSign size={13} /> {t('Distribution', 'Distribution')}</span>
                  {loan.status === 'active' && can('distributions.create') && (
                    <button className="btn sm" style={{ padding: '3px 10px', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 5 }}
                      onClick={() => { setDistEditId(null); setDistribute(true); }}>
                      <FiDollarSign size={12} /> {d.status === 'not_distributed' ? t('Disburse Chit', 'Disburse Chit') : t('Disburse / Edit', 'Disburse / Edit')}
                    </button>
                  )}
                </div>
                <dl className="kv" style={{ gridTemplateColumns: '110px 1fr', rowGap: 4 }}>
                  <dt>{t('Status', 'Status')}</dt><dd><b>{t(DIST_STATUS_LABEL[d.status] || 'Not Distributed', DIST_STATUS_LABEL[d.status] || 'Not Distributed')}</b></dd>
                  <dt>{t('Current EMI', 'Current EMI')}</dt><dd><b style={{ color: '#2563eb' }}>{money(d.current_emi ?? loan.installment_amount)}</b></dd>
                  <dt>{t('Distributed', 'Distributed')}</dt><dd style={{ color: '#15803d', fontWeight: 700 }}>{money(d.total_distributed ?? 0)}</dd>
                  <dt>{t('Principal Covered', 'Principal Covered')}</dt><dd>{money(d.principal_covered ?? Math.min(Number(d.total_distributed ?? 0), Number(loan.principal_amount || 0)))}</dd>
                  <dt>{t('Extra Disbursed', 'Extra Disbursed')}</dt><dd style={{ color: Number(d.extra_disbursed ?? 0) > 0 ? '#f59e0b' : '#64748b', fontWeight: 700 }}>{money(d.extra_disbursed ?? 0)}</dd>
                  <dt>{t('Remaining', 'Remaining')}</dt>
                  <dd style={{ color: Number(d.remaining_undistributed ?? 0) > 0 ? '#b45309' : '#64748b', fontWeight: 700 }}>
                    {money(d.remaining_undistributed ?? 0)}
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
              <h2 style={{ display: 'flex', alignItems: 'center', gap: 6 }}><FiCalendar size={15} /> {t('Installment Schedule & Collect', 'Installment Schedule & Collect')}</h2>
              <div style={{ display: 'flex', gap: 8 }}>
                {loan.due_date_mode === 'custom' && loan.status === 'active' && (can('loans.create') || can('loans.edit')) && (
                  <button className="btn sm secondary" onClick={() => setCustomSchedule(true)} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                    <FiPlusCircle size={12} /> {t('Add Custom Schedule', 'Add Custom Schedule')}
                  </button>
                )}
                {can('collection.create') && loan.status === 'active' && checked.size >= 2 && (
                  <button className="btn" onClick={() => setCollectIds([...checked])} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <FiZap size={14} /> {t(`Pay Multiple Due (${checked.size})`, `Pay Multiple Due (${checked.size})`)}
                  </button>
                )}
              </div>
            </div>
            <div className="table-wrap">
              <table className="grid">
                <thead>
                  <tr>
                    <th></th>
                    <th>#</th>
                    <th>{t('Due date', 'Due date')}</th>
                    <th className="right">{t('Installment Amount', 'Installment Amount')}</th>
                    <th className="right">{t('Paid', 'Paid')}</th>
                    <th className="right">{t('Balance', 'Balance')}</th>
                    <th>{t('Status', 'Status')}</th>
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
                        <td data-label="#" style={{ fontWeight: 700 }}>#{i.installment_no}</td>
                        <td data-label={t('Due date', 'Due date')}>{fmtDate(i.due_date)}</td>
                        <td data-label={t('Installment Amount', 'Installment Amount')} className="right">{money(i.payable_amount)}</td>
                        <td data-label={t('Paid', 'Paid')} className="right" style={{ color: '#10b981', fontWeight: 600 }}>{money(i.paid_amount)}</td>
                        <td data-label={t('Balance', 'Balance')} className="right" style={{ fontWeight: 700, color: Number(i.balance_amount) > 0 ? '#f43f5e' : '#64748b' }}>
                          {money(i.balance_amount)}
                        </td>
                        <td data-label={t('Status', 'Status')}><Badge value={i.status} /></td>
                        <td data-label="" className="right nowrap">
                          <div style={{ display: 'inline-flex', gap: 6, justifyContent: 'flex-end', alignItems: 'center' }}>
                            {(can('loans.edit') || can('loans.create')) && !CLOSED_LIKE.includes(loan.status) && (
                              <button className="btn-icon" title={t('Edit Due', 'Edit Due')} onClick={() => setEditDue(i)}>
                                <FiEdit2 size={13} />
                              </button>
                            )}
                            {can('collection.create') && payable && (
                              <button className="btn sm" onClick={() => setCollectIds([i.id])} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                                <FiZap size={12} /> {t('Collect', 'Collect')}
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

          {/* Custom Schedule History — only for due_date_mode='custom' chits.
              Same installment rows as above, but the action set here is
              schedule MANAGEMENT (Edit/Delete/Print/PDF) rather than Collect. */}
          {loan.due_date_mode === 'custom' && (
            <div className="card">
              <div className="card-head">
                <h2 style={{ display: 'flex', alignItems: 'center', gap: 6 }}><FiList size={15} /> {t('Custom Schedule History', 'Custom Schedule History')}</h2>
              </div>
              <div className="table-wrap">
                <table className="grid">
                  <thead>
                    <tr>
                      <th>{t('Installment', 'Installment')}</th>
                      <th>{t('Due Date', 'Due Date')}</th>
                      <th className="right">{t('Amount', 'Amount')}</th>
                      <th className="right">{t('Paid', 'Paid')}</th>
                      <th>{t('Status', 'Status')}</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {loan.installments.map((i) => {
                      const hasPayments = Number(i.paid_amount) > 0;
                      return (
                        <tr key={i.id}>
                          <td data-label={t('Installment', 'Installment')} style={{ fontWeight: 700 }}>#{i.installment_no}</td>
                          <td data-label={t('Due Date', 'Due Date')}>{fmtDate(i.due_date)}</td>
                          <td data-label={t('Amount', 'Amount')} className="right">{money(i.payable_amount)}</td>
                          <td data-label={t('Paid', 'Paid')} className="right" style={{ color: '#10b981', fontWeight: 600 }}>{money(i.paid_amount)}</td>
                          <td data-label={t('Status', 'Status')}><Badge value={i.status} /></td>
                          <td data-label="" className="right nowrap">
                            <div style={{ display: 'inline-flex', gap: 6, justifyContent: 'flex-end', alignItems: 'center' }}>
                              <button className="btn-icon" title={t('Print / Download PDF', 'Print / Download PDF')} onClick={() => setPrintInstId(i.id)}>
                                <FiPrinter size={14} />
                              </button>
                              {(can('loans.create') || can('loans.edit')) && (
                                <button className="btn-icon" title={t('Edit Schedule', 'Edit Schedule')} onClick={() => setEditCustomInst(i)}>
                                  <FiEdit2 size={14} />
                                </button>
                              )}
                              {(can('loans.create') || can('loans.edit')) && (
                                <button className="btn-icon danger" title={hasPayments ? t('Cannot delete — payments already recorded', 'Cannot delete — payments already recorded') : t('Delete Schedule', 'Delete Schedule')}
                                  disabled={hasPayments} onClick={() => setDeleteCustomInst(i)}>
                                  <FiTrash2 size={14} />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {loan.installments.length === 0 && (
                      <tr><td colSpan={6} className="muted" style={{ textAlign: 'center', padding: 20 }}>{t('No custom installments added yet', 'No custom installments added yet')}</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Collection History Table */}
          <div className="card">
            <div className="card-head">
              <h2 style={{ display: 'flex', alignItems: 'center', gap: 6 }}><FiClipboard size={15} /> {t('Collection History', 'Collection History')}</h2>
            </div>
            <div className="table-wrap">
              <table className="grid">
                <thead>
                  <tr>
                    <th>{t('Receipt', 'Receipt')}</th>
                    <th>{t('Bill No', 'Bill No')}</th>
                    <th>{t('Date', 'Date')}</th>
                    <th>{t('Mode', 'Mode')}</th>
                    <th className="right">{t('Paid (actual)', 'Paid (actual)')}</th>
                    <th>{t('Status', 'Status')}</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {loan.collections.map((col) => {
                    const isRev = String(col.receipt_no).endsWith('-REV');
                    const isSettlement = col.collection_type === 'close_settlement';
                    return (
                      <tr key={col.id} style={col.status !== 'posted' ? { opacity: 0.6 } : undefined}>
                        <td data-label={t('Receipt', 'Receipt')} style={{ fontWeight: 700 }}>
                          {col.receipt_no}
                          {isSettlement && (
                            <div><span className="badge closed" style={{ marginTop: 3 }}>{t('Close Chit / Final Settlement', 'Close Chit / Final Settlement')}</span></div>
                          )}
                        </td>
                        <td data-label={t('Bill No', 'Bill No')}>{col.bill_no || '—'}</td>
                        <td data-label={t('Date', 'Date')}>{fmtDate(col.collection_date)}</td>
                        <td data-label={t('Mode', 'Mode')}>{isSettlement ? '—' : <span className="badge PENDING">{t(col.payment_mode, col.payment_mode)}</span>}</td>
                        <td data-label={t('Paid (actual)', 'Paid (actual)')} className="right">
                          <div style={{ fontWeight: 800, color: '#10b981', fontSize: 12 }}>
                            {money(col.total_amount || (Number(col.amount) + Number(col.fine_amount || 0)))}
                          </div>
                          {Number(col.fine_amount) > 0 && (
                            <div className="muted" style={{ fontSize: 11 }}>
                              {t('EMI', 'EMI')} {money(col.amount)} + {t('Fine', 'Fine')} {money(col.fine_amount)}
                            </div>
                          )}
                        </td>
                        <td data-label={t('Status', 'Status')}><Badge value={col.status === 'posted' ? 'COMPLETED' : col.status} /></td>
                        <td data-label="" className="right nowrap">
                          <div style={{ display: 'inline-flex', gap: 6, justifyContent: 'flex-end', alignItems: 'center' }}>
                            {!isSettlement && (
                              <>
                                <button className="btn-icon" title={t('Print Receipt', 'Print Receipt')} onClick={() => openReceipt(col)}>
                                  <FiPrinter size={14} />
                                </button>
                                <button className="btn-icon" title={t('Download Receipt PDF', 'Download Receipt PDF')} onClick={() => downloadCollectionPdf(col)}>
                                  <FiDownload size={14} />
                                </button>
                              </>
                            )}
                            {col.status === 'posted' && !isRev && (
                              <>
                                {isSettlement ? (
                                  can('loans.cancel') && (
                                    <button className="btn-icon" title={t('Edit Close Settlement', 'Edit Close Settlement')} onClick={() => setEditCloseAmount(true)}>
                                      <FiEdit2 size={14} />
                                    </button>
                                  )
                                ) : can('collection.edit') && (
                                  <button className="btn-icon" title={t('Edit Collection', 'Edit Collection')} onClick={() => setEditCollection(col)}>
                                    <FiEdit2 size={14} />
                                  </button>
                                )}
                                {can('collection.cancel') && (
                                  <button className="btn-icon warning" title={t('Cancel Collection', 'Cancel Collection')} onClick={() => setAct({ type: 'cancel', id: col.id, reason: '' })}>
                                    <FiXCircle size={14} />
                                  </button>
                                )}
                                {can('collection.delete') && (
                                  <button className="btn-icon danger" title={t('Delete Collection', 'Delete Collection')} onClick={() => setAct({ type: 'delete', id: col.id, reason: '' })}>
                                    <FiTrash2 size={14} />
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
                    <tr><td colSpan={6} className="muted" style={{ textAlign: 'center', padding: 20 }}>{t('No collections recorded yet', 'No collections recorded yet')}</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Disbursement History Table — same area as Collection History, so both
              money-IN and money-OUT records are visible together. */}
          {can('distributions.view') && (
            <div className="card">
              <div className="card-head">
                <h2 style={{ display: 'flex', alignItems: 'center', gap: 6 }}><FiList size={15} /> {t('Disbursement History', 'Disbursement History')}</h2>
              </div>
              <div className="table-wrap">
                <table className="grid">
                  <thead>
                    <tr>
                      <th>{t('Date', 'Date')}</th>
                      <th>{t('Account', 'Account')}</th>
                      <th className="right">{t('Amount', 'Amount')}</th>
                      <th>{t('Remarks', 'Remarks')}</th>
                      <th>{t('Status', 'Status')}</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {distributions.map((row) => {
                      const isActive = row.status === 'active';
                      return (
                        <tr key={row.id} style={!isActive ? { opacity: 0.6 } : undefined}>
                          <td data-label={t('Date', 'Date')}>{fmtDate(row.distributed_date)}</td>
                          <td data-label={t('Account', 'Account')}>{row.account_name}</td>
                          <td data-label={t('Amount', 'Amount')} className="right" style={{ fontWeight: 800, color: '#15803d', fontSize: 12 }}>{money(row.amount)}</td>
                          <td data-label={t('Remarks', 'Remarks')}>{row.remarks || '—'}</td>
                          <td data-label={t('Status', 'Status')}><Badge value={isActive ? 'active' : 'cancelled'} /></td>
                          <td data-label="" className="right nowrap">
                            <div style={{ display: 'inline-flex', gap: 6, justifyContent: 'flex-end', alignItems: 'center' }}>
                              {isActive && can('distributions.edit') && (
                                <button className="btn-icon" title={t('Edit Disbursement', 'Edit Disbursement')}
                                  onClick={() => { setDistEditId(row.id); setDistribute(true); }}>
                                  <FiEdit2 size={14} />
                                </button>
                              )}
                              {isActive && can('distributions.cancel') && (
                                <button className="btn-icon warning" title={t('Cancel Disbursement', 'Cancel Disbursement')}
                                  onClick={() => setDistAct({ type: 'cancel', row, reason: '' })}>
                                  <FiXCircle size={14} />
                                </button>
                              )}
                              {can('distributions.delete') && (
                                <button className="btn-icon danger" title={t('Delete Disbursement', 'Delete Disbursement')}
                                  onClick={() => setDistAct({ type: 'delete', row, reason: '' })}>
                                  <FiTrash2 size={14} />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {distributions.length === 0 && (
                      <tr><td colSpan={6} className="muted" style={{ textAlign: 'center', padding: 20 }}>{t('No disbursements recorded yet', 'No disbursements recorded yet')}</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>

      {collectIds && (
        <CollectModal selectedIds={collectIds} loan={loan}
          onClose={() => setCollectIds(null)} onDone={() => { setCollectIds(null); load(); }} />
      )}

      {distribute && (
        <DistributeModal loan={loan} editRowId={distEditId}
          onClose={() => { setDistribute(false); setDistEditId(null); }}
          onDone={() => { load(); refreshMeta?.(); }} />
      )}

      {receipt && (
        <ReceiptModal collection={receipt} loan={loan} customer={c} onClose={() => setReceipt(null)} />
      )}

      {statement && (
        <StatementModal loan={loan} onClose={() => setStatement(false)} />
      )}

      {customSchedule && (
        <CustomScheduleModal loan={loan} onClose={() => setCustomSchedule(false)}
          onDone={() => { setCustomSchedule(false); load(); }} />
      )}

      {editCollection && (
        <CollectionEditModal collection={editCollection} onClose={() => setEditCollection(null)}
          onDone={() => { setEditCollection(null); load(); }} />
      )}

      {printInstId && (
        <InstallmentStatementModal installmentId={printInstId} loan={loan} customer={c}
          onClose={() => setPrintInstId(null)} />
      )}

      {editCustomInst && (
        <CustomScheduleModal loan={loan} editInstallment={editCustomInst} onClose={() => setEditCustomInst(null)}
          onDone={() => { setEditCustomInst(null); load(); }} />
      )}

      {closeChit && (
        <CloseChitModal loan={loan} customer={c} onClose={() => setCloseChit(false)}
          onDone={() => { setCloseChit(false); load(); }} />
      )}

      {editCloseAmount && settlement && (
        <EditCloseAmountModal loan={loan} settlement={settlement} onClose={() => setEditCloseAmount(false)}
          onDone={() => { setEditCloseAmount(false); load(); }} />
      )}

      {editDue && (
        <EditDueDateModal installment={editDue} onClose={() => setEditDue(null)}
          onDone={() => { setEditDue(null); load(); }} />
      )}

      {deleteCustomInst && (
        <Confirm
          title={`Delete Installment #${deleteCustomInst.installment_no}?`}
          danger busy={customDeleteBusy}
          message="This custom schedule row will be permanently removed. This is only possible because it has no payments recorded against it yet."
          confirmLabel="Delete"
          onConfirm={runDeleteCustomInst}
          onClose={() => setDeleteCustomInst(null)}
        />
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

      {distAct && (
        <Confirm
          title={distAct.type === 'cancel' ? `Cancel disbursement of ${money(distAct.row.amount)}?` : `Delete disbursement of ${money(distAct.row.amount)}?`}
          danger busy={busy}
          message={
            <>
              <p style={{ marginTop: 0 }}>
                {distAct.type === 'cancel'
                  ? `${money(distAct.row.amount)} returns to ${distAct.row.account_name}. Distributed total drops, remaining undistributed rises, and the current EMI is recomputed from the remaining history.`
                  : distAct.row.status === 'active'
                    ? `This first reverses its financial effect (${money(distAct.row.amount)} returns to ${distAct.row.account_name}), then removes it from the history list.`
                    : 'This record is already cancelled and contributes nothing financially. It will be removed from the history list.'}
              </p>
              <input style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid var(--line)' }} placeholder="Reason (optional)"
                value={distAct.reason} onChange={(e) => setDistAct({ ...distAct, reason: e.target.value })} />
            </>
          }
          confirmLabel={distAct.type === 'cancel' ? 'Cancel disbursement' : 'Delete'}
          onConfirm={runDistAct} onClose={() => setDistAct(null)}
        />
      )}
    </>
  );
}