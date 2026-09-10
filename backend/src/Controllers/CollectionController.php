<?php
namespace App\Controllers;

use App\Auth\Guard;
use App\Core\Database;
use App\Core\HttpException;
use App\Core\ListQuery;
use App\Core\Request;
use App\Core\Response;
use App\Core\Validator;
use App\Services\CollectionService;
use App\Services\ScheduleService;
use App\Support\BusinessDate;
use App\Support\Money;

class CollectionController
{
    private const POSTED = "col.status = 'posted' AND col.deleted_at IS NULL";

    /**
     * GET /api/collection/workload
     * Customer-first list: one row = one customer + chit, with a compact
     * outstanding summary. The full installment schedule is included so the
     * detail view can render without a second call.
     */
    public function workload(Request $req): void
    {
        $user = Guard::authorize($req, 'collection.view');
        $db = Database::instance();

        $where = ["l.status = 'active'", 'l.deleted_at IS NULL'];
        $params = [];

        [$scopeSql, $scopeParams] = Guard::loanScopeSql($user, 'l');
        $where[] = $scopeSql;
        $params += $scopeParams;

        $q = ListQuery::search($req);
        if ($q !== '') {
            $where[] = '(c.name LIKE :q OR c.customer_code LIKE :q OR c.mobile LIKE :q OR l.code LIKE :q)';
            $params['q'] = "%$q%";
        }
        // Optional location filter — plain typed text, exact match (no Location Master).
        if (($loc = $req->queryParam('location_id')) !== null && $loc !== '') {
            $where[] = '(c.location = :loc OR l.location = :loc)';
            $params['loc'] = $loc;
        }
        if ($st  = $req->queryParam('schedule_type')) { $where[] = 'l.schedule_type = :st'; $params['st'] = $st; }
        $onlyDue = $req->queryParam('only_due') === '1';

        $whereSql = implode(' AND ', $where);
        $perPage = ListQuery::perPage($req);
        $offset  = ListQuery::offset($req);
        $base = "FROM loans_or_chits l
                 JOIN customers c ON c.id = l.customer_id
                 WHERE $whereSql";
        $total = (int)$db->scalar("SELECT COUNT(*) $base", $params);

        $loans = $db->fetchAll(
            "SELECT l.id, l.code, l.account_type, l.installment_amount, l.principal_amount,
                    l.frequency, l.schedule_type, l.start_date, l.tenure,
                    c.id AS customer_id, c.name AS customer_name, c.customer_code, c.mobile,
                    COALESCE(NULLIF(c.location,''), l.location) AS location_name
             $base ORDER BY c.name ASC LIMIT $perPage OFFSET $offset",
            $params
        );

        $dueStatus = $req->queryParam('due_status');
        $onDate    = $req->queryParam('date');
        $today     = BusinessDate::fmt(BusinessDate::today());

        $out = [];
        foreach ($loans as $loan) {
            ScheduleService::refreshOverdue((int)$loan['id']);
            $summary = CollectionService::loanSummary((int)$loan['id']);
            if ($onlyDue && Money::lte($summary['outstanding_balance'] ?? 0, 0)) {
                continue;
            }
            $iWhere = ['loan_id = :l']; $iParams = ['l' => $loan['id']];
            if ($dueStatus) { $iWhere[] = 'status = :ds'; $iParams['ds'] = $dueStatus; }
            if ($onDate)    { $iWhere[] = 'due_date = :dd'; $iParams['dd'] = $onDate; }
            $loan['installments'] = $db->fetchAll(
                'SELECT * FROM installments WHERE ' . implode(' AND ', $iWhere) . ' ORDER BY installment_no', $iParams
            );
            $loan['summary'] = $summary;
            $loan['next_due'] = $db->fetch(
                "SELECT id, installment_no, due_date, payable_amount, paid_amount, balance_amount, status
                 FROM installments WHERE loan_id = :l AND status <> 'COMPLETED' ORDER BY installment_no LIMIT 1",
                ['l' => $loan['id']]
            );
            $out[] = $loan;
        }

        [$dashSql, $dashParams] = Guard::loanScopeSql($user, 'l');
        $dash = $db->fetch(
            "SELECT COALESCE(SUM(CASE WHEN i.due_date = :t1 THEN i.balance_amount ELSE 0 END),0) AS expected_today,
                    COALESCE(SUM(CASE WHEN i.status = 'OVERDUE' THEN i.balance_amount ELSE 0 END),0) AS overdue_amount,
                    COUNT(DISTINCT CASE WHEN i.due_date = :t2 AND i.status <> 'COMPLETED' THEN l.customer_id END) AS due_customers
             FROM installments i JOIN loans_or_chits l ON l.id = i.loan_id
             WHERE l.status='active' AND l.deleted_at IS NULL AND $dashSql",
            $dashParams + ['t1' => $today, 't2' => $today]
        );
        $collectedToday = $db->scalar(
            "SELECT COALESCE(SUM(col.amount),0) FROM collections col
             WHERE " . self::POSTED . " AND col.collection_date = :t AND (:isAdmin = 1 OR col.collected_by = :uid)",
            ['t' => $today, 'isAdmin' => Guard::isAdmin($user) ? 1 : 0, 'uid' => $user['id']]
        );

        Response::ok([
            'loans' => $out,
            'dashboard' => [
                'expected_today'  => $dash['expected_today'] ?? '0.00',
                'collected_today' => $collectedToday ?: '0.00',
                'pending_today'   => Money::max(Money::sub($dash['expected_today'] ?? 0, $collectedToday ?: 0), 0),
                'overdue_amount'  => $dash['overdue_amount'] ?? '0.00',
                'due_customers'   => (int)($dash['due_customers'] ?? 0),
            ],
        ], 'OK', [
            'total' => $total, 'page' => ListQuery::page($req), 'per_page' => $perPage,
            'total_pages' => (int)ceil($total / $perPage),
        ]);
    }

