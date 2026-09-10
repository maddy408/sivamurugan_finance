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

    public static function perPage(Request $req, int $default = 10): int
    {
        $pp = (int)$req->queryParam('per_page', $default);
        return in_array($pp, self::PAGE_SIZES, true) ? $pp : $default;
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
