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
        $sched = $db->fetch(
            "SELECT
                COALESCE(SUM(CASE WHEN i.due_date = :t1 THEN i.balance_amount ELSE 0 END),0) AS expected_today,
                COALESCE(SUM(CASE WHEN i.status = 'OVERDUE' THEN i.balance_amount ELSE 0 END),0) AS overdue_amount,
                COUNT(DISTINCT CASE WHEN i.balance_amount > 0 THEN l.customer_id END) AS pending_customers,
                COUNT(DISTINCT CASE WHEN i.due_date = :t2 AND i.status <> 'COMPLETED' THEN l.customer_id END) AS due_customers,
                COALESCE(SUM(i.balance_amount),0) AS outstanding_total
             FROM installments i
             JOIN loans_or_chits l ON l.id = i.loan_id
             WHERE l.status = 'active' AND l.deleted_at IS NULL AND $scopeSql",
            $scopeParams + ['t1' => $today, 't2' => $today]
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

        $expectedToday = (float)$sched['expected_today'];
        $ranges = [
            'today'   => ['from' => $today, 'to' => $today],
            'month'   => ['from' => $monthFrom, 'to' => $monthTo],
            'week'    => ['from' => $weekFrom, 'to' => $weekTo],
            'generic' => ['from' => $from, 'to' => $to],
        ];

        /* =====================  EMPLOYEE  ===================== */
        if (!$admin) {
            Response::ok([
                'is_admin' => false,
                'as_of'    => $today,
                'ranges'   => $ranges,
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
               (SELECT COUNT(*) FROM locations WHERE is_active=1) AS locations,
               (SELECT COUNT(*) FROM employees WHERE is_active=1) AS employees"
        );

        Response::ok([
            'is_admin' => true,
            'as_of'    => $today,
            'ranges'   => $ranges,
            'cards' => [
                'office_cash'       => $finance['office_cash'],
                'bank_cash'         => $finance['bank_cash'],
                'total_amount'      => $finance['total_amount'],
                'total_expense'     => number_format($totalExpense, 2, '.', ''),
                'expense_this_month'=> number_format($expenseMonth, 2, '.', ''),
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
