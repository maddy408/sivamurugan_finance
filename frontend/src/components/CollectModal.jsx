import { useEffect, useMemo, useState } from 'react';
import { api, money, fmtDate } from '../api/client';
import { Field, Modal } from './ui';
import { validateDate, validateAmount, focusFirstError } from '../utils/validation';
import InstallmentStatementModal from './InstallmentStatementModal';
import { useAuth } from '../state/AuthContext';
import { useToast } from '../state/ToastContext';
import { useI18n } from '../state/I18nContext';
import { FiZap, FiCreditCard, FiClock, FiPrinter } from 'react-icons/fi';

const today = () => new Date().toISOString().slice(0, 10);

/**
 * Payment flow for one or more dues that were ALREADY picked via checkboxes in
 * the installment table (single-due "Collect" button = one id; the "Pay
 * Multiple Due" toolbar button = 2+ ids). This modal never lets the user
 * change which dues are being paid — selection happens strictly in the list,
 * not inside the payment form.
 *
 * `selectedIds` — array of installment ids to pay (required, non-empty).
 */
export default function CollectModal({ selectedIds, loan, onClose, onDone }) {
  const { meta } = useAuth();
  const { t, lang } = useI18n();
  const toast = useToast();
  const modes = meta?.payment_modes || [];
  const accounts = meta?.accounts || [];
  const cashMode = modes.find((m) => String(m.code).toUpperCase() === 'CASH') || modes[0];
  const splitMode = modes.find((m) => String(m.code).toUpperCase() === 'SPLIT');
  const officeCash = accounts.find((a) => a.type === 'cash') || accounts[0];
  const bankAccount = accounts.find((a) => a.type === 'bank') || accounts[0];

  const idSet = useMemo(() => new Set(selectedIds || []), [selectedIds]);
  const selectedDues = useMemo(
    () => (loan?.installments || []).filter((i) => idSet.has(i.id)).sort((a, b) => a.installment_no - b.installment_no),
    [loan, idSet]
  );
  const selected = idSet;

  const [collectionDate, setCollectionDate] = useState(today());
  const [paid, setPaid] = useState('');          // ACTUAL amount paid (blank = use installment total), non-split only
  const [fine, setFine] = useState('0');
  const [modeId, setModeId] = useState(cashMode?.id || '');
  const [accountId, setAccountId] = useState(officeCash?.id ? String(officeCash.id) : '');
  const [cashAmount, setCashAmount] = useState('');
  const [upiAmount, setUpiAmount] = useState('');
  const [cashAccountId, setCashAccountId] = useState(officeCash?.id ? String(officeCash.id) : '');
  const [upiAccountId, setUpiAccountId] = useState(bankAccount?.id ? String(bankAccount.id) : '');
  const [ref, setRef] = useState('');
  const [billNo, setBillNo] = useState('');
  const [remarks, setRemarks] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState({});
  const [history, setHistory] = useState({});   // installment_id -> payments[]
  const [printInstId, setPrintInstId] = useState(null);

  // Previous Payment History — only fetched for dues that already have some
  // amount paid, so a fresh PENDING due never triggers a network call.
  useEffect(() => {
    const withHistory = selectedDues.filter((d) => Number(d.paid_amount) > 0 && !history[d.id]);
    withHistory.forEach((d) => {
      api.get(`/api/installments/${d.id}/payments`).then((r) => {
        setHistory((h) => ({ ...h, [d.id]: r.data.payments }));
      }).catch(() => {});
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDues]);

  const isSplit = splitMode && String(modeId) === String(splitMode.id);

  const installmentTotal = selectedDues.reduce((s, d) => s + Number(d.balance_amount || 0), 0);

  const cashNum = Number(cashAmount || 0);
  const upiNum = Number(upiAmount || 0);
  const paidNum = isSplit ? cashNum + upiNum : (paid === '' ? installmentTotal : Number(paid || 0));
  const fineNum = Number(fine || 0);
  const grandTotal = paidNum + fineNum;
  const remaining = installmentTotal - paidNum;

  const splitInvalid = isSplit && (cashNum < 0 || upiNum < 0 || (cashNum === 0 && upiNum === 0));

  const idemKey = useMemo(
    () => `col-${loan?.id}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    [loan]
  );

  const submit = async () => {
    setBusy(true); setErrors({});
    try {
      const res = await api.post('/api/collections', {
        installment_ids: [...selected],
        collection_date: collectionDate,
        amount: paidNum,
        fine_amount: fineNum,
        payment_mode_id: Number(modeId),
        account_id: isSplit ? undefined : (accountId ? Number(accountId) : undefined),
        cash_amount: isSplit ? cashNum : undefined,
        upi_amount: isSplit ? upiNum : undefined,
        cash_account_id: isSplit && cashAccountId ? Number(cashAccountId) : undefined,
        upi_account_id: isSplit && upiAccountId ? Number(upiAccountId) : undefined,
        reference_no: ref || undefined,
        bill_no: billNo || undefined,
        remarks: remarks || undefined,
        idempotency_key: idemKey,
      });
      const n = (res.data.allocations || []).length;
      toast.success(`Recorded ${money(res.data.collection.amount)}${fineNum ? ` + fine ${money(fineNum)}` : ''} across ${n} due${n === 1 ? '' : 's'}`);
      onDone?.();
    } catch (e) {
      setConfirming(false);
      if (e.errors) setErrors(Object.fromEntries(Object.entries(e.errors).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v])));
      else toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  const canProceed = selected.size > 0 && modeId && grandTotal > 0 && !splitInvalid;

  useEffect(() => {
    if (!confirming) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Enter' && !busy) {
        e.preventDefault();
        submit();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [confirming, busy]);

  const handleCollectSubmit = (e) => {
    e.preventDefault();
    const errs = {};
    const dateErr = validateDate(collectionDate, { required: true, fieldLabel: 'Collection date' });
    if (dateErr) errs.collection_date = dateErr;

    if (isSplit) {
      if (cashNum < 0) errs.cash_amount = 'Cash portion cannot be negative.';
      if (upiNum < 0) errs.upi_amount = 'UPI portion cannot be negative.';
      if (cashNum === 0 && upiNum === 0) errs.cash_amount = 'Enter a Cash and/or UPI portion greater than 0.';
    } else {
      if (paid !== '' && Number(paid) < 0) {
        errs.amount = 'Paid amount cannot be negative.';
      } else if (paidNum <= 0) {
        errs.amount = 'Amount must be greater than 0.';
      }
    }
    if (fine !== '' && Number(fine) < 0) {
      errs.fine_amount = 'Fine amount cannot be negative.';
    }

    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      focusFirstError(errs);
      return;
    }
    setErrors({});
    if (canProceed && !busy) {
      setConfirming(true);
    }
  };

  // ---------- Step 2: confirmation ----------
  if (confirming) {
    return (
      <Modal title={t("Confirm Collection", "Confirm Collection")} size="sm" onClose={() => setConfirming(false)}
        footer={<>
          <button type="button" className="btn secondary" onClick={() => setConfirming(false)} disabled={busy}>{t("Back", "Back")}</button>
          <button type="submit" form="confirm-collect-form" className="btn" disabled={busy}>{busy ? t('Posting…', 'Posting…') : `${t('Confirm', 'Confirm')} ${money(grandTotal)}`}</button>
        </>}>
        <form id="confirm-collect-form" onSubmit={(e) => { e.preventDefault(); if (!busy) submit(); }}>
          <dl className="kv" style={{ gridTemplateColumns: '150px 1fr', rowGap: 8 }}>
            <dt>{t("Customer", "Customer")}</dt><dd style={{ fontWeight: 700 }}>{loan?.customer?.name || loan?.customer_name || '—'}</dd>
            <dt>{t("Chit", "Chit")}</dt><dd>{loan?.code}</dd>
            <dt>{t("Selected Dues", "Selected dues")}</dt>
            <dd>{selectedDues.map((d) => <span key={d.id} className="badge PENDING" style={{ marginRight: 6 }}>{t(`Due #${d.installment_no}`, `Due #${d.installment_no}`)}</span>)}</dd>
            <dt>{t("Installment Total", "Installment Total")}</dt><dd style={{ fontWeight: 700 }}>{money(installmentTotal)}</dd>
            <dt>{t("Actual Paid", "Actual Paid")}</dt><dd style={{ fontWeight: 700 }}>{money(paidNum)}</dd>
            {isSplit && (
              <>
                <dt>&nbsp;&nbsp;· {t("Cash", "Cash")}</dt><dd>{money(cashNum)}</dd>
                <dt>&nbsp;&nbsp;· UPI</dt><dd>{money(upiNum)}</dd>
              </>
            )}
            {billNo && (<><dt>{t("Bill No", "Bill No")}</dt><dd>{billNo}</dd></>)}
            <dt>{t("Fine", "Fine")}</dt><dd style={{ color: '#f59e0b', fontWeight: 700 }}>{money(fineNum)}</dd>
            <dt>{t("Total", "Total")}</dt><dd style={{ fontSize: 16, fontWeight: 800, color: '#10b981' }}>{money(grandTotal)}</dd>
            <dt>{t("Payment Method", "Payment Method")}</dt><dd>{modes.find((m) => String(m.id) === String(modeId))?.name || '—'}</dd>
          </dl>
          {paidNum < installmentTotal && (
            <p className="muted" style={{ fontSize: 12, background: '#fffbeb', color: '#92400e', padding: '6px 10px', borderRadius: 6 }}>
              {t("Partial payment — allocated across the selected dues in order; the last due keeps its remaining balance.", "Partial payment — allocated across the selected dues in order; the last due keeps its remaining balance.")}
            </p>
          )}
        </form>
      </Modal>
    );
  }

  // ---------- Step 1: selection + amounts ----------
  return (
    <>
    <Modal
      title={t(`Collect — ${loan?.code || ''}`, `Collect — ${loan?.code || ''}`)}
      onClose={onClose}
      footer={<>
        <button type="button" className="btn secondary" onClick={onClose} disabled={busy}>{t("Cancel", "Cancel")}</button>
        <button type="submit" form="collect-modal-form" className="btn" disabled={!canProceed}>
          <FiZap size={14} style={{ marginRight: 5, verticalAlign: -2 }} />{t("Collect", "Collect")} {money(grandTotal)}
        </button>
      </>}
    >
      <form id="collect-modal-form" onSubmit={handleCollectSubmit}>
      {/* Read-only summary of the dues that were checked in the installment
          table — selection itself never happens inside this form. */}
      <div className="field">
        <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>{t("Selected Dues", "Selected Dues")}</span>
          <span className="muted" style={{ fontWeight: 600, fontSize: 12 }}>
            {selectedDues.length} {lang === 'ta' ? 'தவணைகள்' : (selectedDues.length === 1 ? 'due' : 'dues')} · {money(installmentTotal)}
          </span>
        </label>
        <div style={{ border: '1px solid var(--line)', borderRadius: 10, overflow: 'hidden' }}>
          <div style={{ maxHeight: 220, overflowY: 'auto', overscrollBehavior: 'contain' }}>
            {selectedDues.length === 0 && <div className="muted" style={{ padding: 16, textAlign: 'center' }}>No dues selected.</div>}
            {selectedDues.map((d) => (
              <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderBottom: '1px solid #f1f5f9' }}>
                <span style={{ fontWeight: 700, minWidth: 54 }}>Due #{d.installment_no}</span>
                <span className="muted" style={{ fontSize: 12, flex: 1 }}>{fmtDate(d.due_date)}</span>
                <span style={{ fontWeight: 700 }}>{money(d.balance_amount)}</span>
                <span className={`badge ${d.status}`} style={{ fontSize: 10 }}>{d.status}</span>
              </div>
            ))}
          </div>
        </div>
        {errors.installment_ids && <span className="err">{errors.installment_ids}</span>}
      </div>

      {selectedDues.filter((d) => Number(d.paid_amount) > 0).map((d) => (
        <div key={d.id} className="field" style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, padding: '10px 12px', marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, fontWeight: 800, fontSize: 12, color: '#92400e', marginBottom: 6 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <FiClock size={13} /> {t('Previous Payment History', 'Previous Payment History')} — {lang === 'ta' ? `தவணை #${d.installment_no}` : `Due #${d.installment_no}`}
            </span>
            <button type="button" className="btn-icon" title={t("Print / Download this due's payment statement", "Print / Download this due's payment statement")}
              onClick={() => setPrintInstId(d.id)} style={{ width: 24, height: 24 }}>
              <FiPrinter size={13} />
            </button>
          </div>
          {(history[d.id] || []).length > 0 && (
            <div className="table-wrap" style={{ border: '1px solid var(--line)', borderRadius: 8, marginBottom: 8 }}>
              <table className="grid" style={{ fontSize: 12 }}>
                <thead><tr><th>{t('Date', 'Date')}</th><th>{t('Bill No', 'Bill No')}</th><th className="right">{t('Paid Amount', 'Paid Amount')}</th></tr></thead>
                <tbody>
                  {(history[d.id] || []).map((p) => (
                    <tr key={p.collection_id}>
                      <td data-label={t('Date', 'Date')}>{fmtDate(p.collection_date)}</td>
                      <td data-label={t('Bill No', 'Bill No')}>{p.bill_no || '—'}</td>
                      <td data-label={t('Paid Amount', 'Paid Amount')} className="right">{money(p.principal_alloc)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div style={{ display: 'flex', gap: 16, fontSize: 12, flexWrap: 'wrap' }}>
            <span>{t('Current Due Amount', 'Current Due Amount')}: <b>{money(d.payable_amount)}</b></span>
            <span>{t('Previously Paid', 'Previously Paid')}: <b style={{ color: '#10b981' }}>{money(d.paid_amount)}</b></span>
            <span>{t('Remaining Due', 'Remaining Due')}: <b style={{ color: '#f43f5e' }}>{money(d.balance_amount)}</b></span>
          </div>
        </div>
      ))}

      <div className="form-grid" style={{ marginBottom: 12 }}>
        <Field label="Collection date *" error={errors.collection_date}>
          <input
            type="date"
            name="collection_date"
            value={collectionDate}
            onChange={(e) => {
              setCollectionDate(e.target.value);
              if (errors.collection_date) setErrors((prev) => { const n = { ...prev }; delete n.collection_date; return n; });
            }}
            onBlur={() => {
              const err = validateDate(collectionDate, { required: true, fieldLabel: 'Collection date' });
              if (err) setErrors((prev) => ({ ...prev, collection_date: err }));
            }}
          />
        </Field>
        <Field label="Payment method" error={errors.payment_mode_id}>
          <select value={modeId} onChange={(e) => setModeId(e.target.value)}>
            {modes.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </Field>

        {!isSplit && (
          <>
            <Field label="Cash / Bank Account">
              <select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                <option value="">(auto by payment method)</option>
                {accounts.map((a) => <option key={a.id} value={a.id}>{a.name} ({a.type})</option>)}
              </select>
            </Field>
            <Field label="Reference / Receipt No.">
              <input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="e.g. UPI-12345" />
            </Field>
            <Field label="Bill No" error={errors.bill_no}>
              <input value={billNo} onChange={(e) => setBillNo(e.target.value)} placeholder="e.g. BILL-1025" />
            </Field>
            <Field label="EMI Amount (Paid) *" error={errors.amount}>
              <input
                type="number"
                name="amount"
                min="0"
                step="0.01"
                placeholder={String(installmentTotal)}
                value={paid}
                onChange={(e) => {
                  setPaid(e.target.value);
                  if (errors.amount) setErrors((prev) => { const n = { ...prev }; delete n.amount; return n; });
                }}
                onBlur={() => {
                  const val = paid === '' ? installmentTotal : Number(paid || 0);
                  if (val <= 0) setErrors((prev) => ({ ...prev, amount: 'Amount must be greater than 0.' }));
                  else if (val < 0) setErrors((prev) => ({ ...prev, amount: 'Amount cannot be negative.' }));
                }}
              />
            </Field>
          </>
        )}

        <Field label="Fine Amount" error={errors.fine_amount}>
          <input
            type="number"
            name="fine_amount"
            min="0"
            step="0.01"
            value={fine}
            onChange={(e) => {
              setFine(e.target.value);
              if (errors.fine_amount) setErrors((prev) => { const n = { ...prev }; delete n.fine_amount; return n; });
            }}
            onBlur={() => {
              if (fine !== '' && Number(fine) < 0) {
                setErrors((prev) => ({ ...prev, fine_amount: 'Fine amount cannot be negative.' }));
              }
            }}
            placeholder="0"
          />
        </Field>

        {isSplit && (
          <>
            <Field label="Reference / Receipt No.">
              <input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="e.g. UPI-12345" />
            </Field>
            <Field label="Bill No" error={errors.bill_no}>
              <input value={billNo} onChange={(e) => setBillNo(e.target.value)} placeholder="e.g. BILL-1025" />
            </Field>
          </>
        )}
      </div>

      {isSplit && (
        <div className="split-payment-box" style={{ background: '#f8fafc', border: '1.5px solid var(--line)', borderRadius: 10, padding: 14, marginBottom: 14 }}>
          <div className="split-payment-title" style={{ fontWeight: 800, fontSize: 13, color: 'var(--blue-primary)', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
            <FiCreditCard size={13} style={{ marginRight: 5, verticalAlign: -2 }} />SPLIT COLLECTION (CASH + UPI)
          </div>
          <div className="split-payment-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="CASH PORTION (₹)" error={errors.cash_amount}>
              <input
                type="number"
                name="cash_amount"
                min="0"
                step="0.01"
                value={cashAmount}
                onChange={(e) => {
                  const val = e.target.value;
                  setCashAmount(val);
                  if (errors.cash_amount) setErrors((prev) => { const n = { ...prev }; delete n.cash_amount; return n; });
                  if (installmentTotal > 0 && val !== '') {
                    const c = Number(val || 0);
                    const rem = Math.max(0, installmentTotal - c);
                    setUpiAmount(rem > 0 ? String(rem) : '0');
                  }
                }}
                onBlur={() => {
                  if (cashNum < 0) setErrors((prev) => ({ ...prev, cash_amount: 'Cash portion cannot be negative.' }));
                }}
                placeholder="e.g. 8000"
              />
            </Field>
            <Field label="UPI PORTION (₹)" error={errors.upi_amount}>
              <input
                type="number"
                name="upi_amount"
                min="0"
                step="0.01"
                value={upiAmount}
                onChange={(e) => {
                  setUpiAmount(e.target.value);
                  if (errors.upi_amount) setErrors((prev) => { const n = { ...prev }; delete n.upi_amount; return n; });
                }}
                onBlur={() => {
                  if (upiNum < 0) setErrors((prev) => ({ ...prev, upi_amount: 'UPI portion cannot be negative.' }));
                }}
                placeholder="e.g. 4000"
              />
            </Field>
          </div>
          <div className="split-payment-summary" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, padding: '8px 12px', background: '#eff4fc', borderRadius: 8, fontSize: 12 }}>
            <div><span className="muted">Total Split:</span> <b style={{ color: 'var(--blue-primary)', fontSize: 14, marginLeft: 4 }}>{money(cashNum + upiNum)}</b></div>
            <div><span className="muted">{t('Selected Due Total', 'Selected Due Total')}:</span> <b style={{ marginLeft: 4 }}>{money(installmentTotal)}</b></div>
          </div>
          {splitInvalid && (
            <p className="err" style={{ marginTop: 8, marginBottom: 0, fontSize: 12 }}>
              {t('Enter a Cash and/or UPI portion greater than 0.', 'Enter a Cash and/or UPI portion greater than 0.')}
            </p>
          )}
        </div>
      )}

      <Field label={t('Remarks', 'Remarks')} error={errors.remarks}>
        <textarea rows={2} value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder={t('Optional collection notes…', 'Optional collection notes…')} />
      </Field>
      <p className="muted" style={{ fontSize: 12, margin: 0 }}>
        {t('Each selected due gets its own payment record. The EMI amount is never changed by a collection.', 'Each selected due gets its own payment record. The EMI amount is never changed by a collection.')}
      </p>
      </form>
    </Modal>
    {printInstId && (
      <InstallmentStatementModal installmentId={printInstId} loan={loan} customer={loan?.customer}
        onClose={() => setPrintInstId(null)} />
    )}
    </>
  );
}