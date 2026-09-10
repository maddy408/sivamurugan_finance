<?php
namespace App\Support;

/**
 * Streams a CSV file (UTF-8 with BOM so Excel opens it cleanly) built from the
 * full filtered result set - never just the current page. Ends the request.
 */
final class Csv
{
    /**
     * @param string        $filename  download name, e.g. "expenses_2026-09.csv"
     * @param array<int,string> $headers column headers
     * @param iterable       $rows      each row = array of scalars in header order
     * @param array<int,array> $summary  optional leading summary lines (arrays of scalars)
     */
    public static function stream(string $filename, array $headers, iterable $rows, array $summary = []): void
    {
        while (ob_get_level() > 0) {
            ob_end_clean();
        }
        header('Content-Type: text/csv; charset=utf-8');
        header('Content-Disposition: attachment; filename="' . $filename . '"');
        header('Cache-Control: no-store');

        $out = fopen('php://output', 'w');
        fwrite($out, "\xEF\xBB\xBF"); // UTF-8 BOM

        foreach ($summary as $line) {
            fputcsv($out, $line);
        }
        if ($summary) {
            fputcsv($out, []);
        }
        fputcsv($out, $headers);
        foreach ($rows as $row) {
            fputcsv($out, array_map(static function ($v) {
                return $v === null ? '' : (is_bool($v) ? ($v ? '1' : '0') : (string)$v);
            }, $row));
        }
        fclose($out);
        exit;
    }
}
