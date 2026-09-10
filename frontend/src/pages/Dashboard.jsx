import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, money } from '../api/client';
import { Spinner, ErrorState } from '../components/ui';
import { useAuth } from '../state/AuthContext';
import { useI18n } from '../state/I18nContext';

export default function Dashboard() {
  const { user, isAdmin } = useAuth();
  const { t } = useI18n();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [flt, setFlt] = useState({ month_from: '', month_to: '', week_from: '', week_to: '' });

  const load = useCallback((params) => {
    setError(null);
    api.get('/api/dashboard', { params: params || undefined })
      .then((r) => setData(r.data))
      .catch(setError);
  }, []);

  useEffect(() => { load(); }, [load]);

  if (error) return <ErrorState error={error} onRetry={() => load()} />;
  if (!data) return <Spinner />;

  const c = data.cards || {};
  const today = data.today || {};
  const activeFlt = Object.values(flt).some(Boolean);
  const applyFlt = () => load(Object.fromEntries(Object.entries(flt).filter(([, v]) => v)));
  const clearFlt = () => { setFlt({ month_from: '', month_to: '', week_from: '', week_to: '' }); load(); };

  // Today collection progress calculation
  const expectedAmt = Number(today.expected || 0);
  const collectedAmt = Number(today.collected || 0);
  const progressPct = expectedAmt > 0 ? Math.min(Math.round((collectedAmt / expectedAmt) * 100), 100) : 0;

  return (
    <>
      {/* 1. Executive Welcome & Quick Action Shortcuts */}
      <div className="card" style={{ marginBottom: 20, background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 60%, #1e1b4b 100%)', color: '#ffffff', border: 'none' }}>
        <div className="card-body" style={{ padding: '22px 26px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
            <div>
              <div style={{ fontSize: 12, color: '#93c5fd', fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                Executive Command Center
              </div>
              <h1 style={{ margin: '4px 0 4px', fontSize: 22, fontWeight: 800, color: '#ffffff' }}>
                👋 {t('dash.hello', 'Welcome back')}, {user?.name?.split(' ')[0]}!
              </h1>
              <div style={{ fontSize: 13, color: '#cbd5e1' }}>
                Status: <span style={{ color: '#34d399', fontWeight: 700 }}>● Operational</span> · {data.as_of || 'Today'}
              </div>
            </div>

            {/* Shortcut Actions */}
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <Link className="btn" to="/collection" style={{ background: 'linear-gradient(135deg, #2563eb 0%, #3b82f6 100%)' }}>
                ⚡ Collect Dues
              </Link>
              <Link className="btn secondary" to="/customers" style={{ background: 'rgba(255,255,255,0.12)', color: '#ffffff', border: '1px solid rgba(255,255,255,0.2)' }}>
                👥 Customers
              </Link>
              <Link className="btn secondary" to="/loans" style={{ background: 'rgba(255,255,255,0.12)', color: '#ffffff', border: '1px solid rgba(255,255,255,0.2)' }}>
                📜 Chits & Loans
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* 2. Today's Target Progress & Dues Status Panel */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-head">
          <h2>🎯 Today's Collection Performance</h2>
          <span className="badge COMPLETED" style={{ background: '#dcfce7', color: '#166534' }}>
            {progressPct}% Achieved
          </span>
        </div>
        <div className="card-body">
          {/* Progress Bar */}
          <div style={{ marginBottom: 18 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 13, fontWeight: 700 }}>
              <span>Collection Target</span>
              <span>{money(collectedAmt)} collected of {money(expectedAmt)} expected</span>
            </div>
            <div style={{ height: 12, background: '#e2e8f0', borderRadius: 6, overflow: 'hidden' }}>
              <div style={{ width: `${progressPct}%`, height: '100%', background: 'linear-gradient(90deg, #10b981 0%, #059669 100%)', transition: 'width 0.4s ease' }} />
            </div>
          </div>

          {/* Today Metrics Row */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
            <div style={{ background: '#eff6ff', padding: '14px 16px', borderRadius: 6, border: '1px solid #bfdbfe' }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: '#1e40af', textTransform: 'uppercase' }}>Expected Today</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: '#1e3a8a', marginTop: 2 }}>{money(today.expected)}</div>
            </div>
            <div style={{ background: '#ecfdf5', padding: '14px 16px', borderRadius: 6, border: '1px solid #a7f3d0' }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: '#065f46', textTransform: 'uppercase' }}>Collected Today</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: '#047857', marginTop: 2 }}>{money(today.collected)}</div>
            </div>
            <div style={{ background: '#fffbeb', padding: '14px 16px', borderRadius: 6, border: '1px solid #fde68a' }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: '#92400e', textTransform: 'uppercase' }}>Pending Today</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: '#b45309', marginTop: 2 }}>{money(today.pending)}</div>
            </div>
            <div style={{ background: '#fff1f2', padding: '14px 16px', borderRadius: 6, border: '1px solid #fecdd3' }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: '#9f1239', textTransform: 'uppercase' }}>Total Overdue</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: '#be123c', marginTop: 2 }}>{money(today.overdue)}</div>
            </div>
          </div>
        </div>
      </div>

      {isAdmin && (
        <>
          {/* 3. Financial Liquidity Panel */}
          <div className="card" style={{ marginBottom: 20 }}>
            <div className="card-head">
              <h2>💳 Financial Liquidity & Capital Overview</h2>
            </div>
            <div className="card-body">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
                <div style={{ background: '#f8fafc', padding: 18, borderRadius: 6, border: '1px solid #e2e8f0' }}>
                  <div className="muted" style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase' }}>💳 Office Cash Box</div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', marginTop: 4 }}>{money(c.office_cash)}</div>
                  <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>Physical cash on hand</div>
                </div>

                <div style={{ background: '#f8fafc', padding: 18, borderRadius: 6, border: '1px solid #e2e8f0' }}>
                  <div className="muted" style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase' }}>🏦 Bank Balance</div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: '#2563eb', marginTop: 4 }}>{money(c.bank_cash)}</div>
                  <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>Bank accounts total</div>
                </div>

                <div style={{ background: '#f8fafc', padding: 18, borderRadius: 6, border: '1px solid #e2e8f0' }}>
                  <div className="muted" style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase' }}>📊 Net Working Capital</div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: '#059669', marginTop: 4 }}>{money(c.total_amount)}</div>
                  <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>Office Cash + Bank Cash</div>
                </div>

                <div style={{ background: '#f8fafc', padding: 18, borderRadius: 6, border: '1px solid #e2e8f0' }}>
                  <div className="muted" style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase' }}>💸 Disbursed Principal</div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: '#7c3aed', marginTop: 4 }}>{money(c.distributed_amount)}</div>
                  <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>Live customer disbursements</div>
                </div>
              </div>
            </div>
          </div>

          {/* 4. Month & Week Collections Breakdown */}
          <div className="card" style={{ marginBottom: 20 }}>
            <div className="card-head">
              <h2>📈 Collections Summary & Filters</h2>
            </div>
            <div className="card-body">
              <div className="toolbar" style={{ marginBottom: 16 }}>
                <label className="muted" style={{ fontSize: 12, fontWeight: 700 }}>Month range</label>
                <input type="date" value={flt.month_from} onChange={(e) => setFlt({ ...flt, month_from: e.target.value })} />
                <span className="muted">→</span>
                <input type="date" value={flt.month_to} onChange={(e) => setFlt({ ...flt, month_to: e.target.value })} />
                
                <label className="muted" style={{ fontSize: 12, fontWeight: 700, marginLeft: 12 }}>Week range</label>
                <input type="date" value={flt.week_from} onChange={(e) => setFlt({ ...flt, week_from: e.target.value })} />
                <span className="muted">→</span>
                <input type="date" value={flt.week_to} onChange={(e) => setFlt({ ...flt, week_to: e.target.value })} />
                
                <button className="btn sm" onClick={applyFlt}>Filter</button>
                {activeFlt && <button className="btn sm secondary" onClick={clearFlt}>Clear ✕</button>}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
                <div style={{ padding: 16, border: '1px solid var(--line)', borderRadius: 6, background: '#ffffff' }}>
                  <div className="muted" style={{ fontSize: 11, fontWeight: 800 }}>MONTHLY COLLECTION</div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: '#0d9488', marginTop: 4 }}>{money(c.monthly_collection)}</div>
                  <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>{data.ranges?.month?.from} → {data.ranges?.month?.to}</div>
                </div>

                <div style={{ padding: 16, border: '1px solid var(--line)', borderRadius: 6, background: '#ffffff' }}>
                  <div className="muted" style={{ fontSize: 11, fontWeight: 800 }}>WEEKLY COLLECTION</div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: '#0284c7', marginTop: 4 }}>{money(c.weekly_collection)}</div>
                  <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>{data.ranges?.week?.from} → {data.ranges?.week?.to}</div>
                </div>

                <div style={{ padding: 16, border: '1px solid var(--line)', borderRadius: 6, background: '#ffffff' }}>
                  <div className="muted" style={{ fontSize: 11, fontWeight: 800 }}>FINE COLLECTED</div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: '#d97706', marginTop: 4 }}>{money(c.fine_collected)}</div>
                  <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>Total fines received</div>
                </div>

                <div style={{ padding: 16, border: '1px solid var(--line)', borderRadius: 6, background: '#ffffff' }}>
                  <div className="muted" style={{ fontSize: 11, fontWeight: 800 }}>TOTAL COLLECTION ALL-TIME</div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: '#4f46e5', marginTop: 4 }}>{money(c.total_collection)}</div>
                  <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>Cumulative collections</div>
                </div>
              </div>
            </div>
          </div>

          {/* 5. Employee Collections Leaderboard */}
          <div className="card">
            <div className="card-head">
              <h2>🏆 Staff Collection Leaderboard</h2>
              <span className="muted" style={{ fontSize: 12 }}>Actual collections logged per employee</span>
            </div>
            <div className="table-wrap">
              <table className="grid">
                <thead>
                  <tr>
                    <th>Employee</th>
                    <th>Code</th>
                    <th className="right">Today</th>
                    <th className="right">This Week</th>
                    <th className="right">This Month</th>
                    <th className="right">Total Collections</th>
                    <th className="right">Receipts</th>
                  </tr>
                </thead>
                <tbody>
                  {(data.employee_collections || []).map((r, i) => (
                    <tr key={r.employee_id ?? 'admin-' + i}>
                      <td style={{ fontWeight: 700 }}>{r.employee_name}</td>
                      <td><span className="badge PENDING">{r.emp_code}</span></td>
                      <td className="right" style={{ color: '#10b981', fontWeight: 700 }}>{money(r.collected_today)}</td>
                      <td className="right">{money(r.collected_week)}</td>
                      <td className="right">{money(r.collected_month)}</td>
                      <td className="right" style={{ fontWeight: 800, color: '#2563eb' }}>{money(r.collected_total)}</td>
                      <td className="right"><b>{r.receipts}</b></td>
                    </tr>
                  ))}
                  {(!data.employee_collections || data.employee_collections.length === 0) && (
                    <tr><td colSpan={7} className="muted" style={{ textAlign: 'center', padding: 24 }}>No employee collections recorded yet</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </>
  );
}


