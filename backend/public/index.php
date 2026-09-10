<?php
/**
 * Siva Murugan Chit Fund - REST API front controller.
 * All /api/* traffic is routed here (see .htaccess).
 */
declare(strict_types=1);

use App\Core\App;
use App\Core\HttpException;
use App\Core\Request;
use App\Core\Response;
use App\Core\Router;

$backendDir = dirname(__DIR__);
require_once $backendDir . '/src/Core/App.php';
App::boot($backendDir);

$request = new Request();
App::applyCors($request);

set_error_handler(function ($severity, $message, $file, $line) {
    if (!(error_reporting() & $severity)) {
        return false;
    }
    throw new ErrorException($message, 0, $severity, $file, $line);
});

$router = new Router();
require $backendDir . '/routes.php';   // defines routes on $router

try {
    $router->dispatch($request);
} catch (HttpException $e) {
    Response::error($e->status, $e->getMessage(), $e->errorCode, $e->meta);
} catch (\Throwable $e) {
    $debug = App::debug();
    error_log('[api] ' . $e->getMessage() . ' @ ' . $e->getFile() . ':' . $e->getLine());
    Response::error(
        500,
        $debug ? $e->getMessage() : 'An unexpected error occurred',
        'SERVER_ERROR',
        $debug ? ['trace' => explode("\n", $e->getTraceAsString())] : []
    );
}
