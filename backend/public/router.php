<?php
/**
 * Router for the PHP built-in web server:
 *   php -S 127.0.0.1:8080 -t backend/public backend/public/router.php
 * Serves real files as-is, sends everything else to the front controller.
 */
$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$full = __DIR__ . $path;
if ($path !== '/' && is_file($full) && !str_ends_with($path, '.php')) {
    return false; // let the built-in server serve the static asset
}
require __DIR__ . '/index.php';
