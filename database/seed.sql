-- =============================================================================
-- Siva Murugan Chit Fund - Seed Data
-- Run AFTER schema.sql.
--   Default Admin     : admin / Admin@123
--   Default Employee  : ravi  / Employee@123
-- Change these immediately in a real deployment (Settings > Security).
-- =============================================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

TRUNCATE roles;
TRUNCATE permissions;
TRUNCATE role_permissions;
TRUNCATE user_permissions;
TRUNCATE users;
TRUNCATE employees;
TRUNCATE payment_modes;
TRUNCATE accounts;
TRUNCATE fine_settings;
TRUNCATE app_settings;
TRUNCATE translations;
TRUNCATE customers;
TRUNCATE loans_or_chits;
TRUNCATE loan_assignments;
TRUNCATE installments;

-- ---------------------------------------------------------------------------
-- Roles
-- ---------------------------------------------------------------------------
INSERT INTO roles (id, code, name) VALUES
  (1, 'ADMIN',    'Administrator'),
  (2, 'EMPLOYEE', 'Field Employee');

-- ---------------------------------------------------------------------------
-- Permissions  (module.action)
-- ---------------------------------------------------------------------------
INSERT INTO permissions (module, action, code, description) VALUES
  ('dashboard','view','dashboard.view','View dashboard'),

  ('collection','view','collection.view','View collection workload'),
  ('collection','create','collection.create','Record a collection / payment'),
  ('collection','edit','collection.edit','Edit collection remarks/reference'),
  ('collection','reverse','collection.reverse','Reverse a posted collection'),
  ('collection','export','collection.export','Export collection data'),

  ('customers','view','customers.view','View customers'),
  ('customers','create','customers.create','Create customers'),
  ('customers','edit','customers.edit','Edit customers'),
  ('customers','delete','customers.delete','Soft-delete customers'),
  ('customers','export','customers.export','Export customers'),

  ('loans','view','loans.view','View chits'),
  ('loans','create','loans.create','Create chits'),
  ('loans','edit','loans.edit','Edit chits'),
  ('loans','cancel','loans.cancel','Cancel chits'),
  ('loans','delete','loans.delete','Delete chits'),
  ('loans','export','loans.export','Export chits'),

  ('installments','view','installments.view','View installment schedules'),

  ('employees','view','employees.view','View employees'),
  ('employees','create','employees.create','Create employees'),
  ('employees','edit','employees.edit','Edit employees'),
  ('employees','delete','employees.delete','Deactivate employees'),

  ('assignments','view','assignments.view','View assignments'),
  ('assignments','create','assignments.create','Create assignments'),
  ('assignments','edit','assignments.edit','Edit assignments'),
  ('assignments','delete','assignments.delete','Remove assignments'),

  ('reports','view','reports.view','View reports'),
  ('reports','export','reports.export','Export reports (Excel/CSV/PDF)'),

  ('expenses','view','expenses.view','View expenses'),
  ('expenses','create','expenses.create','Create expenses'),
  ('expenses','edit','expenses.edit','Edit expenses'),
  ('expenses','delete','expenses.delete','Delete/cancel expenses'),
  ('expenses','export','expenses.export','Export expenses'),

  ('income','view','income.view','View office income'),
  ('income','create','income.create','Create office income'),
  ('income','edit','income.edit','Edit office income'),
  ('income','delete','income.delete','Delete/cancel office income'),
  ('income','export','income.export','Export office income'),

  ('transactions','view','transactions.view','View the financial transaction ledger'),
  ('transactions','export','transactions.export','Export the financial transaction ledger'),

  ('settings','view','settings.view','View settings'),
  ('settings','edit','settings.edit','Edit settings'),

  ('permissions','view','permissions.view','View employee permissions'),
  ('permissions','edit','permissions.edit','Change employee permissions & assignments'),

  ('audit','view','audit.view','View audit logs'),
  ('audit','export','audit.export','Export audit logs'),

  ('collection','cancel','collection.cancel','Cancel a completed collection'),
  ('collection','delete','collection.delete','Delete a collection record'),
  ('pending','view','pending.view','View pending dues'),

  ('distributions','view','distributions.view','View chit distributions'),
  ('distributions','create','distributions.create','Record an actual chit distribution'),
  ('distributions','edit','distributions.edit','Edit a chit distribution'),
  ('distributions','cancel','distributions.cancel','Cancel a chit distribution'),
  ('distributions','delete','distributions.delete','Delete a chit distribution'),

  ('fines','edit','fines.edit','Override fines');

