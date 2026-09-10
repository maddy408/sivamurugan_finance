<?php
namespace App\Support;

/**
 * All schedule / due-date / overdue math is done in the business timezone
 * (Asia/Kolkata by default). Storage timestamps stay UTC.
 */
final class BusinessDate
{
    public static function tz(): \DateTimeZone
    {
        return new \DateTimeZone(\App\Core\App::config()['timezone'] ?? 'Asia/Kolkata');
    }

    public static function today(): \DateTimeImmutable
    {
        return (new \DateTimeImmutable('now', self::tz()))->setTime(0, 0, 0);
    }

    public static function parse(string $ymd): \DateTimeImmutable
    {
        return (new \DateTimeImmutable($ymd, self::tz()))->setTime(0, 0, 0);
    }

    public static function fmt(\DateTimeInterface $d): string
    {
        return $d->format('Y-m-d');
    }

    /** ISO weekday: 1 = Monday ... 7 = Sunday */
    public static function isoDow(\DateTimeInterface $d): int
    {
        return (int)$d->format('N');
    }

    /**
     * The first date on/after $from that falls on ISO weekday $iso (1..7).
     */
    public static function onOrAfterWeekday(\DateTimeImmutable $from, int $iso): \DateTimeImmutable
    {
        $iso = max(1, min(7, $iso));
        $delta = ($iso - self::isoDow($from) + 7) % 7;
        return $from->modify("+$delta days");
    }

    public static function addDays(\DateTimeImmutable $d, int $n): \DateTimeImmutable
    {
        return $d->modify(($n >= 0 ? '+' : '') . $n . ' days');
    }

    public static function diffDays(\DateTimeImmutable $a, \DateTimeImmutable $b): int
    {
        // b - a in whole days (can be negative)
        return (int)$a->diff($b)->format('%r%a');
    }

    /** UTC "now" string for storage columns. */
    public static function utcNow(): string
    {
        return (new \DateTimeImmutable('now', new \DateTimeZone('UTC')))->format('Y-m-d H:i:s');
    }
}
