<?php
namespace App\Controllers;

use App\Auth\Guard;
use App\Core\App;
use App\Core\Database;
use App\Core\Request;
use App\Core\Response;

class MetaController
{
    /** GET /api/meta/bootstrap - everything the SPA needs after login */
    public function bootstrap(Request $req): void
    {
        $user = Guard::authorize($req);
        $db = Database::instance();
        Response::ok([
            'payment_modes' => $db->fetchAll('SELECT id, code, name FROM payment_modes WHERE is_active = 1 ORDER BY sort_order'),
            'accounts'      => $db->fetchAll('SELECT id, code, name, type FROM accounts WHERE is_active = 1 ORDER BY id'),
            // Location is just typed customer text now (no Location Master). This
            // is the distinct set of values already in use, for optional filter
            // pickers. Shape {id,name} kept so existing <option> code works; the
            // value IS the location text.
            'locations'     => $this->customerLocations(),
            'organization'  => App::setting('organization'),
            'locale'        => App::setting('locale'),
            'schedule'      => App::setting('schedule'),
            'page_sizes'    => \App\Core\ListQuery::PAGE_SIZES,
        ]);
    }

    /** GET /api/meta/translations?lang=en|ta */
    public function translations(Request $req): void
    {
        $lang = in_array($req->queryParam('lang'), ['en', 'ta'], true) ? $req->queryParam('lang') : 'en';
        $rows = Database::instance()->fetchAll(
            'SELECT trans_key, trans_value FROM translations WHERE lang = :l', ['l' => $lang]
        );
        $map = [];
        foreach ($rows as $r) {
            $map[$r['trans_key']] = $r['trans_value'];
        }
        Response::ok(['lang' => $lang, 'messages' => $map]);
    }

    /** Distinct non-empty customer location strings, as [{id,name}] (id == name). */
    private function customerLocations(): array
    {
        $rows = Database::instance()->fetchAll(
            "SELECT DISTINCT location FROM customers
             WHERE deleted_at IS NULL AND location IS NOT NULL AND location <> ''
             ORDER BY location"
        );
        return array_map(fn ($r) => ['id' => $r['location'], 'name' => $r['location']], $rows);
    }
}
