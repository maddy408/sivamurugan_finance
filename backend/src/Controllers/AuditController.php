<?php
namespace App\Controllers;

use App\Auth\Guard;
use App\Core\Database;
use App\Core\ListQuery;
use App\Core\Request;
use App\Core\Response;

class AuditController
{
    public function index(Request $req): void
    {
        Guard::authorize($req, 'audit.view');
        $db = Database::instance();
        $where = ['1=1']; $params = [];
        foreach (['module' => 'a.module', 'action' => 'a.action', 'entity_type' => 'a.entity_type'] as $k => $col) {
            if (($v = $req->queryParam($k)) !== null && $v !== '') { $where[] = "$col = :$k"; $params[$k] = $v; }
        }
        if ($u = $req->queryParam('actor_user_id')) { $where[] = 'a.actor_user_id = :u'; $params['u'] = (int)$u; }
        if ($f = $req->queryParam('date_from')) { $where[] = 'a.created_at >= :f'; $params['f'] = $f . ' 00:00:00'; }
        if ($t = $req->queryParam('date_to'))   { $where[] = 'a.created_at <= :t'; $params['t'] = $t . ' 23:59:59'; }
        if (($q = ListQuery::search($req)) !== '') {
            $where[] = '(a.action LIKE :q OR a.module LIKE :q OR a.reason LIKE :q)';
            $params['q'] = "%$q%";
        }
        $whereSql = implode(' AND ', $where);
        $perPage = ListQuery::perPage($req); $offset = ListQuery::offset($req);
        $total = (int)$db->scalar("SELECT COUNT(*) FROM audit_logs a WHERE $whereSql", $params);
        $rows = $db->fetchAll(
            "SELECT a.*, u.name AS actor_name, u.username AS actor_username
             FROM audit_logs a LEFT JOIN users u ON u.id = a.actor_user_id
             WHERE $whereSql ORDER BY a.id DESC LIMIT $perPage OFFSET $offset",
            $params
        );
        Response::paginated($rows, $total, ListQuery::page($req), $perPage);
    }
}
