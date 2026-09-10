<?php
namespace App\Services;

use App\Core\App;
use App\Core\Database;
use App\Support\BusinessDate;

/**
 * Human-readable unique codes. Uniqueness is enforced by DB constraints;
 * these helpers just produce the next candidate and callers retry on clash.
 */
final class CodeGenerator
{
    /**
     * Chit code. Default format PREFIX-N (plain incrementing integer, e.g. JRM-1,
     * JRM-2, JRM-3). Prefix comes from Settings (code_format.loan_prefix).
     *
     * The next number = MAX(trailing integer of every existing PREFIX-... code) + 1,
     * so it is safe across deleted rows and gaps. Concurrency / duplicate submits
     * are caught by the UNIQUE(code) constraint + the caller's retry.
     */
    public static function loanCode(): string
    {
        $fmt = App::setting('code_format', []);
        $prefix  = $fmt['loan_prefix'] ?? 'JRM';
        $pattern = $fmt['loan_pattern'] ?? '{PREFIX}-{SEQ}';
        $year    = BusinessDate::today()->format('Y');

        // highest numeric suffix among codes that start with "PREFIX-"
        $like = $prefix . '-%';
        $max = (int) Database::instance()->scalar(
            "SELECT COALESCE(MAX(CAST(REGEXP_REPLACE(code, '^.*[^0-9]', '') AS UNSIGNED)), 0)
               FROM loans_or_chits
              WHERE code LIKE :like AND code REGEXP :re",
            ['like' => $like, 're' => '^' . preg_quote($prefix, '/') . '-[0-9]+$']
        );
        $seq = $max + 1;

        return self::render($pattern, $prefix, [
            'YYYY'  => $year,
            'SEQ'   => (string) $seq,
            'SEQ6'  => str_pad((string) $seq, 6, '0', STR_PAD_LEFT),
        ]);
    }

    /** The next chit code without any DB write (for the "New chit" form preview). */
    public static function previewLoanCode(): string
    {
        return self::loanCode();
    }

    public static function customerCode(): string
    {
        $fmt = App::setting('code_format', []);
        $prefix  = $fmt['customer_prefix'] ?? 'CUST';
        $pattern = $fmt['customer_pattern'] ?? '{PREFIX}-{SEQ6}';
        $like = str_replace(['{PREFIX}', '{SEQ6}'], [$prefix, '%'], $pattern);
        $max = Database::instance()->scalar(
            "SELECT customer_code FROM customers WHERE customer_code LIKE :like ORDER BY customer_code DESC LIMIT 1",
            ['like' => $like]
        );
        $seq = 1;
        if ($max && preg_match('/(\d+)$/', $max, $m)) {
            $seq = (int)$m[1] + 1;
        }
        return self::render($pattern, $prefix, ['SEQ6' => str_pad((string)$seq, 6, '0', STR_PAD_LEFT)]);
    }

    public static function receiptNo(string $collectionDateYmd): string
    {
        $fmt = App::setting('code_format', []);
        $prefix  = $fmt['receipt_prefix'] ?? 'RCPT';
        $pattern = $fmt['receipt_pattern'] ?? '{PREFIX}-{YYYYMMDD}-{SEQ5}';
        $ymd = str_replace('-', '', $collectionDateYmd);

        $like = str_replace(['{PREFIX}', '{YYYYMMDD}', '{SEQ5}'], [$prefix, $ymd, '%'], $pattern);
        $count = (int)Database::instance()->scalar(
            "SELECT COUNT(*) FROM collections WHERE receipt_no LIKE :like",
            ['like' => $like]
        );
        return self::render($pattern, $prefix, [
            'YYYYMMDD' => $ymd,
            'SEQ5' => str_pad((string)($count + 1), 5, '0', STR_PAD_LEFT),
        ]);
    }

    private static function render(string $pattern, string $prefix, array $tokens): string
    {
        $out = str_replace('{PREFIX}', $prefix, $pattern);
        foreach ($tokens as $k => $v) {
            $out = str_replace('{' . $k . '}', $v, $out);
        }
        return $out;
    }
}
