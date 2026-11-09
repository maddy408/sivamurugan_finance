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
  // Navigation & General
  'dashboard': 'டாஷ்போர்டு',
  'collection': 'வசூல்',
  'collection workload': 'வசூல் பணிச்சுமை',
  'assigned chit collection schedule & due follow-ups': 'ஒதுக்கப்பட்ட சீட்டு வசூல் அட்டவணை மற்றும் நிலுவை கண்காணிப்பு',
  'assigned chits': 'ஒதுக்கப்பட்ட சீட்டுகள்',
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
  'sign in to continue': 'தொடர உள்நுழையவும்',
  'language': 'மொழி',
  'language:': 'மொழி:',
  'change password': 'கடவுச்சொல்லை மாற்றவும்',
  'chit codes': 'சீட்டு குறியீடுகள்',
  'schedule': 'அட்டவணை',
  'fine rules': 'அபராத விதிகள்',
  'payment modes': 'பணம் செலுத்தும் முறைகள்',
  'manage your application settings and organization details': 'உங்கள் பயன்பாட்டு அமைப்புகள் மற்றும் நிறுவன விவரங்களை நிர்வகிக்கவும்',
  'overdue installments': 'தாமதமான தவணைகள்',
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
  'save user': 'பயனரைச் சேமி',
  'update user': 'பயனரைப் புதுப்பி',
  'cancel': 'ரத்து செய்',
  'close': 'மூடு',
  'search': 'தேடுக',
  'clear': 'அழி',
  'clear filters': 'வடிகட்டிகளை அழி',
  'export excel': 'எக்செல் ஏற்றுமதி',
  'apply': 'பயன்படுத்து',
  'reset': 'மீட்டமை',
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
  'confirm': 'உறுதி செய்',
  'working…': 'செயலாக்கத்தில்…',
  'loading…': 'ஏற்றுகிறது…',
  'download pdf': 'PDF பதிவிறக்கு',
  'print report': 'அறிக்கை அச்சிடு',
  'print statement': 'அறிக்கை அச்சிடு',
  'print receipt': 'ரசீது அச்சிடு',
  'print view': 'அச்சுப் பார்வை',
  'sample template': 'மாதிரி படிவம்',

  // Common Table Headers & Fields
  's.no': 'வ.எண்',
  's.no.': 'வ.எண்',
  'customer': 'வாடிக்கையாளர்',
  'customer name': 'வாடிக்கையாளர் பெயர்',
  'mobile number': 'மொபைல் எண்',
  'phone': 'போன் எண்',
  'phone number': 'போன் எண்',
  'customer code': 'வாடிக்கையாளர் குறியீடு',
  'address': 'முகவரி',
  'active loans': 'செயலில் உள்ள சீட்டுகள்',
  'status': 'நிலை',
  'action': 'நடவடிக்கை',
  'actions': 'நடவடிக்கைகள்',
  'chit code': 'சீட்டு குறியீடு',
  'chit type': 'சீட்டு வகை',
  'chit group': 'சீட்டுக் குழு',
  'face value': 'சீட்டு மதிப்பு',
  'total paid': 'செலுத்திய தொகை',
  'total due': 'மொத்த தவணை',
  'total pending': 'மொத்த நிலுவை',
  'balance': 'மீதித் தொகை',
  'due amount': 'தவணைத் தொகை',
  'due balance': 'நிலுவைத் தொகை',
  'due no.': 'தவணை எண்',
  'due no': 'தவணை எண்',
  'installment': 'தவணை',
  'installment #': 'தவணை எண்',
  'installment amount': 'தவணைத் தொகை',
  'installment no': 'தவணை எண்',
  'installment no.': 'தவணை எண்',
  'chit amount': 'சீட்டுத் தொகை',
  'paid': 'செலுத்தப்பட்டது',
  'paid (actual)': 'செலுத்தப்பட்டது',
  'paid amount': 'செலுத்திய தொகை',
  'total': 'மொத்தம்',
  'date': 'தேதி',
  'due date': 'தவணைத் தேதி',
  'paid date': 'செலுத்திய தேதி',
  'next due': 'அடுத்த தவணை',
  'when': 'நேரம்',
  'actor': 'செய்தவர்',
  'entity': 'பொருள்',
  'payment mode': 'பணம் செலுத்தும் முறை',
  'amount': 'தொகை',
  'fine': 'அபராதம்',
  'fine amount': 'அபராதத் தொகை',
  'pending due': 'நிலுவைத் தொகை',
  'notes': 'குறிப்புகள்',
  'remarks': 'குறிப்புகள்',
  'remarks / notes': 'குறிப்புகள் / குறிப்புரை',
  'category': 'வகை',
  'select category': 'வகையைத் தேர்ந்தெடுக்கவும்',
  'account': 'கணக்கு',
  'select account': 'கணக்கைத் தேர்ந்தெடுக்கவும்',
  'collector': 'வசூலிப்பாளர்',
  'agent / collector': 'பணியாளர் / வசூலிப்பாளர்',
  'cash': 'ரொக்கம்',
  'bank': 'வங்கி',
  'bank transfer / upi': 'வங்கிப் பரிமாற்றம் / UPI',
  'cheque': 'காசோலை',
  'office': 'அலுவலகம்',
  'created at': 'உருவாக்கப்பட்ட தேதி',

  // Statuses & Badges
  'active': 'செயலில் உள்ளது',
  'overdue': 'தாமதமானது',
  'partial': 'பகுதி செலுத்தியது',
  'completed': 'முடிவடைந்தது',
  'closed': 'நிறைவடைந்தது',
  'cancelled': 'ரத்து செய்யப்பட்டது',
  'all clear': 'அனைத்தும் செலுத்தப்பட்டது',
  'due': 'தவணை உள்ளது',
  'disabled': 'முடக்கப்பட்டது',
  'pending': 'நிலுவையில்',
  'any status': 'அனைத்து நிலைகளும்',
  'all statuses': 'அனைத்து நிலைகளும்',
  'all chits': 'அனைத்து சீட்டுகள்',
  'only with pending dues': 'நிலுவை உள்ளவை மட்டும்',
  'any schedule': 'அனைத்து கால அட்டவணைகளும்',
  'daily': 'தினசரி',
  'weekly': 'வாராந்திரம்',
  'monthly weekday': 'மாதாந்திர கிழமை',
  'monthly daily': 'மாதாந்திர நாள்',
  'monthly interval': 'மாதாந்திர இடைவெளி',

  // Dashboard
  'total collection': 'மொத்த வசூல்',
  'total collection (all time)': 'மொத்த வசூல் (அனைத்து காலம்)',
  'total collection\n(all time)': 'மொத்த வசூல்\n(அனைத்து காலம்)',
  'lifetime collection across all chits': 'அனைத்து சீட்டுகளின் வாழ்நாள் வசூல்',
  'chit portfolio value': 'மொத்த சீட்டு மதிப்பு',
  'combined face value of every chit': 'அனைத்து சீட்டுகளின் முக மதிப்பு',
  'cash & bank balance': 'ரொக்கம் & வங்கி இருப்பு',
  'total expense': 'மொத்த செலவு',
  'total expenses': 'மொத்த செலவுகள்',
  'total income': 'மொத்த வரவு',
  'all office income recorded': 'அனைத்து அலுவலக வரவுகள்',
  'office cash': 'அலுவலக ரொக்கம்',
  'bank cash': 'வங்கி இருப்பு',
  'total amount': 'மொத்தத் தொகை',
  'today collected': 'இன்றைய வசூல்',
  'today expected': 'இன்றைய எதிர்பார்ப்பு',
  'today pending': 'இன்றைய நிலுவை',
  'overdue amount': 'தாமதமான தொகை',
  'due customers': 'நிலுவை வாடிக்கையாளர்கள்',
  'employee collection': 'பணியாளர் வசூல்',
  'staff collection leaderboard': 'பணியாளர்கள் வசூல் தரவரிசை',
  'actual collections logged per employee': 'பணியாளர் வாரியாக வசூலிக்கப்பட்ட தொகை',
  'daily chit performance': 'தினசரி சீட்டு செயல்திறன்',
  'weekly chit performance': 'வாராந்திர சீட்டு செயல்திறன்',
  'monthly chit performance': 'மாதாந்திர சீட்டு செயல்திறன்',
  'collection rate': 'வசூல் விகிதம்',
  'collected': 'வசூலிக்கப்பட்டது',
  'employee': 'பணியாளர்',
  'code': 'குறியீடு',
  'today': 'இன்று',
  'this week': 'இந்த வாரம்',
  'this month': 'இந்த மாதம்',
  'total collections': 'மொத்த வசூல்',
  'receipts': 'ரசீதுகள்',
  'my collection today': 'இன்றைய எனது வசூல்',
  'today collected by you': 'இன்று நீங்கள் வசூலித்தது',
  'my collection this month': 'இந்த மாத எனது வசூல்',
  'this month collected by you': 'இந்த மாதம் நீங்கள் வசூலித்தது',
  'my total collection': 'எனது மொத்த வசூல்',
  'all time collected by you': 'நீங்கள் வசூலித்த மொத்தத் தொகை',

  // Pending Dues Page
  'pending customers': 'நிலுவை வாடிக்கையாளர்கள்',
  'total pending dues': 'மொத்த நிலுவைத் தொகை',
  'accounts with unpaid dues': 'நிலுவை உள்ள கணக்குகள்',
  'actual dues payable up to today': 'இன்று வரை செலுத்த வேண்டிய தொகை',
  'all pending dues': 'அனைத்து நிலுவைகள்',
  'overdue only': 'தாமதமானவை மட்டும்',
  'no pending dues': 'நிலுவைகள் எதுவும் இல்லை',
  'every scheduled installment up to today has been fully paid.': 'இன்று வரையிலான அனைத்து தவணைகளும் முழுமையாக செலுத்தப்பட்டுவிட்டன.',

  // Customers Page
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
  'aadhar number': 'ஆதார் எண்',
  'aadhaar number': 'ஆதார் எண்',
  'alternate mobile': 'மாற்று மொபைல் எண்',
  'gender': 'பாலினம்',
  'male': 'ஆண்',
  'female': 'பெண்',
  'other': 'மற்றவை',
  'dob': 'பிறந்த தேதி',
  'date of birth': 'பிறந்த தேதி',
  'email': 'மின்னஞ்சல்',
  'address line 1': 'முகவரி வரி 1',
  'customer profile': 'வாடிக்கையாளர் சுயவிவரம்',
  'customer details': 'வாடிக்கையாளர் விவரங்கள்',

  // Chits & Loans
  'start new chit': 'புதிய சீட்டு தொடங்கு',
  'new chit': 'புதிய சீட்டு',
  'create new chit': 'புதிய சீட்டு உருவாக்கு',
  'chits management': 'சீட்டுகள் மேலாண்மை',
  'create new chits, track active chit schedules & manage repayments': 'புதிய சீட்டுகளை உருவாக்கி, தவணைகள் மற்றும் வசூலைக் கண்காணிக்கவும்',
  'total chits': 'மொத்த சீட்டுகள்',
  'total registered chits in portfolio': 'பதிவுசெய்யப்பட்ட மொத்த சீட்டுகள்',
  'active chits': 'நடப்பு சீட்டுகள்',
  'currently active ongoing chits': 'தற்போது நடைமுறையில் உள்ள சீட்டுகள்',
  'total outstanding': 'மொத்த நிலுவை',
  'remaining balance across listed chits': 'சீட்டுகளின் மீதமுள்ள மொத்த நிலுவைத் தொகை',
  'enter customer, installment terms & schedule': 'வாடிக்கையாளர், தவணை விவரங்கள் மற்றும் அட்டவணையை உள்ளிடவும்',
  'tenure': 'தவணைக்காலம்',
  'frequency': 'கால இடைவெளி',
  'due date schedule': 'தவணைத் தேதி அட்டவணை',
  'auto due date': 'தானியங்கி தவணைத் தேதி',
  'custom due date': 'தனிப்பயன் தவணைத் தேதி',
  'installments count': 'தவணைகளின் எண்ணிக்கை',
  'search chit code, customer, mobile…': 'சீட்டு குறியீடு, வாடிக்கையாளர், மொபைல் தேடுக…',
  'any frequency': 'அனைத்து கால அளவுகளும்',
  'chit code & start': 'சீட்டு குறியீடு & தொடக்கம்',
  'customer & address': 'வாடிக்கையாளர் & முகவரி',
  'amount & installment': 'தொகை & தவணை',
  'remaining balance': 'மீதமுள்ள இருப்பு',
  'no chits match your filters': 'வடிகட்டிகளுக்குப் பொருந்தும் சீட்டுகள் எதுவும் இல்லை',
  'create a new chit using the form on the left or clear your search filters.': 'இடதுபுறப் படிவத்தைப் பயன்படுத்தி புதிய சீட்டை உருவாக்கவும் அல்லது வடிகட்டிகளை அழிக்கவும்.',
  'chit status': 'சீட்டின் நிலை',
  'repayment frequency': 'தவணை செலுத்தும் முறை',
  'monthly schedule style': 'மாதாந்திர அட்டவணை பாணி',
  'calendar month': 'நாட்காட்டி மாதம்',
  'weekday cycle': 'வார நாள் சுழற்சி',
  'fixed day interval': 'நிலையான நாள் இடைவெளி',
  'ledger summary': 'பேரேடு சுருக்கம்',
  'scheduled total': 'அட்டவணைப்படுத்தப்பட்ட மொத்தத் தொகை',
  'remaining chit balance': 'மீதமுள்ள சீட்டு இருப்பு',
  'total active chits': 'செயல்பாட்டில் உள்ள சீட்டுகள்',
  'running subscriptions': 'நடப்பில் உள்ள சந்தாக்கள்',
  'face value pool': 'மொத்த சீட்டு நிதி மதிப்பு',
  'completed chits': 'முடிவடைந்த சீட்டுகள்',
  'matured / closed': 'முதிர்வடைந்த சீட்டுகள்',
  'select customer': 'வாடிக்கையாளரைத் தேர்ந்தெடுக்கவும்',
  'duration': 'கால அளவு',
  'number of installments': 'மொத்த தவணைகள்',
  'start date': 'தொடங்கும் தேதி',
  'end date': 'முடியும் தேதி',
  'collection day': 'வசூல் நாள்',
  'fine per day': 'நாள் ஒன்றுக்கு அபராதம்',
  'fine type': 'அபராத வகை',
  'fixed': 'நிலையானது',
  'percentage': 'சதவீதம்',
  'assign staff': 'பணியாளரை ஒதுக்கு',
  'back to collection': 'வசூலுக்குத் திரும்பு',
  'back to chits': 'சீட்டுகளுக்குத் திரும்பு',
  'chit summary': 'சீட்டு சுருக்கம்',
  'disburse chit': 'சீட்டு வழங்கல்',
  'disburse / edit': 'வழங்கல் / திருத்து',
  'distribution': 'சீட்டு வழங்கல்',
  'distributed': 'வழங்கப்பட்டது',
  'remaining': 'மீதித் தொகை',
  'tenure / freq': 'கால அளவு / முறை',
  'chit balance': 'சீட்டு மீதி',
  'total distributed': 'வழங்கப்பட்ட மொத்தத் தொகை',
  'principal covered': 'ஈடுசெய்யப்பட்ட அசல்',
  'extra disbursed': 'கூடுதல் வழங்கல்',
  'remaining undistributed': 'மீதமுள்ள வழங்கப்படாத தொகை',
  'initial emi': 'தொடக்கத் தவணை (EMI)',
  'current emi': 'தற்போதைய தவணை (EMI)',
  'add disbursement payment': 'சீட்டு வழங்கல் பதிவு செய்',
  'edit disbursement': 'சீட்டு வழங்கலைத் திருத்து',
  'disbursed date': 'வழங்கிய தேதி',
  'disbursed amount': 'வழங்கிய தொகை',
  'amount to disburse': 'வழங்க வேண்டிய தொகை',
  'new emi amount': 'புதிய தவணைத் தொகை (EMI)',
  'leave blank to keep current emi': 'தற்போதைய EMI தொடர காலியாக விடவும்',
  'applies to future emis after the disbursed date. entered manually — no interest calculation.': 'வழங்கிய தேதிக்கு பிந்தைய தவணைகளுக்கு பொருந்தும். வட்டி கணக்கீடு இன்றி நேரடியாக உள்ளிடப்படுகிறது.',
  'disburse from': 'எந்தக் கணக்கிலிருந்து வழங்கப்பட்டது',
  'confirm disbursement': 'வழங்கலை உறுதி செய்',
  'cancel edit': 'திருத்தத்தை ரத்து செய்',
  'disbursement history & actions': 'வழங்கல் வரலாறு & செயல்பாடுகள்',
  'payment history': 'பணம் செலுத்திய வரலாறு',
  'due schedule': 'தவணை அட்டவணை',
  'disbursement history': 'வழங்கல் வரலாறு',
  'close chit': 'சீட்டை முடி',
  'custom schedule': 'தனிப்பயன் அட்டவணை',
  'not distributed': 'வழங்கப்படவில்லை',
  'partially distributed': 'பகுதி வழங்கப்பட்டது',
  'fully distributed': 'முழுமையாக வழங்கப்பட்டது',
  'fully distributed + extra': 'முழுமை + கூடுதல் வழங்கப்பட்டது',

  // Expenses & Income
  'track daily office expenses, revenue income & account transactions': 'தினசரி அலுவலக செலவுகள், வரவுகள் மற்றும் கணக்கு பரிவர்த்தனைகளைக் கண்காணிக்கவும்',
  'add expense': 'செலவு சேர்',
  'edit expense': 'செலவைத் திருத்து',
  'record new expense': 'புதிய செலவு பதிவு செய்',
  'delete expense': 'செலவை நீக்கு',
  'expense date': 'செலவு செய்த தேதி',
  'paid from account': 'செலவு செய்யப்பட்ட கணக்கு',
  'this month expenses': 'இந்த மாத செலவுகள்',
  'today expenses': 'இன்றைய செலவுகள்',
  'office rent': 'அலுவலக வாடகை',
  'staff salaries': 'பணியாளர் சம்பளம்',
  'electricity / utilities': 'மின்சாரம் / பயன்பாட்டுக் கட்டணம்',
  'tea, snacks & catering': 'தேநீர், சிற்றுண்டி & உணவு',
  'travel & fuel expenses': 'பயணம் & எரிபொருள் செலவு',
  'office maintenance': 'அலுவலக பராமரிப்பு',
  'stationery & printings': 'எழுதுபொருட்கள் & அச்சிடுதல்',
  'miscellaneous': 'இதர செலவுகள்',
  'add income': 'வரவு சேர்',
  'edit income': 'வரவைத் திருத்து',
  'record new income': 'புதிய வரவு பதிவு செய்',
  'delete income': 'வரவை நீக்கு',
  'received date': 'பெறப்பட்ட தேதி',
  'deposit to account': 'வரவு வைக்கப்பட்ட கணக்கு',
  'received from / giver details': 'யாரிடமிருந்து பெறப்பட்டது / விவரங்கள்',
  'this month income': 'இந்த மாத வரவு',
  'today income': 'இன்றைய வரவு',
  'moi': 'மொய்',
  'gift': 'பரிசு',
  'donation': 'நன்கொடை',
  'investment': 'முதலீடு',
  'interest': 'வட்டி',
  'are you sure you want to delete this expense?': 'இந்த செலவுப் பதிவை நிச்சயமாக நீக்க விரும்புகிறீர்களா?',
  'are you sure you want to delete this income?': 'இந்த வரவுப் பதிவை நிச்சயமாக நீக்க விரும்புகிறீர்களா?',

  // Reports
  'daily report': 'தினசரி அறிக்கை',
  'chit opening': 'சீட்டு தொடக்க அறிக்கை',
  'chit closing': 'சீட்டு முடிவு அறிக்கை',
  'chit collection': 'சீட்டு வசூல் அறிக்கை',
  'customer collection': 'வாடிக்கையாளர் வசூல் அறிக்கை',
  'daily collection': 'தினசரி வசூல் அறிக்கை',
  'chit distribution': 'சீட்டு வழங்கல் அறிக்கை',
  'chit profit': 'சீட்டு லாப அறிக்கை',
  'financial ledger': 'நிதிப் பேரேடு (Financial Ledger)',
  'filter date: from': 'தேதி: முதல்',
  'date range': 'தேதி வரம்பு',
  'from': 'முதல்',
  'to': 'வரை',
  'filter': 'வடிகட்டு',
  'total records': 'மொத்த பதிவுகள்',
  'grand total': 'மொத்தக் கூட்டுத்தொகை',
  'report summary': 'அறிக்கை சுருக்கம்',
  'report generated on': 'அறிக்கை உருவாக்கப்பட்ட நேரம்',

  // Employees & Staff
  'employees & staff directory': 'பணியாளர்கள் பட்டியல்',
  'manage staff logins, permission roles & branch access': 'பணியாளர் கணக்குகள் மற்றும் அனுமதிகளை நிர்வகிக்கவும்',
  'register new employee': 'புதிய பணியாளர் பதிவு',
  'register new user': 'புதிய பயனர் பதிவு',
  'create user account & assign role': 'பயனர் கணக்கை உருவாக்கி பொறுப்பை ஒதுக்கவும்',
  'login username': 'உள்நுழைவு பயனர் பெயர்',
  'system role': 'அமைப்புப் பொறுப்பு',
  'admin (full access)': 'நிர்வாகி (முழு அணுகல்)',
  'employee (staff)': 'பணியாளர் (வழக்கமான அணுகல்)',
  'full access (admin)': 'முழு அணுகல் (நிர்வாகி)',
  'staff (employee)': 'பணியாளர்',
  'user access & permissions': 'பயனர் அணுகல் & அனுமதிகள்',
  'directly assigned loans / chits (collector)': 'நேரடியாக ஒதுக்கப்பட்ட சீட்டுகள் (வசூலிப்பாளர்)',
  'edit employee': 'பணியாளரைத் திருத்து',
  'edit user': 'பயனரைத் திருத்து',
  'view user': 'பயனரைப் பார்',
  'employee details': 'பணியாளர் விவரங்கள்',
  'role': 'பொறுப்பு',
  'username': 'பயனர் பெயர்',
  'password': 'கடவுச்சொல்',
  'permissions': 'அனுமதிகள்',
  'deactivate': 'முடக்கு',
  'activate': 'செயல்படுத்து',

  // Settings
  'organization': 'நிறுவன விவரங்கள்',
  'users': 'பயனர்கள்',
  'app settings': 'செயலி அமைப்புகள்',
  'chit groups': 'சீட்டுக் குழுக்கள்',
  'accounts': 'கணக்குகள்',
  'backup': 'காப்புப் பிரதி',
  'organization name': 'நிறுவனத்தின் பெயர்',
  'tagline': 'குறிக்கோளுரை',
  'registration number': 'பதிவு எண்',
  'telephone': 'தொலைபேசி',
  'website': 'வலைத்தளம்',
  'currency symbol': 'நாணயக் குறியீடு',
  'logo': 'சின்னம் (Logo)',
  'upload logo': 'சின்னத்தைப் பதிவேற்று',

  // Modals & Dialogs
  'collect due': 'தவணை வசூலி',
  'collect chit dues': 'சீட்டுத் தவணைகள் வசூலி',
  'amount to collect': 'வசூலிக்க வேண்டிய தொகை',
  'total payable': 'செலுத்த வேண்டிய மொத்தத் தொகை',
  'received into account': 'எந்தக் கணக்கில் பெறப்பட்டது',
  'transaction reference / cheque no': 'பரிவர்த்தனை குறிப்பு / காசோலை எண்',
  'confirm collection': 'வசூலை உறுதி செய்',
  'close chit group': 'சீட்டுக் குழுவை முடி',
  'maturity / settlement amount': 'முதிர்வு / தீர்வுத் தொகை',
  'settlement mode': 'தீர்வு முறை',
  'add installment': 'தவணை சேர்',
  'selected dues': 'தேர்ந்தெடுக்கப்பட்ட தவணைகள்',
  'collection date': 'வசூல் தேதி',
  'actual paid': 'செலுத்தப்பட்ட தொகை',
  'actual paid amount': 'செலுத்தப்பட்ட தொகை',
  'fine / late fee': 'அபராதம் / தாமதக் கட்டணம்',
  'payment method': 'செலுத்தும் முறை',
  'deposit account': 'வரவு கணக்கு',
  'reference / txn no': 'குறிப்பு எண் / பரிவர்த்தனை எண்',
  'bill no': 'பில் எண்',
  'close date': 'முடிவு தேதி',
  'close amount': 'முடிவுத் தொகை',
  'closing...': 'முடிக்கப்படுகிறது...',
  'closing…': 'முடிக்கப்படுகிறது…',
  'statement of account': 'கணக்கு அறிக்கை',
  'collection receipt': 'வசூல் ரசீது',
  'download receipt pdf': 'ரசீது PDF பதிவிறக்கு',
  'back': 'பின் செல்',
  'posting…': 'பதிவேற்றுகிறது…',
  'saving…': 'சேமிக்கிறது…',
  'creating…': 'உருவாக்குகிறது…',
  'deleting…': 'நீக்குகிறது…',
  'reopening…': 'மீண்டும் திறக்கிறது…',
  'reopen chit': 'சீட்டை மீண்டும் திற',
  'reopen / reactivate chit': 'சீட்டை மீண்டும் தொடங்கு / செயல்படுத்து',
  'edit close settlement': 'முடிவுத் தீர்வைத் திருத்து',
  'installment schedule & collect': 'தவணை அட்டவணை & வசூல்',
  'add custom schedule': 'தனிப்பயன் அட்டவணை சேர்',
  'custom schedule history': 'தனிப்பயன் அட்டவணை வரலாறு',
  'chits assigned for collection': 'வசூலுக்காக ஒதுக்கப்பட்ட சீட்டுகள்',
  'total pending due': 'மொத்த நிலுவைத் தொகை',
  'search customer, code, mobile, chit code… (press enter to open)': 'வாடிக்கையாளர், குறியீடு, மொபைல், சீட்டு தேடுக… (Enter அழுத்தவும்)',
  'open full chit list': 'முழு சீட்டுப் பட்டியலைத் திற',
  'no collections recorded yet': 'இதுவரை வசூல் எதுவும் பதிவு செய்யப்படவில்லை',
  'no disbursements recorded yet': 'இதுவரை வழங்கல் எதுவும் பதிவு செய்யப்படவில்லை',
  'no custom installments added yet': 'தனிப்பயன் தவணைகள் எதுவும் சேர்க்கப்படவில்லை',
  'your username': 'உங்கள் பயனர் பெயர்',
  'your password': 'உங்கள் கடவுச்சொல்',
  'signing in…': 'உள்நுழைகிறது…',

  // Empty states & Messages
  'no records found': 'பதிவுகள் எதுவும் காணப்படவில்லை',
  'no collection workload': 'வசூல் பணி எதுவும் இல்லை',
  'chits assigned to you will appear here.': 'உங்களுக்கு ஒதுக்கப்பட்ட சீட்டுகள் இங்கே தோன்றும்.',

  // Form Validations
  'mobile number is required.': 'மொபைல் எண் தேவை.',
  'phone number is required.': 'போன் எண் தேவை.',
  'enter a valid 10-digit mobile number.': 'சரியான 10-இலக்க மொபைல் எண்ணை உள்ளிடவும்.',
  'only numeric digits are allowed.': 'எண்கள் மட்டுமே அனுமதிக்கப்படும்.',
  'mobile number must start with 6, 7, 8, or 9.': 'மொபைல் எண் 6, 7, 8 அல்லது 9 இல் தொடங்க வேண்டும்.',
  'mobile number must contain exactly 10 digits.': 'மொபைல் எண் சரியாக 10 இலக்கங்களைக் கொண்டிருக்க வேண்டும்.',
  'mobile number cannot exceed 10 digits.': 'மொபைல் எண் 10 இலக்கங்களுக்கு மேல் இருக்கக்கூடாது.',
  'aadhaar number is required.': 'ஆதார் எண் தேவை.',
  'aadhar number is required.': 'ஆதார் எண் தேவை.',
  'aadhaar number must contain exactly 12 digits.': 'ஆதார் எண் சரியாக 12 இலக்கங்களைக் கொண்டிருக்க வேண்டும்.',
  'aadhar number must contain exactly 12 digits.': 'ஆதார் எண் சரியாக 12 இலக்கங்களைக் கொண்டிருக்க வேண்டும்.',
  'enter a valid email address.': 'சரியான மின்னஞ்சல் முகவரியை உள்ளிடவும்.',
  'name is required.': 'பெயர் தேவை.',
  'full name is required.': 'முழுப் பெயர் தேவை.',
  'amount is required.': 'தொகை தேவை.',
  'amount must be greater than 0.': 'தொகை 0 ஐ விட அதிகமாக இருக்க வேண்டும்.',
  'date is required.': 'தேதி தேவை.',
  'category is required.': 'வகை தேர்ந்தெடுக்கப்பட வேண்டும்.',
  'please select an option.': 'தயவுசெய்து ஒரு விருப்பத்தைத் தேர்ந்தெடுக்கவும்.',
  'username is required.': 'பயனர் பெயர் தேவை.',
  'password is required.': 'கடவுச்சொல் தேவை.',
  'role is required.': 'பொறுப்பு தேர்ந்தெடுக்கப்பட வேண்டும்.'
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

