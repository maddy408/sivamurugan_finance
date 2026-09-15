-- =============================================================================
-- 2026-09-15  Split-payment collections (Cash + UPI in one transaction)
--
--   Adds 4 nullable columns to `collections`, used only when payment_mode is
--   the new SPLIT mode. amount/total_amount stay authoritative (= cash+upi),
--   so every existing dashboard/report/pending-dues calculation that already
--   sums collections.amount/total_amount keeps working unchanged.
--
--   Safe for an already-populated database: guarded ALTERs (information_schema
--   check) + INSERT IGNORE for the new payment mode. Re-runnable.
--
--   Apply with:  php backend/setup.php apply database/migrations/2026-09-15_split-payment.sql
-- =============================================================================

SET @db := DATABASE();

SET @sql := (SELECT IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='collections' AND COLUMN_NAME='cash_amount') = 0,
  'ALTER TABLE collections
     ADD COLUMN cash_amount DECIMAL(15,2) NULL AFTER amount,
     ADD COLUMN upi_amount DECIMAL(15,2) NULL AFTER cash_amount,
     ADD COLUMN cash_account_id INT UNSIGNED NULL AFTER account_id,
     ADD COLUMN upi_account_id INT UNSIGNED NULL AFTER cash_account_id,
     ADD CONSTRAINT fk_coll_cash_account FOREIGN KEY (cash_account_id) REFERENCES accounts (id) ON DELETE SET NULL,
     ADD CONSTRAINT fk_coll_upi_account FOREIGN KEY (upi_account_id) REFERENCES accounts (id) ON DELETE SET NULL',
  'SELECT 1'
));
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

INSERT IGNORE INTO payment_modes (code, name, is_active, sort_order)
VALUES ('SPLIT', 'Split Payment (Cash + UPI)', 1, 5);
