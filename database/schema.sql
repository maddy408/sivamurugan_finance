-- =============================================================================
-- Siva Murugan Chit Fund - Database Schema
-- MySQL 8.x / MariaDB 10.5+ compatible
-- Engine: InnoDB, Charset: utf8mb4
-- Money columns: DECIMAL(15,2). Internal timestamps: UTC (see backend config).
-- Business date/schedule calculations: Asia/Kolkata (handled in PHP).
-- =============================================================================

SET FOREIGN_KEY_CHECKS = 0;
SET NAMES utf8mb4;

-- Deprecated tables (Location Master + location mappings) — dropped explicitly so
-- re-running schema.sql over an older DB cleans them up.
DROP TABLE IF EXISTS customer_locations;
DROP TABLE IF EXISTS employee_locations;
DROP TABLE IF EXISTS locations;

-- -----------------------------------------------------------------------------
-- roles
-- -----------------------------------------------------------------------------
DROP TABLE IF EXISTS roles;
CREATE TABLE roles (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  code          VARCHAR(32)  NOT NULL,
  name          VARCHAR(64)  NOT NULL,
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_roles_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- -----------------------------------------------------------------------------
-- permissions  (module + action catalogue)
-- action: view | create | edit | delete | cancel | reverse | export
-- -----------------------------------------------------------------------------
DROP TABLE IF EXISTS permissions;
CREATE TABLE permissions (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  module        VARCHAR(64)  NOT NULL,
  action        VARCHAR(32)  NOT NULL,
  code          VARCHAR(128) NOT NULL,          -- e.g. customers.view
  description   VARCHAR(255) NULL,
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_permissions_code (code),
  KEY idx_permissions_module (module)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- -----------------------------------------------------------------------------
-- role_permissions
-- -----------------------------------------------------------------------------
DROP TABLE IF EXISTS role_permissions;
CREATE TABLE role_permissions (
  role_id        INT UNSIGNED NOT NULL,
  permission_id  INT UNSIGNED NOT NULL,
  PRIMARY KEY (role_id, permission_id),
  CONSTRAINT fk_rp_role       FOREIGN KEY (role_id)       REFERENCES roles (id)       ON DELETE CASCADE,
  CONSTRAINT fk_rp_permission FOREIGN KEY (permission_id) REFERENCES permissions (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- -----------------------------------------------------------------------------
-- users
-- session_version: bumped on "force logout" to invalidate all tokens
-- -----------------------------------------------------------------------------
DROP TABLE IF EXISTS users;
CREATE TABLE users (
  id               INT UNSIGNED NOT NULL AUTO_INCREMENT,
  role_id          INT UNSIGNED NOT NULL,
  name             VARCHAR(128) NOT NULL,
  username         VARCHAR(64)  NOT NULL,
  email            VARCHAR(191) NULL,
  phone            VARCHAR(20)  NULL,
  password_hash    VARCHAR(255) NOT NULL,
  is_active        TINYINT(1)   NOT NULL DEFAULT 1,
  session_version  INT UNSIGNED NOT NULL DEFAULT 1,
  last_login_at    DATETIME     NULL,
  created_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_username (username),
  UNIQUE KEY uq_users_email (email),
  KEY idx_users_role (role_id),
  KEY idx_users_active (is_active),
  CONSTRAINT fk_users_role FOREIGN KEY (role_id) REFERENCES roles (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- -----------------------------------------------------------------------------
-- user_permissions  (per-employee overrides on top of role defaults)
-- effect: allow | deny
-- -----------------------------------------------------------------------------
DROP TABLE IF EXISTS user_permissions;
CREATE TABLE user_permissions (
  user_id        INT UNSIGNED NOT NULL,
  permission_id  INT UNSIGNED NOT NULL,
  effect         ENUM('allow','deny') NOT NULL DEFAULT 'allow',
  created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, permission_id),
  CONSTRAINT fk_up_user       FOREIGN KEY (user_id)       REFERENCES users (id)       ON DELETE CASCADE,
  CONSTRAINT fk_up_permission FOREIGN KEY (permission_id) REFERENCES permissions (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- -----------------------------------------------------------------------------
-- sessions  (opaque bearer tokens)
-- -----------------------------------------------------------------------------
DROP TABLE IF EXISTS sessions;
CREATE TABLE sessions (
  id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id          INT UNSIGNED NOT NULL,
  token_hash       CHAR(64)     NOT NULL,          -- sha256 hex of raw token
  session_version  INT UNSIGNED NOT NULL,          -- snapshot of users.session_version at issue
  ip               VARCHAR(45)  NULL,
  user_agent       VARCHAR(255) NULL,
  revoked          TINYINT(1)   NOT NULL DEFAULT 0,
  created_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at     DATETIME     NULL,
  expires_at       DATETIME     NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_sessions_token (token_hash),
  KEY idx_sessions_user (user_id),
  KEY idx_sessions_active (user_id, revoked, expires_at),
  CONSTRAINT fk_sessions_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- -----------------------------------------------------------------------------
-- employees  (profile record 1:1 with a user of role EMPLOYEE)
-- -----------------------------------------------------------------------------
DROP TABLE IF EXISTS employees;
CREATE TABLE employees (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id       INT UNSIGNED NOT NULL,
  emp_code      VARCHAR(32)  NOT NULL,
  joined_on     DATE         NULL,
  address       VARCHAR(255) NULL,
  is_active     TINYINT(1)   NOT NULL DEFAULT 1,
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_employees_user (user_id),
  UNIQUE KEY uq_employees_code (emp_code),
  CONSTRAINT fk_employees_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- -----------------------------------------------------------------------------
-- customers
-- -----------------------------------------------------------------------------
DROP TABLE IF EXISTS customers;
CREATE TABLE customers (
  id                INT UNSIGNED NOT NULL AUTO_INCREMENT,
  customer_code     VARCHAR(32)  NOT NULL,
  name              VARCHAR(128) NOT NULL,
  mobile            VARCHAR(20)  NOT NULL,
    aadhar_number     VARCHAR(20)  NULL,
  alt_mobile        VARCHAR(20)  NULL,
  email             VARCHAR(191) NULL,
  gender            ENUM('male','female','other') NULL,
  dob               DATE         NULL,
  id_proof_type     VARCHAR(32)  NULL,
  id_proof_number   VARCHAR(64)  NULL,
  address_line1     VARCHAR(255) NULL,
  address_line2     VARCHAR(255) NULL,
  location            VARCHAR(120) NULL,
  nominee_name      VARCHAR(128) NULL,
  nominee_relation  VARCHAR(64)  NULL,
  nominee_mobile    VARCHAR(20)  NULL,
  status            ENUM('active','inactive','blacklisted') NOT NULL DEFAULT 'active',
  notes             VARCHAR(500) NULL,
  created_by        INT UNSIGNED NULL,
  deleted_at        DATETIME     NULL,
  created_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_customers_code (customer_code),
  KEY idx_customers_name (name),
  KEY idx_customers_mobile (mobile),
  KEY idx_customers_location (location),
  KEY idx_customers_status (status),
  KEY idx_customers_deleted (deleted_at),
  CONSTRAINT fk_customers_creator  FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- -----------------------------------------------------------------------------
-- loans_or_chits
-- schedule_type: WEEKLY | MONTHLY_WEEKDAY | MONTHLY_DAILY | MONTHLY_INTERVAL
-- -----------------------------------------------------------------------------
DROP TABLE IF EXISTS loans_or_chits;
CREATE TABLE loans_or_chits (
  id                  INT UNSIGNED NOT NULL AUTO_INCREMENT,
  code                VARCHAR(40)  NOT NULL,
  account_type        ENUM('loan','chit') NOT NULL DEFAULT 'chit',
  customer_id         INT UNSIGNED NOT NULL,
  location            VARCHAR(120) NULL,                 -- typed customer location (denormalised copy)
  principal_amount    DECIMAL(15,2) NOT NULL,             -- total chit / principal amount (display only)
  tenure              INT UNSIGNED  NOT NULL,             -- number of installments
  frequency           ENUM('daily','weekly','monthly') NOT NULL DEFAULT 'weekly',
  installment_amount  DECIMAL(15,2) NOT NULL DEFAULT 0.00, -- CURRENT per-period EMI (starts = initial_emi_amount; a distribution's new_emi_amount overrides it)
  initial_emi_amount  DECIMAL(15,2) NOT NULL DEFAULT 0.00, -- EMI captured at chit creation; frozen baseline for "Initial EMI"
  emi_amount          DECIMAL(15,2) NOT NULL,             -- legacy alias, always kept == installment_amount
  interest_amount     DECIMAL(15,2) NOT NULL DEFAULT 0.00, -- legacy column, unused in chit flow (always 0)
  other_charges       DECIMAL(15,2) NOT NULL DEFAULT 0.00, -- legacy column, unused in chit flow (always 0)
  processing_fee      DECIMAL(15,2) NOT NULL DEFAULT 0.00, -- legacy column, unused in chit flow (always 0)
  start_date          DATE          NOT NULL,
  schedule_type       ENUM('DAILY','WEEKLY','MONTHLY_WEEKDAY','MONTHLY_DAILY','MONTHLY_INTERVAL') NOT NULL DEFAULT 'WEEKLY',
  schedule_config     JSON          NULL,                 -- {weekday:1, anchor_date:"", interval_days:30, cycle_weeks:4}
  due_date_mode       ENUM('auto','custom') NOT NULL DEFAULT 'auto', -- 'auto' = ScheduleService generates installments; 'custom' = staff add each installment manually, backend never auto-generates
  fine_setting_id     INT UNSIGNED  NULL,                 -- snapshot pointer; NULL = use global active
  allow_advance       TINYINT(1)    NOT NULL DEFAULT 1,   -- overpayment always allowed for chits
  deleted_at          DATETIME      NULL,                 -- soft delete
  status              ENUM('active','completed','cancelled','deactivated') NOT NULL DEFAULT 'active',
  notes               VARCHAR(500)  NULL,
  created_by          INT UNSIGNED  NULL,
  cancelled_at        DATETIME      NULL,
  cancelled_by        INT UNSIGNED  NULL,
  cancel_reason       VARCHAR(255)  NULL,
  created_at          DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_loans_code (code),
  KEY idx_loans_customer (customer_id),
  KEY idx_loans_location (location),
  KEY idx_loans_status (status),
  KEY idx_loans_frequency (frequency),
  KEY idx_loans_type (account_type),
  KEY idx_loans_start (start_date),
  CONSTRAINT fk_loans_customer FOREIGN KEY (customer_id) REFERENCES customers (id),
  CONSTRAINT fk_loans_creator  FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- -----------------------------------------------------------------------------
-- loan_assignments  (which employee collects a given loan/chit, time-bounded)
-- -----------------------------------------------------------------------------
DROP TABLE IF EXISTS loan_assignments;
CREATE TABLE loan_assignments (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  loan_id       INT UNSIGNED NOT NULL,
  employee_id   INT UNSIGNED NOT NULL,
  start_date    DATE         NOT NULL,
  end_date      DATE         NULL,
  is_active     TINYINT(1)   NOT NULL DEFAULT 1,
  notes         VARCHAR(255) NULL,
  assigned_by   INT UNSIGNED NULL,
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_la_loan (loan_id),
  KEY idx_la_emp (employee_id),
  KEY idx_la_active (is_active),
  CONSTRAINT fk_la_loan FOREIGN KEY (loan_id)     REFERENCES loans_or_chits (id) ON DELETE CASCADE,
  CONSTRAINT fk_la_emp  FOREIGN KEY (employee_id) REFERENCES employees (id)      ON DELETE CASCADE,
  CONSTRAINT fk_la_by   FOREIGN KEY (assigned_by) REFERENCES users (id)          ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- -----------------------------------------------------------------------------
-- installments  (auto-generated schedule; idempotent via loan_id + installment_no)
-- -----------------------------------------------------------------------------
DROP TABLE IF EXISTS installments;
CREATE TABLE installments (
  id                INT UNSIGNED NOT NULL AUTO_INCREMENT,
  loan_id           INT UNSIGNED NOT NULL,
  installment_no    INT UNSIGNED NOT NULL,
  due_date          DATE          NOT NULL,
  emi_amount        DECIMAL(15,2) NOT NULL,
  other_charges     DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  payable_amount    DECIMAL(15,2) NOT NULL,             -- emi + other_charges (fine tracked separately)
  paid_amount       DECIMAL(15,2) NOT NULL DEFAULT 0.00, -- principal+charges paid (excludes fine)
  fine_accrued      DECIMAL(15,2) NOT NULL DEFAULT 0.00, -- last computed fine snapshot
  fine_paid         DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  fine_waived       DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  balance_amount    DECIMAL(15,2) NOT NULL,             -- payable_amount - paid_amount
  last_paid_date    DATE          NULL,
  status            ENUM('PENDING','PARTIAL','COMPLETED','OVERDUE') NOT NULL DEFAULT 'PENDING',
  created_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_inst_loan_no (loan_id, installment_no),
  KEY idx_inst_due (due_date),
  KEY idx_inst_status (status),
  KEY idx_inst_loan_status (loan_id, status),
  CONSTRAINT fk_inst_loan FOREIGN KEY (loan_id) REFERENCES loans_or_chits (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- -----------------------------------------------------------------------------
-- payment_modes
-- -----------------------------------------------------------------------------
DROP TABLE IF EXISTS payment_modes;
CREATE TABLE payment_modes (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  code          VARCHAR(32)  NOT NULL,
  name          VARCHAR(64)  NOT NULL,
  is_active     TINYINT(1)   NOT NULL DEFAULT 1,
  sort_order    INT          NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY uq_payment_modes_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- -----------------------------------------------------------------------------
-- accounts  (cash / bank sources & destinations)
-- -----------------------------------------------------------------------------
DROP TABLE IF EXISTS accounts;
CREATE TABLE accounts (
  id              INT UNSIGNED NOT NULL AUTO_INCREMENT,
  code            VARCHAR(32)  NOT NULL,
  name            VARCHAR(64)  NOT NULL,
  type            ENUM('cash','bank','other') NOT NULL DEFAULT 'cash',
  opening_balance DECIMAL(15,2) NOT NULL DEFAULT 0.00,  -- starting balance; live balance = opening + income + collections - expenses
  is_active       TINYINT(1)   NOT NULL DEFAULT 1,
  PRIMARY KEY (id),
  UNIQUE KEY uq_accounts_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- -----------------------------------------------------------------------------
-- collections  (immutable financial transactions; reversed, never deleted)
-- -----------------------------------------------------------------------------
DROP TABLE IF EXISTS collections;
CREATE TABLE collections (
  id                 BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  receipt_no         VARCHAR(40)   NOT NULL,
  loan_id            INT UNSIGNED  NOT NULL,
  customer_id        INT UNSIGNED  NOT NULL,
  collected_by       INT UNSIGNED  NOT NULL,             -- users.id
  employee_id        INT UNSIGNED  NULL,
  location          VARCHAR(120)  NULL,                 -- typed customer location (denormalised copy)
  collection_date    DATE          NOT NULL,
  amount             DECIMAL(15,2) NOT NULL,             -- principal+charges portion (= cash_amount+upi_amount when split)
  fine_amount        DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  other_charges      DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  total_amount       DECIMAL(15,2) NOT NULL,             -- amount + fine_amount + other_charges
  payment_mode_id    INT UNSIGNED  NOT NULL,
  account_id         INT UNSIGNED  NULL,
  -- Split-payment (Cash + UPI in one collection): NULL unless payment_mode = SPLIT.
  -- amount/total_amount remain authoritative (= cash_amount+upi_amount) so every
  -- existing sum/report keeps working unchanged; these four just record the split.
  cash_amount        DECIMAL(15,2) NULL,
  upi_amount         DECIMAL(15,2) NULL,
  cash_account_id    INT UNSIGNED  NULL,
  upi_account_id     INT UNSIGNED  NULL,
  reference_no       VARCHAR(64)   NULL,
  bill_no            VARCHAR(64)   NULL,                 -- optional manual bill/voucher number
  remarks            VARCHAR(500)  NULL,
  idempotency_key    VARCHAR(80)   NULL,
  -- posted  = live, counts toward totals / cash / outstanding
  -- cancelled = kept as history, contributes to NOTHING (Cancel action)
  -- reversed  = original of a mirror-row reversal (legacy)
  status             ENUM('posted','reversed','cancelled') NOT NULL DEFAULT 'posted',
  reversed_at        DATETIME      NULL,
  reversed_by        INT UNSIGNED  NULL,
  reversal_reason    VARCHAR(255)  NULL,
  reversal_of        BIGINT UNSIGNED NULL,               -- points to original collection when this row is the reversal
  cancelled_at       DATETIME      NULL,
  cancelled_by       INT UNSIGNED  NULL,
  cancel_reason      VARCHAR(255)  NULL,
  deleted_at         DATETIME      NULL,                 -- hard "Delete" action (soft-deleted; excluded everywhere)
  created_at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_collections_receipt (receipt_no),
  UNIQUE KEY uq_collections_idem (idempotency_key),
  KEY idx_coll_loan (loan_id),
  KEY idx_coll_customer (customer_id),
  KEY idx_coll_date (collection_date),
  KEY idx_coll_collector (collected_by),
  KEY idx_coll_location (location),
  KEY idx_coll_mode (payment_mode_id),
  KEY idx_coll_status (status),
  KEY idx_coll_bill_no (bill_no),
  CONSTRAINT fk_coll_loan     FOREIGN KEY (loan_id)         REFERENCES loans_or_chits (id),
  CONSTRAINT fk_coll_customer FOREIGN KEY (customer_id)     REFERENCES customers (id),
  CONSTRAINT fk_coll_user     FOREIGN KEY (collected_by)    REFERENCES users (id),
  CONSTRAINT fk_coll_emp      FOREIGN KEY (employee_id)     REFERENCES employees (id) ON DELETE SET NULL,
  CONSTRAINT fk_coll_mode     FOREIGN KEY (payment_mode_id) REFERENCES payment_modes (id),
  CONSTRAINT fk_coll_account  FOREIGN KEY (account_id)      REFERENCES accounts (id) ON DELETE SET NULL,
  CONSTRAINT fk_coll_cash_account FOREIGN KEY (cash_account_id) REFERENCES accounts (id) ON DELETE SET NULL,
  CONSTRAINT fk_coll_upi_account  FOREIGN KEY (upi_account_id)  REFERENCES accounts (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- -----------------------------------------------------------------------------
-- collection_allocations  (how one collection is split across installments)
-- -----------------------------------------------------------------------------
DROP TABLE IF EXISTS collection_allocations;
CREATE TABLE collection_allocations (
  id                 BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  collection_id      BIGINT UNSIGNED NOT NULL,
  installment_id     INT UNSIGNED    NOT NULL,
  principal_alloc    DECIMAL(15,2)   NOT NULL DEFAULT 0.00,  -- toward emi+other_charges
  fine_alloc         DECIMAL(15,2)   NOT NULL DEFAULT 0.00,
  created_at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_ca_collection (collection_id),
  KEY idx_ca_installment (installment_id),
  CONSTRAINT fk_ca_collection  FOREIGN KEY (collection_id)  REFERENCES collections (id)  ON DELETE CASCADE,
  CONSTRAINT fk_ca_installment FOREIGN KEY (installment_id) REFERENCES installments (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- -----------------------------------------------------------------------------
-- fine_settings  (global, effective-dated rules)
-- -----------------------------------------------------------------------------
DROP TABLE IF EXISTS fine_settings;
CREATE TABLE fine_settings (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  fine_type     ENUM('NONE','FIXED_PER_DAY','PERCENT_PER_DAY','FIXED_PER_INSTALLMENT') NOT NULL DEFAULT 'FIXED_PER_DAY',
  rate_value    DECIMAL(15,4) NOT NULL DEFAULT 50.0000,   -- rupees/day, or percent/day, or flat
  grace_days    INT UNSIGNED  NOT NULL DEFAULT 0,
  max_fine_type ENUM('none','percent_of_payable','flat') NOT NULL DEFAULT 'percent_of_payable',
  max_fine_value DECIMAL(15,4) NOT NULL DEFAULT 10.0000,   -- 10% of payable by default
  effective_from DATE         NOT NULL,
  active        TINYINT(1)    NOT NULL DEFAULT 1,
  notes         VARCHAR(255)  NULL,
  created_by    INT UNSIGNED  NULL,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_fine_effective (effective_from),
  KEY idx_fine_active (active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- -----------------------------------------------------------------------------
-- fine_overrides  (authorized manual override on a specific installment)
-- -----------------------------------------------------------------------------
DROP TABLE IF EXISTS fine_overrides;
CREATE TABLE fine_overrides (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  installment_id  INT UNSIGNED  NOT NULL,
  collection_id   BIGINT UNSIGNED NULL,
  system_fine     DECIMAL(15,2) NOT NULL,
  override_fine   DECIMAL(15,2) NOT NULL,
  reason          VARCHAR(255)  NOT NULL,
  created_by      INT UNSIGNED  NOT NULL,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_fo_installment (installment_id),
  CONSTRAINT fk_fo_installment FOREIGN KEY (installment_id) REFERENCES installments (id) ON DELETE CASCADE,
  CONSTRAINT fk_fo_collection  FOREIGN KEY (collection_id)  REFERENCES collections (id)  ON DELETE SET NULL,
  CONSTRAINT fk_fo_user        FOREIGN KEY (created_by)     REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- -----------------------------------------------------------------------------
-- expenses
-- -----------------------------------------------------------------------------
DROP TABLE IF EXISTS expenses;
CREATE TABLE expenses (
  id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  amount         DECIMAL(15,2) NOT NULL,
  expense_date   DATE          NOT NULL,
  category       VARCHAR(64)   NOT NULL,
  account_id     INT UNSIGNED  NULL,               -- payment source
  remarks        VARCHAR(500)  NULL,
  status         ENUM('active','cancelled') NOT NULL DEFAULT 'active',
  created_by     INT UNSIGNED  NULL,
  cancelled_by   INT UNSIGNED  NULL,
  cancelled_at   DATETIME      NULL,
  deleted_at     DATETIME      NULL,
  created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_exp_date (expense_date),
  KEY idx_exp_category (category),
  KEY idx_exp_account (account_id),
  KEY idx_exp_status (status),
  CONSTRAINT fk_exp_account FOREIGN KEY (account_id) REFERENCES accounts (id) ON DELETE SET NULL,
  CONSTRAINT fk_exp_creator FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- -----------------------------------------------------------------------------
-- office_income
-- -----------------------------------------------------------------------------
DROP TABLE IF EXISTS office_income;
CREATE TABLE office_income (
  id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  amount         DECIMAL(15,2) NOT NULL,
  received_date  DATE          NOT NULL,
  category       VARCHAR(64)   NOT NULL,            -- Moi | Gift | Donation | Investment | ...
  account_id     INT UNSIGNED  NULL,               -- destination
  giver_details  VARCHAR(255)  NULL,
  remarks        VARCHAR(500)  NULL,
  status         ENUM('active','cancelled') NOT NULL DEFAULT 'active',
  created_by     INT UNSIGNED  NULL,
  cancelled_by   INT UNSIGNED  NULL,
  cancelled_at   DATETIME      NULL,
  deleted_at     DATETIME      NULL,
  created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_inc_date (received_date),
  KEY idx_inc_category (category),
  KEY idx_inc_account (account_id),
  KEY idx_inc_status (status),
  CONSTRAINT fk_inc_account FOREIGN KEY (account_id) REFERENCES accounts (id) ON DELETE SET NULL,
  CONSTRAINT fk_inc_creator FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- -----------------------------------------------------------------------------
-- distributions  (actual money handed to the customer for a chit; money OUT)
--   Creating a chit does NOT move money. A distribution row is the only thing
--   that decreases Office Cash / Bank and increases "Distributed Amount".
--   status active = live (counts); cancelled = kept as history, counts for nothing.
-- -----------------------------------------------------------------------------
DROP TABLE IF EXISTS distributions;
CREATE TABLE distributions (
  id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  loan_id          INT UNSIGNED  NOT NULL,               -- the chit
  customer_id      INT UNSIGNED  NOT NULL,
  distributed_date DATE          NOT NULL,
  amount           DECIMAL(15,2) NOT NULL,               -- actual amount given to the customer
  account_id       INT UNSIGNED  NOT NULL,               -- source: Office Cash / Bank
  new_emi_amount   DECIMAL(15,2) NULL,                   -- optional; applies to FUTURE installments after this date
  remarks          VARCHAR(500)  NULL,
  status           ENUM('active','cancelled') NOT NULL DEFAULT 'active',
  created_by       INT UNSIGNED  NULL,
  cancelled_by     INT UNSIGNED  NULL,
  cancelled_at     DATETIME      NULL,
  cancel_reason    VARCHAR(255)  NULL,
  deleted_at       DATETIME      NULL,
  created_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_dist_loan (loan_id),
  KEY idx_dist_customer (customer_id),
  KEY idx_dist_account (account_id),
  KEY idx_dist_status (status),
  KEY idx_dist_date (distributed_date),
  CONSTRAINT fk_dist_loan     FOREIGN KEY (loan_id)     REFERENCES loans_or_chits (id),
  CONSTRAINT fk_dist_customer FOREIGN KEY (customer_id) REFERENCES customers (id),
  CONSTRAINT fk_dist_account  FOREIGN KEY (account_id)  REFERENCES accounts (id),
  CONSTRAINT fk_dist_creator  FOREIGN KEY (created_by)  REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- -----------------------------------------------------------------------------
-- transactions  (the financial ledger: one row per real money movement)
--   Not a replacement for collections/distributions/expenses/office_income -
--   those stay the business records. This is the append-only ledger layer:
--   exactly one transaction row per source record (reference_type,reference_id
--   is UNIQUE, so re-processing the same collection/expense/etc. can never
--   double-post). status mirrors the source row's own status convention
--   (posted -> cancelled; never hard-deleted, never re-inserted as a reversal).
-- -----------------------------------------------------------------------------
DROP TABLE IF EXISTS transactions;
CREATE TABLE transactions (
  id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  transaction_no   VARCHAR(32)   NOT NULL,
  txn_date         DATE          NOT NULL,
  txn_type         ENUM('collection','distribution','expense','income') NOT NULL,
  direction        ENUM('credit','debit') NOT NULL,       -- credit = money in, debit = money out
  amount           DECIMAL(15,2) NOT NULL,
  account_id       INT UNSIGNED  NULL,
  customer_id      INT UNSIGNED  NULL,
  loan_id          INT UNSIGNED  NULL,
  reference_type   VARCHAR(32)   NOT NULL,                -- collection|distribution|expense|office_income
  reference_id     BIGINT UNSIGNED NOT NULL,               -- source table's PK
  status           ENUM('posted','cancelled') NOT NULL DEFAULT 'posted',
  remarks          VARCHAR(500)  NULL,
  created_by       INT UNSIGNED  NULL,
  cancelled_by     INT UNSIGNED  NULL,
  cancelled_at     DATETIME      NULL,
  created_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_txn_no (transaction_no),
  UNIQUE KEY uq_txn_reference (reference_type, reference_id),
  KEY idx_txn_date (txn_date),
  KEY idx_txn_account (account_id),
  KEY idx_txn_type_status (txn_type, status),
  KEY idx_txn_customer (customer_id),
  KEY idx_txn_loan (loan_id),
  CONSTRAINT fk_txn_account  FOREIGN KEY (account_id)  REFERENCES accounts (id) ON DELETE SET NULL,
  CONSTRAINT fk_txn_customer FOREIGN KEY (customer_id) REFERENCES customers (id) ON DELETE SET NULL,
  CONSTRAINT fk_txn_loan     FOREIGN KEY (loan_id)     REFERENCES loans_or_chits (id) ON DELETE SET NULL,
  CONSTRAINT fk_txn_creator  FOREIGN KEY (created_by)  REFERENCES users (id) ON DELETE SET NULL,
  CONSTRAINT fk_txn_canceller FOREIGN KEY (cancelled_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- -----------------------------------------------------------------------------
-- audit_logs
-- -----------------------------------------------------------------------------
DROP TABLE IF EXISTS audit_logs;
CREATE TABLE audit_logs (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  actor_user_id INT UNSIGNED  NULL,
  actor_role    VARCHAR(32)   NULL,
  action        VARCHAR(64)   NOT NULL,          -- login.success, collection.create, ...
  module        VARCHAR(64)   NOT NULL,
  entity_type   VARCHAR(64)   NULL,
  entity_id     VARCHAR(64)   NULL,
  old_values    JSON          NULL,
  new_values    JSON          NULL,
  reason        VARCHAR(255)  NULL,
  ip            VARCHAR(45)   NULL,
  user_agent    VARCHAR(255)  NULL,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_audit_actor (actor_user_id),
  KEY idx_audit_action (action),
  KEY idx_audit_module (module),
  KEY idx_audit_entity (entity_type, entity_id),
  KEY idx_audit_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- -----------------------------------------------------------------------------
-- app_settings  (key/value, JSON values)
-- -----------------------------------------------------------------------------
DROP TABLE IF EXISTS app_settings;
CREATE TABLE app_settings (
  setting_key   VARCHAR(64)  NOT NULL,
  setting_value JSON         NOT NULL,
  updated_by    INT UNSIGNED NULL,
  updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (setting_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- -----------------------------------------------------------------------------
-- translations  (i18n: en / ta)
-- -----------------------------------------------------------------------------
DROP TABLE IF EXISTS translations;
CREATE TABLE translations (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  lang          VARCHAR(5)   NOT NULL,          -- en | ta
  trans_key     VARCHAR(128) NOT NULL,
  trans_value   VARCHAR(512) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_trans_lang_key (lang, trans_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

SET FOREIGN_KEY_CHECKS = 1;
