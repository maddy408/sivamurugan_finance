<?php
namespace App\Controllers;

use App\Auth\Guard;
use App\Core\Database;
use App\Core\ListQuery;
use App\Core\Request;
use App\Core\Response;
use App\Services\ScheduleService;
use App\Support\BusinessDate;
use App\Support\Xlsx;

/**
 * GET /api/pending-dues
 *
 * Shows only customers and chits that have actual MATURED pending dues
 * (i.e. due_date <= today/asOf with balance_amount > 0).
 * Future scheduled installments (e.g. months ahead in the chit) are NOT
 * included in pending dues so customers and agents are never confused by
 * total future chit values.
 */
class PendingController
{
    private function build(Request $req, array $user): array
    {
        $db = Database::instance();
        $today = BusinessDate::fmt(BusinessDate::today());
        $asOfDate = $req->queryParam('date_to') ?: $today;
        $dateFrom = $req->queryParam('date_from');

        $where = ["l.status = 'active'", 'l.deleted_at IS NULL'];
        $params = ['as_of' => $asOfDate];

        [$scopeSql, $sp] = Guard::loanScopeSql($user, 'l');
        $where[] = $scopeSql;
        $params += $sp;

        if (($q = ListQuery::search($req)) !== '') {
            $where[] = '(c.name LIKE :q OR c.customer_code LIKE :q OR c.mobile LIKE :q OR l.code LIKE :q OR c.address_line1 LIKE :q)';
            $params['q'] = "%$q%";
        }
        $whereSql = implode(' AND ', $where);

        $dateFromCond = '';
        if ($dateFrom) {
            $dateFromCond = ' AND i.due_date >= :df';
            $params['df'] = $dateFrom;
        }

        $chits = $db->fetchAll(
            "SELECT l.id AS chit_id, l.code AS chit_code, l.principal_amount, l.installment_amount,
                    l.frequency, l.start_date,
                    c.id AS customer_id, c.name AS customer_name, c.customer_code, c.mobile,
                    c.address_line1, COALESCE(NULLIF(c.location,''), l.location) AS location_name,
                    (SELECT COALESCE(SUM(i.payable_amount),0) FROM installments i WHERE i.loan_id = l.id) AS scheduled_total,
                    (SELECT COALESCE(SUM(i.paid_amount),0)    FROM installments i WHERE i.loan_id = l.id) AS paid_total,
                    (SELECT COALESCE(SUM(i.balance_amount),0) FROM installments i WHERE i.loan_id = l.id) AS total_chit_balance,
                    (SELECT COALESCE(SUM(i.balance_amount),0) FROM installments i WHERE i.loan_id = l.id AND i.due_date <= :as_of $dateFromCond) AS pending_due_amount,
                    (SELECT COALESCE(SUM(i.balance_amount),0) FROM installments i WHERE i.loan_id = l.id AND i.status = 'OVERDUE') AS overdue_amount,
                    (SELECT COUNT(*)                          FROM installments i WHERE i.loan_id = l.id AND i.status = 'OVERDUE') AS overdue_count
             FROM loans_or_chits l
             JOIN customers c ON c.id = l.customer_id
             WHERE $whereSql
             HAVING pending_due_amount > 0
             ORDER BY pending_due_amount DESC, c.name ASC",
            $params
        );

        foreach ($chits as &$ch) {
            ScheduleService::refreshOverdue((int)$ch['chit_id']);
            $ch['due_installments'] = $db->fetchAll(
                "SELECT id, installment_no, due_date, payable_amount, paid_amount, balance_amount, status, last_paid_date
                 FROM installments
                 WHERE loan_id = :l AND balance_amount > 0 AND due_date <= :as_of $dateFromCond
                 ORDER BY installment_no",
                $params + ['l' => $ch['chit_id']]
            );
            $ch['next_due'] = $ch['due_installments'][0] ?? null;
            // Map outstanding to the actual pending due amount
            $ch['outstanding'] = (float)$ch['pending_due_amount'];
            $ch['overdue_amount'] = (float)$ch['overdue_amount'];
            $ch['overdue_count'] = (int)$ch['overdue_count'];
        }
        unset($ch);

        // group by customer
        $byCust = [];
        foreach ($chits as $ch) {
            $cid = $ch['customer_id'];
            if (!isset($byCust[$cid])) {
                $byCust[$cid] = [
                    'customer_id' => $cid,
                    'customer_name' => $ch['customer_name'],
                    'customer_code' => $ch['customer_code'],
                    'mobile' => $ch['mobile'],
                    'address' => $ch['address_line1'],
                    'location' => $ch['location_name'],
                    'total_pending_due' => 0.0,
                    'total_outstanding' => 0.0,
                    'total_overdue' => 0.0,
                    'overdue_count' => 0,
                    'chits' => [],
                ];
            }
            $dueAmt = (float)$ch['pending_due_amount'];
            $byCust[$cid]['total_pending_due'] += $dueAmt;
            $byCust[$cid]['total_outstanding'] += $dueAmt;
            $byCust[$cid]['total_overdue'] += (float)$ch['overdue_amount'];
            $byCust[$cid]['overdue_count'] += (int)$ch['overdue_count'];
            $byCust[$cid]['chits'][] = $ch;
        }
        $customers = array_values($byCust);
        usort($customers, fn($a, $b) => $b['total_pending_due'] <=> $a['total_pending_due']);

        $grandTotal = array_sum(array_map(fn($c) => $c['total_pending_due'], $customers));
        foreach ($customers as &$c) {
            $c['total_pending_due'] = number_format($c['total_pending_due'], 2, '.', '');
            $c['total_outstanding'] = number_format($c['total_outstanding'], 2, '.', '');
            $c['total_overdue'] = number_format($c['total_overdue'], 2, '.', '');
        }
        unset($c);

        return [$customers, $chits, $grandTotal];
    }

