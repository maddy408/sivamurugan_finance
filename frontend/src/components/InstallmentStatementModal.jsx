import { useEffect, useState } from 'react';
import { api, API_BASE, fmtDate, money } from '../api/client';
import { Modal, Spinner } from './ui';
import { useAuth } from '../state/AuthContext';
import { useToast } from '../state/ToastContext';
import { FiPrinter, FiDownload } from 'react-icons/fi';

/**
 * ONE installment's complete payment history - Print + Download PDF.
 * Different purpose from the main Statement (which only ever shows fully
 * completed dues): this always shows the selected due, Partial or
 * Completed, with every payment transaction and its own Bill No listed
 * separately - never merged.
 */
export default function InstallmentStatementModal({ installmentId, loan, customer, onClose }) {
  const { meta } = useAuth();
  const toast = useToast();
  const org = meta?.organization || {};
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get(`/api/installments/${installmentId}/payments`).then((r) => setData(r.data)).catch(setError);
  }, [installmentId]);

  const downloadPdf = async () => {
    setBusy(true);
    try { await api.download(`/api/installments/${installmentId}/statement.pdf`, null, `Installment-${loan?.code}-${data?.installment?.installment_no}.pdf`); }
    catch (e) { toast.error(e.message); } finally { setBusy(false); }
  };

  const inst = data?.installment;
  const payments = data?.payments || [];

  return (
    <Modal title="Installment Payment Statement" onClose={onClose} size="lg"
      footer={<>
        <button className="btn secondary" onClick={onClose} disabled={busy}>Close</button>
        <button className="btn secondary" onClick={downloadPdf} disabled={busy || !inst} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <FiDownload size={13} /> Download PDF
        </button>
        <button className="btn" onClick={() => window.print()} disabled={busy || !inst} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <FiPrinter size={13} /> Print
        </button>
      </>}>
      {error && <div className="err">{error.message}</div>}
      {!inst && !error && <Spinner />}
      {inst && (
        <div className="print-receipt">
          <div className="receipt-header">
            {org.logo_path && <img className="receipt-logo" src={API_BASE + org.logo_path} alt="logo" />}
            <div>
              <div className="receipt-org-name">{org.name || 'Siva Murugan Chit Fund'}</div>
            </div>
          </div>
          <div className="receipt-title-row">
            <div className="receipt-title">Installment Payment Statement</div>
          </div>
          <div className="receipt-parties">
            <div>
              <div className="receipt-section-label">Customer</div>
              <div className="receipt-party-name">{customer?.name}</div>
              {customer?.customer_code && <div className="receipt-party-line">Code: {customer.customer_code}</div>}
              {customer?.mobile && <div className="receipt-party-line">Mobile: {customer.mobile}</div>}
            </div>
            <div>
              <div className="receipt-section-label">Chit / Loan</div>
              <div className="receipt-party-name">{loan?.code}</div>
              <div className="receipt-party-line">Installment #{inst.installment_no} · Due {fmtDate(inst.due_date)}</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 13, margin: '10px 0', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: 10 }}>
            <span>Amount Due: <b>{money(inst.payable_amount)}</b></span>
            <span>Total Paid: <b style={{ color: '#10b981' }}>{money(inst.paid_amount)}</b></span>
            <span>Remaining: <b style={{ color: '#f43f5e' }}>{money(inst.balance_amount)}</b></span>
            <span>Status: <b>{inst.status}</b></span>
          </div>
          <table className="receipt-table">
            <thead>
              <tr><th>#</th><th>Date</th><th>Bill No</th><th className="right">Amount Paid</th><th>Payment Mode</th></tr>
            </thead>
            <tbody>
              {payments.map((p, n) => (
                <tr key={p.collection_id}>
                  <td>{n + 1}</td>
                  <td>{fmtDate(p.collection_date)}</td>
                  <td>{p.bill_no || '—'}</td>
                  <td className="right">{money(p.principal_alloc)}</td>
                  <td>{p.payment_mode}</td>
                </tr>
              ))}
              {payments.length === 0 && (
                <tr><td colSpan={5} style={{ textAlign: 'center', color: '#64748b' }}>No payments recorded yet</td></tr>
              )}
            </tbody>
            <tfoot>
              <tr><td colSpan={3}><b>Total Paid</b></td><td className="right"><b>{money(inst.paid_amount)}</b></td><td></td></tr>
            </tfoot>
          </table>
        </div>
      )}
    </Modal>
  );
}
