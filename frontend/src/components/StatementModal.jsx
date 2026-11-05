import { Fragment, useEffect, useState } from 'react';
import { api, API_BASE, fmtDate, money } from '../api/client';
import { Modal } from './ui';
import { useAuth } from '../state/AuthContext';
import { useToast } from '../state/ToastContext';
import { FiPrinter, FiDownload, FiFileText } from 'react-icons/fi';

/**
 * Print-friendly Chit Statement of Account modal.
 * Displays Customer Info, Chit Summary, Financial Overview,
 * Installment Schedule, and Collection History for printing.
 *
 * MAIN STATEMENT RULE: only FULLY PAID (status = COMPLETED) installments are
 * shown - partial and pending dues are left out entirely, same rule the
 * backend PDF/Excel statement enforces. A partial due's full payment history
 * has its own place: the per-installment Print/PDF inside the Collect form
 * (see CollectModal's "Previous Payment History" + installment statement).
 */
export default function StatementModal({ loan, onClose }) {
  const { meta } = useAuth();
  const toast = useToast();
  const org = meta?.organization || {};
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState({});   // installment_id -> payments[]

  const paidInstallments = (loan?.installments || []).filter((i) => i.status === 'COMPLETED');

  useEffect(() => {
    paidInstallments.forEach((i) => {
      if (history[i.id]) return;
      api.get(`/api/installments/${i.id}/payments`).then((r) => {
        setHistory((h) => ({ ...h, [i.id]: r.data.payments }));
      }).catch(() => {});
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loan?.id]);

  if (!loan) return null;

  const downloadPdf = async () => {
    setBusy(true);
    try { await api.download(`/api/loans/${loan.id}/statement.pdf`, null, `Statement-${loan.code}.pdf`); }
    catch (e) { toast.error(e.message); } finally { setBusy(false); }
  };
  const downloadExcel = async () => {
    setBusy(true);
    try { await api.download(`/api/loans/${loan.id}/statement.xlsx`, null, `Statement-${loan.code}.xlsx`); }
    catch (e) { toast.error(e.message); } finally { setBusy(false); }
  };

  const s = loan.summary || {};
  const c = loan.customer || {};
  const d = loan.distribution || {};
  const installments = paidInstallments;
  const collections = loan.collections || [];

  return (
    <Modal title={`Statement of Account — ${loan.code}`} onClose={onClose} size="lg"
      footer={<>
        <button className="btn secondary" onClick={onClose} disabled={busy}>Close</button>
        <button className="btn btn-excel" onClick={downloadExcel} disabled={busy} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <FiFileText size={13} /> Export Excel
        </button>
        <button className="btn btn-pdf" onClick={downloadPdf} disabled={busy} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <FiDownload size={13} /> Download PDF
        </button>
        <button className="btn btn-print" onClick={() => window.print()} disabled={busy} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <FiPrinter size={13} /> Print Statement
        </button>
      </>}>
      <div className="print-statement">
        {/* Organization Header */}
        <div className="receipt-header">
          {org.logo_path && <img className="receipt-logo" src={API_BASE + org.logo_path} alt="logo" />}
          <div>
            <div className="receipt-org-name">{org.name || 'Siva Murugan Chit Fund'}</div>
            {org.address && <div className="receipt-org-line">{org.address}</div>}
            <div className="receipt-org-line">
              {[org.mobile, org.telephone].filter(Boolean).join(' · ')}
              {org.email ? ` · ${org.email}` : ''}
            </div>
            {org.gst && <div className="receipt-org-line">GST/Reg. No: {org.gst}</div>}
          </div>
        </div>

        {/* Statement Title Row */}
        <div className="receipt-title-row">
          <div>
            <div className="receipt-title">Chit Statement of Account</div>
            <div style={{ fontSize: 12, color: '#64748b' }}>Generated on {fmtDate(new Date())}</div>
          </div>
          <div className="receipt-meta">
            <div><b>Chit Code:</b> {loan.code}</div>
            <div><b>Status:</b> {loan.status?.toUpperCase()}</div>
          </div>
        </div>

        {/* Customer & Chit Info Grid */}
        <div className="receipt-parties">
          <div>
            <div className="receipt-section-label">Customer Information</div>
            <div className="receipt-party-name">{c.name || '—'}</div>
            {c.customer_code && <div className="receipt-party-line">Customer Code: {c.customer_code}</div>}
            {c.mobile && <div className="receipt-party-line">Mobile: {c.mobile}</div>}
            {[c.address_line1, c.address_line2].filter(Boolean).length > 0 && (
              <div className="receipt-party-line">Address: {[c.address_line1, c.address_line2].filter(Boolean).join(', ')}</div>
            )}
          </div>
          <div>
            <div className="receipt-section-label">Chit Details</div>
            <div className="receipt-party-name">{money(loan.principal_amount)} Principal</div>
            <div className="receipt-party-line">Installment Amount: <b>{money(loan.installment_amount)}</b></div>
            <div className="receipt-party-line">Tenure / Frequency: {loan.tenure} · {loan.frequency}</div>
            <div className="receipt-party-line">Start Date: {fmtDate(loan.start_date)}</div>
          </div>
        </div>

        {/* Financial Overview Box */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: 12, marginBottom: 16 }}>
          <div>
            <div className="receipt-section-label">Principal Amount</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: '#0f172a' }}>{money(loan.principal_amount)}</div>
          </div>
          <div>
            <div className="receipt-section-label">Total Collected (Paid)</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: '#10b981' }}>{money(s.collected_principal)}</div>
          </div>
          <div>
            <div className="receipt-section-label">Outstanding Balance</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: '#f43f5e' }}>{money(s.outstanding_balance)}</div>
          </div>
        </div>

        {/* Installment Schedule Table — paid/partial installments only */}
        <div style={{ marginBottom: 16 }}>
          <div className="receipt-section-label" style={{ marginBottom: 6 }}>
            Installment Schedule <span className="muted" style={{ fontWeight: 400 }}>(fully completed dues only)</span>
          </div>
          <div className="scroll-x">
          <table className="receipt-table">
            <thead>
              <tr>
                <th style={{ width: 40 }}>#</th>
                <th>Due Date</th>
                <th className="right">Payable</th>
                <th className="right">Paid</th>
                <th className="right">Balance</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {installments.map((inst) => (
                <Fragment key={inst.id}>
                  <tr>
                    <td style={{ fontWeight: 700 }}>#{inst.installment_no}</td>
                    <td>{fmtDate(inst.due_date)}</td>
                    <td className="right">{money(inst.payable_amount)}</td>
                    <td className="right" style={{ color: '#10b981' }}>{money(inst.paid_amount)}</td>
                    <td className="right" style={{ fontWeight: 700, color: Number(inst.balance_amount) > 0 ? '#f43f5e' : '#64748b' }}>
                      {money(inst.balance_amount)}
                    </td>
                    <td>{inst.status}</td>
                  </tr>
                  {(history[inst.id] || []).length > 0 && (
                    <tr>
                      <td colSpan={6} style={{ background: '#fafafa', padding: '4px 8px 8px 28px' }}>
                        <div className="muted" style={{ fontSize: 11, fontWeight: 700, marginBottom: 3 }}>Payment History</div>
                        {history[inst.id].map((p) => (
                          <div key={p.collection_id} style={{ fontSize: 11, display: 'flex', gap: 12 }}>
                            <span>{fmtDate(p.collection_date)}</span>
                            <span>Bill No: {p.bill_no || '—'}</span>
                            <span>Paid: {money(p.principal_alloc)}</span>
                          </div>
                        ))}
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
              {installments.length === 0 && (
                <tr><td colSpan={6} style={{ textAlign: 'center', color: '#64748b' }}>No fully completed installments yet</td></tr>
              )}
            </tbody>
          </table>
          </div>
        </div>

        {/* Collection History Table */}
        <div style={{ marginBottom: 16 }}>
          <div className="receipt-section-label" style={{ marginBottom: 6 }}>🧾 Collection History</div>
          <div className="scroll-x">
          <table className="receipt-table">
            <thead>
              <tr>
                <th>Receipt No</th>
                <th>Bill No</th>
                <th>Date</th>
                <th>Payment Mode</th>
                <th className="right">EMI Paid</th>
                <th className="right">Fine</th>
                <th className="right">Total Paid</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {collections.map((col) => (
                <tr key={col.id} style={col.status !== 'posted' ? { opacity: 0.6 } : undefined}>
                  <td style={{ fontWeight: 700 }}>{col.receipt_no}</td>
                  <td>{col.bill_no || '—'}</td>
                  <td>{fmtDate(col.collection_date)}</td>
                  <td>{col.payment_mode}</td>
                  <td className="right">{money(col.amount)}</td>
                  <td className="right">{money(col.fine_amount)}</td>
                  <td className="right" style={{ fontWeight: 800, color: '#10b981' }}>
                    {money(col.total_amount || (Number(col.amount) + Number(col.fine_amount || 0)))}
                  </td>
                  <td>{col.status === 'posted' ? 'COMPLETED' : col.status}</td>
                </tr>
              ))}
              {collections.length === 0 && (
                <tr><td colSpan={8} style={{ textAlign: 'center', color: '#64748b' }}>No collections recorded yet</td></tr>
              )}
            </tbody>
          </table>
          </div>
        </div>

        {/* Statement Footer */}
        <div className="receipt-footer">
          <div className="receipt-signature">Customer Signature</div>
          <div className="receipt-signature">Authorized Signature</div>
        </div>
        <div className="receipt-footer-note" style={{ textAlign: 'center', marginTop: 12 }}>
          This is an official computer-generated Chit Statement of Account issued by {org.name || 'Organization'}.
        </div>
      </div>
    </Modal>
  );
}