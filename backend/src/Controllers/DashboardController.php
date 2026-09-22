<?php
namespace App\Controllers;

use App\Auth\Guard;
use App\Core\Database;
use App\Core\Request;
use App\Core\Response;
use App\Services\FinanceService;
use App\Support\BusinessDate;

/**
 * GET /api/dashboard
 *
 * ROLE-BASED PRIVACY:
 *   Admin    -> full financial picture (Office Cash, Bank Cash, Total Amount,
 *               Total Expense, Distributed Amount, Total/Monthly/Weekly Collection,
 *               per-employee collection).
 *   Employee -> ONLY their own collection figures + their scoped workload.
 *               Office/Bank/Total/Expense/Distributed are NOT computed and NOT
 *               returned in the employee response at all.
 *
 * Calendar filter:
 *   ?month_from & ?month_to  -> "Monthly Collection" range (default: this month)
 *   ?week_from  & ?week_to    -> "Weekly Collection" range  (default: this ISO week)
 *   ?from & ?to               -> generic "range" figure (default: today)
 */
class DashboardController
{
    private const POSTED = "status = 'posted' AND deleted_at IS NULL";

    public function index(Request $req): void
    {
        $user  = Guard::authorize($req);
        $db    = Database::instance();
        $admin = Guard::isAdmin($user);
        $today = BusinessDate::fmt(BusinessDate::today());

        // ---- resolve date ranges ----
        $t = BusinessDate::today();
        $monthFrom = $req->queryParam('month_from') ?: $t->format('Y-m-01');
        $monthTo   = $req->queryParam('month_to')   ?: $t->format('Y-m-t');
        $isoDow    = (int)$t->format('N');                 // 1=Mon .. 7=Sun
        $weekFrom  = $req->queryParam('week_from') ?: $t->modify('-' . ($isoDow - 1) . ' days')->format('Y-m-d');
        $weekTo    = $req->queryParam('week_to')   ?: $t->modify('+' . (7 - $isoDow) . ' days')->format('Y-m-d');
        $from      = $req->queryParam('from') ?: $today;
        $to        = $req->queryParam('to')   ?: $today;

        [$scopeSql, $scopeParams] = Guard::loanScopeSql($user, 'l');

        // ---- schedule figures (installments) ----
        // Kept exactly as before: "today's outstanding workload" figures
        // (overdue_amount/pending_customers/due_customers/outstanding_total)
        // are deliberately scoped to ACTIVE chits only - a completed/closed/
        // cancelled chit has no ongoing collection workload.
        $sched = $db->fetch(
            "SELECT
                COALESCE(SUM(CASE WHEN i.status = 'OVERDUE' THEN i.balance_amount ELSE 0 END),0) AS overdue_amount,
                COUNT(DISTINCT CASE WHEN i.balance_amount > 0 THEN l.customer_id END) AS pending_customers,
                COUNT(DISTINCT CASE WHEN i.due_date = :t2 AND i.status <> 'COMPLETED' THEN l.customer_id END) AS due_customers,
                COALESCE(SUM(i.balance_amount),0) AS outstanding_total
             FROM installments i
             JOIN loans_or_chits l ON l.id = i.loan_id
             WHERE l.status = 'active' AND l.deleted_at IS NULL AND $scopeSql",
            $scopeParams + ['t2' => $today]
        );

        // "Chit Performance" cards' due-side figure: payable_amount (the
        // ORIGINAL scheduled due, frozen once the installment is created) -
        // NOT balance_amount, which shrinks the moment a collection lands on
        // it, so using it would make "expected" chase "collected" downward
        // within the same request and never reconcile (a 3000 due paid 2000
        // today would wrongly show expected=1000, not the real 3000 target).
        //
        // Deliberately NOT restricted to status='active': a due that gets
        // fully paid today flips its chit to 'completed' (or a chit closed/
        // reopened later) immediately after - excluding those would make a
        // just-fully-paid due silently vanish from BOTH sides of the ratio
        // instead of correctly showing 100%. Only truly voided chits
        // (cancelled/deleted - see LoanController::destroy's collection
        // cascade) are excluded, since their dues no longer represent real
        // collectible amounts.
        //
        // CRITICAL: each bucket is scoped to l.frequency (the chit's OWN
        // existing daily/weekly/monthly field, set at chit creation and used
        // everywhere else for schedule generation - see LoanController::
        // syncScheduleType) as well as that bucket's date window. Without the
        // frequency filter, a single weekly chit's collection would satisfy
        // "due today" AND "due this week" AND "due this month" simultaneously
        // and get triple-counted across all three cards; a due/collection now
        // contributes to exactly one card - the one matching its own chit's
        // frequency.
        $perfSched = $db->fetch(
            "SELECT
                COALESCE(SUM(CASE WHEN i.due_date = :t1                                                  THEN i.payable_amount ELSE 0 END),0) AS expected_today_any,
                COALESCE(SUM(CASE WHEN l.frequency = 'daily'   AND i.due_date = :t1                     THEN i.payable_amount ELSE 0 END),0) AS expected_daily,
                COALESCE(SUM(CASE WHEN l.frequency = 'weekly'  AND i.due_date BETWEEN :wf1 AND :wt1      THEN i.payable_amount ELSE 0 END),0) AS expected_weekly,
                COALESCE(SUM(CASE WHEN l.frequency = 'monthly' AND i.due_date BETWEEN :mf1 AND :mt1      THEN i.payable_amount ELSE 0 END),0) AS expected_monthly
             FROM installments i
             JOIN loans_or_chits l ON l.id = i.loan_id
             WHERE l.status <> 'cancelled' AND l.deleted_at IS NULL AND $scopeSql",
            $scopeParams + [
                't1' => $today,
                'wf1' => $weekFrom, 'wt1' => $weekTo,
                'mf1' => $monthFrom, 'mt1' => $monthTo,
            ]
        );

        // ---- collection sums (ACTUAL amounts) ----
        $collFilter = $admin ? '1=1' : 'col.collected_by = :uid';
        $cp = $admin ? [] : ['uid' => $user['id']];
        $sum = fn(string $extra, array $p) => (float)$db->scalar(
            "SELECT COALESCE(SUM(col.amount),0) FROM collections col WHERE " . self::POSTED . " AND $collFilter $extra", $cp + $p
        );

        $collectedToday   = $sum('AND col.collection_date = :d', ['d' => $today]);
        $collectedRange   = $sum('AND col.collection_date BETWEEN :f AND :t', ['f' => $from, 't' => $to]);
        $collectedMonth   = $sum('AND col.collection_date BETWEEN :mf AND :mt', ['mf' => $monthFrom, 'mt' => $monthTo]);
        $collectedWeek    = $sum('AND col.collection_date BETWEEN :wf AND :wt', ['wf' => $weekFrom, 'wt' => $weekTo]);
        $collectedAllTime = $sum('', []);
        $fineCollected    = (float)$db->scalar(
            "SELECT COALESCE(SUM(col.fine_amount),0) FROM collections col WHERE " . self::POSTED . " AND $collFilter", $cp
        );

        // Collected side of the "Chit Performance" cards' frequency+period
        // buckets - summed via collection_allocations against the EXACT SAME
        // installment set (frequency + due_date window) that $perfSched used
        // for "expected", rather than "any collection recorded on a date in
        // this window". Those are NOT the same set: paying a due before its
        // own due_date (a common advance payment), or a chit whose next due
        // falls in a different week/month than the one just paid, would add
        // to "collected" (by collection_date) without a matching amount ever
        // entering "expected" (by due_date) - collected could then exceed
        // expected and push the rate past 100% even though nothing is
        // actually wrong. Scoping both sides to the identical due rows makes
        // collected <= expected by construction (a due's allocations can't
        // exceed its own payable_amount), so the rate is mathematically
        // capped at the source; min(rate, 100) below is only a final safety
        // net, e.g. for a single due manually overpaid beyond its own amount.
        $perfCollected = function (string $freq, string $dateExpr, array $dateParams) use ($db, $collFilter, $cp): float {
            return (float)$db->scalar(
                "SELECT COALESCE(SUM(ca.principal_alloc),0)
                 FROM collection_allocations ca
                 JOIN collections col ON col.id = ca.collection_id
                 JOIN installments i ON i.id = ca.installment_id
                 JOIN loans_or_chits l ON l.id = i.loan_id
                 WHERE col.status = 'posted' AND col.deleted_at IS NULL AND $collFilter
                   AND l.frequency = :freq AND $dateExpr",
                $cp + $dateParams + ['freq' => $freq]
            );
        };
        $collectedDaily   = $perfCollected('daily', 'i.due_date = :pt1', ['pt1' => $today]);
        $collectedWeekly  = $perfCollected('weekly', 'i.due_date BETWEEN :pf2 AND :pt2', ['pf2' => $weekFrom, 'pt2' => $weekTo]);
        $collectedMonthly = $perfCollected('monthly', 'i.due_date BETWEEN :pf3 AND :pt3', ['pf3' => $monthFrom, 'pt3' => $monthTo]);

        // NOTE: expectedToday (any frequency) feeds only the older, separate
        // `today` response sub-object below (kept for API back-compat, no
        // known frontend consumer) - it is intentionally NOT frequency-
        // scoped and is distinct from expectedDaily, which feeds the "Daily
        // Chit Performance" card and only ever counts frequency='daily' chits.
        $expectedToday   = (float)$perfSched['expected_today_any'];
        $expectedDaily   = (float)$perfSched['expected_daily'];
        $expectedWeekly  = (float)$perfSched['expected_weekly'];
        $expectedMonthly = (float)$perfSched['expected_monthly'];
        $ranges = [
            'today'   => ['from' => $today, 'to' => $today],
            'month'   => ['from' => $monthFrom, 'to' => $monthTo],
            'week'    => ['from' => $weekFrom, 'to' => $weekTo],
            'generic' => ['from' => $from, 'to' => $to],
        ];

        // "Chit Performance" cards (Daily/Weekly/Monthly): collected vs. the
        // actual due amount for that period, computed entirely from the
        // Collection module's own real records - never from loan status or
        // an "active loans" count, and never leaking across frequencies (a
        // weekly chit's collection contributes ONLY to the 'weekly' bucket,
        // even though "today" also falls inside "this week"/"this month").
        // Role-scoped for free: $expected* already applies
        // Guard::loanScopeSql, and $collected* already applies the
        // employee's own collected_by filter (see $collFilter above).
        $perfBucket = function (float $expected, float $collected): array {
            $rate = $expected > 0 ? round(($collected / $expected) * 100, 2) : 0;
            return [
                // collected/pending are reported EXACTLY as computed, even if
                // collected > expected (e.g. a single due genuinely overpaid)
                // - only the displayed rate is capped, never these amounts.
                'expected'  => number_format($expected, 2, '.', ''),
                'collected' => number_format($collected, 2, '.', ''),
                'pending'   => number_format(max($expected - $collected, 0), 2, '.', ''),
                'rate'      => min($rate, 100),
            ];
        };
        $performance = [
            'daily'   => $perfBucket($expectedDaily, $collectedDaily),
            'weekly'  => $perfBucket($expectedWeekly, $collectedWeekly),
            'monthly' => $perfBucket($expectedMonthly, $collectedMonthly),
        ];

        /* =====================  EMPLOYEE  ===================== */
        if (!$admin) {
            Response::ok([
                'is_admin' => false,
                'as_of'    => $today,
                'ranges'   => $ranges,
                'performance' => $performance,
                'cards' => [
                    'my_collection_today' => number_format($collectedToday, 2, '.', ''),
                    'my_collection_week'  => number_format($collectedWeek, 2, '.', ''),
                    'my_collection_month' => number_format($collectedMonth, 2, '.', ''),
                    'my_collection_total' => number_format($collectedAllTime, 2, '.', ''),
                    'my_fine_collected'   => number_format($fineCollected, 2, '.', ''),
                ],
                'today' => [
                    'expected'      => number_format($expectedToday, 2, '.', ''),
                    'collected'     => number_format($collectedToday, 2, '.', ''),
                    'pending'       => number_format(max($expectedToday - $collectedToday, 0), 2, '.', ''),
                    'overdue'       => number_format((float)$sched['overdue_amount'], 2, '.', ''),
                    'due_customers' => (int)$sched['due_customers'],
                ],
                'my_outstanding_customers' => (int)$sched['pending_customers'],
            ]);
            return;
        }

        /* =====================  ADMIN  ===================== */
        $finance = FinanceService::balances();

        $totalExpense = (float)$db->scalar("SELECT COALESCE(SUM(amount),0) FROM expenses WHERE status='active' AND deleted_at IS NULL");
        $expenseMonth = (float)$db->scalar("SELECT COALESCE(SUM(amount),0) FROM expenses WHERE status='active' AND deleted_at IS NULL AND expense_date BETWEEN :f AND :t", ['f' => $monthFrom, 't' => $monthTo]);
        $totalIncome  = (float)$db->scalar("SELECT COALESCE(SUM(amount),0) FROM office_income WHERE status='active' AND deleted_at IS NULL");

        // Total Chit Amount = the combined face value of every chit ever opened
        // (active + completed), excluding cancelled ones. Creating a chit moves
        // no money, so this is a portfolio-size figure, not a cash figure.
        $totalChitAmount = (float)$db->scalar("SELECT COALESCE(SUM(principal_amount),0) FROM loans_or_chits WHERE deleted_at IS NULL AND status <> 'cancelled'");

        // Distributed Amount = money ACTUALLY handed to customers, i.e. the sum of
        // live distribution transactions. Creating a chit moves no money, so it does
        // NOT count here.
        $distributed = (float)$db->scalar("SELECT COALESCE(SUM(amount),0) FROM distributions WHERE status='active' AND deleted_at IS NULL");

        $employeeCollections = $db->fetchAll(
            "SELECT e.id AS employee_id, e.emp_code, u.name AS employee_name,
                    COALESCE(SUM(CASE WHEN col.collection_date = :t1 THEN col.amount ELSE 0 END),0) AS collected_today,
                    COALESCE(SUM(CASE WHEN col.collection_date BETWEEN :wf AND :wt THEN col.amount ELSE 0 END),0) AS collected_week,
                    COALESCE(SUM(CASE WHEN col.collection_date BETWEEN :mf AND :mt THEN col.amount ELSE 0 END),0) AS collected_month,
                    COALESCE(SUM(col.amount),0) AS collected_total,
                    COUNT(col.id) AS receipts
             FROM employees e
             JOIN users u ON u.id = e.user_id
             LEFT JOIN collections col ON col.employee_id = e.id AND col.status='posted' AND col.deleted_at IS NULL
             GROUP BY e.id, e.emp_code, u.name
             HAVING collected_total > 0
             ORDER BY collected_month DESC, collected_total DESC",
            ['t1' => $today, 'wf' => $weekFrom, 'wt' => $weekTo, 'mf' => $monthFrom, 'mt' => $monthTo]
        );
        $adminDirect = $db->fetch(
            "SELECT COALESCE(SUM(CASE WHEN col.collection_date = :t1 THEN col.amount ELSE 0 END),0) AS collected_today,
                    COALESCE(SUM(col.amount),0) AS collected_total, COUNT(col.id) AS receipts
             FROM collections col WHERE " . self::POSTED . " AND col.employee_id IS NULL",
            ['t1' => $today]
        );
        if ((int)$adminDirect['receipts'] > 0) {
            $employeeCollections[] = [
                'employee_id' => null, 'emp_code' => '—', 'employee_name' => 'Admin / office',
                'collected_today' => $adminDirect['collected_today'],
                'collected_week'  => $adminDirect['collected_today'],
                'collected_month' => $adminDirect['collected_total'],
                'collected_total' => $adminDirect['collected_total'],
                'receipts'        => $adminDirect['receipts'],
            ];
        }

        $counts = $db->fetch(
            "SELECT
               (SELECT COUNT(*) FROM customers WHERE deleted_at IS NULL) AS customers,
               (SELECT COUNT(*) FROM loans_or_chits WHERE status='active' AND deleted_at IS NULL) AS active_chits,
               (SELECT COUNT(DISTINCT location) FROM customers
                 WHERE deleted_at IS NULL AND location IS NOT NULL AND location <> '') AS locations,
               (SELECT COUNT(*) FROM employees WHERE is_active=1) AS employees"
        );

        Response::ok([
            'is_admin' => true,
            'as_of'    => $today,
            'ranges'   => $ranges,
            'performance' => $performance,
            'cards' => [
                'office_cash'       => $finance['office_cash'],
                'bank_cash'         => $finance['bank_cash'],
                'total_amount'      => $finance['total_amount'],
                'total_expense'     => number_format($totalExpense, 2, '.', ''),
                'expense_this_month'=> number_format($expenseMonth, 2, '.', ''),
                'total_income'      => number_format($totalIncome, 2, '.', ''),
                'total_chit_amount' => number_format($totalChitAmount, 2, '.', ''),
                'distributed_amount'=> number_format($distributed, 2, '.', ''),
                'total_collection'  => number_format($collectedAllTime, 2, '.', ''),
                'monthly_collection'=> number_format($collectedMonth, 2, '.', ''),
                'weekly_collection' => number_format($collectedWeek, 2, '.', ''),
                'fine_collected'    => number_format($fineCollected, 2, '.', ''),
                'accounts'          => $finance['accounts'],
            ],
            'today' => [
                'expected'      => number_format($expectedToday, 2, '.', ''),
                'collected'     => number_format($collectedToday, 2, '.', ''),
                'pending'       => number_format(max($expectedToday - $collectedToday, 0), 2, '.', ''),
                'overdue'       => number_format((float)$sched['overdue_amount'], 2, '.', ''),
                'due_customers' => (int)$sched['due_customers'],
            ],
            'range_totals' => ['collected' => number_format($collectedRange, 2, '.', '')],
            'totals' => [
                'collected_all_time' => number_format($collectedAllTime, 2, '.', ''),
                'outstanding'        => number_format((float)$sched['outstanding_total'], 2, '.', ''),
                'pending_customers'  => (int)$sched['pending_customers'],
                'customers'          => (int)$counts['customers'],
                'active_chits'       => (int)$counts['active_chits'],
                'locations'          => (int)$counts['locations'],
                'employees'          => (int)$counts['employees'],
            ],
            'employee_collections' => $employeeCollections,
        ]);
    }
}