-- ADMIN gets every permission
INSERT INTO role_permissions (role_id, permission_id)
SELECT 1, id FROM permissions;

-- EMPLOYEE default = collection-first
INSERT INTO role_permissions (role_id, permission_id)
SELECT 2, id FROM permissions WHERE code IN (
  'dashboard.view',
  'collection.view','collection.create',
  'pending.view',
  'customers.view',
  'loans.view',
  'installments.view',
  'distributions.view'
);

-- ---------------------------------------------------------------------------
-- Users  (bcrypt hashes; PHP password_verify accepts $2a$)
--   admin / Admin@123
--   ravi  / Employee@123
-- ---------------------------------------------------------------------------
INSERT INTO users (id, role_id, name, username, email, phone, password_hash, is_active, session_version) VALUES
  (1, 1, 'System Administrator', 'admin', 'admin@example.com', '9000000001', '$2a$10$Mv9ljcU.SHmnEvC9EVtOA.0mJIZqa3myrdisuqSDeuJgUmZ9ZcjEq', 1, 1),
  (2, 2, 'Ravi Kumar',           'ravi',  'ravi@example.com',  '9000000002', '$2a$10$9weZgE/4YVCnp94qVNVluObaCBt2jFh40sKWlUg6dXm5aj/badmnu', 1, 1);

INSERT INTO employees (id, user_id, emp_code, joined_on, is_active) VALUES
  (1, 2, 'EMP-0001', '2026-01-01', 1);

-- ---------------------------------------------------------------------------
-- Payment modes / Accounts
-- ---------------------------------------------------------------------------
INSERT INTO payment_modes (id, code, name, is_active, sort_order) VALUES
  (1, 'CASH', 'Cash', 1, 1),
  (2, 'UPI',  'UPI',  1, 2),
  (3, 'BANK', 'Bank Transfer', 1, 3),
  (4, 'OTHER','Other', 1, 4),
  (5, 'SPLIT','Split Payment (Cash + UPI)', 1, 5);

INSERT INTO accounts (id, code, name, type, opening_balance, is_active) VALUES
  (1, 'OFFICE_CASH', 'Office Cash', 'cash', 0.00, 1),
  (2, 'BANK_MAIN',   'Main Bank Account', 'bank', 0.00, 1);

-- ---------------------------------------------------------------------------
-- Fine settings.
-- Chit fund = NO automatic fine / interest. The engine stays for optional future
-- use but ships INACTIVE with fine_type NONE so collections never auto-increase.
-- ---------------------------------------------------------------------------
INSERT INTO fine_settings (id, fine_type, rate_value, grace_days, max_fine_type, max_fine_value, effective_from, active, notes, created_by) VALUES
  (1, 'NONE', 0.0000, 0, 'none', 0.0000, '2020-01-01', 0, 'Disabled - chit fund has no automatic fine/interest', 1);

-- ---------------------------------------------------------------------------
-- App settings
-- ---------------------------------------------------------------------------
INSERT INTO app_settings (setting_key, setting_value) VALUES
  ('organization', JSON_OBJECT(
      'name','Siva Murugan Chit Fund',
      'address','Main Road, Tamil Nadu',
      'mobile','9000000000',
      'telephone','044-20000000',
      'email','info@sivamuruganchitfund.example',
      'website','https://sivamuruganchitfund.example',
      'gst','33ABCDE1234F1Z5',
      'logo_path',NULL
  )),
  ('locale',        JSON_OBJECT('default','en','available', JSON_ARRAY('en','ta'))),
  ('schedule',      JSON_OBJECT(
      'weekly_collection_day', 1,               -- 1=Monday ... 7=Sunday (ISO)
      'monthly_mode', 'MONTHLY_WEEKDAY',
      'monthly_cycle_weeks', 4,
      'monthly_interval_days', 30
  )),
  ('collection',    JSON_OBJECT('allow_advance_default', false)),
  -- chit code = PREFIX-N (plain incrementing number). Prefix is editable in Settings.
  ('code_format',   JSON_OBJECT('loan_prefix','SM','loan_pattern','{PREFIX}-{SEQ}',
                                'customer_prefix','CUST','customer_pattern','{PREFIX}-{SEQ6}',
                                'receipt_prefix','RCPT','receipt_pattern','{PREFIX}-{YYYYMMDD}-{SEQ5}')),
  ('security',      JSON_OBJECT('token_ttl_hours', 12, 'password_min_length', 8));

