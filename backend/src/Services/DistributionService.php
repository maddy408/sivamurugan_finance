<?php
namespace App\Services;

use App\Core\Database;
use App\Core\HttpException;
use App\Support\Audit;
use App\Support\BusinessDate;
use App\Support\Money;

/**
 * Actual chit distributions (money handed to the customer).
 *
 *   - Creating a chit moves NO money.
 *   - A distribution row is the ONLY thing that:
 *       * decreases the selected Office Cash / Bank account
 *         (via FinanceService, which subtracts SUM(distributions.amount) where status='active')
 *       * increases the dashboard "Distributed Amount"
 *       * can raise/lower the chit's CURRENT EMI (new_emi_amount, applied to future installments)
 *
 * Balances are derived, never stored, so editing an amount / switching the account /
 * cancelling all reconcile automatically - there is no manual delta bookkeeping.
 */
final class DistributionService
{
    private const ACTIVE = "status = 'active' AND deleted_at IS NULL";

    /** Distribution summary for the chit detail page. */
    public static function summary(int $loanId): array
    {
        $db = Database::instance();
        $loan = $db->fetch('SELECT * FROM loans_or_chits WHERE id = :id', ['id' => $loanId]);
        if (!$loan) {
            throw HttpException::notFound('Chit not found');
        }
        $chit      = Money::of($loan['principal_amount']);
        $total     = Money::of((float)$db->scalar(
            "SELECT COALESCE(SUM(amount),0) FROM distributions WHERE loan_id = :l AND " . self::ACTIVE,
            ['l' => $loanId]
        ));
        $remaining = Money::max(Money::sub($chit, $total), 0);
        $status = Money::isZero($total) ? 'not_distributed'
            : (Money::gte($total, $chit) ? 'fully_distributed' : 'partially_distributed');

        return [
            'chit_amount'            => $chit,
            'total_distributed'      => $total,
            'remaining_undistributed'=> $remaining,
            'initial_emi'            => Money::of($loan['initial_emi_amount'] ?: $loan['installment_amount']),
            'current_emi'            => Money::of($loan['installment_amount']),
            'status'                 => $status,
        ];
    }

    /** History rows for the chit detail page / modal log. */
    public static function listFor(int $loanId): array
    {
        return Database::instance()->fetchAll(
            "SELECT d.id, d.distributed_date, d.amount, d.account_id, a.name AS account_name, a.type AS account_type,
                    d.new_emi_amount, d.remarks, d.status, d.cancelled_at, d.cancel_reason, d.created_at,
                    u.name AS created_by_name
               FROM distributions d
               LEFT JOIN accounts a ON a.id = d.account_id
               LEFT JOIN users u ON u.id = d.created_by
              WHERE d.loan_id = :l AND d.deleted_at IS NULL
              ORDER BY d.distributed_date ASC, d.id ASC",
            ['l' => $loanId]
        );
    }

    /** Global list (reports / audit). */
    public static function listAll(array $where = [], array $params = [], int $limit = 500): array
    {
        $where[] = 'd.deleted_at IS NULL';
        $sql = "SELECT d.*, a.name AS account_name, a.type AS account_type,
                       l.code AS chit_code, c.name AS customer_name, c.customer_code
                  FROM distributions d
                  LEFT JOIN accounts a ON a.id = d.account_id
                  JOIN loans_or_chits l ON l.id = d.loan_id
                  JOIN customers c ON c.id = d.customer_id
                 WHERE " . implode(' AND ', $where) . "
                 ORDER BY d.distributed_date DESC, d.id DESC
                 LIMIT " . (int)$limit;
        return Database::instance()->fetchAll($sql, $params);
    }

