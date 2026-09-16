<?php
/**
 * CLI installer / maintenance for the Chit Fund backend.
 *
 *   php setup.php check                       - test the DB connection
 *   php setup.php install                     - create DB (if needed) + schema + seed
 *   php setup.php migrate                     - run database/schema.sql
 *   php setup.php seed                        - run database/seed.sql
 *   php setup.php set-password <user> <pass>  - (re)set a login password securely
 *
 * Reads connection settings from backend/.env (see .env.example).
 */
declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    fwrite(STDERR, "Run this from the command line.\n");
    exit(1);
}

$backendDir = __DIR__;
require $backendDir . '/config/config.php';
$cfg = env_load($backendDir);
date_default_timezone_set($cfg['timezone']);
$db = $cfg['db'];

$cmd = $argv[1] ?? 'help';

function connect(array $db, bool $withDb = true): PDO
{
    $dsn = "mysql:host={$db['host']};port={$db['port']};charset=utf8mb4"
         . ($withDb ? ";dbname={$db['database']}" : '');
    return new PDO($dsn, $db['username'], $db['password'], [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
    ]);
}

/** Split a .sql dump on ";" at end-of-line. Good enough for our own files. */
function run_sql_file(PDO $pdo, string $path): int
{
    if (!is_file($path)) {
        throw new RuntimeException("SQL file not found: $path");
    }
    $sql = file_get_contents($path);
    // strip -- line comments
    $sql = preg_replace('/^\s*--.*$/m', '', $sql);
    $statements = array_filter(array_map('trim', preg_split('/;\s*[\r\n]/', $sql)));
    $count = 0;
    foreach ($statements as $stmt) {
        if ($stmt === '' || strtoupper($stmt) === 'COMMIT') {
            continue;
        }
        $pdo->exec($stmt);
        $count++;
    }
    return $count;
}

