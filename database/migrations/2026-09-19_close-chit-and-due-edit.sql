-- =============================================================================
-- 2026-09-19  Close Chit + editable due dates
--
--   loans_or_chits.status gets a new value 'closed': a chit closed via
--   POST /api/loans/{id}/close regardless of whether every due was paid.
--   Distinct from 'cancelled' (used by the existing Cancel/Delete flows,
--   which also void the chit's financial effect) - a closed chit's existing
--   paid/unpaid installments and collection history are left exactly as
--   they are; only future collection/distribution actions are blocked.
--
--   installments.due_date_locked lets a single installment's due_date be
--   corrected via the new PUT /api/installments/{id} endpoint even on an
--   'auto' schedule chit, without ScheduleService::generate() silently
--   recomputing it back on the next chit edit/regenerate.
--
--   Safe for an already-populated database: every existing row defaults to
--   the old behaviour (due_date_locked = 0; 'closed' is simply a new,
--   unused enum value until a chit is explicitly closed).
--   Apply with:  php backend/setup.php apply database/migrations/2026-09-19_close-chit-and-due-edit.sql
-- =============================================================================

ALTER TABLE loans_or_chits
  MODIFY COLUMN status ENUM('active','completed','cancelled','deactivated','closed') NOT NULL DEFAULT 'active',
  ADD COLUMN closed_at      DATETIME      NULL          AFTER cancel_reason,
  ADD COLUMN closed_by      INT UNSIGNED  NULL          AFTER closed_at,
  ADD COLUMN closing_date   DATE          NULL          AFTER closed_by,
  ADD COLUMN closing_amount DECIMAL(15,2) NULL          AFTER closing_date,
  ADD COLUMN close_remarks  VARCHAR(500)  NULL          AFTER closing_amount,
  ADD CONSTRAINT fk_loans_closed_by FOREIGN KEY (closed_by) REFERENCES users (id) ON DELETE SET NULL;

ALTER TABLE installments
  ADD COLUMN due_date_locked TINYINT(1) NOT NULL DEFAULT 0 AFTER status;