    /** GET /api/collections/{id} - one collection with its allocation breakdown */
    public function show(Request $req, array $args): void
    {
        $user = Guard::authorize($req, ['collection.view', 'reports.view']);
        $db = Database::instance();
        $col = $db->fetch(
            "SELECT col.*, pm.name AS payment_mode, a.name AS account_name,
                    cu.name AS customer_name, cu.customer_code, cu.mobile,
                    l.code AS chit_code, l.installment_amount, l.principal_amount,
                    ub.name AS collected_by_name
             FROM collections col
             JOIN payment_modes pm ON pm.id = col.payment_mode_id
             LEFT JOIN accounts a ON a.id = col.account_id
             JOIN customers cu ON cu.id = col.customer_id
             JOIN loans_or_chits l ON l.id = col.loan_id
             LEFT JOIN users ub ON ub.id = col.collected_by
             WHERE col.id = :id", ['id' => (int)$args['id']]
        );
        if (!$col) {
            throw HttpException::notFound('Collection not found');
        }
        Guard::assertLoanInScope($user, (int)$col['loan_id']);
        $col['allocations'] = $db->fetchAll(
            "SELECT ca.*, i.installment_no, i.due_date FROM collection_allocations ca
             JOIN installments i ON i.id = ca.installment_id
             WHERE ca.collection_id = :c ORDER BY i.installment_no", ['c' => $col['id']]
        );
        Response::ok($col);
    }

    /** POST /api/collections */
    public function store(Request $req): void
    {
        $user = Guard::authorize($req, 'collection.create');
        $db = Database::instance();

        $in = Validator::make($req->body, [
            'installment_id'  => 'nullable|int',
            'collection_date' => 'required|date',
            'amount'          => 'required|numeric|min:0',   // ACTUAL amount paid
            'fine_amount'     => 'nullable|numeric|min:0',    // manual fine
            'payment_mode_id' => 'required|int',
            'account_id'      => 'nullable|int',
            'reference_no'    => 'nullable|string|max:64',
            'remarks'         => 'nullable|string|max:500',
        ])->validated();

        // Explicit multi-due selection (installment_ids[]) OR the classic single
        // "installment_id" which the service forward-fills from.
        $explicitIds = array_values(array_unique(array_filter(
            array_map('intval', (array) $req->input('installment_ids', [])), fn ($n) => $n > 0
        )));
        if ($explicitIds) {
            $in['installment_ids'] = $explicitIds;           // multi-due path in the service
            $scopeIds = $explicitIds;
        } elseif (!empty($in['installment_id'])) {
            $scopeIds = [(int) $in['installment_id']];       // single-due forward-fill path
        } else {
            throw HttpException::validation(['installment_ids' => ['Select at least one due to collect.']]);
        }

        $ph = implode(',', array_fill(0, count($scopeIds), '?'));
        $rows = $db->run("SELECT id, loan_id, status FROM installments WHERE id IN ($ph)", $scopeIds)->fetchAll(\PDO::FETCH_ASSOC);
        if (count($rows) !== count($scopeIds)) {
            throw HttpException::notFound('One or more selected dues not found');
        }
        $loanIds = array_unique(array_map(fn ($r) => (int) $r['loan_id'], $rows));
        if (count($loanIds) !== 1) {
            throw HttpException::validation(['installment_ids' => ['All selected dues must belong to the same chit.']]);
        }
        Guard::assertLoanInScope($user, (int) $loanIds[0]);   // server-side scope enforcement
        if (!$db->scalar('SELECT 1 FROM payment_modes WHERE id = :id AND is_active = 1', ['id' => $in['payment_mode_id']])) {
            throw HttpException::validation(['payment_mode_id' => ['Unknown or inactive payment mode']]);
        }

        $in['idempotency_key'] = $req->headers['x-idempotency-key'] ?? $req->input('idempotency_key');

        $result = CollectionService::post($user, $in);
        Response::json([
            'success' => true,
            'message' => $result['idempotent_replay'] ? 'Collection already recorded (idempotent replay)' : 'Collection recorded',
            'data'    => $result,
        ], $result['idempotent_replay'] ? 200 : 201);
    }

