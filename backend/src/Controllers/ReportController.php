<?php
namespace App\Controllers;

use App\Auth\Guard;
use App\Core\App;
use App\Core\Database;
use App\Core\HttpException;
use App\Core\Request;
use App\Core\Response;
use App\Support\Audit;
use App\Support\BusinessDate;
use App\Support\Xlsx;

/**
 * Reports engine.
 *
 * Every report is built with backend SQL against the live database - no figure
 * is ever computed from what the client is showing. Filters are applied in SQL.
 * Exports stream the COMPLETE filtered result set (real .xlsx, never CSV).
 * Employees (if granted reports.view) only ever see rows inside their assigned
 * location / loan scope - the scope is enforced in SQL, not the UI.
 *
 * Financial consistency: a collection is money IN, a distribution / expense is
 * money OUT, creating a chit moves nothing, cancelled rows count for nothing.
 * These rules match FinanceService / CollectionService / DistributionService.
 */
class ReportController
{
    /** name => [label, kind]  kind: table | summary  */
    private const CATALOGUE = [
        'chit-opening'        => ['New Chits (Opening) Report', 'table'],
        'chit-closing'        => ['Closed Chits Report', 'table'],
        'chit-collection'     => ['Chit Collection Report (per due)', 'table'],
        'customer-collection' => ['Customer-wise Collection Report', 'table'],
        'daily-collection'    => ['Daily Collection Report', 'table'],
        'employee-collection' => ['Employee-wise Collection Report', 'table'],
        'location-collection' => ['Location-wise Collection Report', 'table'],
        'chit-distribution'   => ['Chit Distribution Report', 'table'],
        'pending-dues'        => ['Pending Dues Report', 'table'],
        'chit-profit'         => ['Chit Profit / Summary Report', 'table'],
        'monthly-summary'     => ['Monthly Chit Summary', 'summary'],
        'financial-ledger'    => ['Financial Account Report', 'table'],
    ];

