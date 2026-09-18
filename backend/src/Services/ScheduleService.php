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

        // Custom-schedule chits never get backend-generated/adjusted due dates -
        // every installment row is added manually (see LoanController's
        // addCustomInstallment/updateCustomInstallment). Calling generate() on one
        // (e.g. from the generic "regenerate schedule" or loan-edit flows) is a
        // safe no-op rather than an error, since those call sites don't know or
        // care which mode a given chit uses.
        if (($loan['due_date_mode'] ?? 'auto') === 'custom') {
            return [
                'created' => 0, 'updated' => 0, 'skipped_paid' => 0,
                'installments' => $db->fetchAll(
                    'SELECT * FROM installments WHERE loan_id = :l ORDER BY installment_no', ['l' => $loanId]
                ),
            ];
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
     * Add one manually-entered installment row for a 'custom' due_date_mode chit.
     * Never called for 'auto' chits (guarded by the controller/here).
     */
    public static function addCustomInstallment(int $loanId, array $in): array
    {
        $db = Database::instance();
        $loan = $db->fetch('SELECT * FROM loans_or_chits WHERE id = :id AND deleted_at IS NULL', ['id' => $loanId]);
        if (!$loan) {
            throw \App\Core\HttpException::notFound('Chit not found');
        }
        if (($loan['due_date_mode'] ?? 'auto') !== 'custom') {
            throw \App\Core\HttpException::conflict('This chit uses an automatic schedule; custom installments are not allowed');
        }
        $no = (int)$in['installment_no'];
        if ($db->scalar('SELECT 1 FROM installments WHERE loan_id = :l AND installment_no = :n', ['l' => $loanId, 'n' => $no])) {
            throw \App\Core\HttpException::validation(['installment_no' => ["Installment #$no already exists for this chit."]]);
        }
        $payable = Money::of($in['payable_amount']);
        $paid    = Money::of($in['paid_amount'] ?? 0);
        if (Money::gt($paid, $payable)) {
            throw \App\Core\HttpException::validation(['paid_amount' => ['Amount paid cannot exceed the amount due.']]);
        }
        $balance = Money::max(Money::sub($payable, $paid), 0);
        $status  = $in['status'] ?? CollectionService::deriveStatus($balance, $paid, $in['due_date']);

        $id = $db->insert('installments', [
            'loan_id'        => $loanId,
            'installment_no' => $no,
            'due_date'       => $in['due_date'],
            'emi_amount'     => $payable,
            'other_charges'  => '0.00',
            'payable_amount' => $payable,
            'paid_amount'    => $paid,
            'fine_accrued'   => '0.00',
            'fine_paid'      => '0.00',
            'fine_waived'    => '0.00',
            'balance_amount' => $balance,
            'last_paid_date' => Money::gt($paid, 0) ? ($in['paid_date'] ?? $in['due_date']) : null,
            'status'         => $status,
            'created_at'     => BusinessDate::utcNow(),
            'updated_at'     => BusinessDate::utcNow(),
        ]);
        return $db->fetch('SELECT * FROM installments WHERE id = :id', ['id' => $id]);
    }

    /**
     * Edit a manually-entered installment row. Refused once a real collection has
     * been posted against it - that row's paid/balance are then driven by
     * CollectionService, not by this manual-entry form.
     */
    public static function updateCustomInstallment(int $loanId, int $instId, array $in): array
    {
        $db = Database::instance();
        $loan = $db->fetch('SELECT * FROM loans_or_chits WHERE id = :id AND deleted_at IS NULL', ['id' => $loanId]);
        if (!$loan) {
            throw \App\Core\HttpException::notFound('Chit not found');
        }
        if (($loan['due_date_mode'] ?? 'auto') !== 'custom') {
            throw \App\Core\HttpException::conflict('This chit uses an automatic schedule; custom installments are not allowed');
        }
        $row = $db->fetch('SELECT * FROM installments WHERE id = :id AND loan_id = :l', ['id' => $instId, 'l' => $loanId]);
        if (!$row) {
            throw \App\Core\HttpException::notFound('Installment not found');
        }
        if ($db->scalar('SELECT 1 FROM collection_allocations WHERE installment_id = :i', ['i' => $instId])) {
            throw \App\Core\HttpException::conflict('This installment already has a real collection recorded against it - edit it from Collection History instead.');
        }

        $installmentNo = (int) $row['installment_no'];
        if (array_key_exists('installment_no', $in) && $in['installment_no'] !== null) {
            $newNo = (int) $in['installment_no'];
            if ($newNo !== $installmentNo) {
                if ($db->scalar('SELECT 1 FROM installments WHERE loan_id = :l AND installment_no = :n AND id <> :id', ['l' => $loanId, 'n' => $newNo, 'id' => $instId])) {
                    throw \App\Core\HttpException::validation(['installment_no' => ["Installment #$newNo already exists for this chit."]]);
                }
                $installmentNo = $newNo;
            }
        }

        $payable = array_key_exists('payable_amount', $in) && $in['payable_amount'] !== null ? Money::of($in['payable_amount']) : Money::of($row['payable_amount']);
        $paid    = array_key_exists('paid_amount', $in) && $in['paid_amount'] !== null ? Money::of($in['paid_amount']) : Money::of($row['paid_amount']);
        if (Money::gt($paid, $payable)) {
            throw \App\Core\HttpException::validation(['paid_amount' => ['Amount paid cannot exceed the amount due.']]);
        }
        $dueDate = $in['due_date'] ?? $row['due_date'];
        $balance = Money::max(Money::sub($payable, $paid), 0);
        $status  = $in['status'] ?? CollectionService::deriveStatus($balance, $paid, $dueDate);

        $db->update('installments', [
            'installment_no' => $installmentNo,
            'due_date'       => $dueDate,
            'emi_amount'     => $payable,
            'payable_amount' => $payable,
            'paid_amount'    => $paid,
            'balance_amount' => $balance,
            'last_paid_date' => Money::gt($paid, 0) ? ($in['paid_date'] ?? $row['last_paid_date'] ?? $dueDate) : null,
            'status'         => $status,
            'updated_at'     => BusinessDate::utcNow(),
        ], 'id = :id', ['id' => $instId]);

        return $db->fetch('SELECT * FROM installments WHERE id = :id', ['id' => $instId]);
    }

    /**
     * Delete a manually-entered installment row. Refused (409) once a real
     * collection has been posted against it, exactly like the edit guard -
     * deleting it would silently corrupt that collection's allocation
     * history. Staff must cancel/delete the collection(s) first if they
     * genuinely need to remove the due.
     */
    public static function deleteCustomInstallment(int $loanId, int $instId): void
    {
        $db = Database::instance();
        $loan = $db->fetch('SELECT * FROM loans_or_chits WHERE id = :id AND deleted_at IS NULL', ['id' => $loanId]);
        if (!$loan) {
            throw \App\Core\HttpException::notFound('Chit not found');
        }
        if (($loan['due_date_mode'] ?? 'auto') !== 'custom') {
            throw \App\Core\HttpException::conflict('This chit uses an automatic schedule; custom installments are not allowed');
        }
        $row = $db->fetch('SELECT * FROM installments WHERE id = :id AND loan_id = :l', ['id' => $instId, 'l' => $loanId]);
        if (!$row) {
            throw \App\Core\HttpException::notFound('Installment not found');
        }
        if ($db->scalar('SELECT 1 FROM collection_allocations WHERE installment_id = :i', ['i' => $instId])) {
            throw \App\Core\HttpException::conflict('This installment already has a real collection recorded against it - cancel/delete that collection first.');
        }
        $db->run('DELETE FROM installments WHERE id = :id', ['id' => $instId]);
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
