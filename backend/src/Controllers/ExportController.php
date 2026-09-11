<?php
namespace App\Controllers;

use App\Auth\Guard;
use App\Core\Database;
use App\Core\ListQuery;
use App\Core\Request;
use App\Support\Audit;
use App\Support\Xlsx;

/**
 * Real .xlsx exports for the master-data tables. Each export runs the SAME
 * filtered query as its list screen (search + filters), so the file always
 * matches what the user is looking at - and it contains every matching row,
 * not just the current page.
 *
 * There is no location-based filtering: "location" is just typed customer text.
 */
class ExportController
{
    public function customers(Request $req): void
    {
        $user = Guard::authorize($req, 'customers.export');
        $db = Database::instance();
        $where = ['c.deleted_at IS NULL']; $params = [];
        if (($q = ListQuery::search($req)) !== '') {
            $where[] = '(c.name LIKE :q OR c.customer_code LIKE :q OR c.mobile LIKE :q OR c.address_line1 LIKE :q)';
            $params['q'] = "%$q%";
        }
        if ($st = $req->queryParam('status')) { $where[] = 'c.status = :st'; $params['st'] = $st; }
        $rows = $db->fetchAll(
            "SELECT c.customer_code, c.name, c.mobile, c.alt_mobile, c.address_line1,
                    c.nominee_name, c.nominee_mobile, c.status, c.created_at,
                    (SELECT COUNT(*) FROM loans_or_chits l WHERE l.customer_id = c.id AND l.status='active' AND l.deleted_at IS NULL) AS active_chits
             FROM customers c
             WHERE " . implode(' AND ', $where) . " ORDER BY c.name",
            $params
        );
        $this->done($user, 'customers');
        Xlsx::stream('customers_' . date('Ymd_His') . '.xlsx',
            ['Code', 'Name', 'Mobile', 'Alt Mobile', 'Address', 'Nominee', 'Nominee Mobile', 'Status', 'Active Chits', 'Created'],
            array_map(fn($r) => [$r['customer_code'], $r['name'], $r['mobile'], $r['alt_mobile'], $r['address_line1'],
                $r['nominee_name'], $r['nominee_mobile'], $r['status'], (int)$r['active_chits'], substr((string)$r['created_at'], 0, 10)], $rows),
            [['Customers export', 'generated ' . date('Y-m-d H:i')], ['Rows', count($rows)]],
            [8 => 'number', 9 => 'date']);
    }

    public function chits(Request $req): void
    {
        $user = Guard::authorize($req, 'loans.export');
        $db = Database::instance();
        $where = ['l.deleted_at IS NULL']; $params = [];
        if (($q = ListQuery::search($req)) !== '') {
            $where[] = '(l.code LIKE :q OR c.name LIKE :q OR c.customer_code LIKE :q)';
            $params['q'] = "%$q%";
        }
        foreach (['status' => 'l.status', 'frequency' => 'l.frequency', 'customer_id' => 'l.customer_id'] as $k => $col) {
            if (($v = $req->queryParam($k)) !== null && $v !== '') { $where[] = "$col = :$k"; $params[$k] = $v; }
        }
        $rows = $db->fetchAll(
            "SELECT l.code, c.name AS customer, c.customer_code, l.principal_amount, l.installment_amount,
                    l.tenure, l.frequency, l.schedule_type, l.start_date,
                    COALESCE(NULLIF(c.location,''), l.location) AS location, l.status,
                    (SELECT COALESCE(SUM(paid_amount),0) FROM installments i WHERE i.loan_id = l.id) AS collected,
                    (SELECT COALESCE(SUM(balance_amount),0) FROM installments i WHERE i.loan_id = l.id) AS outstanding
             FROM loans_or_chits l JOIN customers c ON c.id = l.customer_id
             WHERE " . implode(' AND ', $where) . " ORDER BY l.created_at DESC",
            $params
        );
        $this->done($user, 'chits');
        Xlsx::stream('chits_' . date('Ymd_His') . '.xlsx',
            ['Code', 'Customer', 'Customer Code', 'Chit Amount', 'Installment Amount', 'Tenure', 'Frequency', 'Schedule', 'Start Date', 'Location', 'Status', 'Collected', 'Outstanding'],
            array_map(fn($r) => [$r['code'], $r['customer'], $r['customer_code'], (float)$r['principal_amount'], (float)$r['installment_amount'],
                (int)$r['tenure'], $r['frequency'], $r['schedule_type'], $r['start_date'], $r['location'], $r['status'], (float)$r['collected'], (float)$r['outstanding']], $rows),
            [['Chits export', 'generated ' . date('Y-m-d H:i')], ['Rows', count($rows)]],
            [3 => 'number', 4 => 'number', 5 => 'number', 8 => 'date', 11 => 'number', 12 => 'number']);
    }