try {
    switch ($cmd) {
        case 'check':
            $pdo = connect($db);
            $tables = $pdo->query("SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = " . $pdo->quote($db['database']))->fetchColumn();
            echo "OK  Connected to {$db['database']} at {$db['host']}:{$db['port']} as {$db['username']}\n";
            echo "    Tables present: {$tables}\n";
            break;

        case 'install':
            $root = connect($db, false);
            $root->exec("CREATE DATABASE IF NOT EXISTS `{$db['database']}` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
            echo "OK  Database `{$db['database']}` ready\n";
            $pdo = connect($db);
            echo "..  Running schema.sql\n";
            echo "OK  " . run_sql_file($pdo, dirname($backendDir) . '/database/schema.sql') . " statements\n";
            echo "..  Running seed.sql\n";
            echo "OK  " . run_sql_file($pdo, dirname($backendDir) . '/database/seed.sql') . " statements\n";
            echo "\nDefault logins:\n  admin / Admin@123\n  ravi  / Employee@123\n";
            break;

        case 'migrate':
            $pdo = connect($db);
            echo "OK  " . run_sql_file($pdo, dirname($backendDir) . '/database/schema.sql') . " statements executed\n";
            break;

        case 'seed':
            $pdo = connect($db);
            echo "OK  " . run_sql_file($pdo, dirname($backendDir) . '/database/seed.sql') . " statements executed\n";
            break;

        case 'apply':
            // Run a one-off migration file WITHOUT touching schema/seed.
            $file = $argv[2] ?? null;
            if (!$file) {
                fwrite(STDERR, "Usage: php setup.php apply <path-to.sql>\n");
                exit(1);
            }
            $path = is_file($file) ? $file : dirname($backendDir) . '/' . ltrim($file, '/\\');
            $pdo = connect($db);
            echo "OK  " . run_sql_file($pdo, $path) . " statements executed from " . basename($path) . "\n";
            break;

        case 'set-password':
            $user = $argv[2] ?? null;
            $pass = $argv[3] ?? null;
            if (!$user || !$pass) {
                fwrite(STDERR, "Usage: php setup.php set-password <username> <password>\n");
                exit(1);
            }
            $pdo = connect($db);
            $stmt = $pdo->prepare('UPDATE users SET password_hash = :h, session_version = session_version + 1 WHERE username = :u');
            $stmt->execute(['h' => password_hash($pass, PASSWORD_BCRYPT), 'u' => $user]);
            echo $stmt->rowCount() ? "OK  Password updated for {$user} (existing sessions invalidated)\n"
                                   : "??  No user named {$user}\n";
            break;

        case 'seed-users':
            $env = $argv[2] ?? 'dev';
            $pdo = connect($db);
            seed_environment_users($pdo, $env);
            break;

        default:
            echo file_get_contents(__FILE__, false, null, 6, 720);
    }
} catch (Throwable $e) {
    fwrite(STDERR, "ERROR: " . $e->getMessage() . "\n");
    exit(1);
}

function seed_environment_users(PDO $pdo, string $env): void
{
    $env = strtolower($env);
    if (!in_array($env, ['dev', 'prod'], true)) {
        throw new InvalidArgumentException("Environment must be 'dev' or 'prod'");
    }

    $devUsers = [
        [
            'role_id' => 1,
            'name' => 'Dev Administrator',
            'username' => 'dev_admin',
            'email' => 'devadmin@qynova.in',
            'phone' => '9876500001',
            'password' => 'DevAdmin@2026!',
            'emp_code' => null
        ],
        [
            'role_id' => 1,
            'name' => 'Dev Finance Manager',
            'username' => 'dev_manager',
            'email' => 'devmanager@qynova.in',
            'phone' => '9876500002',
            'password' => 'DevManager@2026!',
            'emp_code' => null
        ],
        [
            'role_id' => 2,
            'name' => 'Dev Field Collector 1',
            'username' => 'dev_collector1',
            'email' => 'devcollector1@qynova.in',
            'phone' => '9876500003',
            'password' => 'DevCollector1#2026',
            'emp_code' => 'DEV-EMP-001'
        ],
        [
            'role_id' => 2,
            'name' => 'Dev Field Collector 2',
            'username' => 'dev_collector2',
            'email' => 'devcollector2@qynova.in',
            'phone' => '9876500004',
            'password' => 'DevCollector2#2026',
            'emp_code' => 'DEV-EMP-002'
        ],
        [
            'role_id' => 2,
            'name' => 'Dev Internal Auditor',
            'username' => 'dev_audit',
            'email' => 'devauditor@qynova.in',
            'phone' => '9876500005',
            'password' => 'DevAudit#2026',
            'emp_code' => 'DEV-EMP-003'
        ],
    ];

    $prodUsers = [
        [
            'role_id' => 1,
            'name' => 'Siva Murugan System Admin',
            'username' => 'sm_admin',
            'email' => 'admin@sivamurugan-fin.qynova.in',
            'phone' => '9840000001',
            'password' => 'SmProdAdmin#9876$',
            'emp_code' => null
        ],
        [
            'role_id' => 1,
            'name' => 'Siva Murugan Finance Head',
            'username' => 'sm_finance_head',
            'email' => 'finance@sivamurugan-fin.qynova.in',
            'phone' => '9840000002',
            'password' => 'SmFinHead#4561$',
            'emp_code' => null
        ],
        [
            'role_id' => 2,
            'name' => 'Kumar (Senior Collection Agent)',
            'username' => 'sm_agent_kumar',
            'email' => 'kumar@sivamurugan-fin.qynova.in',
            'phone' => '9840000003',
            'password' => 'SmKumarAgent%2026',
            'emp_code' => 'PROD-EMP-001'
        ],
        [
            'role_id' => 2,
            'name' => 'Selvam (Field Collection Agent)',
            'username' => 'sm_agent_selvam',
            'email' => 'selvam@sivamurugan-fin.qynova.in',
            'phone' => '9840000004',
            'password' => 'SmSelvamAgent%2026',
            'emp_code' => 'PROD-EMP-002'
        ],
        [
            'role_id' => 2,
            'name' => 'Murugan (Audit & Risk Agent)',
            'username' => 'sm_auditor_murugan',
            'email' => 'auditor@sivamurugan-fin.qynova.in',
            'phone' => '9840000005',
            'password' => 'SmMuruganAudit%2026',
            'emp_code' => 'PROD-EMP-003'
        ],
    ];

    $users = ($env === 'dev') ? $devUsers : $prodUsers;

    $pdo->exec('SET FOREIGN_KEY_CHECKS = 0');
    $pdo->exec('TRUNCATE employees');
    $pdo->exec('TRUNCATE users');
    $pdo->exec('SET FOREIGN_KEY_CHECKS = 1');

    $stmtUser = $pdo->prepare('INSERT INTO users (role_id, name, username, email, phone, password_hash, is_active, session_version) VALUES (:role_id, :name, :username, :email, :phone, :password_hash, 1, 1)');
    $stmtEmp = $pdo->prepare('INSERT INTO employees (user_id, emp_code, joined_on, is_active) VALUES (:user_id, :emp_code, CURRENT_DATE(), 1)');

    foreach ($users as $u) {
        $hash = password_hash($u['password'], PASSWORD_BCRYPT);
        $stmtUser->execute([
            'role_id' => $u['role_id'],
            'name' => $u['name'],
            'username' => $u['username'],
            'email' => $u['email'],
            'phone' => $u['phone'],
            'password_hash' => $hash,
        ]);
        $userId = (int)$pdo->lastInsertId();

        if ($u['role_id'] === 2 && !empty($u['emp_code'])) {
            $stmtEmp->execute([
                'user_id' => $userId,
                'emp_code' => $u['emp_code'],
            ]);
        }
    }
    echo "OK  Seeded 5 " . strtoupper($env) . " users successfully.\n";
}
