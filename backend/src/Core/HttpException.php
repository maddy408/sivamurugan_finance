<?php
namespace App\Core;

/**
 * Any thrown HttpException is turned into a consistent JSON error envelope
 * by the front controller. Internal detail is only surfaced when APP_DEBUG.
 */
class HttpException extends \RuntimeException
{
    public int $status;
    public string $errorCode;
    public array $meta;

    public function __construct(int $status, string $message, string $errorCode = 'ERROR', array $meta = [])
    {
        parent::__construct($message);
        $this->status = $status;
        $this->errorCode = $errorCode;
        $this->meta = $meta;
    }

    public static function validation(array $errors, string $message = 'Validation failed'): self
    {
        return new self(422, $message, 'VALIDATION', ['errors' => $errors]);
    }

    public static function unauthenticated(string $message = 'Authentication required', string $code = 'UNAUTHENTICATED'): self
    {
        return new self(401, $message, $code);
    }

    public static function forbidden(string $message = 'You do not have permission to perform this action'): self
    {
        return new self(403, $message, 'FORBIDDEN');
    }

    public static function notFound(string $message = 'Resource not found'): self
    {
        return new self(404, $message, 'NOT_FOUND');
    }

    public static function conflict(string $message = 'Conflict'): self
    {
        return new self(409, $message, 'CONFLICT');
    }
}
