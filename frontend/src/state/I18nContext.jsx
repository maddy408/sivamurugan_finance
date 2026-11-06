import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '../api/client';

const I18nContext = createContext(null);
const LS_KEY = 'smcf.lang';

const EN = {
  'app.title': 'Siva Murugan Chit Fund',
  'app.subtitle': 'Chit Fund Management',
  'nav.dashboard': 'Dashboard',
  'nav.collection': 'Collection',
  'nav.pending': 'Pending Dues',
  'nav.customers': 'Customers',
  'nav.chits': 'Chits',
  'nav.loans': 'Loans / Chits',
  'nav.finance': 'Expenses & Income',
  'nav.expenses': 'Expenses',
  'nav.income': 'Office Income',
  'nav.reports': 'Reports',
  'nav.employees': 'Employees',
  'nav.audit': 'Audit Logs',
  'nav.settings': 'Settings',
  'nav.profile': 'Profile',
  'nav.logout': 'Logout',
  'common.language': 'Language',
  'action.view': 'View',
  'action.edit': 'Edit',
  'action.delete': 'Delete',
  'action.create': 'Create',
  'action.save': 'Save',
  'action.cancel': 'Cancel',
  'action.clear': 'Clear filters',
  'action.export': 'Export Excel',
  'action.collect': 'Collect',
  'action.refresh': 'Refresh',
  'field.search': 'Search',
  'field.sno': 'S.No',
  'field.customer': 'Customer',
  'field.customer_name': 'Customer Name',
  'field.mobile': 'Mobile Number',
  'field.phone': 'Phone',
  'field.customer_code': 'Customer Code',
  'field.address': 'Address',
  'field.active_loans': 'Active Loans',
  'field.status': 'Status',
  'field.action': 'Action',
  'field.installment_amount': 'Installment Amount',
  'field.principal_amount': 'Chit Amount',
  'field.paid_amount': 'Paid Amount',
  'field.balance': 'Balance',
  'field.chit_code': 'Chit Code',
  'field.total_due': 'Total Due',
  'field.total_paid': 'Total Paid',
  'field.total_pending': 'Total Pending',
  'dash.welcome': 'Welcome to Siva Murugan Chit Fund',
  'dash.collect_dues': 'Collect Dues',
  'dash.total_collection': 'TOTAL COLLECTION (ALL TIME)',
  'dash.chit_portfolio': 'CHIT PORTFOLIO VALUE',
  'dash.cash_bank': 'CASH & BANK BALANCE',
  'dash.total_expense': 'TOTAL EXPENSE',
  'dash.total_income': 'TOTAL INCOME',
  'dash.office_cash': 'Office Cash',
  'dash.bank_cash': 'Bank Cash',
  'dash.total_amount': 'Total Amount',
  'dash.today_collected': 'Collected Today',
  'dash.today_expected': 'Expected Today',
  'dash.today_pending': 'Pending Today',
  'dash.overdue': 'Overdue Amount',
  'dash.due_customers': 'Due Customers',
  'dash.employee_collection': 'Employee Collection',
  'dash.leaderboard': 'Staff Collection Leaderboard',
  'dash.daily_perf': 'Daily Chit Performance',
  'dash.weekly_perf': 'Weekly Chit Performance',
  'dash.monthly_perf': 'Monthly Chit Performance',
  'pending.title': 'Pending Dues & Arrears',
  'pending.subtitle': 'Track overdue chit installments and customer balances',
  'pending.all': 'All Pending Dues',
  'pending.overdue_only': 'Overdue Only',
  'pending.customers': 'PENDING CUSTOMERS',
  'pending.total_dues': 'TOTAL PENDING DUES',
  'pending.no_dues': 'No pending dues',
  'pending.no_dues_desc': 'Every scheduled installment up to today has been fully paid.',
  'customers.title': 'Customers Directory',
  'customers.subtitle': 'Manage member profiles, nominee details & contact records',
  'customers.total_members': 'TOTAL REGISTERED MEMBERS',
  'customers.active_chits': 'ACTIVE RUNNING CHITS',
  'customers.register_new': 'Register New Customer',
  'loans.title': 'Chits & Loans Directory',
  'loans.subtitle': 'Manage chit groups, auctions, subscriptions & loan terms',
  'loans.new': 'Start New Chit',
  'status.active': 'Active',
  'status.pending': 'Pending',
  'status.partial': 'Partial',
  'status.completed': 'Completed',
  'status.overdue': 'Overdue',
  'status.closed': 'Closed',
  'status.cancelled': 'Cancelled',
  'pagination.prev': 'Prev',
  'pagination.next': 'Next',
  'pagination.records': 'records',
  'pagination.page': 'Page',
  'pagination.of': 'of',
  'empty.no_records': 'No records found',
};

