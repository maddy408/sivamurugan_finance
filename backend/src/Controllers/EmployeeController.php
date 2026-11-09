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

class EmployeeController
{
    // No employee-location mapping in this application. Employees have no
    // location; visibility is not location-based (see Auth::loadScope / Guard).

    /** Users Management: lists/manages EVERY user (Admin + Employee), not just Employee-role rows. */
    public function index(Request $req): void
    {
        $user = Guard::authorize($req, 'employees.view');
        $db = Database::instance();
        $where = ['1=1']; $params = [];
        if (($q = ListQuery::search($req)) !== '') {
            $where[] = '(u.name LIKE :q OR u.username LIKE :q OR e.emp_code LIKE :q OR u.phone LIKE :q)';
            $params['q'] = "%$q%";
        }
        if (($a = $req->queryParam('is_active')) !== null && $a !== '') {
            $where[] = 'u.is_active = :a'; $params['a'] = (int)$a;
        }
        $whereSql = implode(' AND ', $where);
        $perPage = ListQuery::perPage($req); $offset = ListQuery::offset($req);
        $base = "FROM users u JOIN roles r ON r.id = u.role_id LEFT JOIN employees e ON e.user_id = u.id WHERE $whereSql";
        $total = (int)$db->scalar("SELECT COUNT(*) $base", $params);
        $rows = $db->fetchAll(
            "SELECT u.id AS user_id, e.id AS employee_id, e.emp_code, u.name, u.username, u.email, u.phone,
                    u.is_active, u.last_login_at, u.session_version, r.code AS role, r.name AS role_name,
                    (SELECT COUNT(*) FROM loan_assignments la WHERE la.employee_id = e.id AND la.is_active = 1) AS loan_count
             $base ORDER BY u.name LIMIT $perPage OFFSET $offset",
            $params
        );
        Response::paginated($rows, $total, ListQuery::page($req), $perPage);
    }

    /** GET /api/employees/{id}  - one user's profile (id = users.id). No credentials. */
    public function show(Request $req, array $args): void
    {
        Guard::authorize($req, 'employees.view');
        $db = Database::instance();
        $uid = (int) $args['id'];
        $row = $db->fetch(
            "SELECT u.id AS user_id, e.id AS employee_id, e.emp_code, e.joined_on,
                    u.name, u.username, u.email, u.phone, u.is_active, u.last_login_at, u.created_at,
                    r.code AS role, r.name AS role_name
             FROM users u JOIN roles r ON r.id = u.role_id
             LEFT JOIN employees e ON e.user_id = u.id
             WHERE u.id = :id",
            ['id' => $uid]
        );
        if (!$row) {
            throw HttpException::notFound('User not found');
        }
        $row['assigned_loans'] = $row['employee_id'] ? (int) $db->scalar(
            'SELECT COUNT(*) FROM loan_assignments WHERE employee_id = :e AND is_active = 1',
            ['e' => (int) $row['employee_id']]
        ) : 0;
        Response::ok($row);
    }

