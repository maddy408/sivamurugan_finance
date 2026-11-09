import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, money } from '../api/client';
import { Spinner, ErrorState } from '../components/ui';
import { useAuth } from '../state/AuthContext';
import { useI18n } from '../state/I18nContext';
import { FiRefreshCw, FiZap } from 'react-icons/fi';

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

  const todayFormatted = (() => {
    const d = new Date();
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}-${month}-${year}`;
  })();

  const adminCards = [
    {
      key: 'total_collection',
      label: 'TOTAL COLLECTION\n(ALL TIME)',
      subtext: 'Lifetime collection across all chits',
      icon: (
        <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#e6f7ef', display: 'grid', placeItems: 'center' }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
            <polyline points="17 6 23 6 23 12" />
          </svg>
        </div>
      ),
      value: c.total_collection,
      borderLeft: '4px solid #06b6d4',
      labelColor: '#0284c7',
      today: c.today_collection || 0,
      monthly: c.monthly_collection || 0,
    },
    {
      key: 'total_chit_amount',
      label: 'CHIT PORTFOLIO VALUE',
      subtext: 'Combined face value of every Chit',
      icon: (
        <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#f3e8ff', display: 'grid', placeItems: 'center' }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="#9333ea">
            <path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z" />
          </svg>
        </div>
      ),
      value: c.total_chit_amount,
      borderLeft: '4px solid #8b5cf6',
      labelColor: '#7c3aed',
    },
    {
      key: 'total_amount',
      label: 'CASH & BANK BALANCE',
      subtext: `${t('Office', 'Office')}: ${money(c.office_cash)} · ${t('Bank', 'Bank')}: ${money(c.bank_cash)}`,
      icon: (
        <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#e0f2fe', display: 'grid', placeItems: 'center' }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="#0284c7">
            <path d="M4 10v7h3v-7H4zm6 0v7h3v-7h-3zM2 22h19v-3H2v3zm14-12v7h3v-7h-3zm-4.5-9L2 6v2h19V6l-9.5-5z" />
          </svg>
        </div>
      ),
      value: c.total_amount,
      borderLeft: '4px solid #2563eb',
      labelColor: '#1d4ed8',
    },
    {
      key: 'total_expense',
      label: 'TOTAL EXPENSE',
      subtext: `${t('This Month', 'This Month')}: ${money(c.expense_this_month || 0)}`,
      icon: (
        <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#fee2e2', display: 'grid', placeItems: 'center' }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="#ef4444">
            <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 14l-4-4h2.5V8h3v5H16l-4 4z" />
          </svg>
        </div>
      ),
      value: c.total_expense,
      borderLeft: '4px solid #ef4444',
      labelColor: '#dc2626',
    },
    {
      key: 'total_income',
      label: 'TOTAL INCOME',
      subtext: 'All office income recorded',
      icon: (
        <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#fef3c7', display: 'grid', placeItems: 'center' }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="#f59e0b">
            <path d="M20 6h-4V4c0-1.11-.89-2-2-2h-4c-1.11 0-2 .89-2 2v2H4c-1.11 0-1.99.89-1.99 2L2 19c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V8c0-1.11-.89-2-2-2zm-6 0h-4V4h4v2z" />
          </svg>
        </div>
      ),
      value: c.total_income,
      borderLeft: '4px solid #f59e0b',
      labelColor: '#d97706',
    },
  ];

  const employeeCards = [
    {
      key: 'my_collection_today',
      label: 'MY COLLECTION TODAY',
      subtext: 'Today collected by you',
      icon: (
        <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#e6f7ef', display: 'grid', placeItems: 'center' }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
            <polyline points="17 6 23 6 23 12" />
          </svg>
        </div>
      ),
      value: c.my_collection_today,
      borderLeft: '4px solid #06b6d4',
      labelColor: '#0284c7',
      weekly: c.my_collection_week || 0,
      monthly: c.my_collection_month || 0,
    },
    {
      key: 'my_collection_month',
      label: 'MY COLLECTION THIS MONTH',
      subtext: 'This month collected by you',
      icon: (
        <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#e0f2fe', display: 'grid', placeItems: 'center' }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="#0284c7">
            <path d="M4 10v7h3v-7H4zm6 0v7h3v-7h-3zM2 22h19v-3H2v3zm14-12v7h3v-7h-3zm-4.5-9L2 6v2h19V6l-9.5-5z" />
          </svg>
        </div>
      ),
      value: c.my_collection_month,
      borderLeft: '4px solid #2563eb',
      labelColor: '#1d4ed8',
      weekly: c.my_collection_week || 0,
      monthly: c.my_collection_month || 0,
    },
    {
      key: 'my_collection_total',
      label: 'MY TOTAL COLLECTION',
      subtext: 'All time collected by you',
      icon: (
        <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#fef3c7', display: 'grid', placeItems: 'center' }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="#f59e0b">
            <path d="M20 6h-4V4c0-1.11-.89-2-2-2h-4c-1.11 0-2 .89-2 2v2H4c-1.11 0-1.99.89-1.99 2L2 19c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V8c0-1.11-.89-2-2-2zm-6 0h-4V4h4v2z" />
          </svg>
        </div>
      ),
      value: c.my_collection_total,
      borderLeft: '4px solid #f59e0b',
      labelColor: '#d97706',
      weekly: c.my_collection_week || 0,
      monthly: c.my_collection_total || 0,
    },
  ];

  const primaryCards = isAdmin ? adminCards : employeeCards;

  const perfCards = [
    {
      key: 'daily',
      label: 'Daily Chit Performance',
      iconType: 'sun',
      data: perf.daily,
    },
    {
      key: 'weekly',
      label: 'Weekly Chit Performance',
      iconType: 'calendar',
      data: perf.weekly,
    },
    {
      key: 'monthly',
      label: 'Monthly Chit Performance',
      iconType: 'chart',
      data: perf.monthly,
    },
  ];

  return (
    <div className="dashboard-page-container" style={{ maxWidth: '100%', margin: '0 auto', paddingBottom: 24 }}>
      <style>{`
        .dashboard-page-container {
          font-family: inherit;
        }
        .dash-top-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 20px;
          flex-wrap: wrap;
          gap: 12px;
        }
        .dash-metric-card {
          background: #ffffff;
          border-radius: 14px;
          padding: 16px 16px 14px;
          box-shadow: 0 2px 12px rgba(15, 23, 42, 0.04);
          border: 1px solid #edf2f7;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          transition: transform 0.15s ease, box-shadow 0.15s ease;
        }
        .dash-metric-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 6px 16px rgba(15, 23, 42, 0.08);
        }
        .dash-perf-card {
          background: #ffffff;
          border-radius: 14px;
          padding: 18px 20px;
          box-shadow: 0 2px 12px rgba(15, 23, 42, 0.04);
          border: 1px solid #edf2f7;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
        }
        .dash-leaderboard-card {
          background: #ffffff;
          border-radius: 14px;
          overflow: hidden;
          box-shadow: 0 2px 12px rgba(15, 23, 42, 0.04);
          border: 1px solid #e2e8f0;
          margin-bottom: 24px;
        }
        .dash-leaderboard-head {
          background: linear-gradient(90deg, #0d2856 0%, #153a70 100%);
          padding: 12px 20px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          flex-wrap: wrap;
          gap: 8px;
        }
        .dash-table th {
          background: #ffffff;
          color: #64748b;
          font-size: 12px;
          font-weight: 700;
          letter-spacing: 0.5px;
          text-transform: uppercase;
          padding: 12px 16px;
          border-bottom: 1px solid #f1f5f9;
        }
        .dash-table td {
          padding: 12px 16px;
          font-size: 12px;
          color: #1e293b;
          border-bottom: 1px solid #f8fafc;
        }
        .dash-footer {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding-top: 14px;
          border-top: 1px solid #e2e8f0;
          color: #64748b;
          font-size: 12.5px;
          flex-wrap: wrap;
          gap: 10px;
        }
        @media (max-width: 1280px) {
          .dash-cards-grid {
            grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)) !important;
          }
        }
        @media (max-width: 1024px) {
          .dash-perf-grid {
            grid-template-columns: 1fr !important;
          }
        }
        @media (max-width: 768px) {
          .dash-top-header {
            flex-direction: column !important;
            align-items: stretch !important;
            gap: 12px !important;
          }
          .dash-top-actions {
            width: 100% !important;
            justify-content: flex-start !important;
          }
        }
      `}</style>

      {/* Top Header Bar */}
      <div className="dash-top-header">
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: '#0f172a', letterSpacing: '-0.3px' }}>{t('nav.dashboard', 'Dashboard')}</h1>
          <div style={{ fontSize: 13, color: '#64748b', marginTop: 2, fontWeight: 500 }}>{t('dash.welcome', 'Welcome to Siva Murugan Chit Fund')}</div>
        </div>

        <div className="dash-top-actions" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <button className="btn sm secondary" onClick={load} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <FiRefreshCw size={13} /> {t('action.refresh', 'Refresh')}
          </button>
          <Link className="btn sm" to="/collection" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <FiZap size={13} /> {t('dash.collect_dues', 'Collect Dues')}
          </Link>

          {/* Date Badge */}
          <div className="dash-date-badge" style={{
            display: 'flex',
            alignItems: 'center',
            gap: 7,
            background: '#ffffff',
            border: '1px solid #e2e8f0',
            borderRadius: 8,
            padding: '6px 12px',
            fontSize: 12.5,
            fontWeight: 600,
            color: '#1e293b',
            boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
            whiteSpace: 'nowrap'
          }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
            <span>{todayFormatted}</span>
          </div>

          {/* User Profile Pill */}
          <div className="dash-user-pill" style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '4px 10px 4px 4px',
            borderRadius: 24,
            background: '#ffffff',
            border: '1px solid #e2e8f0',
            fontSize: 12.5,
            fontWeight: 600,
            color: '#1e293b',
            boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
            whiteSpace: 'nowrap',
            cursor: 'default'
          }}>
            <div style={{
              width: 28,
              height: 28,
              borderRadius: '50%',
              background: '#0d2856',
              display: 'grid',
              placeItems: 'center',
              color: '#ffffff'
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
              </svg>
            </div>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#1e293b' }}>
              {t(user?.name, user?.name || 'System Administrator')}
            </span>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </div>
        </div>
      </div>

      {/* Row 1: 5 Primary Metric Cards */}
      <div className="dash-cards-grid" style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${primaryCards.length}, minmax(0, 1fr))`,
        gap: 16,
        marginBottom: 20
      }}>
        {primaryCards.map((m) => (
          <div key={m.key} className="dash-metric-card" style={{ borderLeft: m.borderLeft }}>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{
                  fontSize: 11,
                  fontWeight: 800,
                  color: m.labelColor || '#0284c7',
                  letterSpacing: '0.4px',
                  lineHeight: '1.3',
                  whiteSpace: 'pre-line'
                }}>
                  {t(m.label, m.label)}
                </div>
                <div>{m.icon}</div>
              </div>
              <div style={{
                fontSize: 26,
                fontWeight: 900,
                color: '#0f172a',
                marginTop: 6,
                letterSpacing: '-0.5px'
              }}>
                {money(m.value)}
              </div>
              <div style={{ fontSize: 12, color: '#64748b', marginTop: 4, lineHeight: '1.4' }}>
                {t(m.subtext, m.subtext)}
              </div>
            </div>

            {m.today !== undefined && (
              <div style={{
                borderTop: '1px solid #f1f5f9',
                paddingTop: 10,
                marginTop: 12,
                display: 'flex',
                gap: 12,
                fontSize: 12,
                color: '#64748b'
              }}>
                <span>{t('Today', 'Today')}: <strong style={{ color: '#059669', fontWeight: 800 }}>{money(m.today)}</strong></span>
                <span>{t('This Month', 'This Month')}: <strong style={{ color: '#0f172a', fontWeight: 800 }}>{money(m.monthly)}</strong></span>
              </div>
            )}

            {m.weekly !== undefined && (
              <div style={{
                borderTop: '1px solid #f1f5f9',
                paddingTop: 10,
                marginTop: 12,
                display: 'flex',
                gap: 12,
                fontSize: 12,
                color: '#64748b'
              }}>
                <span>{t('Weekly', 'Weekly')}: <strong style={{ color: '#0f172a', fontWeight: 800 }}>{money(m.weekly)}</strong></span>
                <span>{t('Monthly', 'Monthly')}: <strong style={{ color: '#0f172a', fontWeight: 800 }}>{money(m.monthly)}</strong></span>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Row 2: 3 Chit Performance Cards */}
      <div className="dash-perf-grid" style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
        gap: 16,
        marginBottom: 20
      }}>
        {perfCards.map((p) => (
          <PerfCard key={p.key} label={p.label} iconType={p.iconType} data={p.data} />
        ))}
      </div>

      {/* Row 3: Staff Collection Leaderboard */}
      {isAdmin && (
        <div className="dash-leaderboard-card">
          <div className="dash-leaderboard-head">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {/* Trophy Icon */}
              <svg width="20" height="20" viewBox="0 0 24 24" fill="#fbbf24">
                <path d="M19 5h-2V3H7v2H5c-1.1 0-2 .9-2 2v1c0 2.55 1.92 4.63 4.39 4.94A5.01 5.01 0 0 0 11 15.9V19H7v2h10v-2h-4v-3.1a5.01 5.01 0 0 0 3.61-2.96C19.08 12.63 21 10.55 21 8V7c0-1.1-.9-2-2-2zM5 8V7h2v3.82C5.84 10.4 5 9.3 5 8zm14 0c0 1.3-.84 2.4-2 2.82V7h2v1z" />
              </svg>
              <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#ffffff', letterSpacing: '-0.2px' }}>
                {t('Staff Collection Leaderboard', 'Staff Collection Leaderboard')}
              </h2>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#93c5fd', fontSize: 12.5 }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
              <span>{t('Actual collections logged per employee', 'Actual collections logged per employee')}</span>
            </div>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table className="dash-table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr>
                  <th>{t('EMPLOYEE', 'EMPLOYEE')}</th>
                  <th>{t('CODE', 'CODE')}</th>
                  <th style={{ textAlign: 'right' }}>{t('TODAY', 'TODAY')}</th>
                  <th style={{ textAlign: 'right' }}>{t('THIS WEEK', 'THIS WEEK')}</th>
                  <th style={{ textAlign: 'right' }}>{t('THIS MONTH', 'THIS MONTH')}</th>
                  <th style={{ textAlign: 'right' }}>{t('TOTAL COLLECTIONS', 'TOTAL COLLECTIONS')}</th>
                  <th style={{ textAlign: 'right' }}>{t('RECEIPTS', 'RECEIPTS')}</th>
                </tr>
              </thead>
              <tbody>
                {(data.employee_collections || []).slice(0, 10).map((r, i) => (
                  <tr key={r.employee_id ?? 'admin-' + i}>
                    <td style={{ fontWeight: 700 }}>{r.employee_name}</td>
                    <td><span className="badge PENDING">{r.emp_code}</span></td>
                    <td style={{ textAlign: 'right', color: '#059669', fontWeight: 700 }}>{money(r.collected_today)}</td>
                    <td style={{ textAlign: 'right' }}>{money(r.collected_week)}</td>
                    <td style={{ textAlign: 'right' }}>{money(r.collected_month)}</td>
                    <td style={{ textAlign: 'right', fontWeight: 800, color: '#1d4ed8' }}>{money(r.collected_total)}</td>
                    <td style={{ textAlign: 'right', fontWeight: 800 }}>{r.receipts}</td>
                  </tr>
                ))}
                {(!data.employee_collections || data.employee_collections.length === 0) && (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', padding: '42px 20px' }}>
                      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', position: 'relative', width: 70, height: 34, margin: '0 auto 10px' }}>
                        <div style={{ width: 26, height: 26, borderRadius: '50%', background: '#e0edfd', border: '2px solid #ffffff', display: 'grid', placeItems: 'center', position: 'absolute', left: 8 }}>
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="#60a5fa"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" /></svg>
                        </div>
                        <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#bfdbfe', border: '2px solid #ffffff', display: 'grid', placeItems: 'center', position: 'relative', zIndex: 2 }}>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="#2563eb"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" /></svg>
                        </div>
                        <div style={{ width: 26, height: 26, borderRadius: '50%', background: '#e0edfd', border: '2px solid #ffffff', display: 'grid', placeItems: 'center', position: 'absolute', right: 8 }}>
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="#60a5fa"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" /></svg>
                        </div>
                      </div>
                      <div style={{ fontSize: 13, color: '#64748b', fontWeight: 500 }}>
                        No employee collections recorded yet
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Page Footer */}
      <div className="dash-footer">
        <div>
          © 2026 Siva Murugan Chit Fund. All rights reserved.
        </div>
        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          background: '#eff6ff',
          border: '1px solid #dbeafe',
          borderRadius: 20,
          padding: '4px 12px',
          color: '#1d4ed8',
          fontSize: 12,
          fontWeight: 600
        }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            <polyline points="9 12 11 14 15 10" />
          </svg>
          <span>{t('Secure & Trusted', 'Secure & Trusted')}</span>
        </div>
      </div>
    </div>
  );
}

function PerfCard({ label, iconType, data }) {
  const { t, lang } = useI18n();
  const d = data || { collected: 0, expected: 0, pending: 0, rate: 0 };
  const hasExpected = Number(d.expected) > 0;
  const noDuesMsg = lang === 'ta' ? '0% (இக்காலத்தில் நிலுவை இல்லை)' : '0% (No dues in this period)';
  const rateStr = hasExpected
    ? `${d.rate}% (${money(d.collected)} / ${money(d.expected)})`
    : noDuesMsg;

  const renderIcon = () => {
    if (iconType === 'sun') {
      return (
        <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#0b2347', display: 'grid', placeItems: 'center', color: '#60a5fa' }}>
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="5" />
            <line x1="12" y1="1" x2="12" y2="3" />
            <line x1="12" y1="21" x2="12" y2="23" />
            <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
            <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
            <line x1="1" y1="12" x2="3" y2="12" />
            <line x1="21" y1="12" x2="23" y2="12" />
            <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
            <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
          </svg>
        </div>
      );
    }
    if (iconType === 'calendar') {
      return (
        <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#0b2347', display: 'grid', placeItems: 'center', color: '#60a5fa' }}>
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
            <line x1="16" y1="2" x2="16" y2="6" />
            <line x1="8" y1="2" x2="8" y2="6" />
            <line x1="3" y1="10" x2="21" y2="10" />
          </svg>
        </div>
      );
    }
    return (
      <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#0b2347', display: 'grid', placeItems: 'center', color: '#60a5fa' }}>
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="18" y1="20" x2="18" y2="10" />
          <line x1="12" y1="20" x2="12" y2="4" />
          <line x1="6" y1="20" x2="6" y2="14" />
        </svg>
      </div>
    );
  };

  return (
    <div className="dash-perf-card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {renderIcon()}
          <h3 style={{ margin: 0, fontSize: 14.5, fontWeight: 800, color: '#0f172a' }}>{t(label, label)}</h3>
        </div>
        <Link to="/loans" style={{ fontSize: 12.5, fontWeight: 700, color: '#2563eb', textDecoration: 'none' }}>
          {t('View Details →', 'View Details →')}
        </Link>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, fontSize: 13 }}>
        <span style={{ color: '#64748b', fontWeight: 500 }}>{t('Collection Rate', 'Collection Rate')}</span>
        <span style={{ fontWeight: 800, color: '#0f172a' }}>{rateStr}</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        {/* Collected Box */}
        <div style={{
          background: '#f0fdf4',
          border: '1px solid #d1fae5',
          borderRadius: 12,
          padding: '12px 14px'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: '#16a34a' }}>{t('Collected', 'Collected')}</span>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
              <polyline points="22 4 12 14.01 9 11.01" />
            </svg>
          </div>
          <div style={{ fontSize: 21, fontWeight: 900, color: '#15803d', letterSpacing: '-0.3px' }}>
            {money(d.collected)}
          </div>
        </div>

        {/* Pending Box */}
        <div style={{
          background: '#fffbeb',
          border: '1px solid #fef3c7',
          borderRadius: 12,
          padding: '12px 14px'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: '#d97706' }}>{t('Pending', 'Pending')}</span>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
          </div>
          <div style={{ fontSize: 21, fontWeight: 900, color: '#d97706', letterSpacing: '-0.3px' }}>
            {money(d.pending)}
          </div>
        </div>
      </div>
    </div>
  );
}