const TA = {
  'app.title': 'சிவ முருகன் சிட் ஃபண்ட்',
  'app.subtitle': 'சிட் ஃபண்ட் மேலாண்மை',
  'nav.dashboard': 'டாஷ்போர்டு',
  'nav.collection': 'வசூல்',
  'nav.pending': 'நிலுவைத் தவணைகள்',
  'nav.customers': 'வாடிக்கையாளர்கள்',
  'nav.chits': 'சீட்டுகள்',
  'nav.loans': 'கடன்கள் / சீட்டுகள்',
  'nav.finance': 'செலவுகள் & வரவுகள்',
  'nav.expenses': 'செலவுகள்',
  'nav.income': 'அலுவலக வரவு',
  'nav.reports': 'அறிக்கைகள்',
  'nav.employees': 'பணியாளர்கள்',
  'nav.audit': 'தணிக்கை பதிவுகள்',
  'nav.settings': 'அமைப்புகள்',
  'nav.profile': 'சுயவிவரம்',
  'nav.logout': 'வெளியேறு',
  'common.language': 'மொழி',
  'action.view': 'பார்',
  'action.edit': 'திருத்து',
  'action.delete': 'நீக்கு',
  'action.create': 'உருவாக்கு',
  'action.save': 'சேமி',
  'action.cancel': 'ரத்து செய்',
  'action.clear': 'வடிகட்டிகளை அழி',
  'action.export': 'எக்செல் ஏற்றுமதி',
  'action.collect': 'வசூலி',
  'action.refresh': 'புதுப்பி',
  'field.search': 'தேடுக',
  'field.sno': 'வ.எண்',
  'field.customer': 'வாடிக்கையாளர்',
  'field.customer_name': 'வாடிக்கையாளர் பெயர்',
  'field.mobile': 'மொபைல் எண்',
  'field.phone': 'போன் எண்',
  'field.customer_code': 'வாடிக்கையாளர் குறியீடு',
  'field.address': 'முகவரி',
  'field.active_loans': 'செயலில் உள்ள சீட்டுகள்',
  'field.status': 'நிலை',
  'field.action': 'நடவடிக்கை',
  'field.installment_amount': 'தவணைத் தொகை',
  'field.principal_amount': 'சீட்டுத் தொகை',
  'field.paid_amount': 'செலுத்திய தொகை',
  'field.balance': 'மீதித் தொகை',
  'field.chit_code': 'சீட்டு குறியீடு',
  'field.total_due': 'மொத்த தவணை',
  'field.total_paid': 'செலுத்திய தொகை',
  'field.total_pending': 'மொத்த நிலுவை',
  'dash.welcome': 'சிவ முருகன் சிட் ஃபண்டிற்கு நல்வரவு',
  'dash.collect_dues': 'தவணை வசூலி',
  'dash.total_collection': 'மொத்த வசூல் (அனைத்து காலம்)',
  'dash.chit_portfolio': 'மொத்த சீட்டு மதிப்பு',
  'dash.cash_bank': 'ரொக்கம் & வங்கி இருப்பு',
  'dash.total_expense': 'மொத்த செலவு',
  'dash.total_income': 'மொத்த வரவு',
  'dash.office_cash': 'அலுவலக ரொக்கம்',
  'dash.bank_cash': 'வங்கி இருப்பு',
  'dash.total_amount': 'மொத்தத் தொகை',
  'dash.today_collected': 'இன்றைய வசூல்',
  'dash.today_expected': 'இன்றைய எதிர்பார்ப்பு',
  'dash.today_pending': 'இன்றைய நிலுவை',
  'dash.overdue': 'தாமதமான தொகை',
  'dash.due_customers': 'நிலுவை வாடிக்கையாளர்கள்',
  'dash.employee_collection': 'பணியாளர் வசூல்',
  'dash.leaderboard': 'பணியாளர்கள் வசூல் தரவரிசை',
  'dash.daily_perf': 'தினசரி சீட்டு செயல்திறன்',
  'dash.weekly_perf': 'வாராந்திர சீட்டு செயல்திறன்',
  'dash.monthly_perf': 'மாதாந்திர சீட்டு செயல்திறன்',
  'pending.title': 'நிலுவைத் தவணைகள் & பாக்கிகள்',
  'pending.subtitle': 'தாமதமான சீட்டு தவணைகள் மற்றும் வாடிக்கையாளர் இருப்புகளைக் கண்காணிக்கவும்',
  'pending.all': 'அனைத்து நிலுவைகள்',
  'pending.overdue_only': 'தாமதமானவை மட்டும்',
  'pending.customers': 'நிலுவை வாடிக்கையாளர்கள்',
  'pending.total_dues': 'மொத்த நிலுவைத் தொகை',
  'pending.no_dues': 'நிலுவைகள் எதுவும் இல்லை',
  'pending.no_dues_desc': 'இன்று வரையிலான அனைத்து தவணைகளும் முழுமையாக செலுத்தப்பட்டுவிட்டன.',
  'customers.title': 'வாடிக்கையாளர் பட்டியல்',
  'customers.subtitle': 'உறுப்பினர் சுயவிவரங்கள் மற்றும் விவரங்களை நிர்வகிக்கவும்',
  'customers.total_members': 'பதிவுசெய்த உறுப்பினர்கள்',
  'customers.active_chits': 'நடப்பில் உள்ள சீட்டுகள்',
  'customers.register_new': 'புதிய வாடிக்கையாளர் பதிவு',
  'loans.title': 'சீட்டுகள் & கடன்கள் பட்டியல்',
  'loans.subtitle': 'சீட்டுக் குழுக்கள் மற்றும் தவணைகளை நிர்வகிக்கவும்',
  'loans.new': 'புதிய சீட்டு தொடங்கு',
  'status.active': 'செயலில் உள்ளது',
  'status.pending': 'நிலுவையில்',
  'status.partial': 'பகுதி செலுத்தியது',
  'status.completed': 'முடிவடைந்தது',
  'status.overdue': 'தாமதமானது',
  'status.closed': 'நிறைவடைந்தது',
  'status.cancelled': 'ரத்து செய்யப்பட்டது',
  'pagination.prev': 'முந்தையது',
  'pagination.next': 'அடுத்தது',
  'pagination.records': 'பதிவுகள்',
  'pagination.page': 'பக்கம்',
  'pagination.of': 'இல்',
  'empty.no_records': 'பதிவுகள் எதுவும் காணப்படவில்லை',
};

