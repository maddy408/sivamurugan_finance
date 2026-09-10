<?php
namespace App\Controllers;

use App\Auth\Guard;
use App\Core\Database;
use App\Core\HttpException;
use App\Core\ListQuery;
use App\Core\Request;
use App\Core\Response;
use App\Core\Validator;
use App\Services\CodeGenerator;
use App\Services\LocationService;
use App\Support\Audit;
use App\Support\BusinessDate;

class CustomerController
{
    /** GET /api/customers  - server-side search / filter / sort / pagination */
    public function index(Request $req): void
    {
        $user = Guard::authorize($req, 'customers.view');
        $db = Database::instance();

        $where  = ['c.deleted_at IS NULL'];
        $params = [];

        $q = ListQuery::search($req);
        if ($q !== '') {
            $where[] = '(c.name LIKE :q OR c.customer_code LIKE :q OR c.mobile LIKE :q
                         OR loc.name LIKE :q OR l.code LIKE :q)';
            $params['q'] = '%' . $q . '%';
        }
        if ($loc = $req->queryParam('location_id')) {
            $where[] = 'c.primary_location_id = :loc';
            $params['loc'] = (int)$loc;
        }
        if ($status = $req->queryParam('status')) {
            $where[] = 'c.status = :status';
            $params['status'] = $status;
        }

