<?php
namespace App\Services;

use App\Auth\Guard;
use App\Core\Database;
use App\Core\HttpException;
use App\Support\Audit;
use App\Support\BusinessDate;
use App\Support\Money;

/**
 * All collection posting / cancelling / deleting happens here, each inside ONE
 * DB transaction.
 *
 * CHIT-FUND RULES:
 *  - collections.amount        = the ACTUAL amount the customer paid, verbatim.
 *  - collections.fine_amount   = the manually entered fine (editable, may be 0).
 *  - collections.total_amount  = amount + fine_amount.
 *  - The chit's configured installment_amount is NEVER changed by a collection.
 *  - A payment larger than the current installment's balance is allocated
 *    forward across the next unpaid installments (advance). The full paid amount
 *    is always preserved on the collection row and split across
 *    collection_allocations; it is never truncated to one installment amount.
 *
 * status: posted   -> live (counts toward totals / cash / outstanding)
 *         cancelled -> kept as history, contributes to NOTHING
 *         (deleted_at set -> excluded everywhere)
 */
final class CollectionService
{
    public static function post(array $user, array $payload): array
    {
        $db = Database::instance();

        $idemKey = $payload['idempotency_key'] ?? null;
        if ($idemKey) {
            $existing = $db->fetch('SELECT * FROM collections WHERE idempotency_key = :k', ['k' => $idemKey]);
            if ($existing) {
                $instId = $db->scalar('SELECT installment_id FROM collection_allocations WHERE collection_id = :c ORDER BY id LIMIT 1', ['c' => $existing['id']]);
                return [
                    'collection'        => $existing,
                    'installment'       => $instId ? $db->fetch('SELECT * FROM installments WHERE id = :i', ['i' => $instId]) : null,
                    'loan_summary'      => self::loanSummary((int)$existing['loan_id']),
                    'idempotent_replay' => true,
                ];
            }
        }

        return $db->transaction(function ($db) use ($user, $payload, $idemKey) {
            // Explicit multi-due selection: pay a chosen set of installments (may be
            // non-contiguous). Falls back to the single "installment_id" forward-fill.
            $explicitIds = array_values(array_unique(array_filter(
                array_map('intval', (array)($payload['installment_ids'] ?? [])), fn ($n) => $n > 0
            )));

            if ($explicitIds) {
                $ph = implode(',', array_fill(0, count($explicitIds), '?'));
                $selected = $db->run(
                    "SELECT * FROM installments WHERE id IN ($ph) ORDER BY installment_no FOR UPDATE",
                    $explicitIds
                )->fetchAll(\PDO::FETCH_ASSOC);
                if (count($selected) !== count($explicitIds)) {
                    throw HttpException::validation(['installment_ids' => ['One or more selected dues no longer exist.']]);
                }
                $loanIds = array_unique(array_map(fn ($r) => (int) $r['loan_id'], $selected));
                if (count($loanIds) !== 1) {
                    throw HttpException::validation(['installment_ids' => ['All selected dues must belong to the same chit.']]);
                }
                foreach ($selected as $r) {
                    if ($r['status'] === 'COMPLETED') {
                        throw HttpException::validation(['installment_ids' => ["Due #{$r['installment_no']} is already fully paid."]]);
                    }
                }
                $startInst = $selected[0];
                $explicitSet = $selected;
            } else {
                $startInst = $db->fetch('SELECT * FROM installments WHERE id = :id FOR UPDATE', ['id' => (int)$payload['installment_id']]);
                if (!$startInst) {
                    throw HttpException::notFound('Installment not found');
                }
                $explicitSet = null;
            }

            $loan = $db->fetch('SELECT * FROM loans_or_chits WHERE id = :id FOR UPDATE', ['id' => $startInst['loan_id']]);
            if (!$loan) {
                throw HttpException::notFound('Chit not found');
            }
            if ($loan['deleted_at'] !== null || in_array($loan['status'], ['cancelled', 'deactivated'], true)) {
                throw HttpException::conflict('Chit is ' . ($loan['deleted_at'] ? 'deleted' : $loan['status']) . '; collections are not allowed');
            }

            $collectionDate = $payload['collection_date'];
            $modeId = (int)$payload['payment_mode_id'];
            $mode = $db->fetch('SELECT code FROM payment_modes WHERE id = :id', ['id' => $modeId]);
            $isSplit = $mode && strtoupper($mode['code']) === 'SPLIT';

            // ---- Split payment: Cash + UPI portions of ONE collection ----
            $cashAmount = null; $upiAmount = null; $cashAccountId = null; $upiAccountId = null;
            if ($isSplit) {
                $cashAmount = Money::of($payload['cash_amount'] ?? 0);
                $upiAmount  = Money::of($payload['upi_amount'] ?? 0);
                if (Money::lt($cashAmount, 0) || Money::lt($upiAmount, 0)) {
                    throw HttpException::validation(['cash_amount' => ['Cash and UPI amounts cannot be negative']]);
                }
                if (Money::lte(Money::add($cashAmount, $upiAmount), 0)) {
                    throw HttpException::validation(['cash_amount' => ['Enter a Cash and/or UPI amount greater than 0']]);
                }
                $amount = Money::add($cashAmount, $upiAmount);   // authoritative total, never taken from the client directly

                $cashAccountId = $payload['cash_account_id'] ?? null;
                if (!$cashAccountId) {
                    $cashAccountId = $db->scalar("SELECT id FROM accounts WHERE is_active = 1 AND type = 'cash' ORDER BY id LIMIT 1")
                        ?: $db->scalar("SELECT id FROM accounts WHERE is_active = 1 ORDER BY id LIMIT 1");
                }
                $upiAccountId = $payload['upi_account_id'] ?? null;
                if (!$upiAccountId) {
                    $upiAccountId = $db->scalar("SELECT id FROM accounts WHERE is_active = 1 AND type = 'bank' ORDER BY id LIMIT 1")
                        ?: $cashAccountId;
                }
            } else {
                $amount = Money::of($payload['amount'] ?? 0);          // actual paid, verbatim
            }

            // ---- fine: manual, editable, never merged into the installment ----
            $fineAmount = Money::of($payload['fine_amount'] ?? 0);
            if (Money::gt($fineAmount, 0) && !Guard::can($user, 'collection.create')) {
                throw HttpException::forbidden('Not allowed to record a collection');
            }

            if (Money::lte($amount, 0) && Money::lte($fineAmount, 0)) {
                throw HttpException::validation(['amount' => ['Enter a payment amount greater than 0']]);
            }

            // ---- resolve the account the money lands in (Cash -> Office Cash) ----
            // For a split payment this is just the "primary" account shown on reports;
            // the real per-account balance uses cash_account_id/upi_account_id below.
            $accountId = $isSplit ? $cashAccountId : ($payload['account_id'] ?? null);
            if (!$accountId) {
                $wantType = ($mode && strtoupper($mode['code']) === 'CASH') ? 'cash' : 'bank';
                $accountId = $db->scalar("SELECT id FROM accounts WHERE is_active = 1 AND type = :t ORDER BY id LIMIT 1", ['t' => $wantType])
                    ?: $db->scalar("SELECT id FROM accounts WHERE is_active = 1 ORDER BY id LIMIT 1");
            }

            // ---- receipt number ----
            $receiptNo = CodeGenerator::receiptNo($collectionDate);
            if ($db->scalar('SELECT 1 FROM collections WHERE receipt_no = :r', ['r' => $receiptNo])) {
                $receiptNo .= '-' . substr(bin2hex(random_bytes(2)), 0, 3);
            }

            $total = Money::add($amount, $fineAmount);

            // ---- immutable collection row (actual paid amount preserved) ----
            $collectionId = $db->insert('collections', [
                'receipt_no'      => $receiptNo,
                'loan_id'         => $loan['id'],
                'customer_id'     => $loan['customer_id'],
                'collected_by'    => $user['id'],
                'employee_id'     => $user['employee_id'],
                'location'        => $loan['location'] ?? null,   // denormalised typed location text
                'collection_date' => $collectionDate,
                'amount'          => $amount,        // <-- ACTUAL paid, verbatim
                'cash_amount'     => $cashAmount,
                'upi_amount'      => $upiAmount,
                'fine_amount'     => $fineAmount,
                'other_charges'   => '0.00',
                'total_amount'    => $total,
                'payment_mode_id' => $modeId,
                'account_id'      => $accountId,
                'cash_account_id' => $cashAccountId,
                'upi_account_id'  => $upiAccountId,
                'reference_no'    => $payload['reference_no'] ?? null,
                'remarks'         => $payload['remarks'] ?? null,
                'idempotency_key' => $idemKey,
                'status'          => 'posted',
                'created_at'      => BusinessDate::utcNow(),
            ]);

            // ---- allocate the amount across the target installments ----
            // Explicit multi-due selection -> exactly the chosen dues (in due order),
            // never touching an unselected due in between. Otherwise forward-fill.
            if ($explicitSet !== null) {
                $installments = $explicitSet;
            } else {
                $installments = $db->fetchAll(
                    "SELECT * FROM installments
                     WHERE loan_id = :l AND installment_no >= :n AND status <> 'COMPLETED'
                     ORDER BY installment_no FOR UPDATE",
                    ['l' => $loan['id'], 'n' => (int)$startInst['installment_no']]
                );
                if (!$installments) {
                    $installments = [$startInst]; // paying extra on an already-complete chit -> credit the start row
                }
            }

            $remaining = $amount;
            $touched = [];
            $lastIdx = count($installments) - 1;
            foreach ($installments as $idx => $inst) {
                if (Money::lte($remaining, 0) && $idx > 0) {
                    break;
                }
                $bal = Money::of($inst['balance_amount']);
                $alloc = ($idx === $lastIdx)
                    ? $remaining                              // dump any leftover on the last one (advance credit)
                    : Money::min($remaining, $bal);
                if (Money::lte($alloc, 0)) {
                    continue;
                }
                $fineAlloc = ($idx === 0) ? $fineAmount : '0.00';

                $db->insert('collection_allocations', [
                    'collection_id'   => $collectionId,
                    'installment_id'  => $inst['id'],
                    'principal_alloc' => Money::of($alloc),
                    'fine_alloc'      => Money::of($fineAlloc),
                    'created_at'      => BusinessDate::utcNow(),
                ]);

                $newPaid    = Money::add($inst['paid_amount'], $alloc);
                $newBalance = Money::max(Money::sub($inst['payable_amount'], $newPaid), 0);
                $newFine    = Money::add($inst['fine_paid'], $fineAlloc);
                $db->update('installments', [
                    'paid_amount'    => Money::of($newPaid),
                    'fine_paid'      => Money::of($newFine),
                    'balance_amount' => Money::of($newBalance),
                    'last_paid_date' => $collectionDate,
                    'status'         => self::deriveStatus($newBalance, $newPaid, $inst['due_date']),
                    'updated_at'     => BusinessDate::utcNow(),
                ], 'id = :id', ['id' => $inst['id']]);

                $touched[] = (int)$inst['id'];
                $remaining = Money::sub($remaining, $alloc);
            }

            self::syncLoanStatus($db, (int)$loan['id']);

            TransactionService::record([
                'txn_date'       => $collectionDate,
                'txn_type'       => 'collection',
                'direction'      => 'credit',
                'amount'         => $total,
                'account_id'     => $accountId,
                'customer_id'    => (int)$loan['customer_id'],
                'loan_id'        => (int)$loan['id'],
                'reference_type' => 'collection',
                'reference_id'   => $collectionId,
                'remarks'        => $payload['remarks'] ?? null,
                'created_by'     => $user['id'],
            ]);

            Audit::log('collection.create', 'collection', 'collection', $collectionId, null, [
                'receipt_no' => $receiptNo, 'loan_id' => (int)$loan['id'],
                'from_installment_no' => (int)$startInst['installment_no'],
                'amount_paid' => $amount, 'fine' => $fineAmount, 'total' => $total,
                'installments_covered' => count($touched),
                'configured_installment' => $loan['installment_amount'],
            ], null, ['id' => $user['id'], 'role_code' => $user['role_code']]);

            return [
                'collection'        => $db->fetch('SELECT * FROM collections WHERE id = :id', ['id' => $collectionId]),
                'installment'       => $db->fetch('SELECT * FROM installments WHERE id = :id', ['id' => $startInst['id']]),
                'allocations'       => $db->fetchAll(
                    "SELECT ca.*, i.installment_no FROM collection_allocations ca
                     JOIN installments i ON i.id = ca.installment_id WHERE ca.collection_id = :c ORDER BY i.installment_no",
                    ['c' => $collectionId]
                ),
                'loan_summary'      => self::loanSummary((int)$loan['id']),
                'idempotent_replay' => false,
            ];
        });
    }

