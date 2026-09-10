<?php
namespace App\Services;

use App\Core\App;
use App\Core\Database;
use App\Support\BusinessDate;
use App\Support\Money;

/**
 * Deterministic, idempotent installment schedule generation.
 *
 * - Due dates are computed in the business timezone (Asia/Kolkata).
 * - Idempotency is guaranteed by the UNIQUE (loan_id, installment_no) key plus
 *   INSERT ... ON DUPLICATE KEY handling: existing rows are never duplicated and
 *   paid / partially-paid rows are never rewritten.
 */
final class ScheduleService
{
    /**
     * Generate (or top up) the full schedule for a loan. Safe to call repeatedly.
     *
     * @return array{created:int,updated:int,skipped_paid:int,installments:array}
     */
    public static function generate(int $loanId): array
    {
        $db = Database::instance();
        $loan = $db->fetch('SELECT * FROM loans_or_chits WHERE id = :id', ['id' => $loanId]);
        if (!$loan) {
            throw \App\Core\HttpException::notFound('Loan/chit not found');
        }

        $tenure = (int)$loan['tenure'];
        $breakdown = EmiService::breakdown($loan);
        $dueDates  = self::computeDueDates($loan, $tenure);

        $existing = [];
        foreach ($db->fetchAll('SELECT * FROM installments WHERE loan_id = :l', ['l' => $loanId]) as $row) {
            $existing[(int)$row['installment_no']] = $row;
        }

        $created = 0; $updated = 0; $skippedPaid = 0;

        $db->transaction(function ($db) use (
            $loanId, $tenure, $breakdown, $dueDates, $existing, &$created, &$updated, &$skippedPaid
        ) {
            for ($n = 1; $n <= $tenure; $n++) {
                $plan = $breakdown['per_installment'][$n - 1];
                $due  = $dueDates[$n - 1];
                $payable = $plan['payable_amount'];

                if (!isset($existing[$n])) {
                    $db->insert('installments', [
                        'loan_id'        => $loanId,
                        'installment_no' => $n,
                        'due_date'       => $due,
                        'emi_amount'     => $plan['emi_amount'],
                        'other_charges'  => $plan['other_charges'],
                        'payable_amount' => $payable,
                        'paid_amount'    => '0.00',
                        'fine_accrued'   => '0.00',
                        'fine_paid'      => '0.00',
                        'fine_waived'    => '0.00',
                        'balance_amount' => $payable,
                        'status'         => 'PENDING',
                        'created_at'     => BusinessDate::utcNow(),
                        'updated_at'     => BusinessDate::utcNow(),
                    ]);
                    $created++;
                    continue;
                }

                // Row exists: only adjust FUTURE, untouched installments.
                $row = $existing[$n];
                $touched = Money::gt($row['paid_amount'], 0) || Money::gt($row['fine_paid'], 0)
                    || in_array($row['status'], ['PARTIAL', 'COMPLETED'], true);
                if ($touched) {
                    $skippedPaid++;
                    continue;
                }
                $changed = $row['due_date'] !== $due
                    || Money::cmp($row['emi_amount'], $plan['emi_amount']) !== 0
                    || Money::cmp($row['other_charges'], $plan['other_charges']) !== 0
                    || Money::cmp($row['payable_amount'], $payable) !== 0;
                if ($changed) {
                    $db->update('installments', [
                        'due_date'       => $due,
                        'emi_amount'     => $plan['emi_amount'],
                        'other_charges'  => $plan['other_charges'],
                        'payable_amount' => $payable,
                        'balance_amount' => $payable,
                        'updated_at'     => BusinessDate::utcNow(),
                    ], 'id = :id', ['id' => $row['id']]);
                    $updated++;
                }
            }
        });

        self::refreshOverdue($loanId);

        return [
            'created'      => $created,
            'updated'      => $updated,
            'skipped_paid' => $skippedPaid,
            'installments' => $db->fetchAll(
                'SELECT * FROM installments WHERE loan_id = :l ORDER BY installment_no', ['l' => $loanId]
            ),
        ];
    }

