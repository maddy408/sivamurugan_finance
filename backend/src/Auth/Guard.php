<?php
namespace App\Auth;

use App\Core\Database;
use App\Core\HttpException;
use App\Core\Request;

/**
 * Authorization gate. Every protected route calls Guard::authorize() which
 * checks, in order: (1) authentication + session version, (2) permission,
 * (3) assignment scope for employees.
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
     * Assignment scope
     * ------------------------------------------------------------------- */

    public static function scopeIsUnrestricted(array $user): bool
    {
        return $user['scope']['unrestricted'] ?? false;
    }

    /**
     * Returns [sqlFragment, params] to AND into a loans_or_chits query (alias `l`)
     * so an employee only sees loans they are assigned OR in an assigned location.
     */
    public static function loanScopeSql(array $user, string $alias = 'l'): array
    {
        if (self::scopeIsUnrestricted($user)) {
            return ['1=1', []];
        }
        $loanIds = $user['scope']['loan_ids'] ?? [];
        $locIds  = $user['scope']['location_ids'] ?? [];
        $clauses = [];
        $params = [];
        if ($loanIds) {
            $in = [];
            foreach (array_values($loanIds) as $i => $id) {
                $in[] = ":sl_$i";
                $params["sl_$i"] = $id;
            }
            $clauses[] = "$alias.id IN (" . implode(',', $in) . ")";
        }
        if ($locIds) {
            $in = [];
            foreach (array_values($locIds) as $i => $id) {
                $in[] = ":sloc_$i";
                $params["sloc_$i"] = $id;
            }
            $inList = implode(',', $in);
            // Location scope follows the CUSTOMER's master location (the single source
            // of truth set at customer-create), and also the chit's own stored
            // location_id for any legacy row where they differ.
            $clauses[] = "($alias.location_id IN ($inList)"
                . " OR EXISTS (SELECT 1 FROM customers csc WHERE csc.id = $alias.customer_id"
                . " AND csc.primary_location_id IN ($inList)))";
        }
        if (!$clauses) {
            return ['1=0', []];   // employee with no assignments sees nothing
        }
        return ['(' . implode(' OR ', $clauses) . ')', $params];
    }

    public static function assertLoanInScope(array $user, int $loanId): array
    {
        $loan = Database::instance()->fetch('SELECT * FROM loans_or_chits WHERE id = :id', ['id' => $loanId]);
        if (!$loan) {
            throw HttpException::notFound('Loan/chit not found');
        }
        if (self::scopeIsUnrestricted($user)) {
            return $loan;
        }
        $loanIds = $user['scope']['loan_ids'] ?? [];
        $locIds  = $user['scope']['location_ids'] ?? [];
        $ok = in_array((int)$loan['id'], $loanIds, true)
            || ($loan['location_id'] !== null && in_array((int)$loan['location_id'], $locIds, true));
        if (!$ok && $locIds) {
            // Fall back to the customer's master location (source of truth).
            $custLoc = Database::instance()->scalar(
                'SELECT primary_location_id FROM customers WHERE id = :c', ['c' => (int)$loan['customer_id']]
            );
            $ok = $custLoc !== null && in_array((int)$custLoc, $locIds, true);
        }
        if (!$ok) {
            throw HttpException::forbidden('This loan/chit is outside your assigned scope');
        }
        return $loan;
    }

    public static function assertCustomerInScope(array $user, int $customerId): array
    {
        $cust = Database::instance()->fetch('SELECT * FROM customers WHERE id = :id', ['id' => $customerId]);
        if (!$cust || $cust['deleted_at'] !== null) {
            throw HttpException::notFound('Customer not found');
        }
        if (self::scopeIsUnrestricted($user)) {
            return $cust;
        }
        $locIds = $user['scope']['location_ids'] ?? [];
        $loanIds = $user['scope']['loan_ids'] ?? [];
        // In scope if the customer's location is assigned, or the customer has an assigned loan.
        $inByLoc = $cust['primary_location_id'] !== null && in_array((int)$cust['primary_location_id'], $locIds, true);
        $inByLoan = false;
        if ($loanIds) {
            $ph = implode(',', array_fill(0, count($loanIds), '?'));
            $cnt = Database::instance()->run(
                "SELECT COUNT(*) FROM loans_or_chits WHERE customer_id = ? AND id IN ($ph)",
                array_merge([$customerId], array_values($loanIds))
            )->fetchColumn();
            $inByLoan = $cnt > 0;
        }
        if (!$inByLoc && !$inByLoan) {
            throw HttpException::forbidden('This customer is outside your assigned scope');
        }
        return $cust;
    }
}
