-- =============================================================================
-- 2026-09-10  Business-flow update (SAFE for existing data)
--
--   1. Rename the finance to "Siva Murugan Chit Fund"
--   2. Optional collection day  -> no schema change needed. Chits that were
--      created before this change and were snapped to a weekday keep their
--      dates; new chits created without a chosen day run from their start date.
--   3. Remove location-based access -> no schema change needed. Enforced in
--      Auth::loadScope (employees now get an unrestricted scope). The
--      employee_locations / loan_assignments data is preserved for reporting.
--
--   No tables are dropped. No rows are deleted. Re-runnable.
--
--   Apply with:  php backend/setup.php apply database/migrations/2026-09-10_business-flow.sql
-- =============================================================================

-- 1. Organisation name (JSON_SET keeps every other org field intact) --------
UPDATE app_settings
   SET setting_value = JSON_SET(
         setting_value,
         '$.name', 'Siva Murugan Chit Fund'
       )
 WHERE setting_key = 'organization';

-- App title shown in the header / browser tab ------------------------------
UPDATE translations SET trans_value = 'Siva Murugan Chit Fund'
 WHERE lang = 'en' AND trans_key = 'app.title';
UPDATE translations SET trans_value = 'சிவ முருகன் சிட் ஃபண்ட்'
 WHERE lang = 'ta' AND trans_key = 'app.title';

INSERT INTO translations (lang, trans_key, trans_value) VALUES
  ('en','app.title','Siva Murugan Chit Fund'),
  ('ta','app.title','சிவ முருகன் சிட் ஃபண்ட்'),
  ('en','nav.pending','Pending Dues'),
  ('ta','nav.pending','நிலுவைத் தொகை')
ON DUPLICATE KEY UPDATE trans_value = VALUES(trans_value);
