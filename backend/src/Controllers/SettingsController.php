<?php
namespace App\Controllers;

use App\Auth\Guard;
use App\Core\App;
use App\Core\Database;
use App\Core\HttpException;
use App\Core\Request;
use App\Core\Response;
use App\Core\Validator;
use App\Services\FinanceService;
use App\Support\Audit;
use App\Support\BusinessDate;

class SettingsController
{
    private function storageDir(): string
    {
        $dir = dirname(__DIR__, 2) . '/storage/uploads';
        if (!is_dir($dir)) {
            @mkdir($dir, 0775, true);
        }
        return $dir;
    }

    /** GET /api/settings - the full admin settings bundle */
    public function index(Request $req): void
    {
        Guard::authorize($req, 'settings.view');
        $db = Database::instance();
        Response::ok([
            'organization'  => App::setting('organization'),
            'locale'        => App::setting('locale'),
            'schedule'      => App::setting('schedule'),
            'collection'    => App::setting('collection'),
            'code_format'   => App::setting('code_format'),
            'security'      => App::setting('security'),
            'fine_settings' => $db->fetchAll('SELECT * FROM fine_settings ORDER BY effective_from DESC, id DESC'),
            'payment_modes' => $db->fetchAll('SELECT * FROM payment_modes ORDER BY sort_order, id'),
            'accounts'      => $db->fetchAll('SELECT * FROM accounts ORDER BY id'),
            'finance'       => FinanceService::balances(),
        ]);
    }

