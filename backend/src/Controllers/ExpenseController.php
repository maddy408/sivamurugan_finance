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

class ExpenseController
{
    /** Build the shared WHERE clause from query params. */
    private function filters(Request $req): array
    {
        $where = ['e.deleted_at IS NULL'];
        $params = [];
        if (($q = ListQuery::search($req)) !== '') {
            $where[] = '(e.category LIKE :q OR e.remarks LIKE :q)';
            $params['q'] = "%$q%";
        }
        if (($c = $req->queryParam('category')) !== null && $c !== '') { $where[] = 'e.category = :cat'; $params['cat'] = $c; }
        if (($a = $req->queryParam('account_id')) !== null && $a !== '') { $where[] = 'e.account_id = :acc'; $params['acc'] = (int)$a; }
        if (($s = $req->queryParam('status')) !== null && $s !== '') { $where[] = 'e.status = :st'; $params['st'] = $s; }
        if ($f = $req->queryParam('date_from')) { $where[] = 'e.expense_date >= :df'; $params['df'] = $f; }
        if ($t = $req->queryParam('date_to'))   { $where[] = 'e.expense_date <= :dt'; $params['dt'] = $t; }
        return [implode(' AND ', $where), $params];
    }

    /** GET /api/expenses */
    public function index(Request $req): void
    {
        Guard::authorize($req, 'expenses.view');
        $db = Database::instance();
        [$whereSql, $params] = $this->filters($req);

        $order = ListQuery::orderBy($req, [
            'expense_date' => 'e.expense_date', 'amount' => 'e.amount',
            'category' => 'e.category', 'created_at' => 'e.created_at',
        ], 'e.expense_date DESC, e.id DESC');
        $perPage = ListQuery::perPage($req);
        $offset  = ListQuery::offset($req);

        $base = "FROM expenses e
                 LEFT JOIN accounts a ON a.id = e.account_id
                 LEFT JOIN users u ON u.id = e.created_by
                 WHERE $whereSql";
        $total = (int)$db->scalar("SELECT COUNT(*) FROM expenses e LEFT JOIN accounts a ON a.id = e.account_id WHERE $whereSql", $params);
        $rows = $db->fetchAll(
            "SELECT e.id, e.amount, e.expense_date, e.category, e.remarks, e.status,
                    e.account_id, a.name AS account_name, a.type AS account_type,
                    u.name AS created_by_name, e.created_at
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
        $row = Database::instance()->fetch(
            "SELECT
                COALESCE(SUM(CASE WHEN e.status='active' THEN e.amount ELSE 0 END),0) AS total_expenses,
                COALESCE(SUM(CASE WHEN e.status='active' AND a.type='cash' THEN e.amount ELSE 0 END),0) AS cash_expenses,
                COALESCE(SUM(CASE WHEN e.status='active' AND a.type='bank' THEN e.amount ELSE 0 END),0) AS bank_expenses,
                COUNT(*) AS count
             FROM expenses e LEFT JOIN accounts a ON a.id = e.account_id
             WHERE $whereSql",
            $params
        );
        return $row ?: [];
    }

    /** GET /api/expenses/export */
    public function export(Request $req): void
    {
        $user = Guard::authorize($req, 'expenses.export');
        $db = Database::instance();
        [$whereSql, $params] = $this->filters($req);
        $rows = $db->fetchAll(
            "SELECT e.expense_date, e.category, a.name AS account, a.type AS account_type,
                    e.amount, e.status, e.remarks, u.name AS created_by
             FROM expenses e
             LEFT JOIN accounts a ON a.id = e.account_id
             LEFT JOIN users u ON u.id = e.created_by
             WHERE $whereSql
             ORDER BY e.expense_date DESC, e.id DESC",
            $params
        );
        $s = $this->summary($whereSql, $params);
        Audit::log('expense.export', 'expenses', 'expense', null, null, ['rows' => count($rows), 'filters' => $req->query], null,
            ['id' => $user['id'], 'role_code' => $user['role_code']]);
        Xlsx::stream(
            'expenses_' . date('Ymd_His') . '.xlsx',
            ['Date', 'Category', 'Account', 'Account Type', 'Amount', 'Status', 'Remarks', 'Created By'],
            array_map(fn($r) => [$r['expense_date'], $r['category'], $r['account'], $r['account_type'], (float)$r['amount'], $r['status'], $r['remarks'], $r['created_by']], $rows),
            [
                ['Expense Report', 'generated ' . date('Y-m-d H:i')],
                ['Total expenses', (float)($s['total_expenses'] ?? 0)],
                ['From office cash', (float)($s['cash_expenses'] ?? 0)],
                ['From bank', (float)($s['bank_expenses'] ?? 0)],
            ],
            [0 => 'date', 4 => 'number']
        );
    }

    /** POST /api/expenses */
    public function store(Request $req): void
    {
        $user = Guard::authorize($req, 'expenses.create');
        $in = Validator::make($req->body, [
            'amount'       => 'required|numeric|min:0.01',
            'expense_date' => 'required|date',
            'category'     => 'required|string|max:64',
            'account_id'   => 'nullable|int',
            'remarks'      => 'nullable|string|max:500',
        ])->validated();
        $db = Database::instance();
        if ($in['account_id'] && !$db->scalar('SELECT 1 FROM accounts WHERE id = :id AND is_active = 1', ['id' => $in['account_id']])) {
            throw HttpException::validation(['account_id' => ['Unknown or inactive account']]);
        }
        $id = $db->insert('expenses', [
            'amount'       => number_format((float)$in['amount'], 2, '.', ''),
            'expense_date' => $in['expense_date'],
            'category'     => $in['category'],
            'account_id'   => $in['account_id'],
            'remarks'      => $in['remarks'] ?? null,
            'status'       => 'active',
            'created_by'   => $user['id'],
            'created_at'   => BusinessDate::utcNow(),
            'updated_at'   => BusinessDate::utcNow(),
        ]);
        Audit::log('expense.create', 'expenses', 'expense', $id, null, $in, null,
            ['id' => $user['id'], 'role_code' => $user['role_code']]);
        Response::created($db->fetch('SELECT * FROM expenses WHERE id = :id', ['id' => $id]), 'Expense recorded');
    }

    /** PUT /api/expenses/{id} */
    public function update(Request $req, array $args): void
    {
        $user = Guard::authorize($req, 'expenses.edit');
        $db = Database::instance();
        $id = (int)$args['id'];
        $before = $db->fetch('SELECT * FROM expenses WHERE id = :id AND deleted_at IS NULL', ['id' => $id]);
        if (!$before) {
            throw HttpException::notFound('Expense not found');
        }
        if ($before['status'] === 'cancelled') {
            throw HttpException::conflict('A cancelled expense cannot be edited');
        }
        $in = Validator::make($req->body, [
            'amount'       => 'nullable|numeric|min:0.01',
            'expense_date' => 'nullable|date',
            'category'     => 'nullable|string|max:64',
            'account_id'   => 'nullable|int',
            'remarks'      => 'nullable|string|max:500',
        ])->validated();
        $fields = array_filter($in, fn($v) => $v !== null);
        if (!$fields) {
            throw HttpException::validation(['_' => ['Nothing to update']]);
        }
        if (isset($fields['amount'])) {
            $fields['amount'] = number_format((float)$fields['amount'], 2, '.', '');
        }
        $fields['updated_at'] = BusinessDate::utcNow();
        $db->update('expenses', $fields, 'id = :id', ['id' => $id]);
        Audit::log('expense.update', 'expenses', 'expense', $id, array_intersect_key($before, $fields), $fields, null,
            ['id' => $user['id'], 'role_code' => $user['role_code']]);
        Response::ok($db->fetch('SELECT * FROM expenses WHERE id = :id', ['id' => $id]), 'Expense updated');
    }

    /** POST /api/expenses/{id}/cancel */
    public function cancel(Request $req, array $args): void
    {
        $user = Guard::authorize($req, 'expenses.edit');
        $db = Database::instance();
        $id = (int)$args['id'];
        $row = $db->fetch('SELECT * FROM expenses WHERE id = :id AND deleted_at IS NULL', ['id' => $id]);
        if (!$row) {
            throw HttpException::notFound('Expense not found');
        }
        $db->update('expenses', [
            'status' => 'cancelled', 'cancelled_by' => $user['id'], 'cancelled_at' => BusinessDate::utcNow(),
            'updated_at' => BusinessDate::utcNow(),
        ], 'id = :id', ['id' => $id]);
        Audit::log('expense.cancel', 'expenses', 'expense', $id, ['status' => $row['status']], ['status' => 'cancelled'],
            $req->input('reason'), ['id' => $user['id'], 'role_code' => $user['role_code']]);
        Response::ok(null, 'Expense cancelled');
    }

    /** DELETE /api/expenses/{id}  - soft delete */
    public function destroy(Request $req, array $args): void
    {
        $user = Guard::authorize($req, 'expenses.delete');
        $db = Database::instance();
        $id = (int)$args['id'];
        if (!$db->scalar('SELECT 1 FROM expenses WHERE id = :id AND deleted_at IS NULL', ['id' => $id])) {
            throw HttpException::notFound('Expense not found');
        }
        $db->update('expenses', ['deleted_at' => BusinessDate::utcNow(), 'updated_at' => BusinessDate::utcNow()],
            'id = :id', ['id' => $id]);
        Audit::log('expense.delete', 'expenses', 'expense', $id, null, null, $req->input('reason'),
            ['id' => $user['id'], 'role_code' => $user['role_code']]);
        Response::ok(null, 'Expense removed');
    }

    /** GET /api/expenses/categories - distinct list for filters */
    public function categories(Request $req): void
    {
        Guard::authorize($req, 'expenses.view');
        $rows = Database::instance()->fetchAll("SELECT DISTINCT category FROM expenses WHERE deleted_at IS NULL ORDER BY category");
        Response::ok(array_column($rows, 'category'));
    }
}