    /**
     * Recompute PENDING -> OVERDUE (and back) based on today's business date.
     * Never changes PARTIAL/COMPLETED. Also marks PARTIAL rows OVERDUE-eligible
     * via status stays PARTIAL (partial + past due is still collectible).
     */
    public static function refreshOverdue(int $loanId): void
    {
        $today = BusinessDate::fmt(BusinessDate::today());
        Database::instance()->run(
            "UPDATE installments
                SET status = CASE
                    WHEN balance_amount <= 0 THEN 'COMPLETED'
                    WHEN paid_amount > 0 THEN 'PARTIAL'
                    WHEN due_date < :today THEN 'OVERDUE'
                    ELSE 'PENDING'
                END,
                updated_at = :now
              WHERE loan_id = :l AND status <> 'COMPLETED'",
            ['today' => $today, 'now' => BusinessDate::utcNow(), 'l' => $loanId]
        );
    }

    /**
     * @return string[] list of Y-m-d due dates, length = $count
     */
    public static function computeDueDates(array $loan, int $count): array
    {
        $type     = $loan['schedule_type'] ?? 'WEEKLY';
        $cfg      = $loan['schedule_config'] ? json_decode($loan['schedule_config'], true) : [];
        $settings = App::setting('schedule', []);
        $start    = BusinessDate::parse($loan['start_date']);

        // COLLECTION DAY IS OPTIONAL.
        // A weekday is used ONLY when this chit explicitly carries one in its own
        // schedule_config (1..7 ISO). There is no global "Monday" fallback: if no
        // day was chosen the schedule simply runs from the start date.
        $rawWeekday = $cfg['weekday'] ?? null;
        $weekday = ($rawWeekday !== null && $rawWeekday !== '' && (int)$rawWeekday >= 1 && (int)$rawWeekday <= 7)
            ? (int)$rawWeekday
            : null;
        $cycleWeeks = (int)($cfg['cycle_weeks'] ?? $settings['monthly_cycle_weeks'] ?? 4);
        $intervalDays = (int)($cfg['interval_days'] ?? $settings['monthly_interval_days'] ?? 30);

        $dates = [];

        switch ($type) {
            case 'DAILY':
                // One installment per calendar day starting on start_date.
                for ($i = 0; $i < $count; $i++) {
                    $dates[] = BusinessDate::fmt(BusinessDate::addDays($start, $i));
                }
                break;

            case 'WEEKLY':
                // Optional weekday: snap the first due to it when chosen, else
                // start on the chit's start date and repeat every 7 days.
                $first = $weekday ? BusinessDate::onOrAfterWeekday($start, $weekday) : $start;
                for ($i = 0; $i < $count; $i++) {
                    $dates[] = BusinessDate::fmt(BusinessDate::addDays($first, $i * 7));
                }
                break;

            case 'MONTHLY_WEEKDAY':
                // "first <weekday>, then every Nth <weekday>" — weekday still optional.
                $first = $weekday ? BusinessDate::onOrAfterWeekday($start, $weekday) : $start;
                for ($i = 0; $i < $count; $i++) {
                    $dates[] = BusinessDate::fmt(BusinessDate::addDays($first, $i * 7 * $cycleWeeks));
                }
                break;

            case 'MONTHLY_INTERVAL':
                for ($i = 0; $i < $count; $i++) {
                    $dates[] = BusinessDate::fmt(BusinessDate::addDays($start, $i * $intervalDays));
                }
                break;

            case 'MONTHLY_DAILY':
            default:
                // Calendar-monthly nominal due dates; the collection UI still shows
                // every open installment on any day (see CollectionController).
                $anchorDay = (int)$start->format('d');
                for ($i = 0; $i < $count; $i++) {
                    $d = $start->modify("first day of +$i month");
                    $daysInMonth = (int)$d->format('t');
                    $day = min($anchorDay, $daysInMonth);
                    $dates[] = $d->modify('+' . ($day - 1) . ' days')->format('Y-m-d');
                }
                break;
        }

        return $dates;
    }
}
