<?php
namespace App\Controllers;

use App\Auth\Guard;
use App\Core\Database;
use App\Core\HttpException;
use App\Core\ListQuery;
use App\Core\Request;
use App\Core\Response;
use App\Core\Validator;
use App\Support\Audit;
use App\Support\BusinessDate;
use App\Support\Xlsx;

class IncomeController
{
    private function filters(Request $req): array
    {
        $where = ['i.deleted_at IS NULL'];
        $params = [];
        if (($q = ListQuery::search($req)) !== '') {
            $where[] = '(i.category LIKE :q OR i.giver_details LIKE :q OR i.remarks LIKE :q)';
            $params['q'] = "%$q%";
        }
        if (($c = $req->queryParam('category')) !== null && $c !== '') { $where[] = 'i.category = :cat'; $params['cat'] = $c; }
        if (($a = $req->queryParam('account_id')) !== null && $a !== '') { $where[] = 'i.account_id = :acc'; $params['acc'] = (int)$a; }
        if (($s = $req->queryParam('status')) !== null && $s !== '') { $where[] = 'i.status = :st'; $params['st'] = $s; }
        if ($f = $req->queryParam('date_from')) { $where[] = 'i.received_date >= :df'; $params['df'] = $f; }
        if ($t = $req->queryParam('date_to'))   { $where[] = 'i.received_date <= :dt'; $params['dt'] = $t; }
        return [implode(' AND ', $where), $params];
    }