// Case-insensitive direct phrase lookup for any UI string or table header
const TA_PHRASES = {
  'dashboard': 'டாஷ்போர்டு',
  'collection': 'வசூல்',
  'pending dues': 'நிலுவைத் தவணைகள்',
  'pending dues & arrears': 'நிலுவைத் தவணைகள் & பாக்கிகள்',
  'track overdue chit installments and customer balances': 'தாமதமான சீட்டு தவணைகள் மற்றும் வாடிக்கையாளர் இருப்புகளைக் கண்காணிக்கவும்',
  'detailed dues report': 'விரிவான நிலுவை அறிக்கை',
  'customers': 'வாடிக்கையாளர்கள்',
  'customers directory': 'வாடிக்கையாளர் பட்டியல்',
  'manage member profiles, nominee details & contact records': 'உறுப்பினர் சுயவிவரங்கள் மற்றும் விவரங்களை நிர்வகிக்கவும்',
  'chits': 'சீட்டுகள்',
  'chits & loans directory': 'சீட்டுகள் & கடன்கள் பட்டியல்',
  'manage chit groups, auctions, subscriptions & loan terms': 'சீட்டுக் குழுக்கள் மற்றும் தவணைகளை நிர்வகிக்கவும்',
  'expenses & income': 'செலவுகள் & வரவுகள்',
  'expenses': 'செலவுகள்',
  'office income': 'அலுவலக வரவு',
  'reports': 'அறிக்கைகள்',
  'settings': 'அமைப்புகள்',
  'profile': 'சுயவிவரம்',
  'logout': 'வெளியேறு',
  'login': 'உள்நுழைவு',
  'sign in': 'உள்நுழைக',
  'language': 'மொழி',
  'language:': 'மொழி:',
  'siva murugan chit fund': 'சிவ முருகன் சிட் ஃபண்ட்',
  'chit fund management': 'சிட் ஃபண்ட் மேலாண்மை',
  'welcome to siva murugan chit fund': 'சிவ முருகன் சிட் ஃபண்டிற்கு நல்வரவு',
  'refresh': 'புதுப்பி',
  'collect dues': 'தவணை வசூலி',
  'collect': 'வசூலி',
  'save': 'சேமி',
  'save changes': 'மாற்றங்களைச் சேமி',
  'save customer': 'வாடிக்கையாளரைச் சேமி',
  'save chit': 'சீட்டைச் சேமி',
  'cancel': 'ரத்து செய்',
  'close': 'மூடு',
  'search': 'தேடுக',
  'clear': 'அழி',
  'clear filters': 'வடிகட்டிகளை அழி',
  'export excel': 'எக்செல் ஏற்றுமதி',
  'apply': 'பயன்படுத்து',
  'view': 'பார்',
  'edit': 'திருத்து',
  'delete': 'நீக்கு',
  'prev': 'முந்தையது',
  'next': 'அடுத்தது',
  'details': 'விவரங்கள்',
  'view details': 'விவரங்களைக் காண்க',
  'view details →': 'விவரங்களைக் காண்க →',
  'view profile': 'சுயவிவரம் பார்',
  'edit customer': 'வாடிக்கையாளரைத் திருத்து',
  'delete customer': 'வாடிக்கையாளரை நீக்கு',
  's.no': 'வ.எண்',
  's.no.': 'வ.எண்',
  'customer': 'வாடிக்கையாளர்',
  'customer name': 'வாடிக்கையாளர் பெயர்',
  'mobile number': 'மொபைல் எண்',
  'phone': 'போன் எண்',
  'customer code': 'வாடிக்கையாளர் குறியீடு',
  'address': 'முகவரி',
  'active loans': 'செயலில் உள்ள சீட்டுகள்',
  'status': 'நிலை',
  'action': 'நடவடிக்கை',
  'actions': 'நடவடிக்கைகள்',
  'chit code': 'சீட்டு குறியீடு',
  'chit type': 'சீட்டு வகை',
  'face value': 'சீட்டு மதிப்பு',
  'total paid': 'செலுத்திய தொகை',
  'total due': 'மொத்த தவணை',
  'total pending': 'மொத்த நிலுவை',
  'balance': 'மீதித் தொகை',
  'due amount': 'தவணைத் தொகை',
  'installment': 'தவணை',
  'installment amount': 'தவணைத் தொகை',
  'chit amount': 'சீட்டுத் தொகை',
  'paid amount': 'செலுத்திய தொகை',
  'date': 'தேதி',
  'due date': 'தவணைத் தேதி',
  'paid date': 'செலுத்திய தேதி',
  'payment mode': 'பணம் செலுத்தும் முறை',
  'amount': 'தொகை',
  'fine amount': 'அபராதம்',
  'notes': 'குறிப்புகள்',
  'remarks': 'குறிப்புகள்',
  'total collection': 'மொத்த வசூல்',
  'total collection (all time)': 'மொத்த வசூல் (அனைத்து காலம்)',
  'total collection\n(all time)': 'மொத்த வசூல்\n(அனைத்து காலம்)',
  'lifetime collection across all chits': 'அனைத்து சீட்டுகளின் வாழ்நாள் வசூல்',
  'chit portfolio value': 'மொத்த சீட்டு மதிப்பு',
  'combined face value of every chit': 'அனைத்து சீட்டுகளின் முக மதிப்பு',
  'cash & bank balance': 'ரொக்கம் & வங்கி இருப்பு',
  'total expense': 'மொத்த செலவு',
  'total income': 'மொத்த வரவு',
  'all office income recorded': 'அனைத்து அலுவலக வரவுகள்',
  'office cash': 'அலுவலக ரொக்கம்',
  'bank cash': 'வங்கி இருப்பு',
  'bank': 'வங்கி',
  'office': 'அலுவலகம்',
  'my collection today': 'இன்றைய எனது வசூல்',
  'today collected by you': 'இன்று நீங்கள் வசூலித்தது',
  'my collection this month': 'இந்த மாத எனது வசூல்',
  'this month collected by you': 'இந்த மாதம் நீங்கள் வசூலித்தது',
  'my total collection': 'எனது மொத்த வசூல்',
  'all time collected by you': 'நீங்கள் வசூலித்த மொத்தத் தொகை',
  'daily chit performance': 'தினசரி சீட்டு செயல்திறன்',
  'weekly chit performance': 'வாராந்திர சீட்டு செயல்திறன்',
  'monthly chit performance': 'மாதாந்திர சீட்டு செயல்திறன்',
  'collection rate': 'வசூல் விகிதம்',
  'collected': 'வசூலிக்கப்பட்டது',
  'pending': 'நிலுவை',
  'staff collection leaderboard': 'பணியாளர்கள் வசூல் தரவரிசை',
  'actual collections logged per employee': 'பணியாளர் வாரியாக வசூலிக்கப்பட்ட தொகை',
  'employee': 'பணியாளர்',
  'code': 'குறியீடு',
  'today': 'இன்று',
  'this week': 'இந்த வாரம்',
  'this month': 'இந்த மாதம்',
  'total collections': 'மொத்த வசூல்',
  'receipts': 'ரசீதுகள்',
  'pending customers': 'நிலுவை வாடிக்கையாளர்கள்',
  'total pending dues': 'மொத்த நிலுவைத் தொகை',
  'accounts with unpaid dues': 'நிலுவை உள்ள கணக்குகள்',
  'actual dues payable up to today': 'இன்று வரை செலுத்த வேண்டிய தொகை',
  'all pending dues': 'அனைத்து நிலுவைகள்',
  'all pending dues (0)': 'அனைத்து நிலுவைகள் (0)',
  'overdue only': 'தாமதமானவை மட்டும்',
  'overdue only (0)': 'தாமதமானவை மட்டும் (0)',
  'no pending dues': 'நிலுவைகள் எதுவும் இல்லை',
  'every scheduled installment up to today has been fully paid.': 'இன்று வரையிலான அனைத்து தவணைகளும் முழுமையாக செலுத்தப்பட்டுவிட்டன.',
  'total registered members': 'பதிவுசெய்த உறுப்பினர்கள்',
  'member profiles in directory': 'பட்டியலில் உள்ள உறுப்பினர்கள்',
  'active running chits': 'நடப்பில் உள்ள சீட்டுகள்',
  'currently active subscriptions': 'தற்போது செயல்பாட்டில் உள்ளவை',
  'register new customer': 'புதிய வாடிக்கையாளர் பதிவு',
  'create member profile & nominee': 'உறுப்பினர் மற்றும் வாரிசுதாரர் விவரம்',
  'full name': 'முழுப் பெயர்',
  'full name *': 'முழுப் பெயர் *',
  'customer full name': 'வாடிக்கையாளர் முழுப் பெயர்',
  '10-digit mobile number': '10-இலக்க மொபைல் எண்',
  '12-digit aadhar number': '12-இலக்க ஆதார் எண்',
  'nominee / contact person': 'வாரிசுதாரர் / தொடர்பு நபர்',
  'nominee name': 'வாரிசுதாரர் பெயர்',
  'nominee relation': 'வாரிசுதாரர் உறவு',
  'nominee mobile': 'வாரிசுதாரர் மொபைல்',
  'town / city, tamil nadu': 'ஊர் / நகரம், தமிழ்நாடு',
  'active': 'செயலில் உள்ளது',
  'overdue': 'தாமதமானது',
  'partial': 'பகுதி செலுத்தியது',
  'completed': 'முடிவடைந்தது',
  'closed': 'நிறைவடைந்தது',
  'cancelled': 'ரத்து செய்யப்பட்டது',
  'any status': 'அனைத்து நிலைகளும்',
  'filter date: from': 'தேதி: முதல்',
  'to': 'வரை',
  'from': 'முதல்',
  'start new chit': 'புதிய சீட்டு தொடங்கு',
  'total active chits': 'செயல்பாட்டில் உள்ள சீட்டுகள்',
  'running subscriptions': 'நடப்பில் உள்ள சந்தாக்கள்',
  'face value pool': 'மொத்த சீட்டு நிதி மதிப்பு',
  'completed chits': 'முடிவடைந்த சீட்டுகள்',
  'matured / closed': 'முதிர்வடைந்த சீட்டுகள்',
  'no records found': 'பதிவுகள் எதுவும் காணப்படவில்லை',
};

