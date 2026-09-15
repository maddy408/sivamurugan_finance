<?php
namespace App\Controllers;

use App\Auth\Auth;
use App\Auth\Guard;
use App\Core\App;
use App\Core\Database;
use App\Core\HttpException;
use App\Core\Request;
use App\Core\Response;
use App\Core\Validator;
use App\Support\Audit;
use App\Support\BusinessDate;

class AuthController
{
    public function login(Request $req): void
    {
        $in = Validator::make($req->body, [
            'username' => 'required|string|max:64',
            'password' => 'required|string|max:128',
        ])->validated();

        $db = Database::instance();
        $user = $db->fetch(
            'SELECT u.*, r.code AS role_code FROM users u JOIN roles r ON r.id = u.role_id WHERE u.username = :un LIMIT 1',
            ['un' => $in['username']]
        );

        $ok = $user && password_verify($in['password'], $user['password_hash']);
        if (!$ok || (int)$user['is_active'] !== 1) {
            Audit::log('login.failure', 'auth', 'user', $user['id'] ?? null, null,
                ['username' => $in['username']], $ok ? 'account disabled' : 'bad credentials',
                null, $req->ip(), $req->userAgent());
            throw new HttpException(401, 'Invalid username or password', 'BAD_CREDENTIALS');
        }

        // Opaque bearer token; only its sha256 is stored.
        $raw = bin2hex(random_bytes(32));
        $ttlHours = (int)(App::setting('security', ['token_ttl_hours' => 12])['token_ttl_hours']
            ?? App::config()['token_ttl_hours'] ?? 12);
        $expires = (new \DateTimeImmutable('now', new \DateTimeZone('UTC')))
            ->modify("+{$ttlHours} hours")->format('Y-m-d H:i:s');

        $sessionId = $db->insert('sessions', [
            'user_id'         => $user['id'],
            'token_hash'      => Auth::tokenHash($raw),
            'session_version' => $user['session_version'],
            'ip'              => $req->ip(),
            'user_agent'      => $req->userAgent(),
            'revoked'         => 0,
            'created_at'      => BusinessDate::utcNow(),
            'last_seen_at'    => BusinessDate::utcNow(),
            'expires_at'      => $expires,
        ]);
        $db->run('UPDATE users SET last_login_at = :now WHERE id = :id',
            ['now' => BusinessDate::utcNow(), 'id' => $user['id']]);

        Audit::log('login.success', 'auth', 'user', $user['id'], null, null, null,
            ['id' => (int)$user['id'], 'role_code' => $user['role_code']], $req->ip(), $req->userAgent());

        Response::ok([
            'token'      => $raw,
            'token_type' => 'Bearer',
            'expires_at' => $expires,
            'user'       => $this->present(Auth::contextForUserId((int)$user['id'], $sessionId)),
        ], 'Login successful');
    }

    public function me(Request $req): void
    {
        Guard::authorize($req);
        Response::ok($this->present(Auth::user()));
    }

    public function logout(Request $req): void
    {
        $user = Guard::authorize($req);
        Database::instance()->run('UPDATE sessions SET revoked = 1 WHERE id = :id', ['id' => $user['session_id']]);
        Audit::log('logout', 'auth', 'user', $user['id'], null, null, null,
            ['id' => $user['id'], 'role_code' => $user['role_code']], $req->ip(), $req->userAgent());
        Response::ok(null, 'Logged out');
    }

    /**
     * Admin force-logout of an employee: bump users.session_version and revoke
     * every one of that user's sessions. Every subsequent API call by that user
     * fails Auth::attempt() with SESSION_TERMINATED.
     */
    public function forceLogout(Request $req, array $args): void
    {
        $admin = Guard::authorize($req, 'permissions.edit');
        $targetId = (int)$args['id'];

        $db = Database::instance();
        $target = $db->fetch('SELECT u.*, r.code AS role_code FROM users u JOIN roles r ON r.id=u.role_id WHERE u.id = :id', ['id' => $targetId]);
        if (!$target) {
            throw HttpException::notFound('User not found');
        }
        if ($target['role_code'] === 'ADMIN') {
            throw HttpException::forbidden('Cannot force-logout an administrator');
        }

        $db->transaction(function ($db) use ($targetId) {
            $db->run('UPDATE users SET session_version = session_version + 1 WHERE id = :id', ['id' => $targetId]);
            $db->run('UPDATE sessions SET revoked = 1 WHERE user_id = :id AND revoked = 0', ['id' => $targetId]);
        });

        Audit::log('auth.force_logout', 'permissions', 'user', $targetId, null,
            ['new_session_version' => (int)$target['session_version'] + 1], $req->input('reason'),
            ['id' => $admin['id'], 'role_code' => $admin['role_code']], $req->ip(), $req->userAgent());

        Response::ok(null, 'All active sessions for this employee have been terminated');
    }

    private function present(array $u): array
    {
        return [
            'id'          => $u['id'],
            'name'        => $u['name'],
            'username'    => $u['username'],
            'email'       => $u['email'],
            'role'        => $u['role_code'],
            'role_name'   => $u['role_name'],
            'employee_id' => $u['employee_id'],
            'permissions' => $u['permissions'],
            'scope'       => $u['scope'],
        ];
    }
}
