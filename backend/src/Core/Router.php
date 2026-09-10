<?php
namespace App\Core;

class Router
{
    /** @var array<int,array{method:string,regex:string,params:string[],handler:callable}> */
    private array $routes = [];

    public function add(string $method, string $pattern, callable $handler): void
    {
        // /customers/{id} -> named capture groups
        $params = [];
        $regex = preg_replace_callback('#\{([a-zA-Z_]+)\}#', function ($m) use (&$params) {
            $params[] = $m[1];
            return '(?P<' . $m[1] . '>[^/]+)';
        }, $pattern);
        $this->routes[] = [
            'method'  => strtoupper($method),
            'regex'   => '#^' . $regex . '$#',
            'params'  => $params,
            'handler' => $handler,
        ];
    }

    public function get(string $p, callable $h): void    { $this->add('GET', $p, $h); }
    public function post(string $p, callable $h): void   { $this->add('POST', $p, $h); }
    public function put(string $p, callable $h): void    { $this->add('PUT', $p, $h); }
    public function patch(string $p, callable $h): void  { $this->add('PATCH', $p, $h); }
    public function delete(string $p, callable $h): void { $this->add('DELETE', $p, $h); }

    public function dispatch(Request $req)
    {
        $pathMatched = false;
        foreach ($this->routes as $route) {
            if (!preg_match($route['regex'], $req->path, $m)) {
                continue;
            }
            $pathMatched = true;
            if ($route['method'] !== $req->method) {
                continue;
            }
            $args = [];
            foreach ($route['params'] as $name) {
                $args[$name] = $m[$name];
            }
            return ($route['handler'])($req, $args);
        }
        if ($pathMatched) {
            throw new HttpException(405, 'Method not allowed', 'METHOD_NOT_ALLOWED');
        }
        throw HttpException::notFound('Route not found: ' . $req->method . ' ' . $req->path);
    }
}