        // Employee scope: only customers in an assigned location or with an assigned loan.
        if (!Guard::scopeIsUnrestricted($user)) {
            $locIds  = $user['scope']['location_ids'] ?: [0];
            $loanIds = $user['scope']['loan_ids'] ?: [0];
            $lin = [];
            foreach ($locIds as $i => $id) { $lin[] = ":el$i"; $params["el$i"] = $id; }
            $nin = [];
            foreach ($loanIds as $i => $id) { $nin[] = ":en$i"; $params["en$i"] = $id; }
            $where[] = '(c.primary_location_id IN (' . implode(',', $lin) . ')
                        OR EXISTS (SELECT 1 FROM loans_or_chits lx WHERE lx.customer_id = c.id AND lx.id IN (' . implode(',', $nin) . ')))';
        }

        $order = ListQuery::orderBy($req, [
            'name'          => 'c.name',
            'customer_code' => 'c.customer_code',
            'created_at'    => 'c.created_at',
            'status'        => 'c.status',
        ], 'c.name ASC');

        $perPage = ListQuery::perPage($req);
        $offset  = ListQuery::offset($req);
        $whereSql = implode(' AND ', $where);

        $base = "FROM customers c
                 LEFT JOIN locations loc ON loc.id = c.primary_location_id
                 LEFT JOIN loans_or_chits l ON l.customer_id = c.id
                 WHERE $whereSql";

        $total = (int)$db->scalar("SELECT COUNT(DISTINCT c.id) $base", $params);

        $rows = $db->fetchAll(
            "SELECT DISTINCT c.id, c.customer_code, c.name, c.mobile, c.status,
                    c.primary_location_id, loc.name AS location_name,
                    (SELECT COUNT(*) FROM loans_or_chits lc WHERE lc.customer_id = c.id AND lc.status = 'active') AS active_loans,
                    c.created_at
             $base
             ORDER BY $order
             LIMIT $perPage OFFSET $offset",
            $params
        );

        Response::paginated($rows, $total, ListQuery::page($req), $perPage);
    }

    /** GET /api/customers/{id} - profile + loans + schedule summary + history */
    public function show(Request $req, array $args): void
    {
        $user = Guard::authorize($req, 'customers.view');
        $id = (int)$args['id'];
        $customer = Guard::assertCustomerInScope($user, $id);

        $db = Database::instance();
        $customer['location'] = $customer['primary_location_id']
            ? $db->fetch('SELECT id, code, name FROM locations WHERE id = :id', ['id' => $customer['primary_location_id']])
            : null;

        $loans = $db->fetchAll(
            "SELECT l.*,
                    (SELECT COALESCE(SUM(balance_amount),0) FROM installments i WHERE i.loan_id = l.id) AS outstanding_balance
             FROM loans_or_chits l WHERE l.customer_id = :c ORDER BY l.created_at DESC",
            ['c' => $id]
        );

        $payments = $db->fetchAll(
            "SELECT col.id, col.receipt_no, col.collection_date, col.amount, col.fine_amount,
                    col.total_amount, col.status, pm.name AS payment_mode, l.code AS loan_code
             FROM collections col
             JOIN payment_modes pm ON pm.id = col.payment_mode_id
             JOIN loans_or_chits l ON l.id = col.loan_id
             WHERE col.customer_id = :c AND col.deleted_at IS NULL
             ORDER BY col.collection_date DESC, col.id DESC
             LIMIT 100",
            ['c' => $id]
        );

        $outstanding = $db->scalar(
            "SELECT COALESCE(SUM(i.balance_amount),0)
             FROM installments i JOIN loans_or_chits l ON l.id = i.loan_id
             WHERE l.customer_id = :c",
            ['c' => $id]
        );

        Response::ok([
            'customer'            => $customer,
            'loans'               => $loans,
            'payment_history'     => $payments,
            'outstanding_balance' => $outstanding,
        ]);
    }

    /** POST /api/customers */
    public function store(Request $req): void
    {
        $user = Guard::authorize($req, 'customers.create');
        $in = Validator::make($req->body, [
            'name'                => 'required|string|max:128',
            'mobile'              => 'required|string|max:20',
            'alt_mobile'          => 'nullable|string|max:20',
            'email'               => 'nullable|email',
            'gender'              => 'nullable|in:male,female,other',
            'dob'                 => 'nullable|date',
            'address_line1'       => 'nullable|string|max:255',
            'address_line2'       => 'nullable|string|max:255',
            'primary_location_id' => 'nullable|int',
            'new_location'        => 'nullable|string|max:128',
            'nominee_name'        => 'nullable|string|max:128',
            'nominee_relation'    => 'nullable|string|max:64',
            'nominee_mobile'      => 'nullable|string|max:20',
            'id_proof_type'       => 'nullable|string|max:32',
            'id_proof_number'     => 'nullable|string|max:64',
            'notes'               => 'nullable|string|max:500',
        ])->validated();

        $db = Database::instance();

        // New-location typed into the form: reuse if it already exists, else create it.
        $createdLocation = null;
        if (!$in['primary_location_id'] && !empty($in['new_location'])) {
            $res = LocationService::findOrCreate(
                $in['new_location'], ['id' => $user['id'], 'role_code' => $user['role_code']]
            );
            $in['primary_location_id'] = $res['id'];
            if ($res['created']) {
                $createdLocation = $db->fetch('SELECT * FROM locations WHERE id = :id', ['id' => $res['id']]);
            }
        }
        unset($in['new_location']);

        if ($in['primary_location_id'] && !$db->scalar('SELECT 1 FROM locations WHERE id = :id', ['id' => $in['primary_location_id']])) {
            throw HttpException::validation(['primary_location_id' => ['Unknown location']]);
        }

        $code = CodeGenerator::customerCode();
        $id = $db->insert('customers', array_merge($in, [
            'customer_code' => $code,
            'status'        => 'active',
            'created_by'    => $user['id'],
            'created_at'    => BusinessDate::utcNow(),
            'updated_at'    => BusinessDate::utcNow(),
        ]));
        if ($in['primary_location_id']) {
            $db->run('INSERT IGNORE INTO customer_locations (customer_id, location_id) VALUES (:c,:l)',
                ['c' => $id, 'l' => $in['primary_location_id']]);
        }

        Audit::log('customer.create', 'customers', 'customer', $id, null,
            ['customer_code' => $code, 'name' => $in['name']], null,
            ['id' => $user['id'], 'role_code' => $user['role_code']]);

        $row = $db->fetch('SELECT * FROM customers WHERE id = :id', ['id' => $id]);
        if ($createdLocation) {
            $row['created_location'] = $createdLocation;   // let the SPA add it to caches
        }
        Response::created($row, 'Customer created' . ($createdLocation ? ' (new location "' . $createdLocation['name'] . '" added)' : ''));
    }

    /** PUT /api/customers/{id} */
    public function update(Request $req, array $args): void
    {
        $user = Guard::authorize($req, 'customers.edit');
        $id = (int)$args['id'];
        $db = Database::instance();
        $before = Guard::assertCustomerInScope($user, $id);

        $in = Validator::make($req->body, [
            'name'                => 'nullable|string|max:128',
            'mobile'              => 'nullable|string|max:20',
            'alt_mobile'          => 'nullable|string|max:20',
            'email'               => 'nullable|email',
            'gender'              => 'nullable|in:male,female,other',
            'dob'                 => 'nullable|date',
            'address_line1'       => 'nullable|string|max:255',
            'address_line2'       => 'nullable|string|max:255',
            'primary_location_id' => 'nullable|int',
            'nominee_name'        => 'nullable|string|max:128',
            'nominee_relation'    => 'nullable|string|max:64',
            'nominee_mobile'      => 'nullable|string|max:20',
            'status'              => 'nullable|in:active,inactive,blacklisted',
            'notes'               => 'nullable|string|max:500',
        ])->validated();

        $fields = array_filter($in, fn($v) => $v !== null);
        if (!$fields) {
            throw HttpException::validation(['_' => ['Nothing to update']]);
        }
        $fields['updated_at'] = BusinessDate::utcNow();
        $db->update('customers', $fields, 'id = :id', ['id' => $id]);

        // Customer location is the source of truth — keep the customer's chits in sync
        // so scope, filters, reports and exports all agree.
        if (array_key_exists('primary_location_id', $fields)
            && (int)$fields['primary_location_id'] !== (int)($before['primary_location_id'] ?? 0)) {
            $db->update('loans_or_chits',
                ['location_id' => $fields['primary_location_id'], 'updated_at' => BusinessDate::utcNow()],
                'customer_id = :c AND deleted_at IS NULL', ['c' => $id]);
        }

        Audit::log('customer.update', 'customers', 'customer', $id,
            array_intersect_key($before, $fields), $fields, null,
            ['id' => $user['id'], 'role_code' => $user['role_code']]);

        Response::ok($db->fetch('SELECT * FROM customers WHERE id = :id', ['id' => $id]), 'Customer updated');
    }

    /** DELETE /api/customers/{id}  - soft delete */
    public function destroy(Request $req, array $args): void
    {
        $user = Guard::authorize($req, 'customers.delete');
        $id = (int)$args['id'];
        $db = Database::instance();
        Guard::assertCustomerInScope($user, $id);

        if ($db->scalar("SELECT 1 FROM loans_or_chits WHERE customer_id = :c AND status = 'active'", ['c' => $id])) {
            throw HttpException::conflict('Cannot delete a customer with active loans/chits');
        }
        $db->update('customers', ['deleted_at' => BusinessDate::utcNow(), 'status' => 'inactive'], 'id = :id', ['id' => $id]);
        Audit::log('customer.delete', 'customers', 'customer', $id, null, null, $req->input('reason'),
            ['id' => $user['id'], 'role_code' => $user['role_code']]);
        Response::ok(null, 'Customer removed');
    }
}
