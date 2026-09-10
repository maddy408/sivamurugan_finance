<?php
namespace App\Services;

use App\Core\Database;
use App\Support\Audit;
use App\Support\BusinessDate;

/**
 * Find-or-create a location by name. Used when a customer is created with a
 * brand-new location typed into the form. Never creates a duplicate: an
 * existing location with the same name (case-insensitive, trimmed) is reused.
 */
final class LocationService
{
    /**
     * @return array{id:int,created:bool}  reuses an existing location with the
     *         same (case-insensitive, trimmed) name; only 'created' when a
     *         brand-new row was inserted.
     */
    public static function findOrCreate(string $name, ?array $actor = null): array
    {
        $name = trim($name);
        if ($name === '') {
            throw new \App\Core\HttpException(422, 'Location name is empty', 'VALIDATION');
        }
        $db = Database::instance();

        $existing = $db->scalar(
            'SELECT id FROM locations WHERE LOWER(name) = LOWER(:n) ORDER BY id LIMIT 1',
            ['n' => $name]
        );
        if ($existing) {
            return ['id' => (int)$existing, 'created' => false];
        }

        // unique code: LOC-<n>
        $seq = (int)$db->scalar(
            "SELECT COALESCE(MAX(CAST(REGEXP_REPLACE(code,'^.*[^0-9]','') AS UNSIGNED)),0)
               FROM locations WHERE code REGEXP '^LOC-[0-9]+$'"
        ) + 1;
        $code = 'LOC-' . $seq;
        while ($db->scalar('SELECT 1 FROM locations WHERE code = :c', ['c' => $code])) {
            $code = 'LOC-' . (++$seq);
        }

        $id = $db->insert('locations', [
            'code'       => $code,
            'name'       => $name,
            'is_active'  => 1,
            'created_at' => BusinessDate::utcNow(),
            'updated_at' => BusinessDate::utcNow(),
        ]);
        Audit::log('location.create', 'locations', 'location', $id, null,
            ['code' => $code, 'name' => $name, 'via' => 'customer form'], null, $actor);

        return ['id' => $id, 'created' => true];
    }
}
