import { API_BASE, fmtDate, money } from '../api/client';
import { Modal } from './ui';
import { useAuth } from '../state/AuthContext';

/**
 * Print-friendly collection receipt. Company details come from
 * Settings -> Organization (meta.organization) - never hardcoded.
 */
export default function ReceiptModal({ collection, loan, customer, onClose }) {
  const { meta } = useAuth();
  const org = meta?.organization || {};

  const total = Number(collection.total_amount ?? (Number(collection.amount) + Number(collection.fine_amount || 0)));
  const isSplit = collection.payment_mode_code === 'SPLIT' || (collection.cash_amount !== null && collection.cash_amount !== undefined);

  return (
    <Modal title="Collection Receipt" onClose={onClose} size="lg"
      footer={<>
        <button className="btn secondary" onClick={onClose}>Close</button>
        <button className="btn" onClick={() => window.print()}>🖨️ Print</button>
      </>}>
      <div className="print-receipt">
        <div className="receipt-header">
          {org.logo_path && <img className="receipt-logo" src={API_BASE + org.logo_path} alt="logo" />}
          <div>
            <div className="receipt-org-name">{org.name || 'Organization'}</div>
            {org.address && <div className="receipt-org-line">{org.address}</div>}
            <div className="receipt-org-line">
              {[org.mobile, org.telephone].filter(Boolean).join(' · ')}
              {org.email ? ` · ${org.email}` : ''}
            </div>
            {org.gst && <div className="receipt-org-line">GST/Reg. No: {org.gst}</div>}
          </div>
        </div>

        <div className="receipt-title-row">
          <div className="receipt-title">Collection Receipt</div>
          <div className="receipt-meta">
            <div><b>Receipt No:</b> {collection.receipt_no}</div>
            <div><b>Date:</b> {fmtDate(collection.collection_date)}</div>
          </div>
        </div>

        <div className="receipt-parties">
          <div>
            <div className="receipt-section-label">Customer</div>
            <div className="receipt-party-name">{customer?.name}</div>
            {customer?.customer_code && <div className="receipt-party-line">Code: {customer.customer_code}</div>}
            {customer?.mobile && <div className="receipt-party-line">Mobile: {customer.mobile}</div>}
            {customer?.location && <div className="receipt-party-line">{customer.location}</div>}
          </div>
          <div>
            <div className="receipt-section-label">Chit / Loan</div>
            <div className="receipt-party-name">{loan?.code}</div>
            <div className="receipt-party-line">Installment: {money(loan?.installment_amount)}</div>
            <div className="receipt-party-line">Payment Mode: {collection.payment_mode || '—'}</div>
            {collection.reference_no && <div className="receipt-party-line">Ref No: {collection.reference_no}</div>}
          </div>
        </div>

        <table className="receipt-table">
          <thead>
            <tr><th>Description</th><th className="right">Amount</th></tr>
          </thead>
          <tbody>
            {isSplit ? (
              <>
                <tr><td>Cash Portion{collection.cash_account_name ? ` (${collection.cash_account_name})` : ''}</td><td className="right">{money(collection.cash_amount)}</td></tr>
                <tr><td>UPI Portion{collection.upi_account_name ? ` (${collection.upi_account_name})` : ''}</td><td className="right">{money(collection.upi_amount)}</td></tr>
              </>
            ) : (
              <tr><td>Installment Amount</td><td className="right">{money(collection.amount)}</td></tr>
            )}
            {Number(collection.fine_amount) > 0 && (
              <tr><td>Fine Amount</td><td className="right">{money(collection.fine_amount)}</td></tr>
            )}
          </tbody>
          <tfoot>
            <tr><td><b>Total Collected</b></td><td className="right"><b>{money(total)}</b></td></tr>
          </tfoot>
        </table>

        {collection.remarks && <div className="receipt-remarks">Remarks: {collection.remarks}</div>}

        <div className="receipt-footer">
          <div className="receipt-signature">Received By</div>
          <div className="receipt-footer-note">This is a system-generated receipt.</div>
        </div>
      </div>
    </Modal>
  );
}
