import { useMemo, useState } from 'react';
import { api, money, fmtDate } from '../api/client';
import { Field, Modal } from './ui';
import { useAuth } from '../state/AuthContext';
import { useToast } from '../state/ToastContext';

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
  const toast = useToast();
  const modes = meta?.payment_modes || [];
  const accounts = meta?.accounts || [];
  const cashMode = modes.find((m) => String(m.code).toUpperCase() === 'CASH') || modes[0];
  const officeCash = accounts.find((a) => a.type === 'cash') || accounts[0];

  const idSet = useMemo(() => new Set(selectedIds || []), [selectedIds]);
  const selectedDues = useMemo(
    () => (loan?.installments || []).filter((i) => idSet.has(i.id)).sort((a, b) => a.installment_no - b.installment_no),
    [loan, idSet]
  );
  const selected = idSet;

  const [collectionDate, setCollectionDate] = useState(today());
  const [paid, setPaid] = useState('');          // ACTUAL amount paid (blank = use installment total)
  const [fine, setFine] = useState('0');
  const [modeId, setModeId] = useState(cashMode?.id || '');
  const [accountId, setAccountId] = useState(officeCash?.id ? String(officeCash.id) : '');
  const [ref, setRef] = useState('');
  const [remarks, setRemarks] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState({});

  const installmentTotal = selectedDues.reduce((s, d) => s + Number(d.balance_amount || 0), 0);

  const paidNum = paid === '' ? installmentTotal : Number(paid || 0);
  const fineNum = Number(fine || 0);
  const grandTotal = paidNum + fineNum;

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
        account_id: accountId ? Number(accountId) : undefined,
        reference_no: ref || undefined,
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

  const canProceed = selected.size > 0 && modeId && grandTotal > 0;

  // ---------- Step 2: confirmation ----------
  if (confirming) {
    return (
      <Modal title="Confirm Collection" size="sm" onClose={() => setConfirming(false)}
        footer={<>
          <button className="btn secondary" onClick={() => setConfirming(false)} disabled={busy}>Back</button>
          <button className="btn" onClick={submit} disabled={busy}>{busy ? 'Posting…' : `Confirm ${money(grandTotal)}`}</button>
        </>}>
        <dl className="kv" style={{ gridTemplateColumns: '150px 1fr', rowGap: 8 }}>
          <dt>Customer</dt><dd style={{ fontWeight: 700 }}>{loan?.customer?.name || loan?.customer_name || '—'}</dd>
          <dt>Chit</dt><dd>{loan?.code}</dd>
          <dt>Selected dues</dt>
          <dd>{selectedDues.map((d) => <span key={d.id} className="badge PENDING" style={{ marginRight: 6 }}>Due #{d.installment_no}</span>)}</dd>
          <dt>Installment Total</dt><dd style={{ fontWeight: 700 }}>{money(installmentTotal)}</dd>
          <dt>Actual Paid</dt><dd style={{ fontWeight: 700 }}>{money(paidNum)}</dd>
          <dt>Fine</dt><dd style={{ color: '#f59e0b', fontWeight: 700 }}>{money(fineNum)}</dd>
          <dt>Total</dt><dd style={{ fontSize: 16, fontWeight: 800, color: '#10b981' }}>{money(grandTotal)}</dd>
          <dt>Payment Method</dt><dd>{modes.find((m) => String(m.id) === String(modeId))?.name || '—'}</dd>
        </dl>
        {paidNum < installmentTotal && (
          <p className="muted" style={{ fontSize: 12, background: '#fffbeb', color: '#92400e', padding: '6px 10px', borderRadius: 6 }}>
            Partial payment — allocated across the selected dues in order; the last due keeps its remaining balance.
          </p>
        )}
      </Modal>
    );
  }

  // ---------- Step 1: selection + amounts ----------
  return (
    <Modal
      title={`Collect — ${loan?.code || ''}`}
      onClose={onClose}
      footer={<>
        <button className="btn secondary" onClick={onClose} disabled={busy}>Cancel</button>
        <button className="btn" onClick={() => setConfirming(true)} disabled={!canProceed}>
          ⚡ Collect {money(grandTotal)}
        </button>
      </>}
    >
      {/* Read-only summary of the dues that were checked in the installment
          table — selection itself never happens inside this form. */}
      <div className="field">
        <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>Selected Dues</span>
          <span className="muted" style={{ fontWeight: 600, fontSize: 12 }}>
            {selectedDues.length} due{selectedDues.length === 1 ? '' : 's'} · {money(installmentTotal)}
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

      <div className="form-grid">
        <Field label="Collection date" error={errors.collection_date}>
          <input type="date" value={collectionDate} onChange={(e) => setCollectionDate(e.target.value)} />
        </Field>
        <Field label="Payment method" error={errors.payment_mode_id}>
          <select value={modeId} onChange={(e) => setModeId(e.target.value)}>
            {modes.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </Field>
        <Field label="Actual Amount Paid" error={errors.amount}>
          <input type="number" min="0" step="0.01" value={paid}
            onChange={(e) => setPaid(e.target.value)}
            placeholder={money(installmentTotal)} style={{ fontWeight: 700 }} />
        </Field>
        <Field label="Fine Amount" error={errors.fine_amount}>
          <input type="number" min="0" step="0.01" value={fine} onChange={(e) => setFine(e.target.value)} placeholder="0" style={{ fontWeight: 700 }} />
        </Field>
        <Field label="Cash / Bank Account">
          <select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            <option value="">(auto by payment method)</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name} ({a.type})</option>)}
          </select>
        </Field>
        <Field label="Reference / Receipt No.">
          <input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="e.g. UPI-12345" />
        </Field>
      </div>

      <div className="card" style={{ margin: '8px 0 12px', background: '#f8fafc', borderColor: '#cbd5e1' }}>
        <div className="card-body" style={{ padding: '12px 16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <span className="muted">Installment Total ({selected.size} due{selected.size === 1 ? '' : 's'})</span>
            <span style={{ fontWeight: 700 }}>{money(installmentTotal)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <span className="muted">Actual Amount Paid</span>
            <span style={{ fontWeight: 700 }}>{money(paidNum)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <span className="muted">Fine</span>
            <span style={{ fontWeight: 700, color: '#f59e0b' }}>{money(fineNum)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '2px solid #e2e8f0', paddingTop: 8 }}>
            <span style={{ fontWeight: 800 }}>Total Collection</span>
            <span style={{ fontSize: 18, fontWeight: 800, color: '#10b981' }}>{money(grandTotal)}</span>
          </div>
        </div>
      </div>

      <Field label="Remarks" error={errors.remarks}>
        <textarea rows={2} value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="Optional collection notes…" />
      </Field>
      <p className="muted" style={{ fontSize: 12, margin: 0 }}>
        Each selected due gets its own payment record. The EMI amount is never changed by a collection.
      </p>
    </Modal>
  );
}