function matchDynamicPattern(norm) {
  // Pattern: "Page X of Y"
  const pageMatch = norm.match(/^page\s+(\d+)\s+of\s+(\d+)$/i);
  if (pageMatch) return `பக்கம் ${pageMatch[1]} / ${pageMatch[2]}`;

  // Pattern: "X records" or "X record"
  const recMatch = norm.match(/^(\d+)\s+records?$/i);
  if (recMatch) return `${recMatch[1]} பதிவுகள்`;

  // Pattern: "X overdue"
  const odMatch = norm.match(/^(\d+)\s+overdue$/i);
  if (odMatch) return `${odMatch[1]} தாமதமானது`;

  // Pattern: "X chit(s) with overdue dues"
  const chMatch = norm.match(/^(\d+)\s+chit\(s\)\s+with\s+overdue\s+dues$/i);
  if (chMatch) return `${chMatch[1]} தாமதமான சீட்டுகள்`;

  // Pattern: "all pending dues (X)"
  const apdMatch = norm.match(/^all\s+pending\s+dues\s+\((\d+)\)$/i);
  if (apdMatch) return `அனைத்து நிலுவைகள் (${apdMatch[1]})`;

  // Pattern: "overdue only (X)"
  const odoMatch = norm.match(/^overdue\s+only\s+\((\d+)\)$/i);
  if (odoMatch) return `தாமதமானவை மட்டும் (${odoMatch[1]})`;

  // Pattern: "Pay Multiple Due (X)"
  const pmdMatch = norm.match(/^pay\s+multiple\s+due\s+\((\d+)\)$/i);
  if (pmdMatch) return `பல தவணைகளைச் செலுத்து (${pmdMatch[1]})`;

  // Pattern: "Bulk Delete (X)"
  const bdMatch = norm.match(/^bulk\s+delete\s+\((\d+)\)$/i);
  if (bdMatch) return `மொத்தமாக நீக்கு (${bdMatch[1]})`;

  // Pattern: "Delete (X)"
  const delCountMatch = norm.match(/^delete\s+\((\d+)\)$/i);
  if (delCountMatch) return `நீக்கு (${delCountMatch[1]})`;

  // Pattern: "X chits" or "X chit"
  const chitCountMatch = norm.match(/^(\d+)\s+chits?$/i);
  if (chitCountMatch) return `${chitCountMatch[1]} சீட்டுகள்`;

  // Pattern: "Due #X"
  const dueHashMatch = norm.match(/^due\s+#(\d+)$/i);
  if (dueHashMatch) return `தவணை #${dueHashMatch[1]}`;

  // Pattern: "Collect — <ChitCode>"
  const colDashMatch = norm.match(/^collect\s+[—–-]\s+(.+)$/i);
  if (colDashMatch) return `வசூல் — ${colDashMatch[1].toUpperCase()}`;

  // Pattern: "Statement of Account — <ChitCode>"
  const stmtDashMatch = norm.match(/^statement\s+of\s+account\s+[—–-]\s+(.+)$/i);
  if (stmtDashMatch) return `கணக்கு அறிக்கை — ${stmtDashMatch[1].toUpperCase()}`;

  // Pattern: "Edit <ChitCode>"
  const editCodeMatch = norm.match(/^edit\s+([a-z0-9\-_]+)$/i);
  if (editCodeMatch) return `திருத்து ${editCodeMatch[1].toUpperCase()}`;

  return null;
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
        // 5. Dynamic pattern matching (e.g. "Page 1 of 5", "10 records")
        const dyn = matchDynamicPattern(norm) || (normFallback ? matchDynamicPattern(normFallback) : null);
        if (dyn) return dyn;
        // 6. Trailing colon or asterisk (e.g. "Language:", "Full Name *")
        if (norm.endsWith(' *')) {
          const base = norm.slice(0, -2).trim();
          if (TA_PHRASES[base]) return `${TA_PHRASES[base]} *`;
        }
        if (norm.endsWith(':')) {
          const base = norm.slice(0, -1).trim();
          if (TA_PHRASES[base]) return `${TA_PHRASES[base]}:`;
        }
        // 7. Check if key is in EN to find corresponding TA key
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