    public function collections(Request $req): void
    {
        $user = Guard::authorize($req, ['collection.export', 'reports.export']);
        $db = Database::instance();
        $where = ["col.status = 'posted'", 'col.deleted_at IS NULL']; $params = [];
        if ($f = $req->queryParam('date_from')) { $where[] = 'col.collection_date >= :f'; $params['f'] = $f; }
        if ($t = $req->queryParam('date_to'))   { $where[] = 'col.collection_date <= :t'; $params['t'] = $t; }
        if ($lid = $req->queryParam('loan_id')) { $where[] = 'col.loan_id = :lid'; $params['lid'] = (int)$lid; }
        if ($cid = $req->queryParam('customer_id')) { $where[] = 'col.customer_id = :cid'; $params['cid'] = (int)$cid; }
        if ($pm = $req->queryParam('payment_mode_id')) { $where[] = 'col.payment_mode_id = :pm'; $params['pm'] = (int)$pm; }
        $rows = $db->fetchAll(
            "SELECT col.receipt_no, col.collection_date, cu.name AS customer, l.code AS chit,
                    col.amount, col.fine_amount, col.total_amount, pm.name AS payment_mode,
                    u.name AS collected_by, COALESCE(NULLIF(cu.location,''), col.location) AS location
             FROM collections col
             JOIN loans_or_chits l ON l.id = col.loan_id
             JOIN customers cu ON cu.id = col.customer_id
             JOIN payment_modes pm ON pm.id = col.payment_mode_id
             LEFT JOIN users u ON u.id = col.collected_by
             WHERE " . implode(' AND ', $where) . " ORDER BY col.collection_date DESC, col.id DESC",
            $params
        );
        $tot = array_sum(array_map(fn($r) => (float)$r['amount'], $rows));
        $this->done($user, 'collections');
        Xlsx::stream('collections_' . date('Ymd_His') . '.xlsx',
            ['Receipt', 'Date', 'Customer', 'Chit', 'Amount Paid', 'Fine', 'Total', 'Payment Mode', 'Collected By', 'Location'],
            array_map(fn($r) => [$r['receipt_no'], $r['collection_date'], $r['customer'], $r['chit'],
                (float)$r['amount'], (float)$r['fine_amount'], (float)$r['total_amount'], $r['payment_mode'], $r['collected_by'], $r['location']], $rows),
            [['Collections export', 'generated ' . date('Y-m-d H:i')], ['Total actual collected', $tot], ['Rows', count($rows)]],
            [1 => 'date', 4 => 'number', 5 => 'number', 6 => 'number']);
    }

    public function employees(Request $req): void
    {
        $user = Guard::authorize($req, 'employees.view');
        $rows = Database::instance()->fetchAll(
            "SELECT e.emp_code, u.name, u.username, u.email, u.phone, u.is_active, u.last_login_at,
                    (SELECT COUNT(*) FROM loan_assignments la WHERE la.employee_id = e.id AND la.is_active=1) AS chits
             FROM users u JOIN roles r ON r.id = u.role_id JOIN employees e ON e.user_id = u.id
             WHERE r.code = 'EMPLOYEE' ORDER BY u.name"
        );
        $this->done($user, 'employees');
        Xlsx::stream('employees_' . date('Ymd_His') . '.xlsx',
            ['Code', 'Name', 'Username', 'Email', 'Phone', 'Active', 'Last Login', 'Chits'],
            array_map(fn($r) => [$r['emp_code'], $r['name'], $r['username'], $r['email'], $r['phone'],
                $r['is_active'] ? 'Yes' : 'No', substr((string)$r['last_login_at'], 0, 10), (int)$r['chits']], $rows),
            [['Employees export', 'generated ' . date('Y-m-d H:i')]],
            [7 => 'number']);
    }

    private function done(array $user, string $what): void
    {
        Audit::log('export.' . $what, 'export', $what, null, null, ['format' => 'xlsx'], null,
            ['id' => $user['id'], 'role_code' => $user['role_code']]);
    }
}
