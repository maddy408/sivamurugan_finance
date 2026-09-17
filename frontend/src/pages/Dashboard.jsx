import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, money } from '../api/client';
import { Spinner, ErrorState } from '../components/ui';
import { useAuth } from '../state/AuthContext';
import { useI18n } from '../state/I18nContext';
import {
  FiCreditCard, FiFileText, FiBarChart2, FiTrendingDown, FiTrendingUp,
  FiRefreshCw, FiZap, FiCalendar, FiSun,
} from 'react-icons/fi';

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
  const perf = data.performance || {};

  // Admin sees the office-wide summary (moved here from the Reports page);
  // an employee only ever sees their own collection totals (role-based
  // privacy, unchanged).
  const primaryCards = isAdmin
    ? [
        {
          key: 'total_collection',
          label: 'TOTAL COLLECTION',
          subtext: 'Cash collected so far',
          icon: <FiCreditCard />,
          value: c.total_collection,
          borderLeft: '4px solid #087f47',
          iconBg: '#e6f4ea',
          iconColor: '#087f47',
        },
        {
          key: 'total_chit_amount',
          label: 'TOTAL CHITS',
          subtext: 'Combined face value of every chit',
          icon: <FiFileText />,
          value: c.total_chit_amount,
          borderLeft: '4px solid #6d28d9',
          iconBg: '#f5f3ff',
          iconColor: '#6d28d9',
        },
        {
          key: 'total_amount',
          label: 'TOTAL AMOUNT',
          subtext: 'Office Cash + Bank Cash',
          icon: <FiBarChart2 />,
          value: c.total_amount,
          borderLeft: '4px solid #0d3878',
          iconBg: '#e8f0fe',
          iconColor: '#0d3878',
        },
        {
          key: 'total_expense',
          label: 'TOTAL EXPENSE',
          subtext: 'All office expenses',
          icon: <FiTrendingDown />,
          value: c.total_expense,
          borderLeft: '4px solid #be123c',
          iconBg: '#fff1f2',
          iconColor: '#be123c',
        },
        {
          key: 'total_income',
          label: 'TOTAL INCOME',
          subtext: 'All office income',
          icon: <FiCreditCard />,
          value: c.total_income,
          borderLeft: '4px solid #d99b26',
          iconBg: '#feefc3',
          iconColor: '#d99b26',
        },
      ]
    : [
        {
          key: 'my_collection_today',
          label: 'MY COLLECTION TODAY',
          subtext: 'Today collected by you',
          icon: <FiTrendingUp />,
          value: c.my_collection_today,
          tone: 'emerald',
          borderLeft: '4px solid #087f47',
          iconBg: '#e6f4ea',
          iconColor: '#087f47',
          weekly: c.my_collection_week || 0,
          monthly: c.my_collection_month || 0,
        },
        {
          key: 'my_collection_month',
          label: 'MY COLLECTION THIS MONTH',
          subtext: 'This month collected by you',
          icon: <FiCalendar />,
          value: c.my_collection_month,
          tone: 'sky',
          borderLeft: '4px solid #0d3878',
          iconBg: '#e8f0fe',
          iconColor: '#0d3878',
          weekly: c.my_collection_week || 0,
          monthly: c.my_collection_month || 0,
        },
        {
          key: 'my_collection_total',
          label: 'MY TOTAL COLLECTION',
          subtext: 'All time collected by you',
          icon: <FiCreditCard />,
          value: c.my_collection_total,
          tone: 'amber',
          borderLeft: '4px solid #d99b26',
          iconBg: '#feefc3',
          iconColor: '#d99b26',
          weekly: c.my_collection_week || 0,
          monthly: c.my_collection_total || 0,
        },
      ];

  const perfCards = [
    { key: 'daily', label: 'Daily Chit Performance', icon: <FiSun />, data: perf.daily },
    { key: 'weekly', label: 'Weekly Chit Performance', icon: <FiCalendar />, data: perf.weekly },
    { key: 'monthly', label: 'Monthly Chit Performance', icon: <FiBarChart2 />, data: perf.monthly },
  ];

  return (
    <>
      <div className="page-header" style={{ marginBottom: 20 }}>
        <div>
          <h1 className="page-title" style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>Dashboard</h1>
          <div className="muted" style={{ fontSize: 13, marginTop: 2 }}>
             {t('dash.hello', 'Welcome back')}, {user?.name?.split(' ')[0]} · {data.as_of || 'Today'}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn sm secondary" onClick={load} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <FiRefreshCw size={13} /> Refresh
          </button>
          <Link className="btn sm" to="/collection" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><FiZap size={13} /> Collect Dues</Link>
        </div>
      </div>

      {/* Top Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 16, marginBottom: 24 }}>
        {primaryCards.map((m) => (
          <div key={m.key} className="card" style={{
            borderLeft: m.borderLeft,
            borderRadius: 12,
            padding: 20,
            boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
            background: '#ffffff',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 800, color: '#64748b', letterSpacing: '0.5px' }}>
                  {m.label}
                </div>
                <div style={{ fontSize: 26, fontWeight: 900, color: '#0f172a', marginTop: 6, letterSpacing: '-0.5px' }}>
                  {money(m.value)}
                </div>
                <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                  {m.subtext}
                </div>
              </div>
              <div style={{
                width: 44, height: 44, borderRadius: 10,
                background: m.iconBg, color: m.iconColor,
                display: 'grid', placeItems: 'center', fontSize: 20
              }}>
                {m.icon}
              </div>
            </div>

            {m.weekly !== undefined && (
              <div style={{
                borderTop: '1px solid #f1f5f9',
                paddingTop: 10,
                marginTop: 6,
                display: 'flex',
                gap: 16,
                fontSize: 12,
                color: '#64748b'
              }}>
                <span>Weekly: <b style={{ color: '#0f172a' }}>{money(m.weekly)}</b></span>
                <span>Monthly: <b style={{ color: '#0f172a' }}>{money(m.monthly)}</b></span>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* 2-Column Performance Cards Matching Screenshot */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 16, marginBottom: 24 }}>
        {perfCards.map((p) => (
          <PerfCard key={p.key} label={p.label} icon={p.icon} data={p.data} />
        ))}
      </div>

      {isAdmin && (
        <div className="card">
          <div className="card-head">
            <h2>Staff Collection Leaderboard</h2>
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

function PerfCard({ label, icon, data }) {
  const d = data || { collected: 0, expected: 0, pending: 0, rate: 0 };
  const hasExpected = Number(d.expected) > 0;
  const rateStr = hasExpected ? `${d.rate}% (${money(d.collected)} / ${money(d.expected)})` : '0% (No active loans)';

  return (
    <div className="card" style={{ padding: 20, borderRadius: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <span style={{ fontSize: 20 }}>{icon}</span>
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: '#0f172a' }}>{label}</h3>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, fontSize: 13 }}>
        <span className="muted" style={{ fontWeight: 600 }}>Collection Rate</span>
        <span style={{ fontWeight: 800, color: 'var(--blue-primary)' }}>{rateStr}</span>
      </div>

      <div style={{ height: 8, background: '#e2e8f0', borderRadius: 4, overflow: 'hidden', marginBottom: 16 }}>
        <div style={{ height: '100%', width: `${hasExpected ? d.rate : 0}%`, background: 'var(--blue-primary)', transition: 'width 0.3s ease' }} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div style={{ background: '#f8fafc', padding: 12, borderRadius: 8, border: '1px solid #f1f5f9' }}>
          <div className="muted" style={{ fontSize: 11, fontWeight: 700 }}>Collected</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: '#087f47', marginTop: 4 }}>
            {money(d.collected)}
          </div>
        </div>

        <div style={{ background: '#f8fafc', padding: 12, borderRadius: 8, border: '1px solid #f1f5f9' }}>
          <div className="muted" style={{ fontSize: 11, fontWeight: 700 }}>Pending</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: '#d99b26', marginTop: 4 }}>
            {money(d.pending)}
          </div>
        </div>
      </div>
    </div>
  );
}