    /** PUT /api/employees/{id}  - edit basic profile / active flag (id = users.id). */
    public function update(Request $req, array $args): void
    {
        $admin = Guard::authorize($req, 'employees.edit');
        $db = Database::instance();
        $uid = (int) $args['id'];
        $emp = $db->fetch(
            "SELECT e.id AS employee_id, u.* FROM users u
             LEFT JOIN employees e ON e.user_id = u.id
             WHERE u.id = :id",
            ['id' => $uid]
        );
        if (!$emp) {
            throw HttpException::notFound('User not found');
        }
        $in = Validator::make($req->body, [
            'name'  => 'nullable|string|max:128',
            'email' => 'nullable|email',
            'phone' => 'nullable|indian_mobile',
        ])->validated();

        $fields = [];
        foreach (['name', 'email', 'phone'] as $k) {
            if ($in[$k] !== null && $in[$k] !== '') $fields[$k] = $in[$k];
        }
        $body = $req->body;
        $empId = (int) $emp['employee_id'];

        $db->transaction(function ($db) use ($uid, $empId, $fields, $body) {
            if ($fields) {
                $fields['updated_at'] = BusinessDate::utcNow();
                $db->update('users', $fields, 'id = :id', ['id' => $uid]);
            }
            if (array_key_exists('is_active', $body)) {
                $active = filter_var($body['is_active'], FILTER_VALIDATE_BOOL) ? 1 : 0;
                $db->run('UPDATE users SET is_active = :a, updated_at = :n WHERE id = :id',
                    ['a' => $active, 'n' => BusinessDate::utcNow(), 'id' => $uid]);
                $db->run('UPDATE employees SET is_active = :a WHERE user_id = :id', ['a' => $active, 'id' => $uid]);
                if (!$active) {
                    $db->run('UPDATE users SET session_version = session_version + 1 WHERE id = :id', ['id' => $uid]);
                    $db->run('UPDATE sessions SET revoked = 1 WHERE user_id = :id AND revoked = 0', ['id' => $uid]);
                }
            }
        });

        Audit::log('employee.update', 'employees', 'user', $uid, null,
            array_merge($fields, array_intersect_key($body, ['is_active' => 1])), null,
            ['id' => $admin['id'], 'role_code' => $admin['role_code']]);

        $this->show($req, $args);
    }

    /** POST /api/employees  - create a user with either the Admin or Employee role. */
    public function store(Request $req): void
    {
        $user = Guard::authorize($req, 'employees.create');
        $db = Database::instance();
        $in = Validator::make($req->body, [
            'name'         => 'required|string|max:128',
            'username'     => 'required|string|min:3|max:64',
            'password'     => 'required|string|min:8|max:128',
            'email'        => 'nullable|email',
            'phone'        => 'nullable|indian_mobile',
            'emp_code'     => 'nullable|string|max:32',
            'role'         => 'nullable|in:ADMIN,EMPLOYEE',
        ])->validated();

        if ($db->scalar('SELECT 1 FROM users WHERE username = :u', ['u' => $in['username']])) {
            throw HttpException::conflict('Username already taken');
        }
        $roleCode = $in['role'] ?: 'EMPLOYEE';
        $roleId = $db->scalar('SELECT id FROM roles WHERE code = :c', ['c' => $roleCode]);
        if (!$roleId) {
            throw HttpException::validation(['role' => ['Unknown role']]);
        }
        $isEmployee = $roleCode === 'EMPLOYEE';
        $empCode = $isEmployee
            ? ($in['emp_code'] ?: ('EMP-' . str_pad((string)((int)$db->scalar('SELECT COUNT(*) FROM employees') + 1), 4, '0', STR_PAD_LEFT)))
            : null;

        $userId = $db->transaction(function ($db) use ($in, $empCode, $roleId, $isEmployee) {
            $uid = $db->insert('users', [
                'role_id'       => $roleId,
                'name'          => $in['name'],
                'username'      => $in['username'],
                'email'         => $in['email'] ?? null,
                'phone'         => $in['phone'] ?? null,
                'password_hash' => password_hash($in['password'], PASSWORD_BCRYPT),
                'is_active'     => 1,
                'session_version' => 1,
                'created_at'    => BusinessDate::utcNow(),
                'updated_at'    => BusinessDate::utcNow(),
            ]);
            if ($isEmployee) {
                $db->insert('employees', [
                    'user_id'  => $uid,
                    'emp_code' => $empCode,
                    'joined_on'=> BusinessDate::fmt(BusinessDate::today()),
                    'is_active'=> 1,
                    'created_at' => BusinessDate::utcNow(),
                    'updated_at' => BusinessDate::utcNow(),
                ]);
            }
            return $uid;
        });

        Audit::log('user.create', 'employees', 'user', $userId, null,
            ['username' => $in['username'], 'role' => $roleCode, 'emp_code' => $empCode], null,
            ['id' => $user['id'], 'role_code' => $user['role_code']]);
        Response::created(['user_id' => $userId, 'role' => $roleCode, 'emp_code' => $empCode], 'User created');
    }

