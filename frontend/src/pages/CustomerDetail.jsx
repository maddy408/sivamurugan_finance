import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, money, fmtDate } from '../api/client';
import { Spinner, ErrorState, Badge } from '../components/ui';
import { useI18n } from '../state/I18nContext';
import { FiArrowLeft } from 'react-icons/fi';

export default function CustomerDetail() {
  const { id } = useParams();
  const { t, lang } = useI18n();
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
        <Link to="/customers" className="btn sm secondary" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><FiArrowLeft size={14} /> {t('Customers', 'Customers')}</Link>
        <h1 style={{ margin: 0, fontSize: 18 }}>{c.name} <span className="muted">({c.customer_code})</span></h1>
        <div style={{ flex: 1 }} />
        <Badge value={c.status} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div className="card">
          <div className="card-head"><h2>{t('Profile', 'Profile')}</h2></div>
          <div className="card-body">
            <dl className="kv">
              <dt>{t('Mobile', 'Mobile')}</dt><dd>{c.mobile}{c.alt_mobile ? ` / ${c.alt_mobile}` : ''}</dd>
              <dt>{t('Email', 'Email')}</dt><dd>{c.email || '—'}</dd>
              <dt>{t('Address', 'Address')}</dt><dd>{[c.address_line1, c.address_line2].filter(Boolean).join(', ') || '—'}</dd>
              <dt>{t('Location', 'Location')}</dt><dd>{c.location?.name || '—'}</dd>
              <dt>{t('Nominee', 'Nominee')}</dt><dd>{c.nominee_name ? `${c.nominee_name} (${c.nominee_relation || '—'}) ${c.nominee_mobile || ''}` : '—'}</dd>
              <dt>{t('Chit Balance', 'Chit Balance')}</dt><dd><b>{money(data.outstanding_balance)}</b></dd>
            </dl>
          </div>
        </div>

        <div className="card">
          <div className="card-head"><h2>{t('Active loans / chits', 'Active loans / chits')}</h2></div>
          <div className="table-wrap">
            <table className="grid">
              <thead><tr><th>{t('Code', 'Code')}</th><th className="right">{t('Chit Amount', 'Chit Amount')}</th><th className="right">{t('Installment Amount', 'Installment Amount')}</th><th className="right">{t('Remaining Balance', 'Remaining Balance')}</th><th>{t('Status', 'Status')}</th></tr></thead>
              <tbody>
                {data.loans.map((l) => (
                  <tr key={l.id}>
                    <td data-label={t('Code', 'Code')}><Link to={`/loans/${l.id}`}>{l.code}</Link></td>
                    <td data-label={t('Chit Amount', 'Chit Amount')} className="right">{money(l.principal_amount)}</td>
                    <td data-label={t('Installment Amount', 'Installment Amount')} className="right">{money(l.installment_amount ?? l.emi_amount)}</td>
                    <td data-label={t('Remaining Balance', 'Remaining Balance')} className="right">{money(l.outstanding_balance)}</td>
                    <td data-label={t('Status', 'Status')}><Badge value={l.status} /></td>
                  </tr>
                ))}
                {data.loans.length === 0 && <tr><td colSpan={5} className="muted" style={{ textAlign: 'center' }}>{t('No chits', 'No chits')}</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-head"><h2>{t('Payment history', 'Payment history')}</h2></div>
        <div className="table-wrap">
          <table className="grid">
            <thead><tr><th>{t('Receipt', 'Receipt')}</th><th>{t('Date', 'Date')}</th><th>{t('Chit', 'Loan')}</th><th>{t('Mode', 'Mode')}</th><th className="right">{t('Amount', 'Amount')}</th><th className="right">{t('Fine', 'Fine')}</th><th className="right">{t('Total', 'Total')}</th><th>{t('Status', 'Status')}</th></tr></thead>
            <tbody>
              {data.payment_history.map((p) => (
                <tr key={p.id}>
                  <td data-label={t('Receipt', 'Receipt')}>{p.receipt_no}</td>
                  <td data-label={t('Date', 'Date')}>{fmtDate(p.collection_date)}</td>
                  <td data-label={t('Chit', 'Loan')}>{p.loan_code}</td>
                  <td data-label={t('Mode', 'Mode')}>{t(p.payment_mode, p.payment_mode)}</td>
                  <td data-label={t('Amount', 'Amount')} className="right">{money(p.amount)}</td>
                  <td data-label={t('Fine', 'Fine')} className="right">{money(p.fine_amount)}</td>
                  <td data-label={t('Total', 'Total')} className="right">{money(p.total_amount)}</td>
                  <td data-label={t('Status', 'Status')}><Badge value={p.status} /></td>
                </tr>
              ))}
              {data.payment_history.length === 0 && <tr><td colSpan={8} className="muted" style={{ textAlign: 'center' }}>{t('No payments recorded', 'No payments recorded')}</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}