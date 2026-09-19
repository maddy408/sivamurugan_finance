-- =============================================================================
-- 2026-09-19b  Close Chit settlement becomes a real collections row + reopen
--
--   The previous migration (2026-09-19_close-chit-and-due-edit.sql) stored the
--   close amount directly on loans_or_chits (closing_amount/closing_date/
--   close_remarks). That duplicated the same money in two places (the loan
--   row AND, if ever surfaced in a report, the collections table) and gave it
--   no natural way to show up in Collection History / Transactions / reports,
--   be edited without ambiguity, or be cancelled through the existing
--   collection cancel/delete flow.
--
--   New design: a "Close Chit" settlement IS a normal `collections` row
--   (collection_type = 'close_settlement'), with ZERO collection_allocations
--   against any installment - so it never touches installment paid/balance
--   amounts, but it DOES count in every place that already sums
--   collections.status='posted' (FinanceService, Dashboard, Financial Ledger,
--   customer payment history) automatically, with no extra plumbing. Editing
--   it updates that one row in place (no duplicate row); cancelling/deleting
--   it reuses the EXISTING /api/collections/{id}/cancel|delete endpoints -
--   no new reversal logic needed.
--
--   loans_or_chits.closing_date/closing_amount/close_remarks are dropped as
--   redundant (single source of truth is now the collections row itself;
--   these columns were added and never released/depended on outside this
--   project's last change). closed_at/closed_by are kept (metadata about the
--   close action, not the amount). reopened_at/reopened_by added for the new
--   Reopen Chit action.
--
--   Safe for an already-populated database: every existing collections row
--   defaults to collection_type='installment' (current behaviour unchanged).
--   Apply with:  php backend/setup.php apply database/migrations/2026-09-19b_close-settlement-as-collection.sql
-- =============================================================================

ALTER TABLE loans_or_chits
  DROP COLUMN closing_date,
  DROP COLUMN closing_amount,
  DROP COLUMN close_remarks,
  ADD COLUMN reopened_at DATETIME     NULL AFTER closed_by,
  ADD COLUMN reopened_by INT UNSIGNED NULL AFTER reopened_at,
  ADD CONSTRAINT fk_loans_reopened_by FOREIGN KEY (reopened_by) REFERENCES users (id) ON DELETE SET NULL;

ALTER TABLE collections
  ADD COLUMN collection_type ENUM('installment','close_settlement') NOT NULL DEFAULT 'installment' AFTER status,
  ADD INDEX idx_coll_type (collection_type);