    public function setActive(Request $req, array $args): void
    {
        $admin = Guard::authorize($req, 'employees.edit');
        $db = Database::instance();
        $uid = (int)$args['id'];
        $active = filter_var($req->input('is_active', true), FILTER_VALIDATE_BOOL) ? 1 : 0;
        $target = $db->fetch("SELECT u.*, r.code AS role_code FROM users u JOIN roles r ON r.id=u.role_id WHERE u.id=:id", ['id' => $uid]);
        if (!$target) {
            throw HttpException::notFound('User not found');
        }
        if (!$active && $target['role_code'] === 'ADMIN') {
            $otherActiveAdmins = (int)$db->scalar(
                "SELECT COUNT(*) FROM users u JOIN roles r ON r.id=u.role_id WHERE r.code='ADMIN' AND u.is_active=1 AND u.id <> :id",
                ['id' => $uid]
            );
            if ($otherActiveAdmins === 0) {
                throw HttpException::conflict('Cannot deactivate the last active administrator');
            }
        }
        $db->transaction(function ($db) use ($uid, $active) {
            $db->run('UPDATE users SET is_active = :a, updated_at = :n WHERE id = :id',
                ['a' => $active, 'n' => BusinessDate::utcNow(), 'id' => $uid]);
            $db->run('UPDATE employees SET is_active = :a WHERE user_id = :id', ['a' => $active, 'id' => $uid]);
            if (!$active) {
                $db->run('UPDATE users SET session_version = session_version + 1 WHERE id = :id', ['id' => $uid]);
                $db->run('UPDATE sessions SET revoked = 1 WHERE user_id = :id AND revoked = 0', ['id' => $uid]);
            }
        });
        Audit::log($active ? 'employee.activate' : 'employee.deactivate', 'employees', 'user', $uid, null, ['is_active' => $active], null,
            ['id' => $admin['id'], 'role_code' => $admin['role_code']]);
        Response::ok(null, $active ? 'Employee activated' : 'Employee deactivated (sessions terminated)');
    }

    public function resetPassword(Request $req, array $args): void
    {
        $admin = Guard::authorize($req, 'employees.edit');
        $db = Database::instance();
        $uid = (int)$args['id'];
        $in = Validator::make($req->body, ['password' => 'required|string|min:8|max:128'])->validated();
        if (!$db->scalar("SELECT 1 FROM users WHERE id=:id", ['id' => $uid])) {
            throw HttpException::notFound('User not found');
        }
        $db->transaction(function ($db) use ($uid, $in) {
            $db->run('UPDATE users SET password_hash = :h, session_version = session_version + 1, updated_at = :n WHERE id = :id',
                ['h' => password_hash($in['password'], PASSWORD_BCRYPT), 'n' => BusinessDate::utcNow(), 'id' => $uid]);
            $db->run('UPDATE sessions SET revoked = 1 WHERE user_id = :id AND revoked = 0', ['id' => $uid]);
        });
        Audit::log('employee.password_reset', 'employees', 'user', $uid, null, null, null,
            ['id' => $admin['id'], 'role_code' => $admin['role_code']]);
        Response::ok(null, 'Password reset; employee must log in again');
    }