    /**
     * Record an actual distribution. This is the ONLY place money leaves an account.
     */
    public static function create(array $user, int $loanId, array $in): array
    {
        $db = Database::instance();
        return $db->transaction(function ($db) use ($user, $loanId, $in) {
            $loan = $db->fetch('SELECT * FROM loans_or_chits WHERE id = :id AND deleted_at IS NULL', ['id' => $loanId]);
            if (!$loan) {
                throw HttpException::notFound('Chit not found');
            }
            if (in_array($loan['status'], ['cancelled'], true)) {
                throw HttpException::conflict('A cancelled chit cannot be distributed');
            }

            $amount  = self::assertAmount($in['amount'] ?? null);
            $account = self::assertAccount($db, $in['account_id'] ?? null);
            $date    = $in['distributed_date'] ?: BusinessDate::fmt(BusinessDate::today());
            $newEmi  = self::normEmi($in['new_emi_amount'] ?? null);

            $already = Money::of((float)$db->scalar(
                "SELECT COALESCE(SUM(amount),0) FROM distributions WHERE loan_id = :l AND " . self::ACTIVE,
                ['l' => $loanId]
            ));
            $remaining = Money::sub($loan['principal_amount'], $already);
            if (Money::gt($amount, $remaining)) {
                throw HttpException::validation(['amount' => [
                    'Distribution (' . $amount . ') exceeds the remaining undistributed balance (' . Money::max($remaining, 0) . ').'
                ]]);
            }

            $id = $db->insert('distributions', [
                'loan_id'          => $loanId,
                'customer_id'      => (int)$loan['customer_id'],
                'distributed_date' => $date,
                'amount'           => $amount,
                'account_id'       => (int)$account['id'],
                'new_emi_amount'   => $newEmi,
                'remarks'          => $in['remarks'] ?? null,
                'status'           => 'active',
                'created_by'       => $user['id'],
                'created_at'       => BusinessDate::utcNow(),
                'updated_at'       => BusinessDate::utcNow(),
            ]);

            self::syncLoanEmi($loanId);

            TransactionService::record([
                'txn_date'       => $date,
                'txn_type'       => 'distribution',
                'direction'      => 'debit',
                'amount'         => $amount,
                'account_id'     => (int)$account['id'],
                'customer_id'    => (int)$loan['customer_id'],
                'loan_id'        => $loanId,
                'reference_type' => 'distribution',
                'reference_id'   => $id,
                'remarks'        => $in['remarks'] ?? null,
                'created_by'     => $user['id'],
            ]);

            Audit::log('distribution.create', 'distributions', 'distribution', $id, null,
                ['loan_id' => $loanId, 'amount' => $amount, 'account_id' => (int)$account['id'], 'new_emi_amount' => $newEmi],
                $in['remarks'] ?? null, ['id' => $user['id'], 'role_code' => $user['role_code']]);

            return self::detail($id);
        });
    }

    /**
     * Edit a live distribution. Because balances are derived from the current row
     * values, changing amount / account / EMI just changes what gets summed - only
     * the net difference is ever reflected in Office Cash / Bank.
     */
    public static function update(array $user, int $id, array $in): array
    {
        $db = Database::instance();
        return $db->transaction(function ($db) use ($user, $id, $in) {
            $row = $db->fetch('SELECT * FROM distributions WHERE id = :id AND deleted_at IS NULL', ['id' => $id]);
            if (!$row) {
                throw HttpException::notFound('Distribution not found');
            }
            if ($row['status'] !== 'active') {
                throw HttpException::conflict('A cancelled distribution cannot be edited');
            }
            $loan = $db->fetch('SELECT * FROM loans_or_chits WHERE id = :id', ['id' => (int)$row['loan_id']]);

            $fields = [];
            if (array_key_exists('amount', $in) && $in['amount'] !== null) {
                $fields['amount'] = self::assertAmount($in['amount']);
            }
            if (array_key_exists('account_id', $in) && $in['account_id'] !== null) {
                $fields['account_id'] = (int)self::assertAccount($db, $in['account_id'])['id'];
            }
            if (array_key_exists('distributed_date', $in) && $in['distributed_date']) {
                $fields['distributed_date'] = $in['distributed_date'];
            }
            if (array_key_exists('new_emi_amount', $in)) {
                $fields['new_emi_amount'] = self::normEmi($in['new_emi_amount']);
            }
            if (array_key_exists('remarks', $in)) {
                $fields['remarks'] = $in['remarks'] !== '' ? $in['remarks'] : null;
            }
            if (!$fields) {
                throw HttpException::validation(['_' => ['Nothing to update']]);
            }

            // Re-validate the total against the chit amount, excluding THIS row's old value.
            $newAmount = $fields['amount'] ?? $row['amount'];
            $othersTotal = Money::of((float)$db->scalar(
                "SELECT COALESCE(SUM(amount),0) FROM distributions
                  WHERE loan_id = :l AND id <> :id AND " . self::ACTIVE,
                ['l' => (int)$row['loan_id'], 'id' => $id]
            ));
            if (Money::gt(Money::add($othersTotal, $newAmount), $loan['principal_amount'])) {
                $remaining = Money::max(Money::sub($loan['principal_amount'], $othersTotal), 0);
                throw HttpException::validation(['amount' => [
                    'Distribution (' . $newAmount . ') exceeds the remaining undistributed balance (' . $remaining . ').'
                ]]);
            }

            $fields['updated_at'] = BusinessDate::utcNow();
            $db->update('distributions', $fields, 'id = :id', ['id' => $id]);

            self::syncLoanEmi((int)$row['loan_id']);

            $newDate = $fields['distributed_date'] ?? $row['distributed_date'];
            TransactionService::record([
                'txn_date'       => $newDate,
                'txn_type'       => 'distribution',
                'direction'      => 'debit',
                'amount'         => $newAmount,
                'account_id'     => $fields['account_id'] ?? (int)$row['account_id'],
                'customer_id'    => (int)$row['customer_id'],
                'loan_id'        => (int)$row['loan_id'],
                'reference_type' => 'distribution',
                'reference_id'   => $id,
                'remarks'        => $fields['remarks'] ?? $row['remarks'],
                'created_by'     => $row['created_by'],
            ]);

            Audit::log('distribution.update', 'distributions', 'distribution', $id,
                ['amount' => $row['amount'], 'account_id' => (int)$row['account_id'], 'new_emi_amount' => $row['new_emi_amount']],
                $fields, null, ['id' => $user['id'], 'role_code' => $user['role_code']]);

            return self::detail($id);
        });
    }

