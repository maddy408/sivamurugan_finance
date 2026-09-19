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
            if ($loan['deleted_at'] !== null || in_array($loan['status'], ['cancelled', 'deactivated', 'closed'], true)) {
                throw HttpException::conflict('Chit is ' . ($loan['deleted_at'] ? 'deleted' : $loan['status']) . '; collections are not allowed');
            }

            $collectionDate = $payload['collection_date'];
            $amount = Money::of($payload['amount'] ?? 0);          // actual paid, verbatim
            $modeId = (int)$payload['payment_mode_id'];

            // ---- fine: manual, editable, never merged into the installment ----
            $fineAmount = Money::of($payload['fine_amount'] ?? 0);
            if (Money::gt($fineAmount, 0) && !Guard::can($user, 'collection.create')) {
                throw HttpException::forbidden('Not allowed to record a collection');
            }

            if (Money::lte($amount, 0) && Money::lte($fineAmount, 0)) {
                throw HttpException::validation(['amount' => ['Enter a payment amount greater than 0']]);
            }

            // ---- resolve the account the money lands in (Cash -> Office Cash) ----
            $accountId = $payload['account_id'] ?? null;
            if (!$accountId) {
                $mode = $db->fetch('SELECT code FROM payment_modes WHERE id = :id', ['id' => $modeId]);
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
                'fine_amount'     => $fineAmount,
                'other_charges'   => '0.00',
                'total_amount'    => $total,
                'payment_mode_id' => $modeId,
                'account_id'      => $accountId,
                // Split payment (Cash + UPI in one collection): NULL unless the mode is SPLIT.
                'cash_amount'     => $payload['cash_amount'] ?? null,
                'upi_amount'      => $payload['upi_amount'] ?? null,
                'cash_account_id' => $payload['cash_account_id'] ?? null,
                'upi_account_id'  => $payload['upi_account_id'] ?? null,
                'reference_no'    => $payload['reference_no'] ?? null,
                'bill_no'         => $payload['bill_no'] ?? null,
                'remarks'         => $payload['remarks'] ?? null,
                'idempotency_key' => $idemKey,
                'status'          => 'posted',
                'created_at'      => BusinessDate::utcNow(),
            ]);

            // ---- allocate the amount across the target installments ----
            $touched = self::allocate($db, (int)$loan['id'], $startInst, $explicitSet, $amount, $fineAmount, $collectionId, $collectionDate);

            self::syncLoanStatus($db, (int)$loan['id']);

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
     * Core allocation loop shared by post() and updateCollection(): spread
     * $amount across $installments (explicit multi-select, cascading forward
     * past their combined balance if overpaid; or a plain forward-fill from
     * $startInst otherwise), inserting collection_allocations rows and
     * updating each touched installment's paid/balance/status.
     *
     * @return int[] ids of every installment touched
     */
    private static function allocate(
        Database $db, int $loanId, array $startInst, ?array $explicitSet,
        string $amount, string $fineAmount, int $collectionId, string $collectionDate
    ): array {
        if ($explicitSet !== null) {
            $installments = $explicitSet;
            // If the actual paid amount exceeds the selected dues' combined
            // balance, the overflow must cascade forward to the next pending
            // installments (oldest first) instead of being silently absorbed
            // by the selected row(s) — same "advance credit" rule the plain
            // forward-fill flow below already applies. Without this, a
            // single-due selection (e.g. the per-row "Collect" button) that
            // is overpaid would dump the whole excess onto that one row,
            // floor its balance at 0, and never touch the next due's
            // balance — silently understating the chit's outstanding.
            $explicitBalanceSum = array_reduce(
                $installments,
                fn ($carry, $i) => Money::add($carry, $i['balance_amount']),
                '0.00'
            );
            if (Money::gt($amount, $explicitBalanceSum)) {
                $maxNo = max(array_map(fn ($i) => (int)$i['installment_no'], $installments));
                $more = $db->fetchAll(
                    "SELECT * FROM installments
                     WHERE loan_id = :l AND installment_no > :n AND status <> 'COMPLETED'
                     ORDER BY installment_no FOR UPDATE",
                    ['l' => $loanId, 'n' => $maxNo]
                );
                $installments = array_merge($installments, $more);
            }
        } else {
            $installments = $db->fetchAll(
                "SELECT * FROM installments
                 WHERE loan_id = :l AND installment_no >= :n AND status <> 'COMPLETED'
                 ORDER BY installment_no FOR UPDATE",
                ['l' => $loanId, 'n' => (int)$startInst['installment_no']]
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

        return $touched;
    }

    /**
     * Edit a posted collection IN PLACE: the old allocation effect is fully
     * unwound, the collection row's own fields are updated, then the (possibly
     * different) amount/fine is re-allocated forward from the SAME starting
     * installment the original payment covered. Never inserts a second
     * collection row and never leaves the old effect layered under the new one.
     *
     * Editable: amount, fine_amount, collection_date, payment_mode_id,
     * account_id, cash_amount/upi_amount (split), reference_no, remarks.
     * The set of dues covered is NOT re-choosable here — it re-targets
     * whichever installment this collection originally started from.
     */
    public static function updateCollection(array $user, int $collectionId, array $in): array
    {
        $db = Database::instance();
        return $db->transaction(function ($db) use ($user, $collectionId, $in) {
            $col = $db->fetch('SELECT * FROM collections WHERE id = :id AND deleted_at IS NULL FOR UPDATE', ['id' => $collectionId]);
            if (!$col) {
                throw HttpException::notFound('Collection not found');
            }
            if ($col['status'] !== 'posted') {
                throw HttpException::conflict('Only a posted collection can be edited (this one is ' . $col['status'] . ')');
            }

            $firstInstId = $db->scalar(
                'SELECT installment_id FROM collection_allocations WHERE collection_id = :c ORDER BY id LIMIT 1',
                ['c' => $collectionId]
            );
            $startInst = $firstInstId ? $db->fetch('SELECT * FROM installments WHERE id = :id FOR UPDATE', ['id' => $firstInstId]) : null;
            if (!$startInst) {
                throw HttpException::conflict('This collection has no installment allocations to re-target');
            }
            $loan = $db->fetch('SELECT * FROM loans_or_chits WHERE id = :id FOR UPDATE', ['id' => (int)$col['loan_id']]);
            if (!$loan || $loan['deleted_at'] !== null || in_array($loan['status'], ['cancelled', 'deactivated', 'closed'], true)) {
                throw HttpException::conflict('This chit is not open for collection edits');
            }

            $amount = array_key_exists('amount', $in) && $in['amount'] !== null ? Money::of($in['amount']) : Money::of($col['amount']);
            $fineAmount = array_key_exists('fine_amount', $in) && $in['fine_amount'] !== null ? Money::of($in['fine_amount']) : Money::of($col['fine_amount']);
            if (Money::lte($amount, 0) && Money::lte($fineAmount, 0)) {
                throw HttpException::validation(['amount' => ['Enter a payment amount greater than 0']]);
            }
            $collectionDate = $in['collection_date'] ?? $col['collection_date'];
            $modeId = array_key_exists('payment_mode_id', $in) && $in['payment_mode_id'] ? (int)$in['payment_mode_id'] : (int)$col['payment_mode_id'];
            $accountId = array_key_exists('account_id', $in) && $in['account_id'] ? (int)$in['account_id'] : $col['account_id'];
            $cashAmount = array_key_exists('cash_amount', $in) ? $in['cash_amount'] : $col['cash_amount'];
            $upiAmount = array_key_exists('upi_amount', $in) ? $in['upi_amount'] : $col['upi_amount'];
            $cashAccountId = array_key_exists('cash_account_id', $in) ? $in['cash_account_id'] : $col['cash_account_id'];
            $upiAccountId = array_key_exists('upi_account_id', $in) ? $in['upi_account_id'] : $col['upi_account_id'];

            // Reverse the OLD effect exactly once, then delete its allocation rows
            // (they're about to be replaced, not layered under new ones).
            self::unwindAllocations($db, $collectionId);
            $db->run('DELETE FROM collection_allocations WHERE collection_id = :c', ['c' => $collectionId]);

            $total = Money::add($amount, $fineAmount);
            $db->update('collections', [
                'amount'          => $amount,
                'fine_amount'     => $fineAmount,
                'total_amount'    => $total,
                'collection_date' => $collectionDate,
                'payment_mode_id' => $modeId,
                'account_id'      => $accountId,
                'cash_amount'     => $cashAmount,
                'upi_amount'      => $upiAmount,
                'cash_account_id' => $cashAccountId,
                'upi_account_id'  => $upiAccountId,
                'reference_no'    => array_key_exists('reference_no', $in) ? $in['reference_no'] : $col['reference_no'],
                'bill_no'         => array_key_exists('bill_no', $in) ? $in['bill_no'] : $col['bill_no'],
                'remarks'         => array_key_exists('remarks', $in) ? $in['remarks'] : $col['remarks'],
            ], 'id = :id', ['id' => $collectionId]);

            // Re-fetch the start installment (unwind may have changed its balance/status).
            $startInst = $db->fetch('SELECT * FROM installments WHERE id = :id FOR UPDATE', ['id' => $startInst['id']]);
            self::allocate($db, (int)$loan['id'], $startInst, null, $amount, $fineAmount, $collectionId, $collectionDate);

            self::syncLoanStatus($db, (int)$loan['id']);

            Audit::log('collection.update', 'collection', 'collection', $collectionId,
                ['amount' => $col['amount'], 'fine_amount' => $col['fine_amount'], 'collection_date' => $col['collection_date']],
                ['amount' => $amount, 'fine_amount' => $fineAmount, 'collection_date' => $collectionDate],
                null, ['id' => $user['id'], 'role_code' => $user['role_code']]);

            return [
                'collection'   => $db->fetch('SELECT * FROM collections WHERE id = :id', ['id' => $collectionId]),
                'allocations'  => $db->fetchAll(
                    "SELECT ca.*, i.installment_no FROM collection_allocations ca
                     JOIN installments i ON i.id = ca.installment_id WHERE ca.collection_id = :c ORDER BY i.installment_no",
                    ['c' => $collectionId]
                ),
                'loan_summary' => self::loanSummary((int)$loan['id']),
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
        // 'closed' is a deliberate user action (Close Chit) - cancelling/editing
        // any collection (including the close settlement itself) must never
        // silently flip it back to active/completed; only the explicit Reopen
        // Chit action does that.
        if (!$loan || in_array($loan['status'], ['cancelled', 'deactivated', 'closed'], true)) {
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

    /**
     * Every real payment transaction ever posted against one installment,
     * oldest first - the "Previous Payment History" a due carries. Reused by
     * the Collect form (so a partially-paid due's history shows inline
     * without leaving the page) and by the statement generator. Cancelled /
     * deleted collections are excluded - only what actually contributed to
     * the installment's current paid_amount.
     */
    public static function installmentPayments(int $installmentId): array
    {
        return Database::instance()->fetchAll(
            "SELECT ca.principal_alloc, ca.fine_alloc,
                    col.id AS collection_id, col.receipt_no, col.collection_date, col.bill_no,
                    col.payment_mode_id, pm.name AS payment_mode, ub.name AS collected_by_name
             FROM collection_allocations ca
             JOIN collections col ON col.id = ca.collection_id
             JOIN payment_modes pm ON pm.id = col.payment_mode_id
             LEFT JOIN users ub ON ub.id = col.collected_by
             WHERE ca.installment_id = :i AND col.status = 'posted' AND col.deleted_at IS NULL
             ORDER BY col.collection_date ASC, col.id ASC",
            ['i' => $installmentId]
        );
    }

    /* --------------------------------------------- Close Chit settlement --
     * A "Close Chit" settlement is a normal `collections` row
     * (collection_type = 'close_settlement') with NO collection_allocations
     * against any installment - so it never touches installment paid/
     * balance amounts, but it counts everywhere that already sums
     * collections.status='posted' (FinanceService, Dashboard, Financial
     * Ledger, customer payment history) with no extra plumbing. Editing
     * updates this one row in place (no duplicate row, no double counting);
     * cancelling/deleting it reuses the EXISTING cancel()/deleteCollection()
     * above unchanged - unwindAllocations() is a safe no-op when there are
     * zero allocations to unwind. */

    /** Best-effort default account/mode for a settlement the user doesn't pick one for. */
    private static function defaultAccountAndMode(Database $db): array
    {
        $accountId = (int)($db->scalar("SELECT id FROM accounts WHERE is_active = 1 ORDER BY id LIMIT 1") ?: 0);
        $modeId = (int)($db->scalar("SELECT id FROM payment_modes WHERE is_active = 1 AND code = 'CASH' ORDER BY id LIMIT 1")
            ?: $db->scalar("SELECT id FROM payment_modes WHERE is_active = 1 ORDER BY id LIMIT 1") ?: 0);
        return [$accountId, $modeId];
    }

    public static function createCloseSettlement(array $user, int $loanId, array $in): array
    {
        $db = Database::instance();
        return $db->transaction(function ($db) use ($user, $loanId, $in) {
            $loan = $db->fetch('SELECT * FROM loans_or_chits WHERE id = :id FOR UPDATE', ['id' => $loanId]);
            if (!$loan) {
                throw HttpException::notFound('Chit not found');
            }
            $amount = Money::of($in['close_amount']);
            [$accountId, $modeId] = self::defaultAccountAndMode($db);

            $receiptNo = CodeGenerator::receiptNo($in['close_date']);
            if ($db->scalar('SELECT 1 FROM collections WHERE receipt_no = :r', ['r' => $receiptNo])) {
                $receiptNo .= '-' . substr(bin2hex(random_bytes(2)), 0, 3);
            }

            $collectionId = $db->insert('collections', [
                'receipt_no'      => $receiptNo,
                'loan_id'         => $loan['id'],
                'customer_id'     => $loan['customer_id'],
                'collected_by'    => $user['id'],
                'employee_id'     => $user['employee_id'] ?? null,
                'location'        => $loan['location'] ?? null,
                'collection_date' => $in['close_date'],
                'amount'          => $amount,
                'fine_amount'     => '0.00',
                'other_charges'   => '0.00',
                'total_amount'    => $amount,
                'payment_mode_id' => $modeId ?: null,
                'account_id'      => $accountId ?: null,
                'remarks'         => $in['remarks'] ?? 'Close Chit / Final Settlement',
                'status'          => 'posted',
                'collection_type' => 'close_settlement',
                'created_at'      => BusinessDate::utcNow(),
            ]);

            Audit::log('loan.close', 'collection', 'collection', $collectionId, null,
                ['loan_id' => $loan['id'], 'close_amount' => $amount, 'close_date' => $in['close_date']],
                $in['remarks'] ?? null, ['id' => $user['id'], 'role_code' => $user['role_code']]);

            return $db->fetch('SELECT * FROM collections WHERE id = :id', ['id' => $collectionId]);
        });
    }

    /**
     * Edit the amount/date/remarks of an already-posted close settlement -
     * updates the SAME row in place (never a second/duplicate row), exactly
     * like updateCollection() does for a normal payment, but deliberately
     * without that method's "chit must be open" guard: editing the close
     * amount is the one collection action explicitly allowed while the chit
     * itself is status='closed'.
     */
    public static function updateCloseSettlement(array $user, int $loanId, array $in): array
    {
        $db = Database::instance();
        return $db->transaction(function ($db) use ($user, $loanId, $in) {
            $col = $db->fetch(
                "SELECT * FROM collections WHERE loan_id = :l AND collection_type = 'close_settlement'
                  AND status = 'posted' AND deleted_at IS NULL FOR UPDATE",
                ['l' => $loanId]
            );
            if (!$col) {
                throw HttpException::notFound('No active close settlement found for this chit');
            }
            $amount = Money::of($in['close_amount']);
            $before = ['amount' => $col['amount'], 'collection_date' => $col['collection_date'], 'remarks' => $col['remarks']];

            $db->update('collections', [
                'amount'          => $amount,
                'total_amount'    => $amount,
                'collection_date' => $in['close_date'] ?? $col['collection_date'],
                'remarks'         => array_key_exists('remarks', $in) ? ($in['remarks'] ?? null) : $col['remarks'],
            ], 'id = :id', ['id' => $col['id']]);

            Audit::log('loan.close_amount_update', 'collection', 'collection', $col['id'], $before,
                ['amount' => $amount, 'collection_date' => $in['close_date'] ?? $col['collection_date']],
                $in['remarks'] ?? null, ['id' => $user['id'], 'role_code' => $user['role_code']]);

            return $db->fetch('SELECT * FROM collections WHERE id = :id', ['id' => $col['id']]);
        });
    }
}