    private const EMP_NAME_SUBQ =
        "(SELECT u2.name FROM loan_assignments la2
            JOIN employees e2 ON e2.id = la2.employee_id
            JOIN users u2 ON u2.id = e2.user_id
          WHERE la2.loan_id = l.id AND la2.is_active = 1
          ORDER BY la2.id DESC LIMIT 1)";

    /* ================================================================ routes */

    /** GET /api/reports */
    public function catalogue(Request $req): void
    {
        Guard::authorize($req, 'reports.view');
        $out = [];
        foreach (self::CATALOGUE as $name => [$label, $kind]) {
            $out[] = ['name' => $name, 'label' => $label, 'kind' => $kind];
        }
        Response::ok($out);
    }

    /** GET /api/reports/summary  - dashboard cards for the current filter range */
    public function summary(Request $req): void
    {
        $user = Guard::authorize($req, 'reports.view');
        $f = $this->filters($req, $user);
        Response::ok([
            'filters' => $this->filterEcho($f),
            'cards'   => $this->metrics($f, $user),
            'generated_at' => date('c'),
        ]);
    }

    /** GET /api/reports/{name} */
    public function show(Request $req, array $args): void
    {
        $user = Guard::authorize($req, 'reports.view');
        $name = $args['name'];
        if (!isset(self::CATALOGUE[$name])) {
            throw HttpException::notFound('Unknown report');
        }
        $f = $this->filters($req, $user);
        $r = $this->build($name, $f, $user);

        Audit::log('report.generate', 'reports', 'report', $name, null,
            ['filters' => $this->filterEcho($f), 'rows' => count($r['rows'])], null,
            ['id' => $user['id'], 'role_code' => $user['role_code']]);

        Response::ok([
            'report'       => $name,
            'kind'         => self::CATALOGUE[$name][1],
            'title'        => $r['title'],
            'headers'      => $r['headers'],
            'col_types'    => $r['col_types'],
            'rows'         => $r['rows'],
            'totals'       => $r['totals'],
            'filters'      => $this->filterEcho($f),
            'generated_at' => date('c'),
        ]);
    }

    /** GET /api/reports/{name}/export  - one report, one sheet */
    public function export(Request $req, array $args): void
    {
        $user = Guard::authorize($req, 'reports.export');
        $name = $args['name'];
        if (!isset(self::CATALOGUE[$name])) {
            throw HttpException::notFound('Unknown report');
        }
        $f = $this->filters($req, $user);
        $r = $this->build($name, $f, $user);

        Audit::log('report.export', 'reports', 'report', $name, null,
            ['filters' => $this->filterEcho($f), 'rows' => count($r['rows'])], null,
            ['id' => $user['id'], 'role_code' => $user['role_code']]);

        $sheet = $this->sheet($r, $name, $f);
        Xlsx::book($name . '_' . date('Ymd_His') . '.xlsx', [$sheet]);
    }

    /** GET /api/reports/full-export  - one workbook, every report as a sheet */
    public function fullExport(Request $req): void
    {
        $user = Guard::authorize($req, 'reports.export');
        $f = $this->filters($req, $user);

        Audit::log('report.export', 'reports', 'report', 'full-workbook', null,
            ['filters' => $this->filterEcho($f)], null,
            ['id' => $user['id'], 'role_code' => $user['role_code']]);

        $org = $this->orgName();
        $period = $this->periodLabel($f);
        $sheets = [];

        // sheet 1: summary
        $cards = $this->metrics($f, $user);
        $sheets[] = [
            'name'     => 'Summary',
            'title'    => strtoupper($org),
            'subtitle' => ['Chit Summary', 'Period: ' . $period, 'Generated: ' . date('d-m-Y H:i')],
            'headers'  => ['Metric', 'Value'],
            'colTypes' => [1 => 'number'],
            'rows'     => array_map(fn ($k, $v) => [$this->cardLabel($k), $v], array_keys($cards), array_values($cards)),
        ];

        $tabMap = [
            'chit-opening' => 'Chit Opening', 'chit-closing' => 'Chit Closing',
            'chit-collection' => 'Collections', 'customer-collection' => 'Customer Summary',
            'daily-collection' => 'Daily Collection', 'employee-collection' => 'Employee Summary',
            'location-collection' => 'Location Summary', 'chit-distribution' => 'Distribution',
            'pending-dues' => 'Pending Dues', 'chit-profit' => 'Chit Profit',
            'monthly-summary' => 'Monthly Summary', 'financial-ledger' => 'Financial',
        ];
        foreach ($tabMap as $name => $tab) {
            $r = $this->build($name, $f, $user);
            $sheets[] = $this->sheet($r, $name, $f, $tab);
        }

        Xlsx::book('chit_reports_' . date('Ymd_His') . '.xlsx', $sheets);
    }

    /** GET /api/reports/templates/{type}  - blank import template (chit|collection|expense) */
    public function template(Request $req, array $args): void
    {
        Guard::authorize($req, 'reports.export');
        $type = $args['type'] ?? '';
        $today = BusinessDate::fmt(BusinessDate::today());

        $defs = [
            'chit' => [
                'headers' => ['Customer Code*', 'Chit Code (optional)', 'Chit Amount*', 'EMI Amount*',
                              'Tenure*', 'Frequency* (daily/weekly/monthly)', 'Start Date* (YYYY-MM-DD)',
                              'Distributed Amount (optional)', 'Remarks'],
                'example' => ['CUS0001', 'JRM-001', 40000, 2000, 20, 'monthly', $today, 0, 'New chit'],
            ],
            'collection' => [
                'headers' => ['Chit Code*', 'Collection Date* (YYYY-MM-DD)', 'Due Numbers* (e.g. 1 or 1,2,3)',
                              'Installment Amount*', 'Fine Amount (optional)', 'Payment Method* (Cash/UPI/Bank)',
                              'Reference No', 'Remarks'],
                'example' => ['JRM-001', $today, '1,2', 6000, 0, 'Cash', 'UPI-12345', 'On time'],
            ],
            'expense' => [
                'headers' => ['Expense Date* (YYYY-MM-DD)', 'Amount*', 'Category*', 'Account* (Office Cash/Bank)', 'Remarks'],
                'example' => [$today, 1500, 'Travel', 'Office Cash', 'Field visit fuel'],
            ],
        ];
        if (!isset($defs[$type])) {
            throw HttpException::notFound('Unknown template type');
        }
        $d = $defs[$type];
        Xlsx::book($type . '_import_template.xlsx', [[
            'name'     => ucfirst($type) . ' Template',
            'title'    => strtoupper($this->orgName()),
            'subtitle' => [ucfirst($type) . ' import template', 'Columns marked * are required',
                           'Delete the example row before importing', 'Dates: YYYY-MM-DD   Amounts: numbers only, no ₹ or commas'],
            'headers'  => $d['headers'],
            'rows'     => [$d['example']],
        ]]);
    }

    /* ============================================================ filtering */

    private function filters(Request $req, array $user): array
    {
        $p = fn (string $k) => (($v = $req->queryParam($k)) !== null && $v !== '') ? $v : null;

        $from = $p('date_from');
        $to   = $p('date_to');

        $range = $p('range');
        $t = BusinessDate::today();
        if ($range === 'today') {
            $from = $to = $t->format('Y-m-d');
        } elseif ($range === 'this_week') {
            $dow = (int) $t->format('N');
            $from = $t->modify('-' . ($dow - 1) . ' days')->format('Y-m-d');
            $to   = $t->modify('+' . (7 - $dow) . ' days')->format('Y-m-d');
        } elseif ($range === 'this_month') {
            $from = $t->format('Y-m-01');
            $to   = $t->format('Y-m-t');
        } elseif ($range === 'last_month') {
            $lm = $t->modify('first day of last month');
            $from = $lm->format('Y-m-01');
            $to   = $lm->format('Y-m-t');
        } elseif ($p('month') && $p('year')) {
            $y = (int) $p('year'); $m = max(1, min(12, (int) $p('month')));
            $first = (new \DateTimeImmutable(sprintf('%04d-%02d-01', $y, $m)));
            $from = $first->format('Y-m-d');
            $to   = $first->format('Y-m-t');
        } elseif ($p('year')) {
            $y = (int) $p('year');
            $from = sprintf('%04d-01-01', $y);
            $to   = sprintf('%04d-12-31', $y);
        }

        // chit code -> loan id
        $loanId = $p('loan_id') ? (int) $p('loan_id') : null;
        if (!$loanId && ($code = $p('chit_code'))) {
            $loanId = (int) Database::instance()->scalar(
                'SELECT id FROM loans_or_chits WHERE code = :c AND deleted_at IS NULL', ['c' => $code]
            ) ?: -1;
        }

        // Location is plain typed customer text now — an optional exact-match filter.
        $locationId = $p('location_id');

        return [
            'from'            => $from,
            'to'              => $to,
            'location_id'     => $locationId,
            'employee_id'     => $p('employee_id') ? (int) $p('employee_id') : null,
            'customer_id'     => $p('customer_id') ? (int) $p('customer_id') : null,
            'loan_id'         => $loanId,
            'payment_mode_id' => $p('payment_mode_id') ? (int) $p('payment_mode_id') : null,
            'status'          => $p('status'),
            'frequency'       => $p('frequency'),
        ];
    }

    private function filterEcho(array $f): array
    {
        $out = [];
        foreach ($f as $k => $v) {
            if ($v !== null && $v !== '') {
                $out[$k] = $v;
            }
        }
        $out['period'] = $this->periodLabel($f);
        return $out;
    }

    private function periodLabel(array $f): string
    {
        if ($f['from'] && $f['to']) {
            return date('d-m-Y', strtotime($f['from'])) . ' to ' . date('d-m-Y', strtotime($f['to']));
        }
        if ($f['from']) return 'from ' . date('d-m-Y', strtotime($f['from']));
        if ($f['to'])   return 'up to ' . date('d-m-Y', strtotime($f['to']));
        return 'All time';
    }

    /** [" AND (scope sql)", params]  - or ['', []] for unrestricted. */
    private function scope(array $user, string $alias = 'l'): array
    {
        if (Guard::scopeIsUnrestricted($user)) {
            return ['', []];
        }
        [$sql, $p] = Guard::loanScopeSql($user, $alias);
        return [' AND ' . $sql, $p];
    }

    /** date-range clause on $col ; returns [" AND ...", params] */
    private function dateRange(array $f, string $col, string $prefix = 'dr'): array
    {
        $sql = ''; $p = [];
        if ($f['from']) { $sql .= " AND $col >= :{$prefix}_from"; $p["{$prefix}_from"] = $f['from']; }
        if ($f['to'])   { $sql .= " AND $col <= :{$prefix}_to";   $p["{$prefix}_to"]   = $f['to']; }
        return [$sql, $p];
    }

    /* ================================================================ build */

    /**
     * @return array{title:string,headers:string[],col_types:array<string,string>,rows:array<int,array>,totals:array<string,mixed>}
     */
    private function build(string $name, array $f, array $user): array
    {
        return match ($name) {
            'chit-opening'        => $this->rptChitOpening($f, $user),
            'chit-closing'        => $this->rptChitClosing($f, $user),
            'chit-collection'     => $this->rptChitCollection($f, $user),
            'customer-collection' => $this->rptCustomerCollection($f, $user),
            'daily-collection'    => $this->rptDailyCollection($f, $user),
            'employee-collection' => $this->rptEmployeeCollection($f, $user),
            'location-collection' => $this->rptLocationCollection($f, $user),
            'chit-distribution'   => $this->rptChitDistribution($f, $user),
            'pending-dues'        => $this->rptPendingDues($f, $user),
            'chit-profit'         => $this->rptChitProfit($f, $user),
            'monthly-summary'     => $this->rptMonthlySummary($f, $user),
            'financial-ledger'    => $this->rptFinancialLedger($f, $user),
            default              => throw HttpException::notFound('Unknown report'),
        };
    }

    private function result(string $title, array $headers, array $types, array $rows, array $totals): array
    {
        // types: header => 'money'|'number'|'date'|'text'
        $ct = [];
        foreach ($headers as $h) {
            $ct[$h] = $types[$h] ?? 'text';
        }
        return ['title' => $title, 'headers' => $headers, 'col_types' => $ct, 'rows' => $rows, 'totals' => $totals];
    }

    /** append cumulative running-total columns (in current row order) */
    private function running(array &$r, array $map): void
    {
        foreach ($map as $src => $dst) {
            $r['headers'][] = $dst;
            $r['col_types'][$dst] = 'money';
            $acc = 0.0;
            foreach ($r['rows'] as &$row) {
                $acc += (float) ($row[$src] ?? 0);
                $row[$dst] = round($acc, 2);
            }
            unset($row);
            if (isset($r['totals'][$src])) {
                $r['totals'][$dst] = round($acc, 2);
            }
        }
    }

    /* ---------------------------------------------------------- 1. opening */

    private function rptChitOpening(array $f, array $user): array
    {
        $db = Database::instance();
        [$sc, $sp] = $this->scope($user, 'l');
        [$dr, $dp] = $this->dateRange($f, 'l.start_date');
        $w = "l.deleted_at IS NULL $sc $dr";
        $p = $sp + $dp;

        if ($f['status'])      { $w .= ' AND l.status = :st';        $p['st'] = $f['status']; }
        else                   { $w .= " AND l.status <> 'cancelled'"; }
        if ($f['location_id']) { $w .= ' AND cu.location = :loc'; $p['loc'] = $f['location_id']; }
        if ($f['customer_id']) { $w .= ' AND l.customer_id = :cid';  $p['cid'] = $f['customer_id']; }
        if ($f['loan_id'])     { $w .= ' AND l.id = :lid';           $p['lid'] = $f['loan_id']; }
        if ($f['frequency'])   { $w .= ' AND l.frequency = :fr';     $p['fr'] = $f['frequency']; }
        if ($f['employee_id']) { $w .= ' AND EXISTS (SELECT 1 FROM loan_assignments la WHERE la.loan_id=l.id AND la.is_active=1 AND la.employee_id=:eid)'; $p['eid'] = $f['employee_id']; }

        $sql = "SELECT l.id, l.start_date, l.code, cu.name AS customer,
                       cu.location AS location, " . self::EMP_NAME_SUBQ . " AS employee,
                       l.principal_amount, l.installment_amount, l.frequency, l.tenure, l.status,
                       COALESCE((SELECT SUM(d.amount) FROM distributions d
                                 WHERE d.loan_id=l.id AND d.status='active' AND d.deleted_at IS NULL),0) AS distributed
                FROM loans_or_chits l
                JOIN customers cu ON cu.id = l.customer_id
                WHERE $w
                ORDER BY l.start_date ASC, l.id ASC";
        $raw = $db->fetchAll($sql, $p);

        $rows = []; $i = 0;
        $tAmt = 0; $tEmi = 0; $tDist = 0; $tRem = 0;
        foreach ($raw as $x) {
            $dist = (float) $x['distributed'];
            $rem  = max((float) $x['principal_amount'] - $dist, 0);
            $rows[] = [
                'S.No' => ++$i,
                'Date' => $x['start_date'],
                'Chit Code' => $x['code'],
                'Customer Name' => $x['customer'],
                'Location' => $x['location'] ?: '—',
                'Employee' => $x['employee'] ?: 'Unassigned',
                'Chit Amount' => (float) $x['principal_amount'],
                'EMI Amount' => (float) $x['installment_amount'],
                'Frequency' => ucfirst($x['frequency']),
                'Tenure' => (int) $x['tenure'],
                'Distributed Amount' => $dist,
                'Remaining Undistributed' => $rem,
                'Status' => ucfirst($x['status']),
            ];
            $tAmt += (float) $x['principal_amount']; $tEmi += (float) $x['installment_amount'];
            $tDist += $dist; $tRem += $rem;
        }
        $r = $this->result('NEW CHITS',
            ['S.No','Date','Chit Code','Customer Name','Location','Employee','Chit Amount','EMI Amount','Frequency','Tenure','Distributed Amount','Remaining Undistributed','Status'],
            ['S.No'=>'number','Date'=>'date','Tenure'=>'number','Chit Amount'=>'money','EMI Amount'=>'money','Distributed Amount'=>'money','Remaining Undistributed'=>'money'],
            $rows,
            ['S.No'=>'TOTAL ('.$i.')','Chit Amount'=>round($tAmt,2),'EMI Amount'=>round($tEmi,2),'Distributed Amount'=>round($tDist,2),'Remaining Undistributed'=>round($tRem,2)]
        );
        $this->running($r, ['Chit Amount' => 'Chit Amount Total', 'Distributed Amount' => 'Distributed Total']);
        return $r;
    }

    /* ---------------------------------------------------------- 2. closing */

    private function rptChitClosing(array $f, array $user): array
    {
        $db = Database::instance();
        [$sc, $sp] = $this->scope($user, 'l');
        $p = $sp;
        $w = "l.deleted_at IS NULL AND l.status = 'completed' $sc";
        if ($f['location_id']) { $w .= ' AND cu.location = :loc'; $p['loc'] = $f['location_id']; }
        if ($f['customer_id']) { $w .= ' AND l.customer_id = :cid'; $p['cid'] = $f['customer_id']; }
        if ($f['loan_id'])     { $w .= ' AND l.id = :lid'; $p['lid'] = $f['loan_id']; }
        if ($f['frequency'])   { $w .= ' AND l.frequency = :fr'; $p['fr'] = $f['frequency']; }
        if ($f['employee_id']) { $w .= ' AND EXISTS (SELECT 1 FROM loan_assignments la WHERE la.loan_id=l.id AND la.is_active=1 AND la.employee_id=:eid)'; $p['eid'] = $f['employee_id']; }

        // closed date = last posted collection date (fallback: chit updated_at)
        $sql = "SELECT l.id, l.code, cu.name AS customer, cu.location AS location,
                       " . self::EMP_NAME_SUBQ . " AS employee, l.principal_amount, l.status,
                       COALESCE((SELECT MAX(c.collection_date) FROM collections c
                                 WHERE c.loan_id=l.id AND c.status='posted' AND c.deleted_at IS NULL),
                                DATE(l.updated_at)) AS closed_date,
                       COALESCE((SELECT SUM(c.amount) FROM collections c
                                 WHERE c.loan_id=l.id AND c.status='posted' AND c.deleted_at IS NULL),0) AS emi_collected,
                       COALESCE((SELECT SUM(c.fine_amount) FROM collections c
                                 WHERE c.loan_id=l.id AND c.status='posted' AND c.deleted_at IS NULL),0) AS fine_collected,
                       COALESCE((SELECT SUM(c.total_amount) FROM collections c
                                 WHERE c.loan_id=l.id AND c.status='posted' AND c.deleted_at IS NULL),0) AS total_collection,
                       COALESCE((SELECT SUM(d.amount) FROM distributions d
                                 WHERE d.loan_id=l.id AND d.status='active' AND d.deleted_at IS NULL),0) AS distributed
                FROM loans_or_chits l
                JOIN customers cu ON cu.id = l.customer_id
                WHERE $w
                HAVING 1=1";
        // date-range filter applies to the derived closed_date
        if ($f['from']) { $sql .= ' AND closed_date >= :cf'; $p['cf'] = $f['from']; }
        if ($f['to'])   { $sql .= ' AND closed_date <= :ct'; $p['ct'] = $f['to']; }
        $sql .= ' ORDER BY closed_date ASC, l.id ASC';
        $raw = $db->fetchAll($sql, $p);

        $rows = []; $i = 0;
        $tAmt=0;$tEmi=0;$tFine=0;$tColl=0;$tDist=0;$tProfit=0;
        foreach ($raw as $x) {
            $coll = (float) $x['total_collection'];
            $dist = (float) $x['distributed'];
            $profit = round($coll - $dist, 2);
            $rows[] = [
                'S.No' => ++$i,
                'Closed Date' => $x['closed_date'],
                'Chit Code' => $x['code'],
                'Customer Name' => $x['customer'],
                'Location' => $x['location'] ?: '—',
                'Employee' => $x['employee'] ?: 'Unassigned',
                'Original Chit Amount' => (float) $x['principal_amount'],
                'Total EMI Collected' => (float) $x['emi_collected'],
                'Total Fine Collected' => (float) $x['fine_collected'],
                'Total Collection' => $coll,
                'Distributed Amount' => $dist,
                'Profit / Surplus' => $profit,
                'Status' => 'CLOSED',
            ];
            $tAmt += (float) $x['principal_amount']; $tEmi += (float) $x['emi_collected'];
            $tFine += (float) $x['fine_collected']; $tColl += $coll; $tDist += $dist; $tProfit += $profit;
        }
        $r = $this->result('CLOSED CHITS',
            ['S.No','Closed Date','Chit Code','Customer Name','Location','Employee','Original Chit Amount','Total EMI Collected','Total Fine Collected','Total Collection','Distributed Amount','Profit / Surplus','Status'],
            ['S.No'=>'number','Closed Date'=>'date','Original Chit Amount'=>'money','Total EMI Collected'=>'money','Total Fine Collected'=>'money','Total Collection'=>'money','Distributed Amount'=>'money','Profit / Surplus'=>'money'],
            $rows,
            ['S.No'=>'TOTAL ('.$i.')','Original Chit Amount'=>round($tAmt,2),'Total EMI Collected'=>round($tEmi,2),'Total Fine Collected'=>round($tFine,2),'Total Collection'=>round($tColl,2),'Distributed Amount'=>round($tDist,2),'Profit / Surplus'=>round($tProfit,2)]
        );
        $this->running($r, ['Profit / Surplus' => 'Profit Total', 'Total Collection' => 'Collection Total']);
        return $r;
    }

    /* ------------------------------------------------- 3. collection (per due) */

    private function rptChitCollection(array $f, array $user): array
    {
        $db = Database::instance();
        [$sc, $sp] = $this->scope($user, 'l');
        [$dr, $dp] = $this->dateRange($f, 'col.collection_date');
        $p = $sp + $dp;
        $status = $f['status'] === 'cancelled' ? 'cancelled' : 'posted';
        $w = "col.deleted_at IS NULL AND col.status = :cst $sc $dr";
        $p['cst'] = $status;
        if ($f['location_id'])     { $w .= ' AND cu.location = :loc'; $p['loc'] = $f['location_id']; }
        if ($f['customer_id'])     { $w .= ' AND col.customer_id = :cid'; $p['cid'] = $f['customer_id']; }
        if ($f['loan_id'])         { $w .= ' AND col.loan_id = :lid'; $p['lid'] = $f['loan_id']; }
        if ($f['employee_id'])     { $w .= ' AND col.employee_id = :eid'; $p['eid'] = $f['employee_id']; }
        if ($f['payment_mode_id']) { $w .= ' AND col.payment_mode_id = :pm'; $p['pm'] = $f['payment_mode_id']; }

        $sql = "SELECT col.id, col.collection_date, cu.name AS customer, cu.customer_code,
                       l.code AS chit, cu.location AS location,
                       " . self::EMP_NAME_SUBQ . " AS employee,
                       i.installment_no, ca.principal_alloc, ca.fine_alloc,
                       pm.name AS payment_mode, col.status, u.name AS collected_by
                FROM collection_allocations ca
                JOIN collections col ON col.id = ca.collection_id
                JOIN installments i ON i.id = ca.installment_id
                JOIN loans_or_chits l ON l.id = col.loan_id
                JOIN customers cu ON cu.id = col.customer_id
                JOIN payment_modes pm ON pm.id = col.payment_mode_id
                LEFT JOIN users u ON u.id = col.collected_by
                WHERE $w
                ORDER BY col.collection_date DESC, col.id DESC, i.installment_no ASC";
        $raw = $db->fetchAll($sql, $p);

        $rows = []; $i = 0; $tInst = 0; $tFine = 0; $tTot = 0;
        foreach ($raw as $x) {
            $inst = (float) $x['principal_alloc']; $fine = (float) $x['fine_alloc'];
            $rows[] = [
                'S.No' => ++$i,
                'Collection Date' => $x['collection_date'],
                'Customer Name' => $x['customer'],
                'Customer Code' => $x['customer_code'],
                'Chit Code' => $x['chit'],
                'Location' => $x['location'] ?: '—',
                'Employee' => $x['employee'] ?: 'Unassigned',
                'Due Number' => 'Due ' . $x['installment_no'],
                'Installment Amount' => $inst,
                'Fine Amount' => $fine,
                'Total Collected' => round($inst + $fine, 2),
                'Payment Method' => $x['payment_mode'],
                'Collection Status' => $x['status'] === 'posted' ? 'Completed' : ucfirst($x['status']),
                'Collected By' => $x['collected_by'] ?: '—',
            ];
            $tInst += $inst; $tFine += $fine; $tTot += $inst + $fine;
        }
        return $this->result('CHIT COLLECTION REPORT',
            ['S.No','Collection Date','Customer Name','Customer Code','Chit Code','Location','Employee','Due Number','Installment Amount','Fine Amount','Total Collected','Payment Method','Collection Status','Collected By'],
            ['S.No'=>'number','Collection Date'=>'date','Installment Amount'=>'money','Fine Amount'=>'money','Total Collected'=>'money'],
            $rows,
            ['S.No'=>'TOTAL ('.$i.')','Installment Amount'=>round($tInst,2),'Fine Amount'=>round($tFine,2),'Total Collected'=>round($tTot,2)]
        );
    }

    /* ------------------------------------------------- 4. customer-wise */

    private function rptCustomerCollection(array $f, array $user): array
    {
        $db = Database::instance();
        [$sc, $sp] = $this->scope($user, 'l');
        [$dr, $dp] = $this->dateRange($f, 'col.collection_date', 'c');
        $p = $sp + $dp;
        $w = "cu.deleted_at IS NULL";

        // per-customer collection sums in range (posted only)
        $collJoin = "LEFT JOIN (
            SELECT col.customer_id,
                   SUM(col.amount) AS inst, SUM(col.fine_amount) AS fine, SUM(col.total_amount) AS tot
            FROM collections col
            JOIN loans_or_chits l ON l.id = col.loan_id
            WHERE col.status='posted' AND col.deleted_at IS NULL $sc $dr
            GROUP BY col.customer_id
        ) cc ON cc.customer_id = cu.id";

        if ($f['location_id']) { $w .= ' AND cu.location = :loc'; $p['loc'] = $f['location_id']; }
        if ($f['customer_id']) { $w .= ' AND cu.id = :cid'; $p['cid'] = $f['customer_id']; }

        // customer must have at least one non-cancelled chit in scope
        [$scEx, $spEx] = $this->scope($user, 'lx');
        $p += $spEx;
        $w .= " AND EXISTS (SELECT 1 FROM loans_or_chits lx WHERE lx.customer_id=cu.id AND lx.deleted_at IS NULL AND lx.status<>'cancelled' $scEx)";

        $sql = "SELECT cu.id, cu.name, cu.customer_code, cu.location AS location,
                       (SELECT u2.name FROM loan_assignments la2
                          JOIN employees e2 ON e2.id=la2.employee_id
                          JOIN users u2 ON u2.id=e2.user_id
                          JOIN loans_or_chits l2 ON l2.id=la2.loan_id
                        WHERE l2.customer_id=cu.id AND la2.is_active=1
                        ORDER BY la2.id DESC LIMIT 1) AS employee,
                       (SELECT COUNT(*) FROM loans_or_chits l3 WHERE l3.customer_id=cu.id AND l3.deleted_at IS NULL AND l3.status<>'cancelled') AS chits,
                       COALESCE(cc.inst,0) AS inst, COALESCE(cc.fine,0) AS fine, COALESCE(cc.tot,0) AS tot,
                       (SELECT COUNT(*) FROM installments i JOIN loans_or_chits l4 ON l4.id=i.loan_id
                         WHERE l4.customer_id=cu.id AND i.status='COMPLETED') AS paid_dues,
                       (SELECT COUNT(*) FROM installments i JOIN loans_or_chits l5 ON l5.id=i.loan_id
                         WHERE l5.customer_id=cu.id AND l5.status='active' AND i.balance_amount > 0) AS pending_dues
                FROM customers cu
                $collJoin
                WHERE $w
                ORDER BY tot DESC, cu.name ASC";
        $raw = $db->fetchAll($sql, $p);

        $rows = []; $i = 0; $tInst=0;$tFine=0;$tTot=0;
        foreach ($raw as $x) {
            $rows[] = [
                'S.No' => ++$i,
                'Customer Name' => $x['name'],
                'Customer Code' => $x['customer_code'],
                'Location' => $x['location'] ?: '—',
                'Employee' => $x['employee'] ?: 'Unassigned',
                'Number of Chits' => (int) $x['chits'],
                'Total Installments' => (float) $x['inst'],
                'Total Fine' => (float) $x['fine'],
                'Total Collection' => (float) $x['tot'],
                'Paid Dues' => (int) $x['paid_dues'],
                'Pending Dues' => (int) $x['pending_dues'],
            ];
            $tInst += (float) $x['inst']; $tFine += (float) $x['fine']; $tTot += (float) $x['tot'];
        }
        return $this->result('CUSTOMER COLLECTION SUMMARY',
            ['S.No','Customer Name','Customer Code','Location','Employee','Number of Chits','Total Installments','Total Fine','Total Collection','Paid Dues','Pending Dues'],
            ['S.No'=>'number','Number of Chits'=>'number','Total Installments'=>'money','Total Fine'=>'money','Total Collection'=>'money','Paid Dues'=>'number','Pending Dues'=>'number'],
            $rows,
            ['S.No'=>'TOTAL ('.$i.')','Total Installments'=>round($tInst,2),'Total Fine'=>round($tFine,2),'Total Collection'=>round($tTot,2)]
        );
    }

    /* ------------------------------------------------- 5. daily */

    private function rptDailyCollection(array $f, array $user): array
    {
        $db = Database::instance();
        [$sc, $sp] = $this->scope($user, 'l');
        [$dr, $dp] = $this->dateRange($f, 'col.collection_date');
        $p = $sp + $dp;
        $w = "col.status='posted' AND col.deleted_at IS NULL $sc $dr";
        if ($f['location_id'])     { $w .= ' AND cu.location = :loc'; $p['loc'] = $f['location_id']; }
        if ($f['employee_id'])     { $w .= ' AND col.employee_id = :eid'; $p['eid'] = $f['employee_id']; }
        if ($f['customer_id'])     { $w .= ' AND col.customer_id = :cid'; $p['cid'] = $f['customer_id']; }
        if ($f['loan_id'])         { $w .= ' AND col.loan_id = :lid'; $p['lid'] = $f['loan_id']; }
        if ($f['payment_mode_id']) { $w .= ' AND col.payment_mode_id = :pm'; $p['pm'] = $f['payment_mode_id']; }

        $cashExpr = "CASE WHEN COALESCE(acc.type, CASE WHEN pm.code='CASH' THEN 'cash' ELSE 'bank' END)='cash'
                          THEN col.total_amount ELSE 0 END";
        $sql = "SELECT col.collection_date AS d,
                       COUNT(DISTINCT col.customer_id) AS customers,
                       SUM(col.amount) AS collections, SUM(col.fine_amount) AS fine,
                       SUM(col.total_amount) AS total,
                       SUM($cashExpr) AS cash
                FROM collections col
                JOIN loans_or_chits l ON l.id = col.loan_id
                JOIN customers cu ON cu.id = col.customer_id
                JOIN payment_modes pm ON pm.id = col.payment_mode_id
                LEFT JOIN accounts acc ON acc.id = col.account_id
                WHERE $w
                GROUP BY col.collection_date
                ORDER BY col.collection_date ASC";
        $raw = $db->fetchAll($sql, $p);

        $rows = []; $tC=0;$tF=0;$tT=0;$tCash=0;$tBank=0;
        foreach ($raw as $x) {
            $total = (float) $x['total']; $cash = (float) $x['cash']; $bank = round($total - $cash, 2);
            $rows[] = [
                'Date' => $x['d'],
                'Customers' => (int) $x['customers'],
                'Collections' => (float) $x['collections'],
                'Fine' => (float) $x['fine'],
                'Total' => $total,
                'Cash' => $cash,
                'Bank' => $bank,
            ];
            $tC += (float) $x['collections']; $tF += (float) $x['fine']; $tT += $total; $tCash += $cash; $tBank += $bank;
        }
        return $this->result('DAILY COLLECTION',
            ['Date','Customers','Collections','Fine','Total','Cash','Bank'],
            ['Date'=>'date','Customers'=>'number','Collections'=>'money','Fine'=>'money','Total'=>'money','Cash'=>'money','Bank'=>'money'],
            $rows,
            ['Date'=>'TOTAL','Collections'=>round($tC,2),'Fine'=>round($tF,2),'Total'=>round($tT,2),'Cash'=>round($tCash,2),'Bank'=>round($tBank,2)]
        );
    }

    /* ------------------------------------------------- 6. employee-wise */

    private function rptEmployeeCollection(array $f, array $user): array
    {
        $db = Database::instance();
        [$sc, $sp] = $this->scope($user, 'l');
        [$dr, $dp] = $this->dateRange($f, 'col.collection_date');
        $p = $sp + $dp;
        $w = "col.status='posted' AND col.deleted_at IS NULL AND col.employee_id IS NOT NULL $sc $dr";
        if ($f['employee_id'])     { $w .= ' AND col.employee_id = :eid'; $p['eid'] = $f['employee_id']; }
        if ($f['location_id'])     { $w .= ' AND col.customer_id IN (SELECT id FROM customers WHERE location = :loc)'; $p['loc'] = $f['location_id']; }
        if ($f['payment_mode_id']) { $w .= ' AND col.payment_mode_id = :pm'; $p['pm'] = $f['payment_mode_id']; }

        $cashExpr = "CASE WHEN COALESCE(acc.type, CASE WHEN pm.code='CASH' THEN 'cash' ELSE 'bank' END)='cash'
                          THEN col.total_amount ELSE 0 END";
        $sql = "SELECT e.id AS employee_id, u.name AS employee,
                       (SELECT GROUP_CONCAT(DISTINCT cu2.location ORDER BY cu2.location SEPARATOR ', ')
                          FROM collections c2 JOIN customers cu2 ON cu2.id = c2.customer_id
                        WHERE c2.employee_id = e.id AND c2.status='posted' AND c2.deleted_at IS NULL
                          AND cu2.location IS NOT NULL AND cu2.location <> '') AS locations,
                       COUNT(DISTINCT col.customer_id) AS customers,
                       COUNT(col.id) AS collections,
                       SUM(col.amount) AS inst, SUM(col.fine_amount) AS fine, SUM(col.total_amount) AS tot,
                       SUM($cashExpr) AS cash
                FROM collections col
                JOIN employees e ON e.id = col.employee_id
                JOIN users u ON u.id = e.user_id
                JOIN loans_or_chits l ON l.id = col.loan_id
                JOIN payment_modes pm ON pm.id = col.payment_mode_id
                LEFT JOIN accounts acc ON acc.id = col.account_id
                WHERE $w
                GROUP BY e.id, u.name
                ORDER BY tot DESC";
        $raw = $db->fetchAll($sql, $p);

        $rows = []; $i=0; $tInst=0;$tFine=0;$tTot=0;$tCash=0;$tBank=0;
        foreach ($raw as $x) {
            $tot = (float) $x['tot']; $cash = (float) $x['cash']; $bank = round($tot - $cash, 2);
            $rows[] = [
                'S.No' => ++$i,
                'Employee' => $x['employee'],
                'Location(s)' => $x['locations'] ?: '—',
                'Customers Collected' => (int) $x['customers'],
                'Number of Collections' => (int) $x['collections'],
                'Installment Total' => (float) $x['inst'],
                'Fine Total' => (float) $x['fine'],
                'Total Collection' => $tot,
                'Cash' => $cash,
                'Bank' => $bank,
            ];
            $tInst += (float) $x['inst']; $tFine += (float) $x['fine']; $tTot += $tot; $tCash += $cash; $tBank += $bank;
        }
        return $this->result('EMPLOYEE COLLECTION REPORT',
            ['S.No','Employee','Location(s)','Customers Collected','Number of Collections','Installment Total','Fine Total','Total Collection','Cash','Bank'],
            ['S.No'=>'number','Customers Collected'=>'number','Number of Collections'=>'number','Installment Total'=>'money','Fine Total'=>'money','Total Collection'=>'money','Cash'=>'money','Bank'=>'money'],
            $rows,
            ['S.No'=>'TOTAL ('.$i.')','Installment Total'=>round($tInst,2),'Fine Total'=>round($tFine,2),'Total Collection'=>round($tTot,2),'Cash'=>round($tCash,2),'Bank'=>round($tBank,2)]
        );
    }

    /* ------------------------------------------------- 7. location-wise */

    private function rptLocationCollection(array $f, array $user): array
    {
        $db = Database::instance();
        [$sc, $sp] = $this->scope($user, 'l');
        [$dr, $dp] = $this->dateRange($f, 'col.collection_date');
        $p = $sp + $dp;
        $w = "col.status='posted' AND col.deleted_at IS NULL $sc $dr";
        if ($f['location_id'])     { $w .= ' AND cu.location = :loc'; $p['loc'] = $f['location_id']; }
        if ($f['employee_id'])     { $w .= ' AND col.employee_id = :eid'; $p['eid'] = $f['employee_id']; }
        if ($f['payment_mode_id']) { $w .= ' AND col.payment_mode_id = :pm'; $p['pm'] = $f['payment_mode_id']; }

        $sql = "SELECT COALESCE(NULLIF(cu.location,''), '(unassigned)') AS location,
                       COUNT(DISTINCT col.customer_id) AS customers,
                       COUNT(col.id) AS collections,
                       SUM(col.amount) AS inst, SUM(col.fine_amount) AS fine, SUM(col.total_amount) AS tot
                FROM collections col
                JOIN loans_or_chits l ON l.id = col.loan_id
                JOIN customers cu ON cu.id = col.customer_id
                WHERE $w
                GROUP BY COALESCE(NULLIF(cu.location,''), '(unassigned)')
                ORDER BY tot DESC";
        $raw = $db->fetchAll($sql, $p);

        $rows = []; $i=0; $tInst=0;$tFine=0;$tTot=0;
        foreach ($raw as $x) {
            $rows[] = [
                'S.No' => ++$i,
                'Location' => $x['location'],
                'Customers' => (int) $x['customers'],
                'Collections' => (int) $x['collections'],
                'Installment Total' => (float) $x['inst'],
                'Fine Total' => (float) $x['fine'],
                'Total Collection' => (float) $x['tot'],
            ];
            $tInst += (float) $x['inst']; $tFine += (float) $x['fine']; $tTot += (float) $x['tot'];
        }
        return $this->result('LOCATION COLLECTION REPORT',
            ['S.No','Location','Customers','Collections','Installment Total','Fine Total','Total Collection'],
            ['S.No'=>'number','Customers'=>'number','Collections'=>'number','Installment Total'=>'money','Fine Total'=>'money','Total Collection'=>'money'],
            $rows,
            ['S.No'=>'TOTAL ('.$i.')','Installment Total'=>round($tInst,2),'Fine Total'=>round($tFine,2),'Total Collection'=>round($tTot,2)]
        );
    }

    /* ------------------------------------------------- 8. distribution */

    private function rptChitDistribution(array $f, array $user): array
    {
        $db = Database::instance();
        [$sc, $sp] = $this->scope($user, 'l');
        [$dr, $dp] = $this->dateRange($f, 'd.distributed_date');
        $p = $sp + $dp;
        $w = "d.deleted_at IS NULL $sc $dr";
        if ($f['status'] && $f['status'] !== 'all') { $w .= ' AND d.status = :st'; $p['st'] = $f['status']; }
        if ($f['location_id']) { $w .= ' AND cu.location = :loc'; $p['loc'] = $f['location_id']; }
        if ($f['customer_id']) { $w .= ' AND d.customer_id = :cid'; $p['cid'] = $f['customer_id']; }
        if ($f['loan_id'])     { $w .= ' AND d.loan_id = :lid'; $p['lid'] = $f['loan_id']; }
        if ($f['employee_id']) { $w .= ' AND EXISTS (SELECT 1 FROM loan_assignments la WHERE la.loan_id=l.id AND la.is_active=1 AND la.employee_id=:eid)'; $p['eid'] = $f['employee_id']; }

        $sql = "SELECT d.id, d.distributed_date, l.code AS chit, l.id AS loan_id, l.principal_amount,
                       cu.name AS customer, cu.location AS location,
                       " . self::EMP_NAME_SUBQ . " AS employee,
                       d.amount, d.new_emi_amount, d.remarks, d.status, acc.name AS account
                FROM distributions d
                JOIN loans_or_chits l ON l.id = d.loan_id
                JOIN customers cu ON cu.id = d.customer_id
                LEFT JOIN accounts acc ON acc.id = d.account_id
                WHERE $w
                ORDER BY l.id ASC, d.distributed_date ASC, d.id ASC";
        $raw = $db->fetchAll($sql, $p);

        $rows = []; $i = 0; $tDist = 0;
        $prevByLoan = [];
        foreach ($raw as $x) {
            $lid = (int) $x['loan_id'];
            $prev = $prevByLoan[$lid] ?? 0.0;
            $amt = (float) $x['amount'];
            $isActive = $x['status'] === 'active';
            $total = $isActive ? round($prev + $amt, 2) : round($prev, 2);
            if ($isActive) { $prevByLoan[$lid] = $total; }
            $rem = max((float) $x['principal_amount'] - $total, 0);
            $rows[] = [
                'S.No' => ++$i,
                'Distribution Date' => $x['distributed_date'],
                'Chit Code' => $x['chit'],
                'Customer' => $x['customer'],
                'Location' => $x['location'] ?: '—',
                'Employee' => $x['employee'] ?: 'Unassigned',
                'Chit Amount' => (float) $x['principal_amount'],
                'Distributed Amount' => $amt,
                'Previous Distributed' => round($prev, 2),
                'Total Distributed' => $total,
                'Remaining Undistributed' => round($rem, 2),
                'Distribution Account' => $x['account'] ?: '—',
                'New EMI' => $x['new_emi_amount'] !== null ? (float) $x['new_emi_amount'] : '',
                'Remarks' => $x['remarks'] ?: '',
                'Status' => ucfirst($x['status']),
            ];
            if ($isActive) { $tDist += $amt; }
        }
        return $this->result('CHIT DISTRIBUTION REPORT',
            ['S.No','Distribution Date','Chit Code','Customer','Location','Employee','Chit Amount','Distributed Amount','Previous Distributed','Total Distributed','Remaining Undistributed','Distribution Account','New EMI','Remarks','Status'],
            ['S.No'=>'number','Distribution Date'=>'date','Chit Amount'=>'money','Distributed Amount'=>'money','Previous Distributed'=>'money','Total Distributed'=>'money','Remaining Undistributed'=>'money','New EMI'=>'money'],
            $rows,
            ['S.No'=>'TOTAL ('.$i.')','Distributed Amount'=>round($tDist,2)]
        );
    }

    /* ------------------------------------------------- 9. pending dues */

    private function rptPendingDues(array $f, array $user): array
    {
        $db = Database::instance();
        [$sc, $sp] = $this->scope($user, 'l');
        [$dr, $dp] = $this->dateRange($f, 'i.due_date');
        $p = $sp + $dp;
        $today = BusinessDate::fmt(BusinessDate::today());
        $p['today'] = $today;
        $w = "i.balance_amount > 0 AND l.status='active' AND l.deleted_at IS NULL $sc $dr";
        if ($f['location_id']) { $w .= ' AND cu.location = :loc'; $p['loc'] = $f['location_id']; }
        if ($f['customer_id']) { $w .= ' AND l.customer_id = :cid'; $p['cid'] = $f['customer_id']; }
        if ($f['loan_id'])     { $w .= ' AND l.id = :lid'; $p['lid'] = $f['loan_id']; }
        if ($f['status'])      { $w .= ' AND i.status = :ist'; $p['ist'] = strtoupper($f['status']); }
        if ($f['employee_id']) { $w .= ' AND EXISTS (SELECT 1 FROM loan_assignments la WHERE la.loan_id=l.id AND la.is_active=1 AND la.employee_id=:eid)'; $p['eid'] = $f['employee_id']; }

        $sql = "SELECT cu.name AS customer, cu.customer_code, l.code AS chit, cu.location AS location,
                       " . self::EMP_NAME_SUBQ . " AS employee,
                       i.installment_no, i.due_date, i.payable_amount, i.paid_amount, i.balance_amount,
                       GREATEST(DATEDIFF(:today, i.due_date), 0) AS days_pending, i.status
                FROM installments i
                JOIN loans_or_chits l ON l.id = i.loan_id
                JOIN customers cu ON cu.id = l.customer_id
                WHERE $w
                ORDER BY i.due_date ASC, l.code ASC";
        $raw = $db->fetchAll($sql, $p);

        $rows = []; $i = 0; $tEmi=0;$tPaid=0;$tPend=0;
        foreach ($raw as $x) {
            $rows[] = [
                'S.No' => ++$i,
                'Customer Name' => $x['customer'],
                'Customer Code' => $x['customer_code'],
                'Chit Code' => $x['chit'],
                'Location' => $x['location'] ?: '—',
                'Employee' => $x['employee'] ?: 'Unassigned',
                'Due Number' => 'Due ' . $x['installment_no'],
                'Due Date' => $x['due_date'],
                'EMI Amount' => (float) $x['payable_amount'],
                'Paid Amount' => (float) $x['paid_amount'],
                'Pending Amount' => (float) $x['balance_amount'],
                'Days Pending' => (int) $x['days_pending'],
                'Status' => $x['status'],
            ];
            $tEmi += (float) $x['payable_amount']; $tPaid += (float) $x['paid_amount']; $tPend += (float) $x['balance_amount'];
        }
        return $this->result('PENDING DUES REPORT',
            ['S.No','Customer Name','Customer Code','Chit Code','Location','Employee','Due Number','Due Date','EMI Amount','Paid Amount','Pending Amount','Days Pending','Status'],
            ['S.No'=>'number','Due Date'=>'date','EMI Amount'=>'money','Paid Amount'=>'money','Pending Amount'=>'money','Days Pending'=>'number'],
            $rows,
            ['S.No'=>'TOTAL ('.$i.')','EMI Amount'=>round($tEmi,2),'Paid Amount'=>round($tPaid,2),'Pending Amount'=>round($tPend,2)]
        );
    }

    /* ------------------------------------------------- 10. chit profit */

    private function rptChitProfit(array $f, array $user): array
    {
        $db = Database::instance();
        [$sc, $sp] = $this->scope($user, 'l');
        [$dr, $dp] = $this->dateRange($f, 'l.start_date');
        $p = $sp + $dp;
        $w = "l.deleted_at IS NULL $sc $dr";
        if ($f['status'])      { $w .= ' AND l.status = :st'; $p['st'] = $f['status']; }
        else                   { $w .= " AND l.status <> 'cancelled'"; }
        if ($f['location_id']) { $w .= ' AND cu.location = :loc'; $p['loc'] = $f['location_id']; }
        if ($f['customer_id']) { $w .= ' AND l.customer_id = :cid'; $p['cid'] = $f['customer_id']; }
        if ($f['loan_id'])     { $w .= ' AND l.id = :lid'; $p['lid'] = $f['loan_id']; }
        if ($f['frequency'])   { $w .= ' AND l.frequency = :fr'; $p['fr'] = $f['frequency']; }
        if ($f['employee_id']) { $w .= ' AND EXISTS (SELECT 1 FROM loan_assignments la WHERE la.loan_id=l.id AND la.is_active=1 AND la.employee_id=:eid)'; $p['eid'] = $f['employee_id']; }

        $sql = "SELECT l.code AS chit, cu.name AS customer, cu.location AS location,
                       " . self::EMP_NAME_SUBQ . " AS employee, l.status, l.principal_amount,
                       COALESCE((SELECT SUM(c.amount) FROM collections c WHERE c.loan_id=l.id AND c.status='posted' AND c.deleted_at IS NULL),0) AS collected,
                       COALESCE((SELECT SUM(c.fine_amount) FROM collections c WHERE c.loan_id=l.id AND c.status='posted' AND c.deleted_at IS NULL),0) AS fine,
                       COALESCE((SELECT SUM(d.amount) FROM distributions d WHERE d.loan_id=l.id AND d.status='active' AND d.deleted_at IS NULL),0) AS distributed,
                       COALESCE((SELECT SUM(i.balance_amount) FROM installments i WHERE i.loan_id=l.id),0) AS outstanding
                FROM loans_or_chits l
                JOIN customers cu ON cu.id = l.customer_id
                WHERE $w
                ORDER BY l.start_date ASC, l.id ASC";
        $raw = $db->fetchAll($sql, $p);

        $rows = []; $i=0; $tAmt=0;$tColl=0;$tFine=0;$tDist=0;$tOut=0;$tProfit=0;
        foreach ($raw as $x) {
            $coll = (float) $x['collected']; $fine = (float) $x['fine']; $dist = (float) $x['distributed'];
            $profit = round($coll + $fine - $dist, 2);
            $rows[] = [
                'S.No' => ++$i,
                'Chit Code' => $x['chit'],
                'Customer' => $x['customer'],
                'Location' => $x['location'] ?: '—',
                'Employee' => $x['employee'] ?: 'Unassigned',
                'Status' => ucfirst($x['status']),
                'Chit Amount' => (float) $x['principal_amount'],
                'Total Collected' => $coll,
                'Total Fine' => $fine,
                'Distributed' => $dist,
                'Outstanding' => (float) $x['outstanding'],
                'Profit / Surplus' => $profit,
            ];
            $tAmt += (float) $x['principal_amount']; $tColl += $coll; $tFine += $fine;
            $tDist += $dist; $tOut += (float) $x['outstanding']; $tProfit += $profit;
        }
        return $this->result('CHIT PROFIT / SUMMARY REPORT',
            ['S.No','Chit Code','Customer','Location','Employee','Status','Chit Amount','Total Collected','Total Fine','Distributed','Outstanding','Profit / Surplus'],
            ['S.No'=>'number','Chit Amount'=>'money','Total Collected'=>'money','Total Fine'=>'money','Distributed'=>'money','Outstanding'=>'money','Profit / Surplus'=>'money'],
            $rows,
            ['S.No'=>'TOTAL ('.$i.')','Chit Amount'=>round($tAmt,2),'Total Collected'=>round($tColl,2),'Total Fine'=>round($tFine,2),'Distributed'=>round($tDist,2),'Outstanding'=>round($tOut,2),'Profit / Surplus'=>round($tProfit,2)]
        );
    }

    /* ------------------------------------------------- 11. monthly summary */

    private function rptMonthlySummary(array $f, array $user): array
    {
        $m = $this->metrics($f, $user);
        $rows = [];
        foreach ($m as $k => $v) {
            $rows[] = ['Metric' => $this->cardLabel($k), 'Value' => $v];
        }
        return $this->result('CHIT SUMMARY - ' . $this->periodLabel($f),
            ['Metric', 'Value'],
            ['Value' => 'number'],
            $rows,
            []
        );
    }

    /* ------------------------------------------------- 12. financial ledger */

    private function rptFinancialLedger(array $f, array $user): array
    {
        $db = Database::instance();
        $unrestricted = Guard::scopeIsUnrestricted($user);
        [$sc, $sp] = $this->scope($user, 'l');

        // opening balance = sum of active account opening balances + everything before date_from
        $opening = (float) $db->scalar("SELECT COALESCE(SUM(opening_balance),0) FROM accounts WHERE is_active=1");

        $parts = [];
        $params = [];
        // collections (credit)
        $parts[] = "SELECT col.collection_date AS dt, 'Collection' AS ttype, col.receipt_no AS ref,
                           cu.name AS customer, l.code AS chit, acc.name AS account,
                           col.total_amount AS credit, 0 AS debit, col.id AS oid, 1 AS ord
                    FROM collections col
                    JOIN loans_or_chits l ON l.id = col.loan_id
                    JOIN customers cu ON cu.id = col.customer_id
                    LEFT JOIN accounts acc ON acc.id = col.account_id
                    WHERE col.status='posted' AND col.deleted_at IS NULL $sc";
        $params += $sp;
        // distributions (debit)
        [$sc2, $sp2] = $this->scope($user, 'l');
        $parts[] = "SELECT d.distributed_date AS dt, 'Distribution' AS ttype, CONCAT('DIST-', d.id) AS ref,
                           cu.name AS customer, l.code AS chit, acc.name AS account,
                           0 AS credit, d.amount AS debit, d.id AS oid, 2 AS ord
                    FROM distributions d
                    JOIN loans_or_chits l ON l.id = d.loan_id
                    JOIN customers cu ON cu.id = d.customer_id
                    LEFT JOIN accounts acc ON acc.id = d.account_id
                    WHERE d.status='active' AND d.deleted_at IS NULL $sc2";
        foreach ($sp2 as $k => $v) { $params[$k] = $v; }

        if ($unrestricted) {
            $parts[] = "SELECT ex.expense_date AS dt, 'Expense' AS ttype, CONCAT('EXP-', ex.id) AS ref,
                               '' AS customer, '' AS chit, acc.name AS account,
                               0 AS credit, ex.amount AS debit, ex.id AS oid, 3 AS ord
                        FROM expenses ex LEFT JOIN accounts acc ON acc.id = ex.account_id
                        WHERE ex.status='active' AND ex.deleted_at IS NULL";
            $parts[] = "SELECT oi.received_date AS dt, 'Office Income' AS ttype, CONCAT('INC-', oi.id) AS ref,
                               '' AS customer, '' AS chit, acc.name AS account,
                               oi.amount AS credit, 0 AS debit, oi.id AS oid, 0 AS ord
                        FROM office_income oi LEFT JOIN accounts acc ON acc.id = oi.account_id
                        WHERE oi.status='active' AND oi.deleted_at IS NULL";
        }

        $union = implode(' UNION ALL ', array_map(fn ($s) => "($s)", $parts));
        $all = $db->fetchAll("SELECT * FROM ($union) t ORDER BY dt ASC, ord ASC, oid ASC", $params);

        // split into "before range" (folded into opening) and "in range"
        $bal = $opening;
        $rows = []; $i = 0; $tCredit = 0; $tDebit = 0;
        foreach ($all as $x) {
            $credit = (float) $x['credit']; $debit = (float) $x['debit'];
            if ($f['from'] && $x['dt'] < $f['from']) {
                $bal += $credit - $debit;
                continue;
            }
            if ($f['to'] && $x['dt'] > $f['to']) {
                continue;
            }
            $bal += $credit - $debit;
            $rows[] = [
                'S.No' => ++$i,
                'Date' => $x['dt'],
                'Transaction Type' => $x['ttype'],
                'Reference' => $x['ref'],
                'Customer' => $x['customer'] ?: '—',
                'Chit Code' => $x['chit'] ?: '—',
                'Account' => $x['account'] ?: '—',
                'Credit' => $credit ?: '',
                'Debit' => $debit ?: '',
                'Balance' => round($bal, 2),
            ];
            $tCredit += $credit; $tDebit += $debit;
        }
        return $this->result('FINANCIAL ACCOUNT REPORT',
            ['S.No','Date','Transaction Type','Reference','Customer','Chit Code','Account','Credit','Debit','Balance'],
            ['S.No'=>'number','Date'=>'date','Credit'=>'money','Debit'=>'money','Balance'=>'money'],
            $rows,
            ['S.No'=>'TOTAL ('.$i.')','Credit'=>round($tCredit,2),'Debit'=>round($tDebit,2),'Balance'=>round($bal,2)]
        );
    }

    /* ============================================================= metrics */

    /** Shared KPI block for summary cards + Monthly Summary + workbook Summary sheet. */
    private function metrics(array $f, array $user): array
    {
        $db = Database::instance();
        [$sc, $sp] = $this->scope($user, 'l');
        $today = BusinessDate::fmt(BusinessDate::today());

        [$drStart, $dpStart] = $this->dateRange($f, 'l.start_date', 'ms');
        $openedRow = $db->fetch(
            "SELECT COUNT(*) c, COALESCE(SUM(l.principal_amount),0) amt
             FROM loans_or_chits l JOIN customers cu ON cu.id=l.customer_id
             WHERE l.deleted_at IS NULL AND l.status<>'cancelled' $sc $drStart",
            $sp + $dpStart
        );

        // closed in range (by last posted collection date)
        [$fromC, $toC] = [$f['from'], $f['to']];
        $closedSql = "SELECT COUNT(*) c FROM loans_or_chits l
             JOIN customers cu ON cu.id=l.customer_id
             WHERE l.deleted_at IS NULL AND l.status='completed' $sc
             AND COALESCE((SELECT MAX(c.collection_date) FROM collections c
                           WHERE c.loan_id=l.id AND c.status='posted' AND c.deleted_at IS NULL), DATE(l.updated_at))
                 BETWEEN :cfrom AND :cto";
        $closed = (int) $db->scalar($closedSql, $sp + ['cfrom' => $fromC ?: '1900-01-01', 'cto' => $toC ?: '2999-12-31']);

        $active = (int) $db->scalar(
            "SELECT COUNT(*) FROM loans_or_chits l JOIN customers cu ON cu.id=l.customer_id
             WHERE l.status='active' AND l.deleted_at IS NULL $sc", $sp
        );

        [$drColl, $dpColl] = $this->dateRange($f, 'col.collection_date', 'mc');
        $coll = $db->fetch(
            "SELECT COALESCE(SUM(col.amount),0) inst, COALESCE(SUM(col.fine_amount),0) fine
             FROM collections col JOIN loans_or_chits l ON l.id=col.loan_id
             JOIN customers cu ON cu.id=col.customer_id
             WHERE col.status='posted' AND col.deleted_at IS NULL $sc $drColl", $sp + $dpColl
        );

        [$drDist, $dpDist] = $this->dateRange($f, 'd.distributed_date', 'md');
        $dist = (float) $db->scalar(
            "SELECT COALESCE(SUM(d.amount),0) FROM distributions d JOIN loans_or_chits l ON l.id=d.loan_id
             JOIN customers cu ON cu.id=d.customer_id
             WHERE d.status='active' AND d.deleted_at IS NULL $sc $drDist", $sp + $dpDist
        );

        $pending = (float) $db->scalar(
            "SELECT COALESCE(SUM(i.balance_amount),0) FROM installments i
             JOIN loans_or_chits l ON l.id=i.loan_id JOIN customers cu ON cu.id=l.customer_id
             WHERE l.status='active' AND l.deleted_at IS NULL AND i.balance_amount>0 $sc", $sp
        );

        $totalColl = (float) $coll['inst'];
        $totalFine = (float) $coll['fine'];
        return [
            'chits_opened'      => (int) $openedRow['c'],
            'chits_closed'      => $closed,
            'active_chits'      => $active,
            'total_chit_amount' => round((float) $openedRow['amt'], 2),
            'total_distributed' => round($dist, 2),
            'total_collection'  => round($totalColl, 2),
            'total_fine'        => round($totalFine, 2),
            'pending_amount'    => round($pending, 2),
            'profit'            => round($totalColl + $totalFine - $dist, 2),
        ];
    }

    private function cardLabel(string $k): string
    {
        return [
            'chits_opened' => 'Chits Opened', 'chits_closed' => 'Chits Closed',
            'active_chits' => 'Active Chits', 'total_chit_amount' => 'Total Chit Amount',
            'total_distributed' => 'Total Distributed', 'total_collection' => 'Total Collection',
            'total_fine' => 'Total Fine', 'pending_amount' => 'Pending Dues Amount',
            'profit' => 'Actual Profit / Surplus',
        ][$k] ?? ucwords(str_replace('_', ' ', $k));
    }

    /* ============================================================== export */

    private function orgName(): string
    {
        $org = App::setting('organization', []);
        return is_array($org) && !empty($org['name']) ? (string) $org['name'] : 'Chit Fund';
    }

    /** turn a build() result into an Xlsx sheet spec */
    private function sheet(array $r, string $name, array $f, ?string $sheetName = null): array
    {
        $headers = $r['headers'];
        $types = [];
        foreach ($headers as $idx => $h) {
            $types[$idx] = $r['col_types'][$h] ?? 'text';
        }
        $rows = array_map(function ($row) use ($headers) {
            $line = [];
            foreach ($headers as $h) {
                $line[] = $row[$h] ?? '';
            }
            return $line;
        }, $r['rows']);

        $totals = [];
        foreach (($r['totals'] ?? []) as $h => $v) {
            $totals[$h] = $v;
        }

        return [
            'name'     => $sheetName ?: ucwords(str_replace('-', ' ', $name)),
            'title'    => strtoupper($this->orgName()),
            'subtitle' => [
                $r['title'] . ' — ' . $this->periodLabel($f),
                'Period: ' . $this->periodLabel($f),
                'Generated: ' . date('d-m-Y H:i'),
            ],
            'headers'  => $headers,
            'colTypes' => $types,
            'rows'     => $rows,
            'totals'   => $totals ?: null,
        ];
    }
}
