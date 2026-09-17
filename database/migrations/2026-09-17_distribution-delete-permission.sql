-- =============================================================================
-- 2026-09-17  Add distributions.delete permission
--
--   Distribution now supports Delete (soft) in addition to Edit/Cancel,
--   matching the collections.delete pattern. Grants it to Admin (role 1),
--   matching how every other module permission is granted on install.
--
--   Safe for an already-populated database: INSERT IGNORE + NOT EXISTS guard.
--   Apply with:  php backend/setup.php apply database/migrations/2026-09-17_distribution-delete-permission.sql
-- =============================================================================

INSERT IGNORE INTO permissions (module, action, code, description)
VALUES ('distributions', 'delete', 'distributions.delete', 'Delete a chit distribution');

INSERT INTO role_permissions (role_id, permission_id)
SELECT 1, p.id FROM permissions p
WHERE p.code = 'distributions.delete'
  AND NOT EXISTS (
    SELECT 1 FROM role_permissions rp WHERE rp.role_id = 1 AND rp.permission_id = p.id
  );