    /** GET /api/collections - ledger (excludes deleted; cancelled shown but flagged) */
    public function index(Request $req): void
    {
        $user = Guard::authorize($req, ['collection.view', 'reports.view']);
        $db = Database::instance();

        $where = ['col.deleted_at IS NULL'];
        $params = [];
        if (!Guard::isAdmin($user)) {
            [$scopeSql, $sp] = Guard::loanScopeSql($user, 'l');
            $where[] = $scopeSql;
            $params += $sp;
        }
        if (($q = ListQuery::search($req)) !== '') {
            $where[] = '(cu.name LIKE :q OR cu.customer_code LIKE :q OR cu.mobile LIKE :q OR l.code LIKE :q OR col.receipt_no LIKE :q)';
            $params['q'] = "%$q%";
        }
        if ($from = $req->queryParam('date_from')) { $where[] = 'col.collection_date >= :df'; $params['df'] = $from; }
        if ($to   = $req->queryParam('date_to'))   { $where[] = 'col.collection_date <= :dt'; $params['dt'] = $to; }
        if ($lid  = $req->queryParam('loan_id'))   { $where[] = 'col.loan_id = :lid'; $params['lid'] = (int)$lid; }
        if ($cid  = $req->queryParam('customer_id')) { $where[] = 'col.customer_id = :cid'; $params['cid'] = (int)$cid; }
        if ($pm   = $req->queryParam('payment_mode_id')) { $where[] = 'col.payment_mode_id = :pm'; $params['pm'] = (int)$pm; }
        if ($stt  = $req->queryParam('status')) { $where[] = 'col.status = :stt'; $params['stt'] = $stt; }

        $whereSql = implode(' AND ', $where);
        $perPage = ListQuery::perPage($req);
        $offset  = ListQuery::offset($req);
        $bs = "FROM collections col
               JOIN loans_or_chits l ON l.id = col.loan_id
               JOIN customers cu ON cu.id = col.customer_id
               JOIN payment_modes pm ON pm.id = col.payment_mode_id
               WHERE $whereSql";
        $total = (int)$db->scalar("SELECT COUNT(*) $bs", $params);
        $rows = $db->fetchAll(
            "SELECT col.id, col.receipt_no, col.collection_date, col.amount, col.fine_amount,
                    col.total_amount, col.status, col.reference_no, col.loan_id,
                    l.code AS loan_code, cu.id AS customer_id, cu.name AS customer_name, cu.customer_code,
                    pm.name AS payment_mode
             $bs ORDER BY col.collection_date DESC, col.id DESC LIMIT $perPage OFFSET $offset",
            $params
        );
        Response::paginated($rows, $total, ListQuery::page($req), $perPage);
    }

    /** POST /api/collections/{id}/cancel */
    public function cancel(Request $req, array $args): void
    {
        $user = Guard::authorize($req, 'collection.cancel');
        $db = Database::instance();
        $col = $db->fetch('SELECT * FROM collections WHERE id = :id', ['id' => (int)$args['id']]);
        if (!$col) {
            throw HttpException::notFound('Collection not found');
        }
        Guard::assertLoanInScope($user, (int)$col['loan_id']);
        $reason = trim((string)$req->input('reason', '')) ?: 'Cancelled by ' . $user['username'];
        $result = CollectionService::cancel($user, (int)$col['id'], $reason);
        Response::ok($result, 'Collection cancelled. Cash, totals and outstanding have been reversed.');
    }

    /** DELETE /api/collections/{id} */
    public function destroy(Request $req, array $args): void
    {
        $user = Guard::authorize($req, 'collection.delete');
        $db = Database::instance();
        $col = $db->fetch('SELECT * FROM collections WHERE id = :id', ['id' => (int)$args['id']]);
        if (!$col) {
            throw HttpException::notFound('Collection not found');
        }
        Guard::assertLoanInScope($user, (int)$col['loan_id']);
        $reason = trim((string)$req->input('reason', '')) ?: 'Deleted by ' . $user['username'];
        $result = CollectionService::deleteCollection($user, (int)$col['id'], $reason);
        Response::ok($result, 'Collection deleted.');
    }

    /** POST /api/collections/{id}/reverse  (legacy alias -> cancel) */
    public function reverse(Request $req, array $args): void
    {
        $user = Guard::authorize($req, ['collection.reverse', 'collection.cancel']);
        $db = Database::instance();
        $col = $db->fetch('SELECT * FROM collections WHERE id = :id', ['id' => (int)$args['id']]);
        if (!$col) {
            throw HttpException::notFound('Collection not found');
        }
        Guard::assertLoanInScope($user, (int)$col['loan_id']);
        $reason = trim((string)$req->input('reason', '')) ?: 'Reversed';
        $result = CollectionService::cancel($user, (int)$col['id'], $reason);
        Response::ok($result, 'Collection reversed.');
    }
}
