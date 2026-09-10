<?php
namespace App\Core;

class Response
{
    public static function json($payload, int $status = 200): void
    {
        http_response_code($status);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        exit;
    }

    public static function ok($data = null, string $message = 'OK', ?array $pagination = null): void
    {
        $body = ['success' => true, 'message' => $message, 'data' => $data];
        if ($pagination !== null) {
            $body['pagination'] = $pagination;
        }
        self::json($body, 200);
    }

    public static function created($data = null, string $message = 'Created'): void
    {
        self::json(['success' => true, 'message' => $message, 'data' => $data], 201);
    }

    public static function error(int $status, string $message, string $code = 'ERROR', array $meta = []): void
    {
        $body = ['success' => false, 'message' => $message, 'error_code' => $code];
        if (!empty($meta)) {
            $body = array_merge($body, $meta);
        }
        self::json($body, $status);
    }

    public static function paginated(array $rows, int $total, int $page, int $perPage, string $message = 'OK'): void
    {
        self::ok($rows, $message, [
            'total'        => $total,
            'page'         => $page,
            'per_page'     => $perPage,
            'total_pages'  => $perPage > 0 ? (int)ceil($total / $perPage) : 1,
        ]);
    }
}
