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
                $isAllowed = false;
        if ($origin) {
            if (in_array($origin, $allowed, true) || in_array('*', $allowed, true)) {
                $isAllowed = true;
            } else {
                $parsedHost = parse_url($origin, PHP_URL_HOST);
                if ($parsedHost && (
                    $parsedHost === 'localhost' ||
                    $parsedHost === '127.0.0.1' ||
                    preg_match('/^(192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.)/', $parsedHost) ||
                    str_ends_with($parsedHost, '.devtunnels.ms') ||
                    str_ends_with($parsedHost, '.github.dev')
                )) {
                    $isAllowed = true;
                }
            }
        }

        if ($isAllowed && $origin) {
            header('Access-Control-Allow-Origin: ' . $origin);
            header('Vary: Origin');
            header('Access-Control-Allow-Credentials: true');
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

