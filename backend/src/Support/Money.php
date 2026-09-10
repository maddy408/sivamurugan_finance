<?php
namespace App\Support;

/**
 * Currency-safe arithmetic at 2 decimal places. Uses bcmath when available,
 * otherwise a scaled-integer fallback. Never rely on raw float math for money.
 */
final class Money
{
    private const SCALE = 2;

    public static function of($v): string
    {
        if (function_exists('bcadd')) {
            return bcadd((string)$v, '0', self::SCALE);
        }
        return number_format((float)$v, self::SCALE, '.', '');
    }

    public static function add($a, $b): string
    {
        return function_exists('bcadd')
            ? bcadd(self::of($a), self::of($b), self::SCALE)
            : self::of((float)self::of($a) + (float)self::of($b));
    }

    public static function sub($a, $b): string
    {
        return function_exists('bcsub')
            ? bcsub(self::of($a), self::of($b), self::SCALE)
            : self::of((float)self::of($a) - (float)self::of($b));
    }

    public static function mul($a, $b): string
    {
        return function_exists('bcmul')
            ? bcmul(self::of($a), (string)$b, self::SCALE)
            : self::of((float)self::of($a) * (float)$b);
    }

    public static function div($a, $b): string
    {
        if ((float)$b == 0.0) {
            return self::of(0);
        }
        return function_exists('bcdiv')
            ? bcdiv(self::of($a), (string)$b, self::SCALE)
            : self::of((float)self::of($a) / (float)$b);
    }

    /** -1, 0, 1 */
    public static function cmp($a, $b): int
    {
        if (function_exists('bccomp')) {
            return bccomp(self::of($a), self::of($b), self::SCALE);
        }
        $d = (float)self::of($a) - (float)self::of($b);
        return $d < -0.001 ? -1 : ($d > 0.001 ? 1 : 0);
    }

    public static function isZero($a): bool  { return self::cmp($a, 0) === 0; }
    public static function gt($a, $b): bool  { return self::cmp($a, $b) === 1; }
    public static function gte($a, $b): bool { return self::cmp($a, $b) >= 0; }
    public static function lt($a, $b): bool  { return self::cmp($a, $b) === -1; }
    public static function lte($a, $b): bool { return self::cmp($a, $b) <= 0; }

    public static function max($a, $b): string { return self::gte($a, $b) ? self::of($a) : self::of($b); }
    public static function min($a, $b): string { return self::lte($a, $b) ? self::of($a) : self::of($b); }
}