    /**
     * CANCEL a posted collection: it stays as a history row (status = cancelled)
     * but contributes to nothing. Its allocations are unwound from the
     * installments; cash reverses automatically because FinanceService only
     * sums status = 'posted'.
     */
    public static function cancel(array $user, int $collectionId, string $reason): array
    {
        $db = Database::instance();
        return $db->transaction(function ($db) use ($user, $collectionId, $reason) {
            $col = $db->fetch('SELECT * FROM collections WHERE id = :id AND deleted_at IS NULL FOR UPDATE', ['id' => $collectionId]);
            if (!$col) {
                throw HttpException::notFound('Collection not found');
            }
            if ($col['status'] !== 'posted') {
                throw HttpException::conflict('Only a posted collection can be cancelled (this one is ' . $col['status'] . ')');
            }

            self::unwindAllocations($db, $collectionId);

            $db->update('collections', [
                'status'        => 'cancelled',
                'cancelled_at'  => BusinessDate::utcNow(),
                'cancelled_by'  => $user['id'],
                'cancel_reason' => $reason,
            ], 'id = :id', ['id' => $collectionId]);

            self::syncLoanStatus($db, (int)$col['loan_id']);

            TransactionService::cancelFor('collection', $collectionId, $user['id']);

            Audit::log('collection.cancel', 'collection', 'collection', $collectionId,
                ['status' => 'posted', 'amount' => $col['amount']], ['status' => 'cancelled'], $reason,
                ['id' => $user['id'], 'role_code' => $user['role_code']]);

            return [
                'collection'   => $db->fetch('SELECT * FROM collections WHERE id = :id', ['id' => $collectionId]),
                'loan_summary' => self::loanSummary((int)$col['loan_id']),
            ];
        });
    }

