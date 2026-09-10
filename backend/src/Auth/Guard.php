<?php
namespace App\Auth;

use App\Core\Database;
use App\Core\HttpException;
use App\Core\Request;

/**
 * Authorization gate. Every protected route calls Guard::authorize() which
 * checks: (1) authentication + session version, (2) role / module / action
 * permission. There is NO location- or assignment-based visibility filtering:
 * the "scope" helpers below are retained as no-ops so existing call sites keep
 * compiling, and every authenticated user simply sees all rows.
 */
final class Guard
{
    /**
     * @param string|string[]|null $permission  required permission code(s); any-of semantics
     * @return array the authenticated user context
     */
    public static function authorize(Request $req, $permission = null): array
    {
        $user = Auth::attempt($req);           // 401 on failure / SESSION_TERMINATED
        if ($permission !== null) {
            self::requirePermission($user, $permission);
        }
        return $user;
    }

    public static function requirePermission(array $user, $permission): void
    {
        $needed = is_array($permission) ? $permission : [$permission];
        foreach ($needed as $code) {
            if (in_array($code, $user['permissions'], true)) {
                return;
            }
        }
        throw HttpException::forbidden('Missing permission: ' . implode(' or ', $needed));
    }

    public static function can(array $user, string $code): bool
    {
        return in_array($code, $user['permissions'], true);
    }

    public static function isAdmin(array $user): bool
    {
        return $user['role_code'] === 'ADMIN';
    }

    /* ---------------------------------------------------------------------
     * Visibility scope — intentionally NO-OP (no location / assignment filter).
     * Kept so existing call sites keep working; every user sees all rows.
     * ------------------------------------------------------------------- */

    public static function scopeIsUnrestricted(array $user): bool
    {
        return true;
    }

    /** Always returns a pass-through clause — no visibility filtering. */
    public static function loanScopeSql(array $user, string $alias = 'l'): array
    {
        return ['1=1', []];
    }

    /** Just resolves the loan and 404s if missing — no scope check. */
    public static function assertLoanInScope(array $user, int $loanId): array
    {
        $loan = Database::instance()->fetch('SELECT * FROM loans_or_chits WHERE id = :id', ['id' => $loanId]);
        if (!$loan) {
            throw HttpException::notFound('Loan/chit not found');
        }
        return $loan;
    }

    /** Just resolves the customer and 404s if missing/deleted — no scope check. */
    public static function assertCustomerInScope(array $user, int $customerId): array
    {
        $cust = Database::instance()->fetch('SELECT * FROM customers WHERE id = :id', ['id' => $customerId]);
        if (!$cust || $cust['deleted_at'] !== null) {
            throw HttpException::notFound('Customer not found');
        }
        return $cust;
    }
}
