<?php
namespace App\Core;

/**
 * Shared helper for server-side pagination / sorting / page-size handling.
 * Allowed page sizes per requirements: 10, 25, 50, 100, 200.
 */
final class ListQuery
{
    public const PAGE_SIZES = [10, 25, 50, 100, 200];

    public static function page(Request $req): int
    {
        return max(1, (int)$req->queryParam('page', 1));
    }

    /**
     * PAGE_SIZES is the UI's "rows per page" selector - but several call
     * sites (customer/employee dropdowns used to populate a <select>, e.g.
     * Loan -> Select Customer) legitimately ask for a single large batch via
     * per_page=500 to fetch effectively "all" rows in one request. Silently
     * coercing any value outside PAGE_SIZES back to $default (10) used to
     * mean those requests quietly got only the first 10 rows with no error -
     * any record past the 10th alphabetically (e.g. a customer whose name
     * starts late in the alphabet) would be missing from every such dropdown
     * even though GET /api/customers itself had it. Any requested per_page in
     * PAGE_SIZES is honoured as before; anything else is honoured too, up to
     * a sane hard cap, instead of being silently discarded.
     */
    public static function perPage(Request $req, int $default = 10): int
    {
        $pp = (int)$req->queryParam('per_page', $default);
        if ($pp <= 0) {
            return $default;
        }
        if (in_array($pp, self::PAGE_SIZES, true)) {
            return $pp;
        }
        return min($pp, 1000);
    }

    public static function offset(Request $req, int $default = 10): int
    {
        return (self::page($req) - 1) * self::perPage($req, $default);
    }

    /**
     * Validate a sort request against a whitelist; returns "col DIR".
     * @param array<string,string> $allowed  request key => real column
     */
    public static function orderBy(Request $req, array $allowed, string $fallback): string
    {
        $by  = (string)$req->queryParam('sort_by', '');
        $dir = strtolower((string)$req->queryParam('sort_dir', 'asc')) === 'desc' ? 'DESC' : 'ASC';
        if (isset($allowed[$by])) {
            return $allowed[$by] . ' ' . $dir;
        }
        return $fallback;
    }

    public static function search(Request $req): string
    {
        return trim((string)$req->queryParam('q', ''));
    }
}
