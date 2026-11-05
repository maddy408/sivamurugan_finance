import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, money, fmtDate } from '../api/client';
import { Spinner, ErrorState, Badge } from '../components/ui';
import { FiArrowLeft } from 'react-icons/fi';

export default function CustomerDetail() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  const load = () => {
    setError(null); setData(null);
    api.get(`/api/customers/${id}`).then((r) => setData(r.data)).catch(setError);
  };
  useEffect(load, [id]);

  if (error) return <ErrorState error={error} onRetry={load} />;
  if (!data) return <Spinner />;
  const c = data.customer;

  return (
    <>
      <div className="toolbar">
        <Link to="/customers" className="btn sm secondary" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><FiArrowLeft size={14} /> Customers</Link>
        <h1 style={{ margin: 0, fontSize: 18 }}>{c.name} <span className="muted">({c.customer_code})</span></h1>
        <div style={{ flex: 1 }} />
        <Badge value={c.status} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div className="card">
          <div className="card-head"><h2>Profile</h2></div>
          <div className="card-body">
            <dl className="kv">
              <dt>Mobile</dt><dd>{c.mobile}{c.alt_mobile ? ` / ${c.alt_mobile}` : ''}</dd>
              <dt>Email</dt><dd>{c.email || '—'}</dd>
              <dt>Address</dt><dd>{[c.address_line1, c.address_line2].filter(Boolean).join(', ') || '—'}</dd>
              <dt>Location</dt><dd>{c.location?.name || '—'}</dd>
              <dt>Nominee</dt><dd>{c.nominee_name ? `${c.nominee_name} (${c.nominee_relation || '—'}) ${c.nominee_mobile || ''}` : '—'}</dd>
              <dt>Chit Balance</dt><dd><b>{money(data.outstanding_balance)}</b></dd>
            </dl>
          </div>
        </div>

        <div className="card">
          <div className="card-head"><h2>Active loans / chits</h2></div>
          <div className="table-wrap">
            <table className="grid">
              <thead><tr><th>Code</th><th className="right">Chit Amount</th><th className="right">Installment Amount</th><th className="right">Remaining Balance</th><th>Status</th></tr></thead>
              <tbody>
                {data.loans.map((l) => (
                  <tr key={l.id}>
                    <td data-label="Code"><Link to={`/loans/${l.id}`}>{l.code}</Link></td>
                    <td data-label="Chit Amount" className="right">{money(l.principal_amount)}</td>
                    <td data-label="Installment Amount" className="right">{money(l.installment_amount ?? l.emi_amount)}</td>
                    <td data-label="Remaining Balance" className="right">{money(l.outstanding_balance)}</td>
                    <td data-label="Status"><Badge value={l.status} /></td>
                  </tr>
                ))}
                {data.loans.length === 0 && <tr><td colSpan={5} className="muted" style={{ textAlign: 'center' }}>No chits</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-head"><h2>Payment history</h2></div>
        <div className="table-wrap">
          <table className="grid">
            <thead><tr><th>Receipt</th><th>Date</th><th>Loan</th><th>Mode</th><th className="right">Amount</th><th className="right">Fine</th><th className="right">Total</th><th>Status</th></tr></thead>
            <tbody>
              {data.payment_history.map((p) => (
                <tr key={p.id}>
                  <td data-label="Receipt">{p.receipt_no}</td>
                  <td data-label="Date">{fmtDate(p.collection_date)}</td>
                  <td data-label="Loan">{p.loan_code}</td>
                  <td data-label="Mode">{p.payment_mode}</td>
                  <td data-label="Amount" className="right">{money(p.amount)}</td>
                  <td data-label="Fine" className="right">{money(p.fine_amount)}</td>
                  <td data-label="Total" className="right">{money(p.total_amount)}</td>
                  <td data-label="Status"><Badge value={p.status} /></td>
                </tr>
              ))}
              {data.payment_history.length === 0 && <tr><td colSpan={8} className="muted" style={{ textAlign: 'center' }}>No payments recorded</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}