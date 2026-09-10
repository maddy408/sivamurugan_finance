import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '../api/client';

const I18nContext = createContext(null);
const LS_KEY = 'smcf.lang';

// English is the built-in fallback so the UI is never blank while the Tamil
// pack loads (or if a key is missing on the server).
const EN = {
  'app.title': 'Siva Murugan Chit Fund',
  'nav.dashboard': 'Dashboard',
  'nav.collection': 'Collection',
  'nav.pending': 'Pending Dues',
  'nav.customers': 'Customers',
  'nav.chits': 'Chits',
  'nav.reports': 'Reports',
  'nav.expenses': 'Expenses',
  'nav.income': 'Office Income',
  'nav.employees': 'Employees',
  'nav.locations': 'Locations',
  'nav.audit': 'Audit Logs',
  'nav.settings': 'Settings',
  'nav.profile': 'Profile',
  'nav.logout': 'Logout',
  'action.view': 'View',
  'action.edit': 'Edit',
  'action.delete': 'Delete',
  'action.create': 'Create',
  'action.save': 'Save',
  'action.cancel': 'Cancel',
  'action.clear': 'Clear filters',
  'action.export': 'Export Excel',
  'action.collect': 'Collect',
  'field.search': 'Search',
  'field.installment_amount': 'Installment Amount',
  'field.principal_amount': 'Chit Amount',
  'field.paid_amount': 'Paid Amount',
  'field.balance': 'Balance',
  'field.status': 'Status',
  'dash.office_cash': 'Office Cash',
  'dash.bank_cash': 'Bank Cash',
  'dash.total_amount': 'Total Amount',
  'dash.today_collected': 'Collected Today',
  'dash.today_expected': 'Expected Today',
  'dash.today_pending': 'Pending Today',
  'dash.overdue': 'Overdue Amount',
  'dash.due_customers': 'Due Customers',
  'dash.employee_collection': 'Employee Collection',
};

export function I18nProvider({ children }) {
  const [lang, setLangState] = useState(() => {
    try { return localStorage.getItem(LS_KEY) || 'en'; } catch { return 'en'; }
  });
  const [messages, setMessages] = useState({});
  const [ready, setReady] = useState(false);

  const loadLang = useCallback(async (l) => {
    setReady(false);
    try {
      const res = await api.get('/api/meta/translations', { params: { lang: l } });
      setMessages(res.data?.messages || {});
    } catch {
      setMessages({});
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => { loadLang(lang); }, [lang, loadLang]);

  const setLang = useCallback((l) => {
    try { localStorage.setItem(LS_KEY, l); } catch { /* ignore */ }
    setLangState(l);
  }, []);

  const t = useCallback(
    (key, fallback) => messages[key] ?? EN[key] ?? fallback ?? key,
    [messages]
  );

  const value = useMemo(() => ({ lang, setLang, t, ready }), [lang, setLang, t, ready]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export const useI18n = () => useContext(I18nContext) || { lang: 'en', setLang: () => {}, t: (k, f) => f ?? k, ready: true };
