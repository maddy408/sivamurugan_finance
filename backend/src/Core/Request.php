<?php
namespace App\Core;

class Request
{
    public string $method;
    public string $path;
    /** @var array<string,string> */
    public array $query;
    /** @var array<string,mixed> */
    public array $body;
    /** @var array<string,string> */
    public array $headers;
    public array $files;

    public function __construct()
    {
        $this->method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');

        $uri  = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';
        // Strip the folder the API lives in so routes are declared as /api/...
        $script = str_replace('\\', '/', dirname($_SERVER['SCRIPT_NAME'] ?? ''));
        if ($script !== '/' && $script !== '' && str_starts_with($uri, $script)) {
            $uri = substr($uri, strlen($script));
        }
        $uri = '/' . ltrim($uri, '/');
        // Also tolerate a trailing "/index.php".
        $uri = preg_replace('#^/index\.php#', '', $uri) ?: '/';
        $this->path = rtrim($uri, '/') ?: '/';

        $this->query = $_GET ?? [];
        $this->files = $_FILES ?? [];
        $this->headers = $this->readHeaders();

        $raw = file_get_contents('php://input') ?: '';
        $ct  = $this->headers['content-type'] ?? '';
        if (stripos($ct, 'application/json') !== false && $raw !== '') {
            $decoded = json_decode($raw, true);
            $this->body = is_array($decoded) ? $decoded : [];
        } elseif (!empty($_POST)) {
            $this->body = $_POST;
        } else {
            $this->body = [];
        }
    }

    private function readHeaders(): array
    {
        $out = [];
        if (function_exists('getallheaders')) {
            foreach (getallheaders() as $k => $v) {
                $out[strtolower($k)] = $v;
            }
        }
        foreach ($_SERVER as $k => $v) {
            if (str_starts_with($k, 'HTTP_')) {
                $name = strtolower(str_replace('_', '-', substr($k, 5)));
                $out[$name] = $v;
            }
        }
        if (isset($_SERVER['CONTENT_TYPE'])) {
            $out['content-type'] = $_SERVER['CONTENT_TYPE'];
        }
        return $out;
    }

    public function bearerToken(): ?string
    {
        $auth = $this->headers['authorization'] ?? '';
        if (preg_match('/Bearer\s+(.+)/i', $auth, $m)) {
            return trim($m[1]);
        }
        return null;
    }

    public function input(string $key, $default = null)
    {
        return $this->body[$key] ?? $default;
    }

    public function queryParam(string $key, $default = null)
    {
        return $this->query[$key] ?? $default;
    }

    public function ip(): string
    {
        return $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0';
    }

    public function userAgent(): string
    {
        return substr($this->headers['user-agent'] ?? '', 0, 255);
    }
}
