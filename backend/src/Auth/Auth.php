<?php
namespace App\Auth;

use App\Core\App;
use App\Core\Database;
use App\Core\HttpException;
use App\Core\Request;
use App\Support\BusinessDate;

/**
 * Resolves the authenticated principal from the bearer token and loads its
 * effective permissions + assignment scope. Enforces the "force logout"
 * contract: a session is only valid while its session_version still matches
 * users.session_version AND it is not individually revoked.
 */
final class Auth
{
    private static ?array $user = null;

    public static function tokenHash(string $raw): string
    {
        return hash('sha256', $raw);
    }

    public static function attempt(Request $req): array
    {
        if (self::$user !== null) {
            return self::$user;
        }
        $raw = $req->bearerToken();
        if (!$raw) {
            throw HttpException::unauthenticated();
        }
        $db = Database::instance();
        $row = $db->fetch(
            "SELECT s.id AS session_id, s.revoked, s.expires_at, s.session_version AS s_ver,
                    u.id AS user_id, u.name, u.username, u.email, u.is_active,
                    u.session_version AS u_ver, u.role_id, r.code AS role_code, r.name AS role_name
             FROM sessions s
             JOIN users u ON u.id = s.user_id
             JOIN roles r ON r.id = u.role_id
             WHERE s.token_hash = :h
             LIMIT 1",
            ['h' => self::tokenHash($raw)]
        );

        if (!$row) {
            throw HttpException::unauthenticated('Invalid session', 'INVALID_TOKEN');
        }
        if ((int)$row['revoked'] === 1 || (int)$row['s_ver'] !== (int)$row['u_ver']) {
            throw HttpException::unauthenticated(
                'Your session has been terminated by an administrator.',
                'SESSION_TERMINATED'
            );
        }
        if (strtotime($row['expires_at']) < time()) {
            throw HttpException::unauthenticated('Session expired', 'SESSION_EXPIRED');
        }
        if ((int)$row['is_active'] !== 1) {
            throw HttpException::unauthenticated('Account is deactivated', 'ACCOUNT_DISABLED');
        }

        $db->run('UPDATE sessions SET last_seen_at = :now WHERE id = :id', [
            'now' => BusinessDate::utcNow(),
            'id'  => $row['session_id'],
        ]);

        self::$user = self::buildContext($row, (int)$row['session_id']);
        return self::$user;
    }

    /**
     * Build the principal context (permissions + scope) for a user row.
     * Used by attempt() for token requests and by contextForUserId() right
     * after a successful password login (no token in that request yet).
     */
    private static function buildContext(array $row, ?int $sessionId): array
    {
        $db = Database::instance();
        $employee = null;
        if ($row['role_code'] === 'EMPLOYEE') {
            $employee = $db->fetch('SELECT id, emp_code, is_active FROM employees WHERE user_id = :u', ['u' => $row['user_id']]);
        }
        return [
            'id'          => (int)$row['user_id'],
            'name'        => $row['name'],
            'username'    => $row['username'],
            'email'       => $row['email'],
            'role_id'     => (int)$row['role_id'],
            'role_code'   => $row['role_code'],
            'role_name'   => $row['role_name'],
            'session_id'  => $sessionId,
            'employee_id' => $employee ? (int)$employee['id'] : null,
            'permissions' => self::loadPermissions((int)$row['user_id'], $row['role_code'], (int)$row['role_id']),
            'scope'       => self::loadScope($row['role_code'], $employee ? (int)$employee['id'] : null),
        ];
    }

    /** Public context for a freshly authenticated user id (login flow). */
    public static function contextForUserId(int $userId, ?int $sessionId = null): array
    {
        $row = Database::instance()->fetch(
            'SELECT u.id AS user_id, u.name, u.username, u.email, u.role_id,
                    r.code AS role_code, r.name AS role_name
             FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = :id',
            ['id' => $userId]
        );
        if (!$row) {
            throw HttpException::unauthenticated();
        }
        return self::buildContext($row, $sessionId);
    }

    public static function user(): array
    {
        if (self::$user === null) {
            throw HttpException::unauthenticated();
        }
        return self::$user;
    }

    public static function check(): bool
    {
        return self::$user !== null;
    }

    private static function loadPermissions(int $userId, string $roleCode, int $roleId): array
    {
        $db = Database::instance();
        if ($roleCode === 'ADMIN') {
            $all = $db->fetchAll('SELECT code FROM permissions');
            return array_column($all, 'code');
        }
        $rolePerms = $db->fetchAll(
            'SELECT p.code FROM role_permissions rp JOIN permissions p ON p.id = rp.permission_id WHERE rp.role_id = :r',
            ['r' => $roleId]
        );
        $set = array_fill_keys(array_column($rolePerms, 'code'), true);

        $overrides = $db->fetchAll(
            'SELECT p.code, up.effect FROM user_permissions up JOIN permissions p ON p.id = up.permission_id WHERE up.user_id = :u',
            ['u' => $userId]
        );
        foreach ($overrides as $o) {
            if ($o['effect'] === 'allow') {
                $set[$o['code']] = true;
            } else {
                unset($set[$o['code']]);
            }
        }
        return array_keys($set);
    }

    /**
     * Data-visibility scope.
     *
     * There is NO location-based (or assignment-based) visibility filtering in
     * this application. Both ADMIN and EMPLOYEE see every customer, loan/chit,
     * collection and pending due. What a user may DO is governed purely by
     * role + module/action permissions (loadPermissions()); what a user may
     * SEE is never filtered.
     *
     * The array shape (`unrestricted`, empty id lists) is kept so the Guard
     * helpers that still accept a "scope" continue to work as no-ops.
     */
    private static function loadScope(string $roleCode, ?int $employeeId): array
    {
        return ['unrestricted' => true, 'location_ids' => [], 'loan_ids' => []];
    }
}