    /** GET /api/employees/{id}/permissions */
    public function getPermissions(Request $req, array $args): void
    {
        Guard::authorize($req, 'permissions.view');
        $db = Database::instance();
        $uid = (int)$args['id'];
        $roleId = (int)$db->scalar('SELECT role_id FROM users WHERE id = :u', ['u' => $uid]);
        if (!$roleId) {
            throw HttpException::notFound('User not found');
        }
        $all = $db->fetchAll('SELECT id, module, action, code, description FROM permissions ORDER BY module, action');
        $rolePerms = array_column($db->fetchAll(
            'SELECT p.code FROM role_permissions rp JOIN permissions p ON p.id=rp.permission_id WHERE rp.role_id = :r',
            ['r' => $roleId]
        ), 'code');
        $overrides = $db->fetchAll('SELECT p.code, up.effect FROM user_permissions up JOIN permissions p ON p.id=up.permission_id WHERE up.user_id = :u', ['u' => $uid]);
        $ovMap = [];
        foreach ($overrides as $o) { $ovMap[$o['code']] = $o['effect']; }

        $result = [];
        foreach ($all as $p) {
            $effective = in_array($p['code'], $rolePerms, true);
            if (isset($ovMap[$p['code']])) $effective = $ovMap[$p['code']] === 'allow';
            $result[] = $p + [
                'role_default' => in_array($p['code'], $rolePerms, true),
                'override'     => $ovMap[$p['code']] ?? null,
                'effective'    => $effective,
            ];
        }
        $loans = $db->fetchAll(
            "SELECT la.id, la.loan_id, lc.code AS loan_code, c.name AS customer_name
             FROM loan_assignments la JOIN loans_or_chits lc ON lc.id = la.loan_id JOIN customers c ON c.id = lc.customer_id
             WHERE la.employee_id = (SELECT id FROM employees WHERE user_id = :u) AND la.is_active = 1", ['u' => $uid]
        );
        Response::ok(['permissions' => $result, 'assigned_loans' => $loans]);
    }

    /** PUT /api/employees/{id}/permissions  body: { overrides: [{code, effect}], loan_ids:[] } */
    public function updatePermissions(Request $req, array $args): void
    {
        $admin = Guard::authorize($req, 'permissions.edit');
        $db = Database::instance();
        $uid = (int)$args['id'];
        $emp = $db->fetch('SELECT id FROM employees WHERE user_id = :u', ['u' => $uid]);
        if (!$emp) {
            throw HttpException::notFound('Employee not found');
        }
        $empId = (int)$emp['id'];
        $body = $req->body;

        $db->transaction(function ($db) use ($uid, $empId, $body) {
            if (array_key_exists('overrides', $body) && is_array($body['overrides'])) {
                $db->run('DELETE FROM user_permissions WHERE user_id = :u', ['u' => $uid]);
                foreach ($body['overrides'] as $o) {
                    if (empty($o['code']) || !in_array($o['effect'] ?? '', ['allow', 'deny'], true)) continue;
                    $pid = $db->scalar('SELECT id FROM permissions WHERE code = :c', ['c' => $o['code']]);
                    if ($pid) {
                        $db->run('INSERT INTO user_permissions (user_id, permission_id, effect) VALUES (:u,:p,:e)',
                            ['u' => $uid, 'p' => $pid, 'e' => $o['effect']]);
                    }
                }
            }
            if (array_key_exists('loan_ids', $body) && is_array($body['loan_ids'])) {
                $db->run('UPDATE loan_assignments SET is_active = 0 WHERE employee_id = :e', ['e' => $empId]);
                foreach (array_unique(array_map('intval', $body['loan_ids'])) as $lid) {
                    if ($lid <= 0) continue;
                    $existing = $db->fetch('SELECT id FROM loan_assignments WHERE employee_id = :e AND loan_id = :l', ['e' => $empId, 'l' => $lid]);
                    if ($existing) {
                        $db->run('UPDATE loan_assignments SET is_active = 1, end_date = NULL WHERE id = :id', ['id' => $existing['id']]);
                    } else {
                        $db->insert('loan_assignments', [
                            'loan_id' => $lid, 'employee_id' => $empId,
                            'start_date' => \App\Support\BusinessDate::fmt(\App\Support\BusinessDate::today()),
                            'is_active' => 1, 'created_at' => BusinessDate::utcNow(), 'updated_at' => BusinessDate::utcNow(),
                        ]);
                    }
                }
            }
            // permission/assignment change also forces re-auth so new scope is picked up cleanly
            $db->run('UPDATE users SET session_version = session_version + 1 WHERE id = :id', ['id' => $uid]);
            $db->run('UPDATE sessions SET revoked = 1 WHERE user_id = :id AND revoked = 0', ['id' => $uid]);
        });

        Audit::log('permission.update', 'permissions', 'user', $uid, null, $body, null,
            ['id' => $admin['id'], 'role_code' => $admin['role_code']]);
        Response::ok(null, 'Permissions & assignments updated; employee must sign in again');
    }
}
