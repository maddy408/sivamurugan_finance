<?php
namespace App\Services;

use App\Core\Database;

/**
 * Single source of truth for money balances.
 *
 *   account balance = opening_balance
 *                   + office income posted to that account   (status active)
 *                   + collections received into that account (status posted)
 *                   - expenses paid from that account         (status active)
 *                   - distributions paid from that account    (status active)
 *
 * Reversed collections are excluded (status 'reversed'); their mirror rows are
 * also 'reversed', so nothing is double-counted.
 *
 *   Office Cash = sum of balances of accounts with type 'cash'
 *   Bank Cash   = sum of balances of accounts with type 'bank'
 *   Total       = Office Cash + Bank Cash
 */
final class FinanceService
{
    /**
     * @return array{
     *   accounts: array<int,array{id:int,code:string,name:string,type:string,opening_balance:string,income:string,collections:string,expenses:string,balance:string}>,
     *   office_cash:string, bank_cash:string, other:string, total_amount:string
     * }
     */
    public static function balances(): array
    {
        $db = Database::instance();

        $rows = $db->fetchAll(
            "SELECT a.id, a.code, a.name, a.type, a.opening_balance,
                    COALESCE((SELECT SUM(oi.amount) FROM office_income oi
                              WHERE oi.account_id = a.id AND oi.status = 'active' AND oi.deleted_at IS NULL), 0) AS income,
                    COALESCE((SELECT SUM(c.total_amount) FROM collections c
                              WHERE c.account_id = a.id AND c.status = 'posted' AND c.deleted_at IS NULL), 0) AS collections,
                    COALESCE((SELECT SUM(e.amount) FROM expenses e
                              WHERE e.account_id = a.id AND e.status = 'active' AND e.deleted_at IS NULL), 0) AS expenses,
                    COALESCE((SELECT SUM(d.amount) FROM distributions d
                              WHERE d.account_id = a.id AND d.status = 'active' AND d.deleted_at IS NULL), 0) AS distributions
             FROM accounts a
             WHERE a.is_active = 1
             ORDER BY a.id"
        );

        $office = 0.0; $bank = 0.0; $other = 0.0;
        foreach ($rows as &$r) {
            $bal = (float)$r['opening_balance'] + (float)$r['income'] + (float)$r['collections']
                 - (float)$r['expenses'] - (float)$r['distributions'];
            $r['balance'] = number_format($bal, 2, '.', '');
            $r['opening_balance'] = number_format((float)$r['opening_balance'], 2, '.', '');
            $r['income']        = number_format((float)$r['income'], 2, '.', '');
            $r['collections']   = number_format((float)$r['collections'], 2, '.', '');
            $r['expenses']      = number_format((float)$r['expenses'], 2, '.', '');
            $r['distributions'] = number_format((float)$r['distributions'], 2, '.', '');
            $r['id'] = (int)$r['id'];
            if ($r['type'] === 'cash')      $office += $bal;
            elseif ($r['type'] === 'bank')  $bank   += $bal;
            else                            $other  += $bal;
        }
        unset($r);

        return [
            'accounts'     => $rows,
            'office_cash'  => number_format($office, 2, '.', ''),
            'bank_cash'    => number_format($bank, 2, '.', ''),
            'other'        => number_format($other, 2, '.', ''),
            'total_amount' => number_format($office + $bank, 2, '.', ''),
        ];
    }
}
