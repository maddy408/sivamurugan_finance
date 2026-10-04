<?php
namespace App\Core;

use App\Support\BusinessDate;

/**
 * Application container: config, autoloader, cached app_settings.
 */
final class App
{
    private static array $config = [];
    private static array $settingsCache = [];
    private static bool $booted = false;

    public static function boot(string $backendDir): void
    {
        if (self::$booted) {
            return;
        }
        require_once $backendDir . '/config/config.php';
        self::$config = env_load($backendDir);

        $composerAutoload = $backendDir . '/vendor/autoload.php';
        if (is_file($composerAutoload)) {
            require_once $composerAutoload;
        }

        date_default_timezone_set(self::$config['timezone'] ?? 'Asia/Kolkata');

        spl_autoload_register(function (string $class) use ($backendDir) {
            if (!str_starts_with($class, 'App\\')) {
                return;
            }
            $rel = str_replace('\\', '/', substr($class, 4));
            $file = $backendDir . '/src/' . $rel . '.php';
            if (is_file($file)) {
                require_once $file;
            }
        });

        self::$booted = true;
    }

    public static function config(): array
    {
        return self::$config;
    }

    public static function debug(): bool
    {
        return (bool)(self::$config['app_debug'] ?? false);
    }

    /**
     * Read a JSON app_settings row. Cached per-request.
     */
    public static function setting(string $key, $default = null)
    {
        if (array_key_exists($key, self::$settingsCache)) {
            return self::$settingsCache[$key];
        }
        $row = Database::instance()->fetch(
            'SELECT setting_value FROM app_settings WHERE setting_key = :k',
            ['k' => $key]
        );
        $val = $row ? json_decode($row['setting_value'], true) : $default;
        self::$settingsCache[$key] = $val;
        return $val;
    }

    public static function forgetSetting(string $key): void
    {
        unset(self::$settingsCache[$key]);
    }

    public static function applyCors(Request $req): void
    {
        $origin = $req->headers['origin'] ?? '';
        $allowed = self::$config['cors_origins'] ?? [];
        if ($origin) {
            $isAllowed = in_array('*', $allowed, true) || in_array($origin, $allowed, true);
            if (!$isAllowed) {
                // LAN/dev convenience only: localhost and private/reserved-range IP
                // literals (e.g. testing from a phone at http://192.168.1.5:5173)
                // bypass the explicit allowlist. A bare `filter_var($host, ...) ===
                // false` check here would also be true for any ordinary domain name
                // (it isn't an IP at all), which would let literally any origin
                // through with credentials - so a non-IP host must equal
                // 'localhost' outright, and an IP host must itself fail the
                // "is this a public IP" validation to qualify as private/reserved.
                $host = parse_url($origin, PHP_URL_HOST);
                if ($host === 'localhost' || $host === '127.0.0.1' || $host === '::1') {
                    $isAllowed = true;
                } elseif ($host && filter_var($host, FILTER_VALIDATE_IP)
                    && filter_var($host, FILTER_VALIDATE_IP, FILTER_FLAG_NO_RES_RANGE | FILTER_FLAG_NO_PRIV_RANGE) === false) {
                    $isAllowed = true;
                }
            }
            if ($isAllowed) {
                header('Access-Control-Allow-Origin: ' . $origin);
                header('Vary: Origin');
                header('Access-Control-Allow-Credentials: true');
            }
        }
        header('Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS');
        header('Access-Control-Allow-Headers: Authorization, Content-Type, X-Idempotency-Key');
        header('Access-Control-Max-Age: 86400');
        if ($req->method === 'OPTIONS') {
            http_response_code(204);
            exit;
        }
    }
}