-- ---------------------------------------------------------------------------
-- Translations (starter set - extend freely)
-- ---------------------------------------------------------------------------
INSERT INTO translations (lang, trans_key, trans_value) VALUES
  ('en','app.title','Siva Murugan Chit Fund'),
  ('en','nav.dashboard','Dashboard'),
  ('en','nav.collection','Collection'),
  ('en','nav.customers','Customers'),
  ('en','nav.loans','Loans / Chits'),
  ('en','nav.reports','Reports'),
  ('en','nav.expenses','Expenses & Income'),
  ('en','nav.settings','Settings'),
  ('en','nav.profile','Profile'),
  ('en','nav.logout','Logout'),
  ('en','auth.login','Login'),
  ('en','auth.username','Username'),
  ('en','auth.password','Password'),
  ('en','auth.session_terminated','Your session has been terminated by an administrator.'),
  ('en','collection.collect','Collect'),
  ('en','collection.partial','Partial'),
  ('en','status.pending','Pending'),
  ('en','status.partial','Partial'),
  ('en','status.completed','Completed'),
  ('en','status.overdue','Overdue'),
  ('ta','app.title','சிவ முருகன் சிட் ஃபண்ட்'),
  ('ta','nav.dashboard','டாஷ்போர்டு'),
  ('ta','nav.collection','வசூல்'),
  ('ta','nav.customers','வாடிக்கையாளர்கள்'),
  ('ta','nav.loans','கடன் / சிட்'),
  ('ta','nav.reports','அறிக்கைகள்'),
  ('ta','nav.expenses','செலவுகள் & வருமானம்'),
  ('ta','nav.settings','அமைப்புகள்'),
  ('ta','nav.profile','சுயவிவரம்'),
  ('ta','nav.logout','வெளியேறு'),
  ('ta','auth.login','உள்நுழை'),
  ('ta','auth.username','பயனர்பெயர்'),
  ('ta','auth.password','கடவுச்சொல்'),
  ('ta','auth.session_terminated','உங்கள் அமர்வு நிர்வாகியால் நிறுத்தப்பட்டது.'),
  ('ta','collection.collect','வசூலி'),
  ('ta','collection.partial','பகுதி'),
  ('ta','status.pending','நிலுவை'),
  ('ta','status.partial','பகுதி'),
  ('ta','status.completed','முடிந்தது'),
  ('ta','status.overdue','தாமதம்'),
  -- extended keys used by the React UI (t('key'))
  ('en','nav.chits','Chits'),
  ('en','nav.income','Office Income'),
  ('en','nav.employees','Employees'),
  ('en','nav.audit','Audit Logs'),
  ('en','dash.office_cash','Office Cash'),
  ('en','dash.bank_cash','Bank Cash'),
  ('en','dash.total_amount','Total Amount'),
  ('en','dash.today_collected','Collected Today'),
  ('en','dash.today_expected','Expected Today'),
  ('en','dash.today_pending','Pending Today'),
  ('en','dash.overdue','Overdue Amount'),
  ('en','dash.due_customers','Due Customers'),
  ('en','dash.employee_collection','Employee Collection'),
  ('en','dash.finance_summary','Financial summary'),
  ('en','dash.today','Today'),
  ('en','dash.hello','Welcome'),
  ('en','dash.quick_actions','Quick actions'),
  ('en','action.clear','Clear filters'),
  ('en','action.export','Export Excel'),
  ('en','field.installment_amount','Installment Amount'),
  ('en','nav.pending','Pending Dues'),
  ('en','dash.total_expense','Total Expense Amount'),
  ('en','dash.distributed','Distributed Amount'),
  ('en','dash.total_collection','Total Collection Amount'),
  ('en','dash.monthly_collection','Monthly Collection'),
  ('en','dash.weekly_collection','Weekly Collection'),
  ('en','dash.collections','Collections'),
  ('en','dash.my_collections','My collections'),
  ('en','dash.fine_collected','Fine Collected'),
  ('en','pending.customers','Pending customers'),
  ('en','pending.total_outstanding','Total outstanding'),
  ('en','pending.outstanding','Outstanding Amount'),
  ('en','pending.paid','Paid Amount'),
  ('en','field.chit_code','Chit Code'),
  ('en','field.fine_amount','Fine Amount'),
  ('en','field.total_amount','Total Amount'),
  ('en','field.actual_paid','Actual Amount Paid'),
  ('en','action.collect','Collect'),
  ('en','action.cancel','Cancel'),
  ('en','action.delete','Delete'),
  ('ta','nav.chits','சிட்டுகள்'),
  ('ta','nav.income','அலுவலக வருமானம்'),
  ('ta','nav.employees','ஊழியர்கள்'),
  ('ta','nav.audit','தணிக்கை பதிவுகள்'),
  ('ta','dash.office_cash','அலுவலக பணம்'),
  ('ta','dash.bank_cash','வங்கி பணம்'),
  ('ta','dash.total_amount','மொத்த தொகை'),
  ('ta','dash.today_collected','இன்று வசூலித்தது'),
  ('ta','dash.today_expected','இன்று எதிர்பார்த்தது'),
  ('ta','dash.today_pending','இன்று நிலுவை'),
  ('ta','dash.overdue','தாமத தொகை'),
  ('ta','dash.due_customers','நிலுவை வாடிக்கையாளர்கள்'),
  ('ta','dash.employee_collection','ஊழியர் வசூல்'),
  ('ta','dash.finance_summary','நிதி சுருக்கம்'),
  ('ta','dash.today','இன்று'),
  ('ta','dash.hello','வரவேற்பு'),
  ('ta','dash.quick_actions','விரைவு செயல்கள்'),
  ('ta','action.clear','வடிகட்டியை அழி'),
  ('ta','action.export','எக்செல் ஏற்றுமதி'),
  ('ta','field.installment_amount','தவணை தொகை'),
  ('ta','nav.pending','நிலுவைத் தொகைகள்'),
  ('ta','dash.total_expense','மொத்த செலவுத் தொகை'),
  ('ta','dash.distributed','விநியோகிக்கப்பட்ட தொகை'),
  ('ta','dash.total_collection','மொத்த வசூல் தொகை'),
  ('ta','dash.monthly_collection','மாதாந்திர வசூல்'),
  ('ta','dash.weekly_collection','வாராந்திர வசூல்'),
  ('ta','dash.collections','வசூல்கள்'),
  ('ta','dash.my_collections','எனது வசூல்கள்'),
  ('ta','dash.fine_collected','அபராதம் வசூலிக்கப்பட்டது'),
  ('ta','pending.customers','நிலுவை வாடிக்கையாளர்கள்'),
  ('ta','pending.total_outstanding','மொத்த நிலுவை'),
  ('ta','pending.outstanding','நிலுவைத் தொகை'),
  ('ta','pending.paid','செலுத்திய தொகை'),
  ('ta','field.chit_code','சிட் குறியீடு'),
  ('ta','field.fine_amount','அபராதத் தொகை'),
  ('ta','field.total_amount','மொத்த தொகை'),
  ('ta','field.actual_paid','உண்மையில் செலுத்திய தொகை'),
  ('ta','action.collect','வசூலி'),
  ('ta','action.cancel','ரத்து'),
  ('ta','action.delete','நீக்கு');

-- ---------------------------------------------------------------------------
-- Demo master data for the vertical slice (safe to delete later)
-- ---------------------------------------------------------------------------
INSERT INTO customers (id, customer_code, name, mobile, gender, address_line1, location, nominee_name, nominee_relation, nominee_mobile, status, created_by) VALUES
  (1, 'CUST-000001', 'Meena Rajan',   '9812300001', 'female', '5 Bakery Street, Anna Nagar',  'Anna Nagar', 'Rajan S',  'Spouse', '9812300010', 'active', 1),
  (2, 'CUST-000002', 'Suresh Babu',   '9812300002', 'male',   '18 Lake View, Gandhipuram',    'Gandhipuram', 'Latha B',  'Spouse', '9812300020', 'active', 1);

SET FOREIGN_KEY_CHECKS = 1;
