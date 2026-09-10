<?php
namespace App\Services;

use App\Core\HttpException;
use App\Support\Money;

/**
 * CHIT FUND installment planner.
 *
 * A chit has ONE configured installment amount, entered by the user when the
 * chit is created. It is used verbatim for EVERY period. There is NO EMI
 * formula, NO interest, NO "principal / tenure" division, NO other charges,
 * NO rounding remainder logic, and nothing that depends on other chits,
 * customers or past collections.
 *
 *   installment_amount = ₹2,000  ->  every period is exactly ₹2,000
 *
 * (Class name kept for backward compatibility with existing call sites.)
 */
final class EmiService
{
    /**
     * @param array $loan  needs 'tenure' and one of 'installment_amount' / 'emi_amount'
     * @return array{
     *   installment_amount:string,
     *   emi_amount:string,
     *   per_installment:array<int,array{installment_no:int,emi_amount:string,other_charges:string,payable_amount:string}>,
     *   totals:array{principal:string,interest:string,other_charges:string,scheduled:string}
     * }
     */
    public static function breakdown(array $loan): array
    {
        $tenure = (int)($loan['tenure'] ?? 0);
        // The configured amount. Legacy rows may only have emi_amount populated.
        $inst = Money::of($loan['installment_amount'] ?? ($loan['emi_amount'] ?? 0));

        if ($tenure < 1) {
            throw HttpException::validation(['tenure' => ['Tenure (number of installments) must be at least 1']]);
        }
        if (Money::lte($inst, 0)) {
            throw HttpException::validation(['installment_amount' => ['Installment amount must be greater than 0']]);
        }

        $rows = [];
        for ($n = 1; $n <= $tenure; $n++) {
            $rows[] = [
                'installment_no' => $n,
                'emi_amount'     => $inst,   // flat, identical every period
                'other_charges'  => '0.00',
                'payable_amount' => $inst,
            ];
        }

        $scheduled = Money::mul($inst, $tenure);
        return [
            'installment_amount' => $inst,
            'emi_amount'         => $inst,
            'per_installment'    => $rows,
            'totals' => [
                'principal'     => Money::of($loan['principal_amount'] ?? 0),
                'interest'      => '0.00',
                'other_charges' => '0.00',
                'scheduled'     => $scheduled,   // installment_amount x tenure
            ],
        ];
    }

    /** The configured installment amount, used verbatim. */
    public static function emi(array $loan): string
    {
        return self::breakdown($loan)['installment_amount'];
    }
}
