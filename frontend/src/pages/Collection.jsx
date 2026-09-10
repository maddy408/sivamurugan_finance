import { Link, useNavigate } from 'react-router-dom';
import { money, fmtDate } from '../api/client';
import { Spinner, ErrorState, EmptyState } from '../components/ui';
import { useList } from '../hooks/useList';
import { useAuth } from '../state/AuthContext';

export default function Collection() {
  const { meta } = useAuth();
  const nav = useNavigate();
  const list = useList('/api/collection/workload', { initialPerPage: 25 });

  const dash = list.extra?.dashboard;
  const loans = list.extra?.loans || [];

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Collection Workload</h1>
      </div>

      {dash && (
        <div className="stat-grid">
          <div className="stat sky"><div className="label">Expected today</div><div className="value">{money(dash.expected_today)}</div></div>
          <div className="stat emerald"><div className="label">Collected today</div><div className="value">{money(dash.collected_today)}</div></div>
          <div className="stat amber"><div className="label">Pending today</div><div className="value">{money(dash.pending_today)}</div></div>
          <div className="stat rose"><div className="label">Overdue amount</div><div className="value">{money(dash.overdue_amount)}</div></div>
          <div className="stat purple"><div className="label">Due customers</div><div className="value">{dash.due_customers}</div></div>
        </div>
      )}

      <div className="toolbar">
        <input type="search" placeholder="Search customer, code, mobile, chit code…"
          value={list.q} onChange={(e) => list.setQ(e.target.value)} />
        <select value={list.filters.location_id || ''} onChange={(e) => list.setFilter('location_id', e.target.value)}>
          <option value="">All locations</option>
          {(meta?.locations || []).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
        <select value={list.filters.only_due || ''} onChange={(e) => list.setFilter('only_due', e.target.value)}>
          <option value="">All chits</option>
          <option value="1">Only with outstanding</option>
        </select>
        <select value={list.filters.schedule_type || ''} onChange={(e) => list.setFilter('schedule_type', e.target.value)}>
          <option value="">Any schedule</option>
          <option value="DAILY">Daily</option>
          <option value="WEEKLY">Weekly</option>
          <option value="MONTHLY_WEEKDAY">Monthly weekday</option>
          <option value="MONTHLY_DAILY">Monthly daily</option>
          <option value="MONTHLY_INTERVAL">Monthly interval</option>
        </select>
        {list.hasFilters && <button className="btn secondary" onClick={list.clear}>Clear filters ✕</button>}
      </div>

      {list.loading && <Spinner />}
      {list.error && <ErrorState error={list.error} onRetry={list.reload} />}
      {!list.loading && !list.error && loans.length === 0 && (
        <EmptyState title="No collection workload" hint="Chits assigned to you (or your locations) will appear here." />
      )}

      {/* Customer-first premium collection workload cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(360px,1fr))', gap: 16 }}>
        {loans.map((loan) => {
          const nd = loan.next_due;
          const outstanding = Number(loan.summary?.outstanding_balance || 0);
          const initial = loan.customer_name ? loan.customer_name.charAt(0).toUpperCase() : 'C';
          const isDue = outstanding > 0;

          return (
            <div 
              className={`collection-card ${isDue ? 'is-due' : 'is-clear'}`} 
              key={loan.id}
              onClick={() => nav(`/collection/chit/${loan.id}`)}
            >
              <div>
                {/* Header with Customer Avatar and Status Badge */}
                <div className="collection-card-header">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div className="customer-avatar-box">{initial}</div>
                    <div>
                      <div style={{ fontWeight: 800, fontSize: 16, color: '#0f172a' }}>{loan.customer_name}</div>
                      <div style={{ fontSize: 12, color: '#64748b', fontWeight: 600, marginTop: 2 }}>
                        {loan.customer_code} · 📞 {loan.mobile || '—'}
                      </div>
                    </div>
                  </div>
                  <span className={`badge ${isDue ? 'OVERDUE' : 'COMPLETED'}`}>
                    {isDue ? 'DUE' : 'CLEAR'}
                  </span>
                </div>

                {/* Key Value Details Grid */}
                <dl className="kv" style={{ marginTop: 14, gridTemplateColumns: '130px 1fr', rowGap: 6 }}>
                  <dt>Chit Code</dt>
                  <dd><span className="badge PENDING" style={{ textTransform: 'none' }}>{loan.code}</span></dd>

                  <dt>Chit Amount</dt>
                  <dd>{money(loan.principal_amount)}</dd>

                  <dt>Installment</dt>
                  <dd style={{ fontWeight: 700 }}>{money(loan.installment_amount)}</dd>

                  <dt>Outstanding</dt>
                  <dd>
                    <b style={{ color: isDue ? '#f43f5e' : '#10b981', fontSize: 15 }}>
                      {money(outstanding)}
                    </b>
                  </dd>

                  {nd && (
                    <>
                      <dt>Next Due</dt>
                      <dd>
                        {fmtDate(nd.due_date)} <span className="muted" style={{ fontWeight: 600 }}>(#{nd.installment_no})</span>
                      </dd>
                    </>
                  )}
                </dl>
              </div>

              {/* Bottom Action Footer */}
              <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--line-subtle)', display: 'flex', justifyContent: 'flex-end' }}>
                <span className="btn sm">⚡ Collect Now →</span>
              </div>
            </div>
          );
        })}
      </div>

      {!list.loading && loans.length > 0 && (
        <div className="pagination" style={{ marginTop: 24 }}>
          <span>{list.pagination.total} chit{list.pagination.total === 1 ? '' : 's'}</span>
          <button className="btn sm secondary" disabled={list.page <= 1} onClick={() => list.setPage(list.page - 1)}>Prev</button>
          <span>Page {list.page} of {Math.max(1, list.pagination.total_pages)}</span>
          <button className="btn sm secondary" disabled={list.page >= list.pagination.total_pages} onClick={() => list.setPage(list.page + 1)}>Next</button>
        </div>
      )}

      <p className="muted" style={{ fontSize: 13, marginTop: 16 }}>
        <Link to="/loans" style={{ fontWeight: 600 }}>Open full chit list →</Link>
      </p>
    </>
  );
}
