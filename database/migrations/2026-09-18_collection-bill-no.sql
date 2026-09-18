-- =============================================================================
-- 2026-09-18  Add bill_no to collections
--
--   Optional manual bill/voucher number entered on the Collect form and shown
--   in Collection History / receipts / statements. Nullable so every existing
--   collection keeps working unchanged; only new/edited collections carry one.
--
--   Apply with:  php backend/setup.php apply database/migrations/2026-09-18_collection-bill-no.sql
-- =============================================================================

ALTER TABLE collections
  ADD COLUMN bill_no VARCHAR(64) NULL AFTER reference_no,
  ADD KEY idx_coll_bill_no (bill_no);