    /**
     * DELETE a collection record (soft-delete). If it is still 'posted' its
     * financial effect is unwound first (exactly once - no double reversal).
     */
    public static function deleteCollection(array $user, int $collectionId, string $reason): array
    {
        $db = Database::instance();
        return $db->transaction(function ($db) use ($user, $collectionId, $reason) {
            $col = $db->fetch('SELECT * FROM collections WHERE id = :id AND deleted_at IS NULL FOR UPDATE', ['id' => $collectionId]);
            if (!$col) {
                throw HttpException::notFound('Collection not found');
            }
            if ($col['status'] === 'posted') {
                self::unwindAllocations($db, $collectionId);   // reverse once
            }
            $db->update('collections', [
                'status'        => $col['status'] === 'posted' ? 'cancelled' : $col['status'],
                'deleted_at'    => BusinessDate::utcNow(),
                'cancelled_by'  => $user['id'],
                'cancel_reason' => $reason,
            ], 'id = :id', ['id' => $collectionId]);

            self::syncLoanStatus($db, (int)$col['loan_id']);

            if ($col['status'] === 'posted') {
                TransactionService::cancelFor('collection', $collectionId, $user['id']);
            }

            Audit::log('collection.delete', 'collection', 'collection', $collectionId,
                ['status' => $col['status'], 'amount' => $col['amount']], ['deleted' => true], $reason,
                ['id' => $user['id'], 'role_code' => $user['role_code']]);

            return [
                'collection'   => $db->fetch('SELECT * FROM collections WHERE id = :id', ['id' => $collectionId]),
                'loan_summary' => self::loanSummary((int)$col['loan_id']),
            ];
        });
    }