    /** GET /api/pending-dues */
    public function index(Request $req): void
    {
        $user = Guard::authorize($req, 'pending.view');
        [$customers, , $grandTotal] = $this->build($req, $user);

        // simple server-side pagination over the grouped customers
        $page = ListQuery::page($req);
        $perPage = ListQuery::perPage($req, 25);
        $total = count($customers);
        $slice = array_slice($customers, ($page - 1) * $perPage, $perPage);

        Response::ok($slice, 'OK', [
            'total' => $total, 'page' => $page, 'per_page' => $perPage,
            'total_pages' => (int)max(1, ceil($total / $perPage)),
            'summary' => [
                'pending_customers'  => $total,
                'total_pending_dues' => number_format($grandTotal, 2, '.', ''),
                'total_outstanding'  => number_format($grandTotal, 2, '.', ''),
            ],
        ]);
    }

    /** GET /api/pending-dues/export */
    public function export(Request $req): void
    {
        $user = Guard::authorize($req, 'pending.view');
        [, $chits, $grandTotal] = $this->build($req, $user);
        $rows = [];
        foreach ($chits as $ch) {
            foreach ($ch['due_installments'] as $d) {
                $rows[] = [
                    $ch['customer_name'],
                    $ch['customer_code'],
                    $ch['mobile'],
                    $ch['location_name'],
                    $ch['chit_code'],
                    'Due #' . $d['installment_no'],
                    $d['due_date'],
                    (float)$d['payable_amount'],
                    (float)$d['paid_amount'],
                    (float)$d['balance_amount'],
                    $d['status'],
                ];
            }
        }
        Xlsx::stream('pending_dues_' . date('Ymd_His') . '.xlsx',
            ['Customer', 'Customer Code', 'Phone', 'Location', 'Chit Code', 'Due Number', 'Due Date', 'Installment (EMI)', 'Paid Amount', 'Due Balance', 'Status'],
            $rows,
            [['Pending Dues Itemized Report', 'Total Pending: Rs. ' . number_format($grandTotal, 2)], ['Total Dues Listed', count($rows)]],
            [6 => 'date', 7 => 'number', 8 => 'number', 9 => 'number']
        );
    }
}
