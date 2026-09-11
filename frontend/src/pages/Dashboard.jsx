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

  const load = useCallback(() => {
    setError(null);
    api.get('/api/dashboard').then((r) => setData(r.data)).catch(setError);
  }, []);

  useEffect(() => { load(); }, [load]);

  if (error) return <ErrorState error={error} onRetry={load} />;
  if (!data) return <Spinner />;

  const c = data.cards || {};

  // Exactly the primary metrics requested — nothing else at the top of the
  // dashboard. Admin sees the office-wide figures; an employee only ever sees
  // their own collection totals (role-based privacy, unchanged).
  const primaryCards = isAdmin
    ? [
        { key: 'total_collection', label: 'Total Collection', icon: '💳', value: c.total_collection, tone: 'emerald' },
        { key: 'total_chit_amount', label: 'Total Chit Amount', icon: '📜', value: c.total_chit_amount, tone: 'indigo' },
        { key: 'total_expense', label: 'Total Expense Amount', icon: '💸', value: c.total_expense, tone: 'rose' },
        { key: 'total_income', label: 'Total Income Amount', icon: '💰', value: c.total_income, tone: 'amber' },
      ]
    : [
        { key: 'my_collection_today', label: 'My Collection Today', icon: '📅', value: c.my_collection_today, tone: 'emerald' },
        { key: 'my_collection_week', label: 'My Collection This Week', icon: '🗓️', value: c.my_collection_week, tone: 'sky' },
        { key: 'my_collection_month', label: 'My Collection This Month', icon: '📆', value: c.my_collection_month, tone: 'indigo' },
        { key: 'my_collection_total', label: 'My Total Collection', icon: '💳', value: c.my_collection_total, tone: 'amber' },
      ];

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
            👋 {t('dash.hello', 'Welcome back')}, {user?.name?.split(' ')[0]} · {data.as_of || 'Today'}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Link className="btn sm" to="/collection">⚡ Collect Dues</Link>
          <button className="btn sm secondary" onClick={load}>↻ Refresh</button>
        </div>
      </div>

      <div className="stat-grid">
        {primaryCards.map((m) => (
          <div className={`stat ${m.tone}`} key={m.key}>
            <div className="icon-chip">{m.icon}</div>
            <div className="label">{m.label}</div>
            <div className="value">{money(m.value)}</div>
          </div>
        ))}
      </div>

      {isAdmin && (
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
                {(data.employee_collections || []).slice(0, 8).map((r, i) => (
                  <tr key={r.employee_id ?? 'admin-' + i}>
                    <td style={{ fontWeight: 700 }}>{r.employee_name}</td>
                    <td><span className="badge PENDING">{r.emp_code}</span></td>
                    <td className="right" style={{ color: 'var(--emerald)', fontWeight: 700 }}>{money(r.collected_today)}</td>
                    <td className="right">{money(r.collected_week)}</td>
                    <td className="right">{money(r.collected_month)}</td>
                    <td className="right" style={{ fontWeight: 800, color: 'var(--blue-primary)' }}>{money(r.collected_total)}</td>
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
      )}
    </>
  );
}