    /** Legacy mirror-row reversal (kept for API compatibility). */
    public static function reverse(array $user, int $collectionId, string $reason): array
    {
        // Equivalent business outcome to cancel; keep the same public shape.
        return self::cancel($user, $collectionId, $reason);
    }

    /* ------------------------------------------------------------------ */

    private static function unwindAllocations(Database $db, int $collectionId): void
    {
        foreach ($db->fetchAll('SELECT * FROM collection_allocations WHERE collection_id = :c', ['c' => $collectionId]) as $a) {
            $inst = $db->fetch('SELECT * FROM installments WHERE id = :id FOR UPDATE', ['id' => $a['installment_id']]);
            if (!$inst) {
                continue;
            }
            $newPaid    = Money::max(Money::sub($inst['paid_amount'], $a['principal_alloc']), 0);
            $newFine    = Money::max(Money::sub($inst['fine_paid'], $a['fine_alloc']), 0);
            $newBalance = Money::max(Money::sub($inst['payable_amount'], $newPaid), 0);
            $db->update('installments', [
                'paid_amount'    => Money::of($newPaid),
                'fine_paid'      => Money::of($newFine),
                'balance_amount' => Money::of($newBalance),
                'status'         => self::deriveStatus($newBalance, $newPaid, $inst['due_date']),
                'updated_at'     => BusinessDate::utcNow(),
            ], 'id = :id', ['id' => $inst['id']]);
        }
    }

