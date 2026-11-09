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
                         OR c.address_line1 LIKE :q OR l.code LIKE :q)';
            $params['q'] = '%' . $q . '%';
        }
        // No location-based filtering: address is plain customer text, not a
        // filterable/master-backed dimension.
        if ($status = $req->queryParam('status')) {
            $where[] = 'c.status = :status';
            $params['status'] = $status;
        }
        // No location- or assignment-based visibility filtering: every user sees
        // all customers. Access is governed by the customers.* permission only.

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
                 LEFT JOIN loans_or_chits l ON l.customer_id = c.id
                 WHERE $whereSql";

        $total = (int)$db->scalar("SELECT COUNT(DISTINCT c.id) $base", $params);

        $rows = $db->fetchAll(
            "SELECT DISTINCT c.id, c.customer_code, c.name, c.mobile, c.status,
                    c.address_line1,
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
        $customer = Guard::assertCustomerInScope($user, $id);   // no-op scope; 404 if missing

        $db = Database::instance();
        // `customer.location` is already the typed text on the row.
        $customer['location_name'] = $customer['location'] ?? null;

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
            'name'             => 'required|string|max:128',
            'mobile'           => 'nullable|indian_mobile',
            'aadhar_number'    => 'nullable|aadhaar',
            'alt_mobile'       => 'nullable|indian_mobile',
            'email'            => 'nullable|email',
            'gender'           => 'nullable|in:male,female,other',
            'dob'              => 'nullable|date',
            'address_line1'    => 'nullable|string|max:255',
            'address_line2'    => 'nullable|string|max:255',
            'location'         => 'nullable|string|max:120',   // plain typed text — no Location Master
            'nominee_name'     => 'nullable|string|max:128',
            'nominee_relation' => 'nullable|string|max:64',
            'nominee_mobile'   => 'nullable|indian_mobile',
            'id_proof_type'    => 'nullable|string|max:32',
            'id_proof_number'  => 'nullable|string|max:64',
            'notes'            => 'nullable|string|max:500',
        ])->validated();

        if (isset($in['location'])) {
            $in['location'] = trim((string)$in['location']) ?: null;
        }

        $db = Database::instance();
        $code = CodeGenerator::customerCode();
        $id = $db->insert('customers', array_merge($in, [
            'customer_code' => $code,
            'status'        => 'active',
            'created_by'    => $user['id'],
            'created_at'    => BusinessDate::utcNow(),
            'updated_at'    => BusinessDate::utcNow(),
        ]));

        Audit::log('customer.create', 'customers', 'customer', $id, null,
            ['customer_code' => $code, 'name' => $in['name'], 'location' => $in['location'] ?? null], null,
            ['id' => $user['id'], 'role_code' => $user['role_code']]);

        Response::created($db->fetch('SELECT * FROM customers WHERE id = :id', ['id' => $id]), 'Customer created');
    }

    /** PUT /api/customers/{id} */
    public function update(Request $req, array $args): void
    {
        $user = Guard::authorize($req, 'customers.edit');
        $id = (int)$args['id'];
        $db = Database::instance();
        $before = Guard::assertCustomerInScope($user, $id);

        $in = Validator::make($req->body, [
            'name'             => 'nullable|string|max:128',
            'mobile'           => 'nullable|indian_mobile',
            'aadhar_number'    => 'nullable|aadhaar',
            'alt_mobile'       => 'nullable|indian_mobile',
            'email'            => 'nullable|email',
            'gender'           => 'nullable|in:male,female,other',
            'dob'              => 'nullable|date',
            'address_line1'    => 'nullable|string|max:255',
            'address_line2'    => 'nullable|string|max:255',
            'location'         => 'nullable|string|max:120',
            'nominee_name'     => 'nullable|string|max:128',
            'nominee_relation' => 'nullable|string|max:64',
            'nominee_mobile'   => 'nullable|indian_mobile',
            'status'           => 'nullable|in:active,inactive,blacklisted',
            'notes'            => 'nullable|string|max:500',
        ])->validated();

        // `location` may be explicitly cleared to '' -> store NULL.
        $locationTouched = array_key_exists('location', $req->body);
        $fields = array_filter($in, fn ($v) => $v !== null);
        if ($locationTouched) {
            $fields['location'] = trim((string)($req->body['location'] ?? '')) ?: null;
        }
        if (!$fields) {
            throw HttpException::validation(['_' => ['Nothing to update']]);
        }
        $fields['updated_at'] = BusinessDate::utcNow();
        $db->update('customers', $fields, 'id = :id', ['id' => $id]);

        // Keep the denormalised location text on the customer's chits in sync so
        // reports / filters / exports agree.
        if ($locationTouched && ($fields['location'] ?? null) !== ($before['location'] ?? null)) {
            $db->update('loans_or_chits',
                ['location' => $fields['location'], 'updated_at' => BusinessDate::utcNow()],
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
