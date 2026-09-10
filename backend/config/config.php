<?php
/**
 * Loads environment configuration from backend/.env (falls back to .env.example).
 * Returns an associative array. No external dependencies.
 */

function env_load(string $baseDir): array
{
    $file = $baseDir . DIRECTORY_SEPARATOR . '.env';
    if (!is_file($file)) {
        $file = $baseDir . DIRECTORY_SEPARATOR . '.env.example';
    }
    $vars = [];
    if (is_file($file)) {
        foreach (file($file, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $line) {
            $line = trim($line);
            if ($line === '' || $line[0] === '#') {
                continue;
            }
            $pos = strpos($line, '=');
            if ($pos === false) {
                continue;
            }
            $key = trim(substr($line, 0, $pos));
            $val = trim(substr($line, $pos + 1));
            if (strlen($val) >= 2 && ($val[0] === '"' || $val[0] === "'") && substr($val, -1) === $val[0]) {
                $val = substr($val, 1, -1);
            }
            $vars[$key] = $val;
        }
    }
    // Allow real environment variables to override the file.
    foreach (['APP_ENV','APP_URL','APP_DEBUG','TIMEZONE','DB_HOST','DB_PORT','DB_DATABASE','DB_USERNAME','DB_PASSWORD','CORS_ALLOWED_ORIGINS','TOKEN_TTL_HOURS'] as $k) {
        $v = getenv($k);
        if ($v !== false) {
            $vars[$k] = $v;
        }
    }

    return [
        'app_env'    => $vars['APP_ENV'] ?? 'local',
        'app_url'    => $vars['APP_URL'] ?? '',
        'app_debug'  => filter_var($vars['APP_DEBUG'] ?? 'false', FILTER_VALIDATE_BOOL),
        'timezone'   => $vars['TIMEZONE'] ?? 'Asia/Kolkata',
        'db' => [
            'host'     => $vars['DB_HOST'] ?? '127.0.0.1',
            'port'     => (int)($vars['DB_PORT'] ?? 3306),
            'database' => $vars['DB_DATABASE'] ?? 'siva_murugan_chit_fund',
            'username' => $vars['DB_USERNAME'] ?? 'root',
            'password' => $vars['DB_PASSWORD'] ?? '',
        ],
        'cors_origins' => array_filter(array_map('trim', explode(',', $vars['CORS_ALLOWED_ORIGINS'] ?? ''))),
        'token_ttl_hours' => (int)($vars['TOKEN_TTL_HOURS'] ?? 12),
    ];
}
