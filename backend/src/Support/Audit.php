<?php
namespace App\Support;

use App\Core\Database;

final class Audit
{
    /**
     * @param array{id:int,role_code:string}|null $actor
     */
    public static function log(
        string $action,
        string $module,
        ?string $entityType = null,
        $entityId = null,
        ?array $oldValues = null,
        ?array $newValues = null,
        ?string $reason = null,
        ?array $actor = null,
        ?string $ip = null,
        ?string $ua = null
    ): void {
        Database::instance()->insert('audit_logs', [
            'actor_user_id' => $actor['id'] ?? null,
            'actor_role'    => $actor['role_code'] ?? null,
            'action'        => $action,
            'module'        => $module,
            'entity_type'   => $entityType,
            'entity_id'     => $entityId !== null ? (string)$entityId : null,
            'old_values'    => $oldValues !== null ? json_encode($oldValues, JSON_UNESCAPED_UNICODE) : null,
            'new_values'    => $newValues !== null ? json_encode($newValues, JSON_UNESCAPED_UNICODE) : null,
            'reason'        => $reason,
            'ip'            => $ip,
            'user_agent'    => $ua ? substr($ua, 0, 255) : null,
            'created_at'    => BusinessDate::utcNow(),
        ]);
    }
}