    private function put(string $key, array $value, array $user, ?array $old): void
    {
        $db = Database::instance();
        $db->run(
            'INSERT INTO app_settings (setting_key, setting_value, updated_by, updated_at)
             VALUES (:k, :v, :u, :t)
             ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), updated_by = VALUES(updated_by), updated_at = VALUES(updated_at)',
            ['k' => $key, 'v' => json_encode($value, JSON_UNESCAPED_UNICODE), 'u' => $user['id'], 't' => BusinessDate::utcNow()]
        );
        App::forgetSetting($key);
        Audit::log('settings.update', 'settings', 'app_settings', $key, $old, $value, null,
            ['id' => $user['id'], 'role_code' => $user['role_code']]);
    }

    /** PUT /api/settings/organization */
    public function updateOrganization(Request $req): void
    {
        $user = Guard::authorize($req, 'settings.edit');
        $in = Validator::make($req->body, [
            'name'      => 'required|string|max:191',
            'address'   => 'nullable|string|max:500',
            'mobile'    => 'nullable|string|max:20',
            'telephone' => 'nullable|string|max:30',
            'email'     => 'nullable|email',
            'website'   => 'nullable|string|max:191',
            'gst'       => 'nullable|string|max:32',
        ])->validated();
        $old = App::setting('organization', []);
        $in['logo_path'] = $old['logo_path'] ?? null;
        $this->put('organization', $in, $user, $old);
        Response::ok($in, 'Organization profile updated');
    }

    /** POST /api/settings/organization/logo  (multipart: file) */
    public function uploadLogo(Request $req): void
    {
        $user = Guard::authorize($req, 'settings.edit');
        if (empty($req->files['file']) || $req->files['file']['error'] !== UPLOAD_ERR_OK) {
            throw HttpException::validation(['file' => ['A logo file is required (field name: file)']]);
        }
        $f = $req->files['file'];
        if ($f['size'] > 2 * 1024 * 1024) {
            throw HttpException::validation(['file' => ['Logo must be 2 MB or smaller']]);
        }
        $finfo = new \finfo(FILEINFO_MIME_TYPE);
        $mime = $finfo->file($f['tmp_name']) ?: '';
        $ext = ['image/png' => 'png', 'image/jpeg' => 'jpg', 'image/webp' => 'webp'][$mime] ?? null;
        if (!$ext) {
            throw HttpException::validation(['file' => ['Logo must be a PNG, JPEG or WebP image']]);
        }
        $dir = $this->storageDir();
        foreach (glob($dir . '/logo.*') as $old) {
            @unlink($old);
        }
        $dest = $dir . '/logo.' . $ext;
        if (!move_uploaded_file($f['tmp_name'], $dest) && !rename($f['tmp_name'], $dest)) {
            throw new HttpException(500, 'Could not store the uploaded file', 'UPLOAD_FAILED');
        }
        $org = App::setting('organization', []);
        $org['logo_path'] = '/api/settings/organization/logo?v=' . time();
        $this->put('organization', $org, $user, App::setting('organization', []));
        Audit::log('settings.logo_upload', 'settings', 'organization', 'logo', null, ['mime' => $mime, 'size' => $f['size']], null,
            ['id' => $user['id'], 'role_code' => $user['role_code']]);
        Response::ok(['logo_path' => $org['logo_path']], 'Logo updated');
    }

    /** GET /api/settings/organization/logo  (public-ish stream) */
    public function logo(Request $req): void
    {
        $files = glob($this->storageDir() . '/logo.*');
        if (!$files) {
            throw HttpException::notFound('No logo uploaded');
        }
        $path = $files[0];
        $mime = ['png' => 'image/png', 'jpg' => 'image/jpeg', 'webp' => 'image/webp'][pathinfo($path, PATHINFO_EXTENSION)] ?? 'application/octet-stream';
        while (ob_get_level() > 0) { ob_end_clean(); }
        header('Content-Type: ' . $mime);
        header('Cache-Control: public, max-age=300');
        readfile($path);
        exit;
    }

    /** PUT /api/settings/schedule */
    public function updateSchedule(Request $req): void
    {
        $user = Guard::authorize($req, 'settings.edit');
        $in = Validator::make($req->body, [
            'weekly_collection_day' => 'required|int|min:1|max:7',
            'monthly_mode'          => 'required|in:MONTHLY_WEEKDAY,MONTHLY_DAILY,MONTHLY_INTERVAL',
            'monthly_cycle_weeks'   => 'required|int|min:1|max:8',
            'monthly_interval_days' => 'required|int|min:1|max:120',
        ])->validated();
        $this->put('schedule', $in, $user, App::setting('schedule', []));
        Response::ok($in, 'Schedule settings updated (applies to new/future installments only)');
    }

    /** PUT /api/settings/locale */
    public function updateLocale(Request $req): void
    {
        $user = Guard::authorize($req, 'settings.edit');
        $in = Validator::make($req->body, ['default' => 'required|in:en,ta'])->validated();
        $cur = App::setting('locale', ['available' => ['en', 'ta']]);
        $cur['default'] = $in['default'];
        $this->put('locale', $cur, $user, App::setting('locale', []));
        Response::ok($cur, 'Language updated');
    }

    /** PUT /api/settings/code-format */
    public function updateCodeFormat(Request $req): void
    {
        $user = Guard::authorize($req, 'settings.edit');
        $in = Validator::make($req->body, [
            'loan_prefix'     => 'required|string|max:8',
            'loan_pattern'    => 'required|string|max:40',
            'customer_prefix' => 'required|string|max:8',
            'customer_pattern'=> 'required|string|max:40',
            'receipt_prefix'  => 'required|string|max:8',
            'receipt_pattern' => 'required|string|max:40',
        ])->validated();
        $this->put('code_format', $in, $user, App::setting('code_format', []));
        Response::ok($in, 'Code format updated');
    }

    /**
     * PUT /api/settings/chit-prefix  { prefix: "SM" }
     * Only touches the chit code prefix; the pattern stays PREFIX-N.
     * Existing chit codes are NOT changed - only new chits use the new prefix.
     */
    public function updateChitPrefix(Request $req): void
    {
        $user = Guard::authorize($req, 'settings.edit');
        $in = Validator::make($req->body, [
            'prefix' => 'required|string|min:1|max:8',
        ])->validated();
        $prefix = strtoupper(preg_replace('/[^A-Za-z0-9]/', '', $in['prefix']));
        if ($prefix === '') {
            throw HttpException::validation(['prefix' => ['Prefix must contain at least one letter or digit']]);
        }
        $cur = App::setting('code_format', []);
        $cur['loan_prefix']  = $prefix;
        $cur['loan_pattern'] = '{PREFIX}-{SEQ}';
        $this->put('code_format', $cur, $user, App::setting('code_format', []));
        Response::ok([
            'prefix'      => $prefix,
            'next_example'=> \App\Services\CodeGenerator::loanCode(),
        ], 'Chit code prefix saved. New chits will use "' . $prefix . '-N".');
    }

    /** POST /api/settings/fine  - create a new effective-dated fine rule */
    public function createFineRule(Request $req): void
    {
        $user = Guard::authorize($req, 'settings.edit');
        $in = Validator::make($req->body, [
            'fine_type'      => 'required|in:NONE,FIXED_PER_DAY,PERCENT_PER_DAY,FIXED_PER_INSTALLMENT',
            'rate_value'     => 'required|numeric|min:0',
            'grace_days'     => 'required|int|min:0|max:60',
            'max_fine_type'  => 'required|in:none,percent_of_payable,flat',
            'max_fine_value' => 'required|numeric|min:0',
            'effective_from' => 'required|date',
            'notes'          => 'nullable|string|max:255',
        ])->validated();
        $db = Database::instance();
        $db->transaction(function ($db) use ($in, $user) {
            $db->run('UPDATE fine_settings SET active = 0 WHERE effective_from <= :ef', ['ef' => $in['effective_from']]);
            $db->insert('fine_settings', [
                'fine_type'      => $in['fine_type'],
                'rate_value'     => $in['rate_value'],
                'grace_days'     => $in['grace_days'],
                'max_fine_type'  => $in['max_fine_type'],
                'max_fine_value' => $in['max_fine_value'],
                'effective_from' => $in['effective_from'],
                'active'         => 1,
                'notes'          => $in['notes'] ?? null,
                'created_by'     => $user['id'],
                'created_at'     => BusinessDate::utcNow(),
            ]);
        });
        Audit::log('fine_setting.create', 'settings', 'fine_settings', null, null, $in, null,
            ['id' => $user['id'], 'role_code' => $user['role_code']]);
        Response::created($db->fetchAll('SELECT * FROM fine_settings ORDER BY effective_from DESC, id DESC'),
            'New fine rule saved; historical transactions are unaffected');
    }

    /** POST /api/settings/payment-modes  &  PUT /api/settings/payment-modes/{id} */
    public function savePaymentMode(Request $req, array $args = []): void
    {
        $user = Guard::authorize($req, 'settings.edit');
        $db = Database::instance();
        $id = isset($args['id']) ? (int)$args['id'] : null;
        $in = Validator::make($req->body, [
            'code'      => ($id ? 'nullable' : 'required') . '|string|max:32',
            'name'      => ($id ? 'nullable' : 'required') . '|string|max:64',
            'is_active' => 'nullable|bool',
            'sort_order'=> 'nullable|int',
        ])->validated();
        if ($id) {
            $row = $db->fetch('SELECT * FROM payment_modes WHERE id = :id', ['id' => $id]);
            if (!$row) {
                throw HttpException::notFound('Payment mode not found');
            }
            $fields = array_filter($in, fn($v) => $v !== null);
            if (isset($fields['is_active'])) $fields['is_active'] = $fields['is_active'] ? 1 : 0;
            unset($fields['code']);
            if ($fields) $db->update('payment_modes', $fields, 'id = :id', ['id' => $id]);
        } else {
            if ($db->scalar('SELECT 1 FROM payment_modes WHERE code = :c', ['c' => $in['code']])) {
                throw HttpException::conflict('Payment mode code already exists');
            }
            $db->insert('payment_modes', [
                'code' => $in['code'], 'name' => $in['name'],
                'is_active' => ($in['is_active'] ?? true) ? 1 : 0, 'sort_order' => $in['sort_order'] ?? 0,
            ]);
        }
        Audit::log('payment_mode.save', 'settings', 'payment_modes', $id, null, $in, null,
            ['id' => $user['id'], 'role_code' => $user['role_code']]);
        Response::ok($db->fetchAll('SELECT * FROM payment_modes ORDER BY sort_order, id'), 'Payment modes updated');
    }

    /** POST /api/settings/accounts  &  PUT /api/settings/accounts/{id} */
    public function saveAccount(Request $req, array $args = []): void
    {
        $user = Guard::authorize($req, 'settings.edit');
        $db = Database::instance();
        $id = isset($args['id']) ? (int)$args['id'] : null;
        $in = Validator::make($req->body, [
            'code'            => ($id ? 'nullable' : 'required') . '|string|max:32',
            'name'            => ($id ? 'nullable' : 'required') . '|string|max:64',
            'type'            => 'nullable|in:cash,bank,other',
            'opening_balance' => 'nullable|numeric',
            'is_active'       => 'nullable|bool',
        ])->validated();
        if ($id) {
            if (!$db->scalar('SELECT 1 FROM accounts WHERE id = :id', ['id' => $id])) {
                throw HttpException::notFound('Account not found');
            }
            $fields = array_filter($in, fn($v) => $v !== null);
            if (isset($fields['is_active'])) $fields['is_active'] = $fields['is_active'] ? 1 : 0;
            if (isset($fields['opening_balance'])) $fields['opening_balance'] = number_format((float)$fields['opening_balance'], 2, '.', '');
            unset($fields['code']);
            if ($fields) $db->update('accounts', $fields, 'id = :id', ['id' => $id]);
        } else {
            if ($db->scalar('SELECT 1 FROM accounts WHERE code = :c', ['c' => $in['code']])) {
                throw HttpException::conflict('Account code already exists');
            }
            $db->insert('accounts', [
                'code' => $in['code'], 'name' => $in['name'],
                'type' => $in['type'] ?? 'cash',
                'opening_balance' => number_format((float)($in['opening_balance'] ?? 0), 2, '.', ''),
                'is_active' => ($in['is_active'] ?? true) ? 1 : 0,
            ]);
        }
        Audit::log('account.save', 'settings', 'accounts', $id, null, $in, null,
            ['id' => $user['id'], 'role_code' => $user['role_code']]);
        Response::ok($db->fetchAll('SELECT * FROM accounts ORDER BY id'), 'Accounts updated');
    }

    /** GET /api/settings/translations  &  PUT /api/settings/translations */
    public function translations(Request $req): void
    {
        Guard::authorize($req, 'settings.view');
        $rows = Database::instance()->fetchAll('SELECT lang, trans_key, trans_value FROM translations ORDER BY trans_key, lang');
        Response::ok($rows);
    }

    public function saveTranslation(Request $req): void
    {
        $user = Guard::authorize($req, 'settings.edit');
        $in = Validator::make($req->body, [
            'lang'  => 'required|in:en,ta',
            'key'   => 'required|string|max:128',
            'value' => 'required|string|max:512',
        ])->validated();
        Database::instance()->run(
            'INSERT INTO translations (lang, trans_key, trans_value) VALUES (:l,:k,:v)
             ON DUPLICATE KEY UPDATE trans_value = VALUES(trans_value)',
            ['l' => $in['lang'], 'k' => $in['key'], 'v' => $in['value']]
        );
        Audit::log('translation.save', 'settings', 'translations', $in['lang'] . ':' . $in['key'], null, $in, null,
            ['id' => $user['id'], 'role_code' => $user['role_code']]);
        Response::ok(null, 'Translation saved');
    }
}
