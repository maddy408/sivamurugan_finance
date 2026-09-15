<?php
namespace App\Controllers;

use App\Auth\Guard;
use App\Core\Database;
use App\Core\ListQuery;
use App\Core\Request;
use App\Core\Response;
use App\Support\Audit;
use App\Support\Xlsx;

/**
 * Read-only view over the `transactions` ledger. Money movements themselves
 * are created by CollectionService / DistributionService / Expense- and
 * IncomeController via TransactionService - nothing here writes a ledger row.
 */
class TransactionController
{
    private function filters(Request $req): array
    {
        $where = [];
        $params = [];
        if (($q = ListQuery::search($req)) !== '') {
            $where[] = '(t.transaction_no LIKE :q OR t.remarks LIKE :q OR cu.name LIKE :q OR l.code LIKE :q)';
            $params['q'] = "%$q%";
        }
        if (($ty = $req->queryParam('txn_type')) !== null && $ty !== '') { $where[] = 't.txn_type = :ty'; $params['ty'] = $ty; }
        if (($a = $req->queryParam('account_id')) !== null && $a !== '') { $where[] = 't.account_id = :acc'; $params['acc'] = (int)$a; }
        if (($s = $req->queryParam('status')) !== null && $s !== '') { $where[] = 't.status = :st'; $params['st'] = $s; }
        if (($d = $req->queryParam('direction')) !== null && $d !== '') { $where[] = 't.direction = :dir'; $params['dir'] = $d; }
        if ($f = $req->queryParam('date_from')) { $where[] = 't.txn_date >= :df'; $params['df'] = $f; }
        if ($t = $req->queryParam('date_to'))   { $where[] = 't.txn_date <= :dt'; $params['dt'] = $t; }
        return [$where ? implode(' AND ', $where) : '1=1', $params];
    }

    private const BASE = "FROM transactions t
             LEFT JOIN accounts a ON a.id = t.account_id
             LEFT JOIN customers cu ON cu.id = t.customer_id
             LEFT JOIN loans_or_chits l ON l.id = t.loan_id
             LEFT JOIN users u ON u.id = t.created_by";

    /** GET /api/transactions */
    public function index(Request $req): void
    {
        Guard::authorize($req, 'transactions.view');
        $db = Database::instance();
        [$whereSql, $params] = $this->filters($req);

        $order = ListQuery::orderBy($req, [
            'txn_date' => 't.txn_date', 'amount' => 't.amount', 'txn_type' => 't.txn_type',
            'created_at' => 't.created_at',
        ], 't.txn_date DESC, t.id DESC');
        $perPage = ListQuery::perPage($req);
        $offset  = ListQuery::offset($req);

        $total = (int)$db->scalar('SELECT COUNT(*) ' . self::BASE . " WHERE $whereSql", $params);
        $rows = $db->fetchAll(
            "SELECT t.id, t.transaction_no, t.txn_date, t.txn_type, t.direction, t.amount, t.status,
                    t.account_id, a.name AS account_name, a.type AS account_type,
                    t.customer_id, cu.name AS customer_name,
                    t.loan_id, l.code AS chit_code,
                    t.reference_type, t.reference_id, t.remarks,
                    u.name AS created_by_name, t.created_at
             " . self::BASE . "
             WHERE $whereSql
             ORDER BY $order LIMIT $perPage OFFSET $offset",
            $params
        );
        Response::ok($rows, 'OK', [
            'total' => $total, 'page' => ListQuery::page($req), 'per_page' => $perPage,
            'total_pages' => (int)ceil($total / $perPage),
            'summary' => $this->summary($whereSql, $params),
        ]);
    }

    private function summary(string $whereSql, array $params): array
    {
        $row = Database::instance()->fetch(
            "SELECT
                COALESCE(SUM(CASE WHEN t.status='posted' AND t.direction='credit' THEN t.amount ELSE 0 END),0) AS total_credit,
                COALESCE(SUM(CASE WHEN t.status='posted' AND t.direction='debit'  THEN t.amount ELSE 0 END),0) AS total_debit,
                COUNT(*) AS count
             " . self::BASE . " WHERE $whereSql",
            $params
        );
        return $row ?: [];
    }

    /** GET /api/transactions/export */
    public function export(Request $req): void
    {
        $user = Guard::authorize($req, 'transactions.export');
        [$whereSql, $params] = $this->filters($req);
        $rows = Database::instance()->fetchAll(
            "SELECT t.transaction_no, t.txn_date, t.txn_type, t.direction, t.amount, t.status,
                    a.name AS account, cu.name AS customer, l.code AS chit_code, t.remarks, u.name AS created_by
             " . self::BASE . "
             WHERE $whereSql ORDER BY t.txn_date DESC, t.id DESC",
            $params
        );
        $s = $this->summary($whereSql, $params);
        Audit::log('transaction.export', 'transactions', 'transaction', null, null, ['rows' => count($rows)], null,
            ['id' => $user['id'], 'role_code' => $user['role_code']]);
        Xlsx::stream(
            'transactions_' . date('Ymd_His') . '.xlsx',
            ['Txn No', 'Date', 'Type', 'Direction', 'Amount', 'Status', 'Account', 'Customer', 'Chit', 'Remarks', 'Created By'],
            array_map(fn($r) => [
                $r['transaction_no'], $r['txn_date'], $r['txn_type'], $r['direction'], (float)$r['amount'],
                $r['status'], $r['account'], $r['customer'], $r['chit_code'], $r['remarks'], $r['created_by'],
            ], $rows),
            [
                ['Transaction Ledger', 'generated ' . date('Y-m-d H:i')],
                ['Total credit', (float)($s['total_credit'] ?? 0)],
                ['Total debit', (float)($s['total_debit'] ?? 0)],
            ],
            [1 => 'date', 4 => 'number']
        );
    }
}
