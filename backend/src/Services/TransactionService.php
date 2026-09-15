<?php
namespace App\Services;

use App\Core\Database;
use App\Support\BusinessDate;

/**
 * The financial ledger. One transactions row per real money-movement source
 * record (collection / distribution / expense / office_income) - never a
 * replacement for those tables, just an append-only, report-friendly ledger
 * layered on top of them.
 *
 * Callers use this from WITHIN the same $db->transaction() as the source
 * write, so the business record and its ledger row can never go out of sync.
 *
 * record() is an upsert keyed on (reference_type, reference_id): the first
 * call for a source row inserts, every later call (e.g. editing a mutable
 * distribution/expense/income row) updates the SAME ledger row in place -
 * there is never more than one ledger row per source record, enforced by
 * uq_txn_reference on top of this upsert logic.
 */
final class TransactionService
{
    /**
     * @param array{
     *   txn_date:string, txn_type:string, direction:string, amount:string|float,
     *   reference_type:string, reference_id:int,
     *   account_id?:?int, customer_id?:?int, loan_id?:?int, remarks?:?string,
     *   created_by?:?int
     * } $p
     */
    public static function record(array $p): int
    {
        $db = Database::instance();
        $existing = $db->fetch(
            'SELECT id FROM transactions WHERE reference_type = :rt AND reference_id = :rid',
            ['rt' => $p['reference_type'], 'rid' => $p['reference_id']]
        );

        $fields = [
            'txn_date'    => $p['txn_date'],
            'txn_type'    => $p['txn_type'],
            'direction'   => $p['direction'],
            'amount'      => $p['amount'],
            'account_id'  => $p['account_id'] ?? null,
            'customer_id' => $p['customer_id'] ?? null,
            'loan_id'     => $p['loan_id'] ?? null,
            'remarks'     => $p['remarks'] ?? null,
            'updated_at'  => BusinessDate::utcNow(),
        ];

        if ($existing) {
            $db->update('transactions', $fields, 'id = :id', ['id' => $existing['id']]);
            return (int)$existing['id'];
        }

        $fields['transaction_no']  = CodeGenerator::transactionNo($p['txn_date']);
        $fields['reference_type']  = $p['reference_type'];
        $fields['reference_id']    = $p['reference_id'];
        $fields['status']          = 'posted';
        $fields['created_by']      = $p['created_by'] ?? null;
        $fields['created_at']      = BusinessDate::utcNow();

        return $db->insert('transactions', $fields);
    }

    /** Status-flip the ledger row for a source record: posted -> cancelled. Idempotent. */
    public static function cancelFor(string $referenceType, int $referenceId, ?int $cancelledBy = null): void
    {
        $db = Database::instance();
        $row = $db->fetch(
            "SELECT id FROM transactions WHERE reference_type = :rt AND reference_id = :rid AND status = 'posted'",
            ['rt' => $referenceType, 'rid' => $referenceId]
        );
        if (!$row) {
            return; // no ledger row, or already cancelled - nothing to do
        }
        $db->update('transactions', [
            'status'       => 'cancelled',
            'cancelled_by' => $cancelledBy,
            'cancelled_at' => BusinessDate::utcNow(),
            'updated_at'   => BusinessDate::utcNow(),
        ], 'id = :id', ['id' => $row['id']]);
    }
}