    public function index(Request $req): void
    {
        Guard::authorize($req, 'income.view');
        $db = Database::instance();
        [$whereSql, $params] = $this->filters($req);
        $order = ListQuery::orderBy($req, [
            'received_date' => 'i.received_date', 'amount' => 'i.amount',
            'category' => 'i.category', 'created_at' => 'i.created_at',
        ], 'i.received_date DESC, i.id DESC');
        $perPage = ListQuery::perPage($req);
        $offset  = ListQuery::offset($req);
        $base = "FROM office_income i
                 LEFT JOIN accounts a ON a.id = i.account_id
                 LEFT JOIN users u ON u.id = i.created_by
                 WHERE $whereSql";
        $total = (int)$db->scalar("SELECT COUNT(*) FROM office_income i LEFT JOIN accounts a ON a.id = i.account_id WHERE $whereSql", $params);
        $rows = $db->fetchAll(
            "SELECT i.id, i.amount, i.received_date, i.category, i.giver_details, i.remarks, i.status,
                    i.account_id, a.name AS account_name, a.type AS account_type,
                    u.name AS created_by_name, i.created_at
             $base
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
        return Database::instance()->fetch(
            "SELECT
                COALESCE(SUM(CASE WHEN i.status='active' THEN i.amount ELSE 0 END),0) AS total_income,
                COALESCE(SUM(CASE WHEN i.status='active' AND a.type='cash' THEN i.amount ELSE 0 END),0) AS cash_income,
                COALESCE(SUM(CASE WHEN i.status='active' AND a.type='bank' THEN i.amount ELSE 0 END),0) AS bank_income,
                COUNT(*) AS count
             FROM office_income i LEFT JOIN accounts a ON a.id = i.account_id
             WHERE $whereSql",
            $params
        ) ?: [];
    }

    public function export(Request $req): void
    {
        $user = Guard::authorize($req, 'income.export');
        [$whereSql, $params] = $this->filters($req);
        $rows = Database::instance()->fetchAll(
            "SELECT i.received_date, i.category, a.name AS account, a.type AS account_type,
                    i.amount, i.status, i.giver_details, i.remarks, u.name AS created_by
             FROM office_income i
             LEFT JOIN accounts a ON a.id = i.account_id
             LEFT JOIN users u ON u.id = i.created_by
             WHERE $whereSql ORDER BY i.received_date DESC, i.id DESC",
            $params
        );
        $s = $this->summary($whereSql, $params);
        Audit::log('income.export', 'income', 'office_income', null, null, ['rows' => count($rows)], null,
            ['id' => $user['id'], 'role_code' => $user['role_code']]);
        Xlsx::stream(
            'office_income_' . date('Ymd_His') . '.xlsx',
            ['Date', 'Category', 'Account', 'Account Type', 'Amount', 'Status', 'Giver', 'Remarks', 'Created By'],
            array_map(fn($r) => [$r['received_date'], $r['category'], $r['account'], $r['account_type'], (float)$r['amount'], $r['status'], $r['giver_details'], $r['remarks'], $r['created_by']], $rows),
            [
                ['Office Income Report', 'generated ' . date('Y-m-d H:i')],
                ['Total income', (float)($s['total_income'] ?? 0)],
                ['To office cash', (float)($s['cash_income'] ?? 0)],
                ['To bank', (float)($s['bank_income'] ?? 0)],
            ],
            [0 => 'date', 4 => 'number']
        );
    }

    public function store(Request $req): void
    {
        $user = Guard::authorize($req, 'income.create');
        $in = Validator::make($req->body, [
            'amount'        => 'required|numeric|min:0.01',
            'received_date' => 'required|date',
            'category'      => 'required|string|max:64',
            'account_id'    => 'nullable|int',
            'giver_details' => 'nullable|string|max:255',
            'remarks'       => 'nullable|string|max:500',
        ])->validated();
        $db = Database::instance();
        if ($in['account_id'] && !$db->scalar('SELECT 1 FROM accounts WHERE id = :id AND is_active = 1', ['id' => $in['account_id']])) {
            throw HttpException::validation(['account_id' => ['Unknown or inactive account']]);
        }
        $id = $db->insert('office_income', [
            'amount'        => number_format((float)$in['amount'], 2, '.', ''),
            'received_date' => $in['received_date'],
            'category'      => $in['category'],
            'account_id'    => $in['account_id'],
            'giver_details' => $in['giver_details'] ?? null,
            'remarks'       => $in['remarks'] ?? null,
            'status'        => 'active',
            'created_by'    => $user['id'],
            'created_at'    => BusinessDate::utcNow(),
            'updated_at'    => BusinessDate::utcNow(),
        ]);
        Audit::log('income.create', 'income', 'office_income', $id, null, $in, null,
            ['id' => $user['id'], 'role_code' => $user['role_code']]);
        Response::created($db->fetch('SELECT * FROM office_income WHERE id = :id', ['id' => $id]), 'Income recorded');
    }

    public function update(Request $req, array $args): void
    {
        $user = Guard::authorize($req, 'income.edit');
        $db = Database::instance();
        $id = (int)$args['id'];
        $before = $db->fetch('SELECT * FROM office_income WHERE id = :id AND deleted_at IS NULL', ['id' => $id]);
        if (!$before) {
            throw HttpException::notFound('Income entry not found');
        }
        if ($before['status'] === 'cancelled') {
            throw HttpException::conflict('A cancelled income entry cannot be edited');
        }
        $in = Validator::make($req->body, [
            'amount'        => 'nullable|numeric|min:0.01',
            'received_date' => 'nullable|date',
            'category'      => 'nullable|string|max:64',
            'account_id'    => 'nullable|int',
            'giver_details' => 'nullable|string|max:255',
            'remarks'       => 'nullable|string|max:500',
        ])->validated();
        $fields = array_filter($in, fn($v) => $v !== null);
        if (!$fields) {
            throw HttpException::validation(['_' => ['Nothing to update']]);
        }
        if (isset($fields['amount'])) {
            $fields['amount'] = number_format((float)$fields['amount'], 2, '.', '');
        }
        $fields['updated_at'] = BusinessDate::utcNow();
        $db->update('office_income', $fields, 'id = :id', ['id' => $id]);
        Audit::log('income.update', 'income', 'office_income', $id, array_intersect_key($before, $fields), $fields, null,
            ['id' => $user['id'], 'role_code' => $user['role_code']]);
        Response::ok($db->fetch('SELECT * FROM office_income WHERE id = :id', ['id' => $id]), 'Income updated');
    }

    public function cancel(Request $req, array $args): void
    {
        $user = Guard::authorize($req, 'income.edit');
        $db = Database::instance();
        $id = (int)$args['id'];
        $row = $db->fetch('SELECT * FROM office_income WHERE id = :id AND deleted_at IS NULL', ['id' => $id]);
        if (!$row) {
            throw HttpException::notFound('Income entry not found');
        }
        $db->update('office_income', [
            'status' => 'cancelled', 'cancelled_by' => $user['id'], 'cancelled_at' => BusinessDate::utcNow(),
            'updated_at' => BusinessDate::utcNow(),
        ], 'id = :id', ['id' => $id]);
        Audit::log('income.cancel', 'income', 'office_income', $id, ['status' => $row['status']], ['status' => 'cancelled'],
            $req->input('reason'), ['id' => $user['id'], 'role_code' => $user['role_code']]);
        Response::ok(null, 'Income entry cancelled');
    }

    public function destroy(Request $req, array $args): void
    {
        $user = Guard::authorize($req, 'income.delete');
        $db = Database::instance();
        $id = (int)$args['id'];
        if (!$db->scalar('SELECT 1 FROM office_income WHERE id = :id AND deleted_at IS NULL', ['id' => $id])) {
            throw HttpException::notFound('Income entry not found');
        }
        $db->update('office_income', ['deleted_at' => BusinessDate::utcNow(), 'updated_at' => BusinessDate::utcNow()],
            'id = :id', ['id' => $id]);
        Audit::log('income.delete', 'income', 'office_income', $id, null, null, $req->input('reason'),
            ['id' => $user['id'], 'role_code' => $user['role_code']]);
        Response::ok(null, 'Income entry removed');
    }

    public function categories(Request $req): void
    {
        Guard::authorize($req, 'income.view');
        $seeded = ['Moi', 'Gift', 'Donation', 'Investment'];
        $rows = Database::instance()->fetchAll("SELECT DISTINCT category FROM office_income WHERE deleted_at IS NULL");
        $all = array_values(array_unique(array_merge($seeded, array_column($rows, 'category'))));
        sort($all);
        Response::ok($all);
    }
}