    private static function syncLoanStatus(Database $db, int $loanId): void
    {
        $loan = $db->fetch('SELECT status FROM loans_or_chits WHERE id = :id', ['id' => $loanId]);
        if (!$loan || in_array($loan['status'], ['cancelled', 'deactivated'], true)) {
            return;
        }
        $open = (int)$db->scalar("SELECT COUNT(*) FROM installments WHERE loan_id = :l AND status <> 'COMPLETED'", ['l' => $loanId]);
        $want = $open === 0 ? 'completed' : 'active';
        if ($loan['status'] !== $want) {
            $db->update('loans_or_chits', ['status' => $want, 'updated_at' => BusinessDate::utcNow()], 'id = :id', ['id' => $loanId]);
        }
    }

    public static function deriveStatus(string $balance, string $paid, string $dueDate): string
    {
        if (Money::lte($balance, 0) && Money::gt($paid, 0)) {
            return 'COMPLETED';
        }
        if (Money::gt($paid, 0)) {
            return 'PARTIAL';
        }
        $today = BusinessDate::fmt(BusinessDate::today());
        return $dueDate < $today ? 'OVERDUE' : 'PENDING';
    }

    public static function loanSummary(int $loanId): array
    {
        return Database::instance()->fetch(
            "SELECT
                COUNT(*) AS installments_total,
                SUM(payable_amount) AS scheduled_total,
                SUM(paid_amount) AS collected_principal,
                SUM(fine_paid) AS collected_fine,
                SUM(balance_amount) AS outstanding_balance,
                SUM(CASE WHEN status='COMPLETED' THEN 1 ELSE 0 END) AS completed_count,
                SUM(CASE WHEN status='OVERDUE' THEN 1 ELSE 0 END) AS overdue_count
             FROM installments WHERE loan_id = :l",
            ['l' => $loanId]
        ) ?: [];
    }
}
