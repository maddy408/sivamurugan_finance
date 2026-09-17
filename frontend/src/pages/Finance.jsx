import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import Expenses from './Expenses';
import Income from './Income';
import { useAuth } from '../state/AuthContext';
import { FiTrendingDown, FiTrendingUp } from 'react-icons/fi';

export default function Finance() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = searchParams.get('tab') || 'expenses';
  const [activeTab, setActiveTab] = useState(initialTab);
  const { can } = useAuth();

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    setSearchParams({ tab });
  };

  const canExpenses = can('expenses.view');
  const canIncome = can('income.view');

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Expenses & Income</h1>
      </div>

      <div className="sub-tab-bar">
        {canExpenses && (
          <button 
            className={`sub-tab-btn ${activeTab === 'expenses' ? 'active' : ''}`}
            onClick={() => handleTabChange('expenses')}
          >
            <FiTrendingDown size={13} style={{ marginRight: 5, verticalAlign: -2 }} />Office Expense
          </button>
        )}
        {canIncome && (
          <button 
            className={`sub-tab-btn ${activeTab === 'income' ? 'active' : ''}`}
            onClick={() => handleTabChange('income')}
          >
            <FiTrendingUp size={13} style={{ marginRight: 5, verticalAlign: -2 }} />Office Income
          </button>
        )}
      </div>

      {activeTab === 'expenses' && canExpenses && <Expenses embedded />}
      {activeTab === 'income' && canIncome && <Income embedded />}
    </>
  );
}
