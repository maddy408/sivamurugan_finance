<?php
namespace App\Controllers;

use App\Auth\Guard;
use App\Core\Database;
use App\Core\ListQuery;
use App\Core\Request;
use App\Core\Response;
use App\Services\ScheduleService;
use App\Support\Xlsx;

/**
 * GET /api/pending-dues
 *
 * Customers who still owe money, grouped by customer -> chit. "Owing" is decided
 * purely from ACTUAL saved payments: outstanding = SUM(installments.balance_amount)
 * where balance_amount = payable_amount - paid_amount (floored at 0). A fully paid
 * installment (balance 0) drops out; a chit with every installment paid drops out;
 * a customer with nothing outstanding does not appear.
 */
class PendingController
{
    private function build(Request $req, array $user): array
    {
        $db = Database::instance();
        $where = ["l.status = 'active'", 'l.deleted_at IS NULL'];
        $params = [];

        [$scopeSql, $sp] = Guard::loanScopeSql($user, 'l');
        $where[] = $scopeSql;
        $params += $sp;

        if (($q = ListQuery::search($req)) !== '') {
            $where[] = '(c.name LIKE :q OR c.customer_code LIKE :q OR c.mobile LIKE :q OR l.code LIKE :q OR c.address_line1 LIKE :q)';
            $params['q'] = "%$q%";
        }
        // No location-based filtering: address is plain customer text, not a
        // filterable/master-backed dimension.
        $whereSql = implode(' AND ', $where);

        $chits = $db->fetchAll(
            "SELECT l.id AS chit_id, l.code AS chit_code, l.principal_amount, l.installment_amount,
                    l.frequency, l.start_date,
                    c.id AS customer_id, c.name AS customer_name, c.customer_code, c.mobile,
                    c.address_line1, COALESCE(NULLIF(c.location,''), l.location) AS location_name,
                    (SELECT COALESCE(SUM(i.payable_amount),0) FROM installments i WHERE i.loan_id = l.id) AS scheduled_total,
                    (SELECT COALESCE(SUM(i.paid_amount),0)    FROM installments i WHERE i.loan_id = l.id) AS paid_total,
                    (SELECT COALESCE(SUM(i.balance_amount),0) FROM installments i WHERE i.loan_id = l.id) AS outstanding
             FROM loans_or_chits l
             JOIN customers c ON c.id = l.customer_id
             WHERE $whereSql
             HAVING outstanding > 0
             ORDER BY c.name, l.code",
            $params
        );

        $dateFrom = $req->queryParam('date_from') ?: null;
        $dateTo   = $req->queryParam('date_to') ?: null;

        foreach ($chits as &$ch) {
            ScheduleService::refreshOverdue((int)$ch['chit_id']);
            $dueWhere = ['loan_id = :l', 'balance_amount > 0'];
            $dueParams = ['l' => $ch['chit_id']];
            if ($dateFrom) { $dueWhere[] = 'due_date >= :df'; $dueParams['df'] = $dateFrom; }
            if ($dateTo)   { $dueWhere[] = 'due_date <= :dt'; $dueParams['dt'] = $dateTo; }
            $ch['due_installments'] = $db->fetchAll(
                "SELECT installment_no, due_date, payable_amount, paid_amount, balance_amount, status, last_paid_date
                 FROM installments WHERE " . implode(' AND ', $dueWhere) . " ORDER BY installment_no",
                $dueParams
            );
            $ch['next_due'] = $ch['due_installments'][0] ?? null;
            $ch['overdue_count'] = 0;
            $ch['outstanding'] = 0;
            foreach ($ch['due_installments'] as $d) {
                if ($d['status'] === 'OVERDUE') $ch['overdue_count']++;
                $ch['outstanding'] += (float)$d['balance_amount'];
            }
        }
        unset($ch);

        // When a date range is applied, only chits with at least one due
        // installment inside that range remain relevant.
        if ($dateFrom || $dateTo) {
            $chits = array_values(array_filter($chits, fn($ch) => count($ch['due_installments']) > 0));
        }

        // group by customer
        $byCust = [];
        foreach ($chits as $ch) {
            $cid = $ch['customer_id'];
            if (!isset($byCust[$cid])) {
                $byCust[$cid] = [
                    'customer_id' => $cid, 'customer_name' => $ch['customer_name'],
                    'customer_code' => $ch['customer_code'], 'mobile' => $ch['mobile'],
                    'address' => $ch['address_line1'], 'location' => $ch['location_name'],
                    'total_outstanding' => 0.0, 'chits' => [],
                ];
            }
            $byCust[$cid]['total_outstanding'] += (float)$ch['outstanding'];
            $byCust[$cid]['chits'][] = $ch;
        }
        $customers = array_values($byCust);
        usort($customers, fn($a, $b) => $b['total_outstanding'] <=> $a['total_outstanding']);

        $grandTotal = array_sum(array_map(fn($c) => $c['total_outstanding'], $customers));
        foreach ($customers as &$c) {
            $c['total_outstanding'] = number_format($c['total_outstanding'], 2, '.', '');
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
                'total_outstanding'  => number_format($grandTotal, 2, '.', ''),
            ],
        ]);
    }

    /** GET /api/pending-dues/export */
    public function export(Request $req): void
    {
        $user = Guard::authorize($req, 'pending.view');
        [, $chits] = $this->build($req, $user);
        Xlsx::stream('pending_dues_' . date('Ymd_His') . '.xlsx',
            ['Customer', 'Customer Code', 'Phone', 'Location', 'Chit Code', 'Chit Amount', 'Installment Amount', 'Scheduled', 'Paid', 'Outstanding', 'Overdue Installments', 'Next Due Date'],
            array_map(fn($ch) => [
                $ch['customer_name'], $ch['customer_code'], $ch['mobile'], $ch['location_name'],
                $ch['chit_code'], (float)$ch['principal_amount'], (float)$ch['installment_amount'],
                (float)$ch['scheduled_total'], (float)$ch['paid_total'], (float)$ch['outstanding'],
                (int)$ch['overdue_count'], $ch['next_due']['due_date'] ?? '',
            ], $chits),
            [['Pending Dues', 'generated ' . date('Y-m-d H:i')], ['Rows', count($chits)]],
            [5 => 'number', 6 => 'number', 7 => 'number', 8 => 'number', 9 => 'number', 10 => 'number', 11 => 'date']
        );
    }
}
