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

        default:
            echo file_get_contents(__FILE__, false, null, 6, 720);
    }
} catch (Throwable $e) {
    fwrite(STDERR, "ERROR: " . $e->getMessage() . "\n");
    exit(1);
}
