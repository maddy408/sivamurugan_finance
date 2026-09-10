<?php
namespace App\Services;

use App\Core\Database;
use App\Support\BusinessDate;
use App\Support\Money;

/**
 * Backend-authoritative fine engine. Fine is always computed here - never
 * trusted from the client. Rules are effective-dated and fully configurable
 * via the fine_settings table.
 *
 *   overdue_days = max(0, collection_date - due_date - grace_days)
 *   fine        = formula(fine_type, rate) applied to overdue_days
 *   fine        = min(fine, configured cap)
 */
final class FineService
{
    /**
     * @param array $installment  installments row
     * @param string $asOfYmd     date the fine is evaluated for (usually collection date)
     * @return array{
     *   overdue_days:int, fine_type:string, computed_fine:string,
     *   cap:string|null, setting_id:int|null,
     *   outstanding_fine:string
     * }
     */
    public static function compute(array $installment, string $asOfYmd): array
    {
        $setting = self::activeSetting($asOfYmd);

        $due  = BusinessDate::parse($installment['due_date']);
        $asOf = BusinessDate::parse($asOfYmd);
        $rawDays = BusinessDate::diffDays($due, $asOf);
        $grace = (int)($setting['grace_days'] ?? 0);
        $overdueDays = max(0, $rawDays - $grace);

        $payable = Money::of($installment['payable_amount']);
        $balance = Money::of($installment['balance_amount']);
        $type = $setting['fine_type'] ?? 'NONE';
        $rate = (string)($setting['rate_value'] ?? '0');

        $fine = '0.00';
        if ($overdueDays > 0 && $type !== 'NONE') {
            switch ($type) {
                case 'FIXED_PER_DAY':
                    $fine = Money::mul($rate, $overdueDays);
                    break;
                case 'PERCENT_PER_DAY':
                    // percent per day of the outstanding balance
                    $perDay = Money::mul(Money::div($balance, 100), $rate);
                    $fine = Money::mul($perDay, $overdueDays);
                    break;
                case 'FIXED_PER_INSTALLMENT':
                    $fine = Money::of($rate);
                    break;
            }
        }

        // Cap
        $cap = null;
        $capType = $setting['max_fine_type'] ?? 'none';
        if ($capType === 'percent_of_payable') {
            $cap = Money::mul(Money::div($payable, 100), (string)($setting['max_fine_value'] ?? '0'));
        } elseif ($capType === 'flat') {
            $cap = Money::of($setting['max_fine_value'] ?? '0');
        }
        if ($cap !== null && Money::gt($fine, $cap)) {
            $fine = $cap;
        }

        $alreadySettled = Money::add($installment['fine_paid'] ?? 0, $installment['fine_waived'] ?? 0);
        $outstanding = Money::max(Money::sub($fine, $alreadySettled), 0);

        return [
            'overdue_days'     => $overdueDays,
            'fine_type'        => $type,
            'computed_fine'    => Money::of($fine),
            'cap'              => $cap !== null ? Money::of($cap) : null,
            'setting_id'       => isset($setting['id']) ? (int)$setting['id'] : null,
            'outstanding_fine' => Money::of($outstanding),
        ];
    }

    /** The fine_settings row in force on a given date (latest effective_from <= date, active). */
    public static function activeSetting(string $asOfYmd): array
    {
        $row = Database::instance()->fetch(
            'SELECT * FROM fine_settings
             WHERE active = 1 AND effective_from <= :d
             ORDER BY effective_from DESC, id DESC LIMIT 1',
            ['d' => $asOfYmd]
        );
        return $row ?: [
            'id' => null, 'fine_type' => 'NONE', 'rate_value' => '0',
            'grace_days' => 0, 'max_fine_type' => 'none', 'max_fine_value' => '0',
        ];
    }
}
