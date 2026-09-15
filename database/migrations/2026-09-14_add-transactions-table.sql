-- =============================================================================
-- 2026-09-14  Add the `transactions` ledger table
--
--   Adds an append-only financial ledger on top of the existing
--   collections / distributions / expenses / office_income tables. Those
--   tables remain the business records; `transactions` is a read-optimised
--   ledger with exactly one row per source record.
--
--   Safe for an already-populated database:
--     - CREATE TABLE IF NOT EXISTS (no-op if already applied)
--     - Backfill uses INSERT ... SELECT ... WHERE NOT EXISTS, so re-running
--       this file never double-inserts.
--
--   No existing table is dropped, renamed, or has rows deleted. Re-runnable.
--
--   Apply with:  php backend/setup.php apply database/migrations/2026-09-14_add-transactions-table.sql
-- =============================================================================

CREATE TABLE IF NOT EXISTS transactions (
  id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  transaction_no   VARCHAR(32)   NOT NULL,
  txn_date         DATE          NOT NULL,
  txn_type         ENUM('collection','distribution','expense','income') NOT NULL,
  direction        ENUM('credit','debit') NOT NULL,
  amount           DECIMAL(15,2) NOT NULL,
  account_id       INT UNSIGNED  NULL,
  customer_id      INT UNSIGNED  NULL,
  loan_id          INT UNSIGNED  NULL,
  reference_type   VARCHAR(32)   NOT NULL,
  reference_id     BIGINT UNSIGNED NOT NULL,
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

-- ---- backfill: collections -------------------------------------------------
INSERT INTO transactions
  (transaction_no, txn_date, txn_type, direction, amount, account_id, customer_id, loan_id,
   reference_type, reference_id, status, remarks, created_by, cancelled_by, cancelled_at, created_at)
SELECT
  CONCAT('TXN-BKF-COL-', col.id), col.collection_date, 'collection', 'credit', col.total_amount,
  col.account_id, col.customer_id, col.loan_id,
  'collection', col.id, IF(col.status = 'posted', 'posted', 'cancelled'),
  col.remarks, col.collected_by, col.cancelled_by, col.cancelled_at, col.created_at
FROM collections col
WHERE col.deleted_at IS NULL
  AND NOT EXISTS (SELECT 1 FROM transactions t WHERE t.reference_type = 'collection' AND t.reference_id = col.id);

-- ---- backfill: distributions ------------------------------------------------
INSERT INTO transactions
  (transaction_no, txn_date, txn_type, direction, amount, account_id, customer_id, loan_id,
   reference_type, reference_id, status, remarks, created_by, cancelled_by, cancelled_at, created_at)
SELECT
  CONCAT('TXN-BKF-DIST-', d.id), d.distributed_date, 'distribution', 'debit', d.amount,
  d.account_id, d.customer_id, d.loan_id,
  'distribution', d.id, IF(d.status = 'active', 'posted', 'cancelled'),
  d.remarks, d.created_by, d.cancelled_by, d.cancelled_at, d.created_at
FROM distributions d
WHERE d.deleted_at IS NULL
  AND NOT EXISTS (SELECT 1 FROM transactions t WHERE t.reference_type = 'distribution' AND t.reference_id = d.id);

-- ---- backfill: expenses -------------------------------------------------
INSERT INTO transactions
  (transaction_no, txn_date, txn_type, direction, amount, account_id, customer_id, loan_id,
   reference_type, reference_id, status, remarks, created_by, cancelled_by, cancelled_at, created_at)
SELECT
  CONCAT('TXN-BKF-EXP-', e.id), e.expense_date, 'expense', 'debit', e.amount,
  e.account_id, NULL, NULL,
  'expense', e.id, IF(e.status = 'active', 'posted', 'cancelled'),
  e.remarks, e.created_by, e.cancelled_by, e.cancelled_at, e.created_at
FROM expenses e
WHERE e.deleted_at IS NULL
  AND NOT EXISTS (SELECT 1 FROM transactions t WHERE t.reference_type = 'expense' AND t.reference_id = e.id);

-- ---- permissions: transactions.view / transactions.export -----------------
-- INSERT IGNORE is safe to re-run: uq_permissions_code stops duplicates.
INSERT IGNORE INTO permissions (module, action, code, description) VALUES
  ('transactions','view','transactions.view','View the financial transaction ledger'),
  ('transactions','export','transactions.export','Export the financial transaction ledger');

-- Admin (role 1) gets every permission, including any just inserted above.
INSERT INTO role_permissions (role_id, permission_id)
SELECT 1, p.id FROM permissions p
WHERE p.code IN ('transactions.view','transactions.export')
  AND NOT EXISTS (
    SELECT 1 FROM role_permissions rp WHERE rp.role_id = 1 AND rp.permission_id = p.id
  );

-- ---- backfill: office_income -------------------------------------------------
INSERT INTO transactions
  (transaction_no, txn_date, txn_type, direction, amount, account_id, customer_id, loan_id,
   reference_type, reference_id, status, remarks, created_by, cancelled_by, cancelled_at, created_at)
SELECT
  CONCAT('TXN-BKF-INC-', i.id), i.received_date, 'income', 'credit', i.amount,
  i.account_id, NULL, NULL,
  'office_income', i.id, IF(i.status = 'active', 'posted', 'cancelled'),
  i.remarks, i.created_by, i.cancelled_by, i.cancelled_at, i.created_at
FROM office_income i
WHERE i.deleted_at IS NULL
  AND NOT EXISTS (SELECT 1 FROM transactions t WHERE t.reference_type = 'office_income' AND t.reference_id = i.id);
