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

class LocationController
{
    public function index(Request $req): void
    {
        $user = Guard::authorize($req, 'locations.view');
        $db = Database::instance();
        $where = ['1=1']; $params = [];
        if (($q = ListQuery::search($req)) !== '') {
            $where[] = '(name LIKE :q OR code LIKE :q OR district LIKE :q)';
            $params['q'] = "%$q%";
        }
        if (($a = $req->queryParam('is_active')) !== null && $a !== '') {
            $where[] = 'is_active = :a'; $params['a'] = (int)$a;
        }
        if (!Guard::scopeIsUnrestricted($user)) {
            $ids = $user['scope']['location_ids'] ?: [0];
            $in = [];
            foreach ($ids as $i => $v) { $in[] = ":l$i"; $params["l$i"] = $v; }
            $where[] = 'id IN (' . implode(',', $in) . ')';
        }
        $whereSql = implode(' AND ', $where);
        $perPage = ListQuery::perPage($req); $offset = ListQuery::offset($req);
        $total = (int)$db->scalar("SELECT COUNT(*) FROM locations WHERE $whereSql", $params);
        $rows = $db->fetchAll(
            "SELECT l.*, (SELECT COUNT(*) FROM customers c WHERE c.primary_location_id = l.id AND c.deleted_at IS NULL) AS customer_count
             FROM locations l WHERE $whereSql ORDER BY l.name LIMIT $perPage OFFSET $offset",
            $params
        );
        Response::paginated($rows, $total, ListQuery::page($req), $perPage);
    }

    public function store(Request $req): void
    {
        $user = Guard::authorize($req, 'locations.create');
        $in = Validator::make($req->body, [
            'code'     => 'required|string|max:32',
            'name'     => 'required|string|max:128',
            'district' => 'nullable|string|max:128',
            'state'    => 'nullable|string|max:128',
            'pincode'  => 'nullable|string|max:12',
            'notes'    => 'nullable|string|max:255',
        ])->validated();
        $db = Database::instance();
        if ($db->scalar('SELECT 1 FROM locations WHERE code = :c', ['c' => $in['code']])) {
            throw HttpException::conflict('Location code already exists');
        }
        $id = $db->insert('locations', $in + [
            'is_active' => 1, 'created_at' => BusinessDate::utcNow(), 'updated_at' => BusinessDate::utcNow(),
        ]);
        Audit::log('location.create', 'locations', 'location', $id, null, $in, null,
            ['id' => $user['id'], 'role_code' => $user['role_code']]);
        Response::created($db->fetch('SELECT * FROM locations WHERE id = :id', ['id' => $id]), 'Location created');
    }

    /** GET /api/locations/{id} - detail + assigned employees + customer count */
    public function show(Request $req, array $args): void
    {
        $user = Guard::authorize($req, 'locations.view');
        $db = Database::instance();
        $id = (int)$args['id'];
        $loc = $db->fetch('SELECT * FROM locations WHERE id = :id', ['id' => $id]);
        if (!$loc) {
            throw HttpException::notFound('Location not found');
        }
        if (!Guard::scopeIsUnrestricted($user)
            && !in_array($id, $user['scope']['location_ids'] ?? [], true)) {
            throw HttpException::forbidden('This location is outside your assigned scope');
        }
        $loc['employees'] = $db->fetchAll(
            "SELECT e.id AS employee_id, e.emp_code, u.name, u.username, u.is_active
             FROM employee_locations el
             JOIN employees e ON e.id = el.employee_id
             JOIN users u ON u.id = e.user_id
             WHERE el.location_id = :id ORDER BY u.name",
            ['id' => $id]
        );
        $loc['customer_count'] = (int)$db->scalar(
            'SELECT COUNT(*) FROM customers WHERE primary_location_id = :id AND deleted_at IS NULL', ['id' => $id]
        );
        $loc['chit_count'] = (int)$db->scalar(
            "SELECT COUNT(*) FROM loans_or_chits WHERE location_id = :id AND deleted_at IS NULL", ['id' => $id]
        );
        Response::ok($loc);
    }

    public function update(Request $req, array $args): void
    {
        $user = Guard::authorize($req, 'locations.edit');
        $db = Database::instance();
        $id = (int)$args['id'];
        $before = $db->fetch('SELECT * FROM locations WHERE id = :id', ['id' => $id]);
        if (!$before) {
            throw HttpException::notFound('Location not found');
        }
        $in = Validator::make($req->body, [
            'name'      => 'nullable|string|max:128',
            'district'  => 'nullable|string|max:128',
            'state'     => 'nullable|string|max:128',
            'pincode'   => 'nullable|string|max:12',
            'is_active' => 'nullable|bool',
            'notes'     => 'nullable|string|max:255',
        ])->validated();
        $fields = array_filter($in, fn($v) => $v !== null);
        if (isset($fields['is_active'])) $fields['is_active'] = $fields['is_active'] ? 1 : 0;
        if (!$fields) {
            throw HttpException::validation(['_' => ['Nothing to update']]);
        }
        $fields['updated_at'] = BusinessDate::utcNow();
        $db->update('locations', $fields, 'id = :id', ['id' => $id]);
        Audit::log('location.update', 'locations', 'location', $id, array_intersect_key($before, $fields), $fields, null,
            ['id' => $user['id'], 'role_code' => $user['role_code']]);
        Response::ok($db->fetch('SELECT * FROM locations WHERE id = :id', ['id' => $id]), 'Location updated');
    }

    /** DELETE /api/locations/{id} */
    public function destroy(Request $req, array $args): void
    {
        $user = Guard::authorize($req, 'locations.delete');
        $db = Database::instance();
        $id = (int)$args['id'];
        $loc = $db->fetch('SELECT * FROM locations WHERE id = :id', ['id' => $id]);
        if (!$loc) {
            throw HttpException::notFound('Location not found');
        }
        $custCount = (int)$db->scalar('SELECT COUNT(*) FROM customers WHERE primary_location_id = :id AND deleted_at IS NULL', ['id' => $id]);
        $chitCount = (int)$db->scalar("SELECT COUNT(*) FROM loans_or_chits WHERE location_id = :id AND deleted_at IS NULL", ['id' => $id]);
        if ($custCount > 0 || $chitCount > 0) {
            throw HttpException::conflict(
                "Cannot delete: $custCount customer(s) and $chitCount chit(s) are still mapped to this location. Reassign them first."
            );
        }
        $db->transaction(function ($db) use ($id) {
            $db->run('DELETE FROM employee_locations WHERE location_id = :id', ['id' => $id]);
            $db->run('DELETE FROM customer_locations WHERE location_id = :id', ['id' => $id]);
            $db->run('DELETE FROM locations WHERE id = :id', ['id' => $id]);
        });
        Audit::log('location.delete', 'locations', 'location', $id, ['code' => $loc['code'], 'name' => $loc['name']], null,
            $req->input('reason'), ['id' => $user['id'], 'role_code' => $user['role_code']]);
        Response::ok(null, 'Location deleted');
    }
}
