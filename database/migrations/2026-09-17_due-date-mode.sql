-- =============================================================================
-- 2026-09-17  Add due_date_mode (auto | custom) to loans_or_chits
--
--   'auto'   (default) - ScheduleService generates/refreshes installment due
--             dates automatically, exactly as before this change.
--   'custom' - the backend never auto-generates or auto-adjusts due dates for
--             this chit; staff add each installment row manually via
--             POST/PUT /api/loans/{id}/custom-schedule. Collection, pending
--             dues, receipts, statements and Excel exports all read from
--             whatever rows exist in `installments` either way - no other
--             code path needed to change.
--
--   Safe for an already-populated database: every existing chit gets 'auto',
--   preserving current behaviour exactly.
--   Apply with:  php backend/setup.php apply database/migrations/2026-09-17_due-date-mode.sql
-- =============================================================================

ALTER TABLE loans_or_chits
  ADD COLUMN due_date_mode ENUM('auto','custom') NOT NULL DEFAULT 'auto' AFTER schedule_config;