function normalizeText(str) {
  if (typeof str !== 'string') return '';
  return str.toLowerCase().trim().replace(/\s+/g, ' ');
}

// Checks if a string contains garbled / corrupted characters (like α«)
function isGarbled(str) {
  if (typeof str !== 'string') return false;
  return /[\u0370-\u03ff]/.test(str); // Greek characters injected by mojibake
}

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
      const raw = res.data?.messages || {};
      const clean = {};
      // Filter out any corrupted mojibake rows from server
      Object.entries(raw).forEach(([k, v]) => {
        if (!isGarbled(v)) clean[k] = v;
      });
      setMessages(clean);
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
    (key, fallback) => {
      if (!key && !fallback) return '';
      const rawKey = String(key || fallback || '');
      const norm = normalizeText(rawKey);
      const normFallback = fallback ? normalizeText(String(fallback)) : '';

      if (lang === 'ta') {
        // 1. Direct server translation (if not garbled)
        if (messages[key] && !isGarbled(messages[key])) return messages[key];
        // 2. Direct key in TA dictionary
        if (TA[key]) return TA[key];
        // 3. Phrase match by key
        if (TA_PHRASES[norm]) return TA_PHRASES[norm];
        // 4. Phrase match by fallback
        if (normFallback && TA_PHRASES[normFallback]) return TA_PHRASES[normFallback];
        // 5. Check if key is in EN to find corresponding TA key
        if (EN[key] && TA[key]) return TA[key];
        return fallback ?? key;
      }

      // Default English
      if (messages[key]) return messages[key];
      if (EN[key]) return EN[key];
      return fallback ?? key;
    },
    [lang, messages]
  );

  const value = useMemo(() => ({ lang, setLang, t, ready }), [lang, setLang, t, ready]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export const useI18n = () => useContext(I18nContext) || {
  lang: 'en',
  setLang: () => {},
  t: (k, f) => f ?? k,
  ready: true
};