    /**
     * Cancel a live distribution: the money returns to its account automatically
     * (it stops being summed) and the chit's CURRENT EMI is recomputed from the
     * remaining active distribution history - never blindly reset.
     */
    public static function cancel(array $user, int $id, ?string $reason): array
    {
        $db = Database::instance();
        return $db->transaction(function ($db) use ($user, $id, $reason) {
            $row = $db->fetch('SELECT * FROM distributions WHERE id = :id AND deleted_at IS NULL', ['id' => $id]);
            if (!$row) {
                throw HttpException::notFound('Distribution not found');
            }
            if ($row['status'] !== 'active') {
                throw HttpException::conflict('Distribution is already cancelled');
            }
            $db->update('distributions', [
                'status'        => 'cancelled',
                'cancelled_by'  => $user['id'],
                'cancelled_at'  => BusinessDate::utcNow(),
                'cancel_reason' => $reason,
                'updated_at'    => BusinessDate::utcNow(),
            ], 'id = :id', ['id' => $id]);

            self::syncLoanEmi((int)$row['loan_id']);

            TransactionService::cancelFor('distribution', $id, $user['id']);

            Audit::log('distribution.cancel', 'distributions', 'distribution', $id,
                ['status' => 'active', 'amount' => $row['amount']], ['status' => 'cancelled'],
                $reason, ['id' => $user['id'], 'role_code' => $user['role_code']]);

            return self::detail($id);
        });
    }

    // ---------------------------------------------------------------------------

    /**
     * Set the chit's CURRENT EMI = the newest active distribution that carries a
     * new_emi_amount (ordered by date, then id); otherwise the frozen initial EMI.
     * Future, untouched installments are regenerated; paid/partial rows are frozen.
     */
    private static function syncLoanEmi(int $loanId): void
    {
        $db = Database::instance();
        $loan = $db->fetch('SELECT * FROM loans_or_chits WHERE id = :id', ['id' => $loanId]);
        if (!$loan) {
            return;
        }
        $baseline = Money::of($loan['initial_emi_amount'] ?: $loan['installment_amount']);
        $latest = $db->scalar(
            "SELECT new_emi_amount FROM distributions
              WHERE loan_id = :l AND new_emi_amount IS NOT NULL AND " . self::ACTIVE . "
              ORDER BY distributed_date DESC, id DESC LIMIT 1",
            ['l' => $loanId]
        );
        $target = $latest !== null ? Money::of($latest) : $baseline;

        if (Money::cmp($target, $loan['installment_amount']) !== 0) {
            $db->update('loans_or_chits', [
                'installment_amount' => $target,
                'emi_amount'         => $target,
                'updated_at'         => BusinessDate::utcNow(),
            ], 'id = :id', ['id' => $loanId]);
            ScheduleService::generate($loanId);
        }
    }

    private static function assertAmount($v): string
    {
        if ($v === null || $v === '' || !is_numeric($v) || (float)$v <= 0) {
            throw HttpException::validation(['amount' => ['Distributed amount must be a number greater than 0.']]);
        }
        return Money::of($v);
    }

    private static function normEmi($v): ?string
    {
        if ($v === null || $v === '') {
            return null;
        }
        if (!is_numeric($v) || (float)$v <= 0) {
            throw HttpException::validation(['new_emi_amount' => ['New EMI amount must be a number greater than 0.']]);
        }
        return Money::of($v);
    }

    private static function assertAccount(Database $db, $accountId): array
    {
        $acc = $accountId
            ? $db->fetch('SELECT * FROM accounts WHERE id = :id AND is_active = 1', ['id' => (int)$accountId])
            : null;
        if (!$acc) {
            throw HttpException::validation(['account_id' => ['Choose the Office Cash or Bank account the money comes from.']]);
        }
        return $acc;
    }

    private static function detail(int $id): array
    {
        return Database::instance()->fetch(
            "SELECT d.*, a.name AS account_name, a.type AS account_type
               FROM distributions d LEFT JOIN accounts a ON a.id = d.account_id
              WHERE d.id = :id",
            ['id' => $id]
        );
    }
}
