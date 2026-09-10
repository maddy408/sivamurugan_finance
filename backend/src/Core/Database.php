<?php
namespace App\Core;

use PDO;
use PDOException;

/**
 * Thin PDO wrapper. All statements are prepared; no string interpolation of values.
 */
class Database
{
    private static ?Database $instance = null;
    private PDO $pdo;

    private function __construct(array $cfg)
    {
        $dsn = sprintf(
            'mysql:host=%s;port=%d;dbname=%s;charset=utf8mb4',
            $cfg['host'], $cfg['port'], $cfg['database']
        );
        try {
            $this->pdo = new PDO($dsn, $cfg['username'], $cfg['password'], [
                PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                // Emulated prepares: values are still bound + escaped by PDO (no
                // string interpolation of user input anywhere in this codebase),
                // and a single named placeholder may be reused within one query.
                PDO::ATTR_EMULATE_PREPARES   => true,
                PDO::ATTR_STRINGIFY_FETCHES  => false,
            ]);
            // Keep session time consistent; business date math is done in PHP (Asia/Kolkata).
            $this->pdo->exec("SET time_zone = '+00:00'");
        } catch (PDOException $e) {
            throw new HttpException(500, 'Database connection failed', 'DB_CONNECTION', [
                'detail' => $e->getMessage(),
            ]);
        }
    }

    public static function instance(): Database
    {
        if (self::$instance === null) {
            $cfg = App::config()['db'];
            self::$instance = new self($cfg);
        }
        return self::$instance;
    }

    public function pdo(): PDO
    {
        return $this->pdo;
    }

    public function run(string $sql, array $params = []): \PDOStatement
    {
        $stmt = $this->pdo->prepare($sql);
        $stmt->execute($params);
        return $stmt;
    }

    public function fetch(string $sql, array $params = []): ?array
    {
        $row = $this->run($sql, $params)->fetch();
        return $row === false ? null : $row;
    }

    public function fetchAll(string $sql, array $params = []): array
    {
        return $this->run($sql, $params)->fetchAll();
    }

    public function scalar(string $sql, array $params = [])
    {
        $v = $this->run($sql, $params)->fetchColumn();
        return $v === false ? null : $v;
    }

    public function insert(string $table, array $data): int
    {
        $cols = array_keys($data);
        $place = implode(',', array_map(fn($c) => ':' . $c, $cols));
        $sql = sprintf(
            'INSERT INTO %s (%s) VALUES (%s)',
            $table,
            implode(',', $cols),
            $place
        );
        $this->run($sql, $data);
        return (int)$this->pdo->lastInsertId();
    }

    public function update(string $table, array $data, string $where, array $whereParams = []): int
    {
        $set = implode(',', array_map(fn($c) => "$c = :set_$c", array_keys($data)));
        $params = [];
        foreach ($data as $k => $v) {
            $params["set_$k"] = $v;
        }
        $params = array_merge($params, $whereParams);
        $stmt = $this->run("UPDATE $table SET $set WHERE $where", $params);
        return $stmt->rowCount();
    }

    public function transaction(callable $fn)
    {
        if ($this->pdo->inTransaction()) {
            return $fn($this);
        }
        $this->pdo->beginTransaction();
        try {
            $result = $fn($this);
            $this->pdo->commit();
            return $result;
        } catch (\Throwable $e) {
            if ($this->pdo->inTransaction()) {
                $this->pdo->rollBack();
            }
            throw $e;
        }
    }
}
