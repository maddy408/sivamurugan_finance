import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import Expenses from './Expenses';
import Income from './Income';
import { useAuth } from '../state/AuthContext';
import { useI18n } from '../state/I18nContext';
import { FiTrendingDown, FiTrendingUp, FiDollarSign } from 'react-icons/fi';

export default function Finance() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = searchParams.get('tab') || 'expenses';
  const [activeTab, setActiveTab] = useState(initialTab);
  const { can } = useAuth();
  const { t } = useI18n();

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    setSearchParams({ tab });
  };

  const canExpenses = can('expenses.view');
  const canIncome = can('income.view');

  return (
    <>
      {/* Clean Header matching screenshot */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
        <div style={{
          width: 44, height: 44, borderRadius: '50%',
          background: '#e0edfd',
          display: 'grid', placeItems: 'center',
          color: '#1d4ed8', fontSize: 22, fontWeight: 900
        }}>
          ₹
        </div>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 900, color: '#0f172a', letterSpacing: '-0.3px' }}>
            {t('Expenses & Income', 'Expenses & Income')}
          </h1>
          <div style={{ fontSize: 13, color: '#64748b', marginTop: 2, fontWeight: 500 }}>
            {t('Track daily office expenses, revenue income & account transactions', 'Track daily office expenses, revenue income & account transactions')}
          </div>
        </div>
      </div>

      <div className="sub-tab-bar" style={{ display: 'inline-flex', gap: 4, background: '#f1f5f9', padding: 4, borderRadius: 24, marginBottom: 16, maxWidth: '100%', flexWrap: 'wrap' }}>
        {canExpenses && (
          <button
            className={`sub-tab-btn ${activeTab === 'expenses' ? 'active' : ''}`}
            onClick={() => handleTabChange('expenses')}
            style={{
              borderRadius: 20,
              padding: '7px 18px',
              fontWeight: 700,
              fontSize: 13,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              border: 'none',
              cursor: 'pointer',
              background: activeTab === 'expenses' ? 'linear-gradient(135deg, #0d2856 0%, #1d4ed8 100%)' : 'transparent',
              color: activeTab === 'expenses' ? '#ffffff' : '#64748b',
              boxShadow: activeTab === 'expenses' ? '0 4px 12px rgba(13, 40, 86, 0.25)' : 'none'
            }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="7" y1="17" x2="17" y2="7" />
              <polyline points="7 7 17 7 17 17" />
            </svg>
            {t('Expenses', 'Office Expense')}
          </button>
        )}
        {canIncome && (
          <button
            className={`sub-tab-btn ${activeTab === 'income' ? 'active' : ''}`}
            onClick={() => handleTabChange('income')}
            style={{
              borderRadius: 20,
              padding: '7px 18px',
              fontWeight: 700,
              fontSize: 13,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              border: 'none',
              cursor: 'pointer',
              background: activeTab === 'income' ? 'linear-gradient(135deg, #0d2856 0%, #1d4ed8 100%)' : 'transparent',
              color: activeTab === 'income' ? '#ffffff' : '#64748b',
              boxShadow: activeTab === 'income' ? '0 4px 12px rgba(13, 40, 86, 0.25)' : 'none'
            }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="7" y1="17" x2="17" y2="7" />
              <polyline points="7 7 17 7 17 17" />
            </svg>
            {t('Office Income', 'Office Income')}
          </button>
        )}
      </div>

      {activeTab === 'expenses' && canExpenses && <Expenses embedded />}
      {activeTab === 'income' && canIncome && <Income embedded />}
    </>
  );
}