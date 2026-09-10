<?php
namespace App\Controllers;

use App\Auth\Guard;
use App\Core\Database;
use App\Core\HttpException;
use App\Core\ListQuery;
use App\Core\Request;
use App\Core\Response;
use App\Core\Validator;
use App\Services\CodeGenerator;
use App\Services\EmiService;
use App\Services\ScheduleService;
use App\Support\Audit;
use App\Support\BusinessDate;
use App\Support\Money;

/**
 * CHIT / loan accounts.
 *
 * A chit has a configured `installment_amount` that the user types in and that
 * the system stores and reuses VERBATIM. There is no EMI formula, no interest,
 * no automatic increase of any kind. `emi_amount` is kept only as a legacy
 * mirror column (always == installment_amount).
 */
class LoanController
{
    /** GET /api/loans/next-code - the chit code that auto-generation would use next */
    public function nextCode(Request $req): void
    {
        Guard::authorize($req, ['loans.create', 'loans.edit']);
        $fmt = \App\Core\App::setting('code_format', []);
        Response::ok([
            'prefix'    => $fmt['loan_prefix'] ?? 'JRM',
            'next_code' => CodeGenerator::loanCode(),
        ]);
    }

    /** POST /api/loans/preview  - flat schedule preview, saves nothing */
    /**
     * Keep the repayment frequency and the internal schedule_type consistent.
     * frequency is the user-facing cadence (daily/weekly/monthly); schedule_type
     * is the engine key that ScheduleService::computeDueDates() understands.
     * Monthly keeps whatever MONTHLY_* variant was chosen (weekday cycle / interval).
     */
    private static function syncScheduleType(string $frequency, ?string $scheduleType): string
    {
        return match ($frequency) {
            'daily'   => 'DAILY',
            'weekly'  => 'WEEKLY',
            'monthly' => in_array($scheduleType, ['MONTHLY_WEEKDAY', 'MONTHLY_DAILY', 'MONTHLY_INTERVAL'], true)
                ? $scheduleType
                : 'MONTHLY_DAILY',
            default   => $scheduleType ?: 'WEEKLY',
        };
    }

    /**
     * Normalise an incoming schedule_config. The collection day (`weekday`) is
     * OPTIONAL: only a real 1..7 value is kept, anything else (null / '' / 0 /
     * "any") is dropped so the schedule just runs from the start date. Returns
     * null when nothing meaningful was supplied.
     */
    private static function normScheduleConfig($raw): ?array
    {
        if (!is_array($raw)) {
            return null;
        }
        $out = [];
        $wd = $raw['weekday'] ?? null;
        if ($wd !== null && $wd !== '' && (int)$wd >= 1 && (int)$wd <= 7) {
            $out['weekday'] = (int)$wd;
        }
        foreach (['cycle_weeks' => [1, 8], 'interval_days' => [1, 120]] as $k => [$min, $max]) {
            if (isset($raw[$k]) && $raw[$k] !== '' && (int)$raw[$k] >= $min && (int)$raw[$k] <= $max) {
                $out[$k] = (int)$raw[$k];
            }
        }
        return $out ?: null;
    }

    public function preview(Request $req): void
    {
        Guard::authorize($req, ['loans.create', 'loans.edit']);
        $in = Validator::make($req->body, [
            'principal_amount'   => 'required|numeric|min:1',
            'installment_amount' => 'required|numeric|min:0.01',
            'tenure'             => 'required|int|min:1|max:600',
            'frequency'          => 'required|in:daily,weekly,monthly',
            'start_date'         => 'required|date',
            'schedule_type'      => 'required|in:DAILY,WEEKLY,MONTHLY_WEEKDAY,MONTHLY_DAILY,MONTHLY_INTERVAL',
        ])->validated();
        $in['schedule_type'] = self::syncScheduleType($in['frequency'], $in['schedule_type']);

        $loanLike = $in + ['schedule_config' => json_encode($req->input('schedule_config', []))];
        $breakdown = EmiService::breakdown($loanLike);
        $dates = ScheduleService::computeDueDates($loanLike, (int)$in['tenure']);

        $schedule = [];
        foreach ($breakdown['per_installment'] as $i => $row) {
            $schedule[] = $row + ['due_date' => $dates[$i]];
        }
        Response::ok([
            'installment_amount' => $breakdown['installment_amount'],
            'emi_amount'         => $breakdown['installment_amount'],
            'totals'             => $breakdown['totals'],
            'schedule'           => $schedule,
            'next_code'          => CodeGenerator::loanCode(),   // suggested auto chit code
        ]);
    }

    /** GET /api/loans */
    public function index(Request $req): void
    {
        $user = Guard::authorize($req, 'loans.view');
        $db = Database::instance();

        $where = ['l.deleted_at IS NULL'];
        $params = [];

        $q = ListQuery::search($req);
        if ($q !== '') {
            $where[] = '(l.code LIKE :q OR c.name LIKE :q OR c.customer_code LIKE :q OR c.mobile LIKE :q)';
            $params['q'] = "%$q%";
        }
        foreach ([
            'status' => 'l.status', 'frequency' => 'l.frequency',
            'account_type' => 'l.account_type',
            'customer_id' => 'l.customer_id',
        ] as $key => $col) {
            if (($v = $req->queryParam($key)) !== null && $v !== '') {
                $where[] = "$col = :$key";
                $params[$key] = $v;
            }
        }
        // Location filter follows the customer's master location (source of truth).
        if (($lv = $req->queryParam('location_id')) !== null && $lv !== '') {
            $where[] = '(c.primary_location_id = :location_id OR l.location_id = :location_id)';
            $params['location_id'] = (int)$lv;
        }
        if ($from = $req->queryParam('date_from')) { $where[] = 'l.start_date >= :df'; $params['df'] = $from; }
        if ($to   = $req->queryParam('date_to'))   { $where[] = 'l.start_date <= :dt'; $params['dt'] = $to; }

        [$scopeSql, $scopeParams] = Guard::loanScopeSql($user, 'l');
        $where[] = $scopeSql;
        $params += $scopeParams;

        $order = ListQuery::orderBy($req, [
            'code' => 'l.code', 'start_date' => 'l.start_date',
            'principal_amount' => 'l.principal_amount', 'installment_amount' => 'l.installment_amount',
            'created_at' => 'l.created_at',
        ], 'l.created_at DESC');

        $perPage = ListQuery::perPage($req);
        $offset  = ListQuery::offset($req);
        $whereSql = implode(' AND ', $where);
        $base = "FROM loans_or_chits l
                 JOIN customers c ON c.id = l.customer_id
                 LEFT JOIN locations cloc ON cloc.id = c.primary_location_id
                 LEFT JOIN locations loc ON loc.id = l.location_id
                 WHERE $whereSql";

        $total = (int)$db->scalar("SELECT COUNT(*) $base", $params);
        $rows = $db->fetchAll(
            "SELECT l.id, l.code, l.account_type, l.principal_amount,
                    l.installment_amount, l.installment_amount AS emi_amount, l.tenure,
                    l.frequency, l.schedule_type, l.start_date, l.status,
                    c.id AS customer_id, c.name AS customer_name, c.customer_code, c.mobile,
                    COALESCE(cloc.name, loc.name) AS location_name,
                    (SELECT u.name FROM loan_assignments la
                       JOIN employees e ON e.id = la.employee_id
                       JOIN users u ON u.id = e.user_id
                      WHERE la.loan_id = l.id AND la.is_active = 1
                      ORDER BY la.id DESC LIMIT 1) AS employee_name,
                    (SELECT COALESCE(SUM(balance_amount),0) FROM installments i WHERE i.loan_id = l.id) AS outstanding_balance
             $base
             ORDER BY $order LIMIT $perPage OFFSET $offset",
            $params
        );
        Response::paginated($rows, $total, ListQuery::page($req), $perPage);
    }

    /** GET /api/loans/{id} */
    public function show(Request $req, array $args): void
    {
        $user = Guard::authorize($req, 'loans.view');
        $loan = Guard::assertLoanInScope($user, (int)$args['id']);
        if ($loan['deleted_at'] !== null) {
            throw HttpException::notFound('Chit not found');
        }
        $db = Database::instance();

        ScheduleService::refreshOverdue((int)$loan['id']);

        // legacy mirror for any old caller
        $loan['emi_amount'] = $loan['installment_amount'];

        $loan['customer'] = $db->fetch('SELECT id, customer_code, name, mobile, primary_location_id FROM customers WHERE id = :id', ['id' => $loan['customer_id']]);
        $loan['location'] = $loan['location_id']
            ? $db->fetch('SELECT id, code, name FROM locations WHERE id = :id', ['id' => $loan['location_id']])
            : null;
        $loan['assignment'] = $db->fetch(
            "SELECT la.*, e.emp_code, u.name AS employee_name
             FROM loan_assignments la JOIN employees e ON e.id = la.employee_id JOIN users u ON u.id = e.user_id
             WHERE la.loan_id = :l AND la.is_active = 1 ORDER BY la.id DESC LIMIT 1",
            ['l' => $loan['id']]
        );
        $loan['installments'] = $db->fetchAll(
            'SELECT * FROM installments WHERE loan_id = :l ORDER BY installment_no', ['l' => $loan['id']]
        );
        $loan['summary'] = \App\Services\CollectionService::loanSummary((int)$loan['id']);
        $loan['distribution']  = \App\Services\DistributionService::summary((int)$loan['id']);
        $loan['distributions'] = \App\Services\DistributionService::listFor((int)$loan['id']);
        $loan['collections'] = $db->fetchAll(
            "SELECT col.*, pm.name AS payment_mode FROM collections col
             JOIN payment_modes pm ON pm.id = col.payment_mode_id
             WHERE col.loan_id = :l AND col.deleted_at IS NULL ORDER BY col.collection_date DESC, col.id DESC",
            ['l' => $loan['id']]
        );

        Response::ok($loan);
    }

    /** POST /api/loans  - create chit + auto-generate the flat installment schedule */
    public function store(Request $req): void
    {
        $user = Guard::authorize($req, 'loans.create');
        $db = Database::instance();

        $in = Validator::make($req->body, [
            'customer_id'        => 'required|int',
            'account_type'       => 'nullable|in:loan,chit',
            'principal_amount'   => 'required|numeric|min:1',
            'installment_amount' => 'required|numeric|min:0.01',
            'tenure'             => 'required|int|min:1|max:600',
            'frequency'          => 'required|in:daily,weekly,monthly',
            'start_date'         => 'required|date',
            'schedule_type'      => 'required|in:DAILY,WEEKLY,MONTHLY_WEEKDAY,MONTHLY_DAILY,MONTHLY_INTERVAL',
            'location_id'        => 'nullable|int',
            'employee_id'        => 'nullable|int',
            'notes'              => 'nullable|string|max:500',
            'code'               => 'nullable|string|max:40',
        ])->validated();
        $in['schedule_type'] = self::syncScheduleType($in['frequency'], $in['schedule_type']);

        $customer = $db->fetch('SELECT * FROM customers WHERE id = :id AND deleted_at IS NULL', ['id' => $in['customer_id']]);
        if (!$customer) {
            throw HttpException::validation(['customer_id' => ['Unknown customer']]);
        }
        $locationId = $in['location_id'] ?: $customer['primary_location_id'];

        // ---- Optional: distribute the chit immediately as part of creation ----
        // Reuses DistributionService exactly like a later distribution: one financial
        // transaction, one history row, EMI sync. Validate the inputs up-front so we
        // never leave an orphan chit if the distribution amount is wrong.
        $distIn = $req->input('distribution');
        $wantDistribution = is_array($distIn) && isset($distIn['amount']) && (float) $distIn['amount'] > 0;
        if ($wantDistribution) {
            $distAmount = (float) $distIn['amount'];
            if ($distAmount > (float) $in['principal_amount']) {
                throw HttpException::validation(['distribution.amount' => [
                    'Distributed amount cannot exceed the chit amount (' . number_format((float) $in['principal_amount'], 2, '.', '') . ').'
                ]]);
            }
            if (empty($distIn['account_id']) ||
                !$db->scalar('SELECT 1 FROM accounts WHERE id = :id AND is_active = 1', ['id' => (int) $distIn['account_id']])) {
                throw HttpException::validation(['distribution.account_id' => ['Choose the Office Cash or Bank account the money comes from.']]);
            }
            if (isset($distIn['new_emi_amount']) && $distIn['new_emi_amount'] !== '' && (float) $distIn['new_emi_amount'] <= 0) {
                throw HttpException::validation(['distribution.new_emi_amount' => ['New EMI amount must be greater than 0.']]);
            }
        }

        // The configured installment amount is stored verbatim. emi_amount mirrors it.
        $installment = Money::of($in['installment_amount']);

        // ---- Chit code: manual (verbatim, must be unique) or auto (backend = source of truth) ----
        $manualCode = isset($in['code']) ? trim((string) $in['code']) : '';
        $isManual   = $manualCode !== '';
        if ($isManual) {
            if (!preg_match('/^[A-Za-z0-9][A-Za-z0-9._\/-]{0,39}$/', $manualCode)) {
                throw HttpException::validation(['code' => ['Chit code may only contain letters, numbers, dot, dash, slash or underscore (max 40).']]);
            }
            if ($db->scalar('SELECT 1 FROM loans_or_chits WHERE code = :c', ['c' => $manualCode])) {
                throw HttpException::conflict('Chit Code already exists');
            }
        }

        $scheduleConfig = self::normScheduleConfig($req->input('schedule_config'));
        $makeRow = fn (string $code): array => [
            'code'               => $code,
            'account_type'       => $in['account_type'] ?: 'chit',
            'customer_id'        => $in['customer_id'],
            'location_id'        => $locationId,
            'principal_amount'   => $installment === '0.00' ? '0.00' : Money::of($in['principal_amount']),
            'tenure'             => $in['tenure'],
            'frequency'          => $in['frequency'],
            'installment_amount' => $installment,   // CURRENT EMI (a distribution's new_emi_amount can later override it)
            'initial_emi_amount' => $installment,   // frozen baseline for "Initial EMI"
            'emi_amount'         => $installment,   // legacy mirror
            'interest_amount'    => '0.00',
            'other_charges'      => '0.00',
            'processing_fee'     => '0.00',
            'start_date'         => $in['start_date'],
            'schedule_type'      => $in['schedule_type'],
            'schedule_config'    => $scheduleConfig ? json_encode($scheduleConfig) : null,
            'allow_advance'      => 1,
            'status'             => 'active',
            'notes'              => $in['notes'] ?? null,
            'created_by'         => $user['id'],
            'created_at'         => BusinessDate::utcNow(),
            'updated_at'         => BusinessDate::utcNow(),
        ];

        // Auto mode retries against a fresh MAX(suffix)+1 if a concurrent insert grabbed
        // the same number; the UNIQUE(code) constraint is the final arbiter.
        $code = $isManual ? $manualCode : CodeGenerator::loanCode();
        $loanId = null;
        for ($attempt = 1; ; $attempt++) {
            try {
                $row = $makeRow($code);
                $loanId = $db->transaction(fn ($db) => $db->insert('loans_or_chits', $row));
                break;
            } catch (\PDOException $e) {
                $dup = ($e->getCode() === '23000') || str_contains($e->getMessage(), 'uq_loans_code') || str_contains($e->getMessage(), 'Duplicate entry');
                if (!$dup) {
                    throw $e;
                }
                if ($isManual) {
                    throw HttpException::conflict('Chit Code already exists');
                }
                if ($attempt >= 5) {
                    throw HttpException::conflict('Could not allocate a unique chit code, please retry');
                }
                $code = CodeGenerator::loanCode();
            }
        }

        if (!empty($in['employee_id'])) {
            $emp = $db->fetch('SELECT id FROM employees WHERE id = :id', ['id' => $in['employee_id']]);
            if ($emp) {
                $db->insert('loan_assignments', [
                    'loan_id'     => $loanId,
                    'employee_id' => $in['employee_id'],
                    'start_date'  => $in['start_date'],
                    'is_active'   => 1,
                    'assigned_by' => $user['id'],
                    'created_at'  => BusinessDate::utcNow(),
                    'updated_at'  => BusinessDate::utcNow(),
                ]);
            }
        }

        // Automatic, deterministic, idempotent flat schedule generation.
        $gen = ScheduleService::generate($loanId);

        Audit::log('loan.create', 'loans', 'loan', $loanId, null,
            ['code' => $code, 'principal' => $in['principal_amount'], 'tenure' => $in['tenure'],
             'installment_amount' => $installment, 'installments_created' => $gen['created']],
            null, ['id' => $user['id'], 'role_code' => $user['role_code']]);

        // Immediate distribution (optional) — same service as a later distribution.
        $distributionResult = null;
        if ($wantDistribution) {
            \App\Services\DistributionService::create($user, $loanId, [
                'amount'           => $distIn['amount'],
                'account_id'       => (int) $distIn['account_id'],
                'distributed_date' => $distIn['distributed_date'] ?? null,
                'new_emi_amount'   => ($distIn['new_emi_amount'] ?? '') !== '' ? $distIn['new_emi_amount'] : null,
                'remarks'          => $distIn['remarks'] ?? 'Distributed at chit creation',
            ]);
            $distributionResult = \App\Services\DistributionService::summary($loanId);
        }

        $loan = $db->fetch('SELECT * FROM loans_or_chits WHERE id = :id', ['id' => $loanId]);
        $loan['emi_amount'] = $loan['installment_amount'];
        // Re-read the schedule: a distribution with a New EMI regenerates future rows.
        $loan['installments'] = $db->fetchAll(
            'SELECT * FROM installments WHERE loan_id = :l ORDER BY installment_no', ['l' => $loanId]
        );
        $loan['schedule_generation'] = [
            'created' => $gen['created'], 'updated' => $gen['updated'], 'skipped_paid' => $gen['skipped_paid'],
        ];
        $loan['distribution'] = $distributionResult ?? \App\Services\DistributionService::summary($loanId);
        Response::created($loan, $distributionResult
            ? 'Chit created and ' . number_format((float) $distIn['amount'], 2, '.', '') . ' distributed'
            : 'Chit created and schedule generated');
    }

    /** POST /api/loans/{id}/generate-schedule  - idempotent top-up / repair */
    public function generateSchedule(Request $req, array $args): void
    {
        $user = Guard::authorize($req, ['loans.create', 'loans.edit']);
        $loan = Guard::assertLoanInScope($user, (int)$args['id']);
        $gen = ScheduleService::generate((int)$loan['id']);
        Audit::log('loan.schedule_regenerate', 'loans', 'loan', $loan['id'], null,
            ['created' => $gen['created'], 'updated' => $gen['updated'], 'skipped_paid' => $gen['skipped_paid']],
            null, ['id' => $user['id'], 'role_code' => $user['role_code']]);
        Response::ok([
            'created' => $gen['created'], 'updated' => $gen['updated'], 'skipped_paid' => $gen['skipped_paid'],
            'installments' => $gen['installments'],
        ], 'Schedule synchronised (no duplicates created)');
    }

    /**
     * PUT /api/loans/{id}
     * Editing installment_amount / start_date / schedule_type / tenure recalculates
     * only FUTURE, untouched installments. Paid / partially-paid rows are frozen.
     * There is NO interest recomputation.
     */
    public function update(Request $req, array $args): void
    {
        $user = Guard::authorize($req, 'loans.edit');
        $db = Database::instance();
        $loan = Guard::assertLoanInScope($user, (int)$args['id']);
        if ($loan['deleted_at'] !== null) {
            throw HttpException::notFound('Chit not found');
        }
        if (in_array($loan['status'], ['cancelled', 'completed'], true)) {
            throw HttpException::conflict('A ' . $loan['status'] . ' chit cannot be edited');
        }

        $in = Validator::make($req->body, [
            'installment_amount' => 'nullable|numeric|min:0.01',
            'principal_amount'   => 'nullable|numeric|min:0',
            'schedule_type'      => 'nullable|in:DAILY,WEEKLY,MONTHLY_WEEKDAY,MONTHLY_DAILY,MONTHLY_INTERVAL',
            'start_date'         => 'nullable|date',
            'tenure'             => 'nullable|int|min:1|max:600',
            'frequency'          => 'nullable|in:daily,weekly,monthly',
            'location_id'        => 'nullable|int',
            'notes'              => 'nullable|string|max:500',
            'code'               => 'nullable|string|max:40',
        ])->validated();

        $fields = [];
        foreach (['principal_amount','schedule_type','start_date','tenure','frequency','location_id','notes'] as $k) {
            if ($in[$k] !== null) $fields[$k] = $in[$k];
        }
        // Keep frequency <-> schedule_type consistent whenever either one is edited.
        if ($in['frequency'] !== null || $in['schedule_type'] !== null) {
            $effFreq = $in['frequency'] ?? $loan['frequency'];
            $fields['frequency']     = $effFreq;
            $fields['schedule_type'] = self::syncScheduleType($effFreq, $in['schedule_type'] ?? $loan['schedule_type']);
        }
        // Optional collection day: send schedule_config to set/clear the weekday.
        if (is_array($req->body) && array_key_exists('schedule_config', $req->body)) {
            $cfg = self::normScheduleConfig($req->input('schedule_config'));
            $fields['schedule_config'] = $cfg ? json_encode($cfg) : null;
        }
        if ($in['installment_amount'] !== null) {
            // Editing the chit's EMI in the normal edit form redefines the BASELINE
            // ("Initial EMI"). A later distribution can still override the current EMI.
            $fields['installment_amount'] = Money::of($in['installment_amount']);
            $fields['initial_emi_amount'] = $fields['installment_amount'];
            $fields['emi_amount']         = $fields['installment_amount'];   // legacy mirror follows
        }
        if ($in['code'] !== null && trim((string) $in['code']) !== '' && trim((string) $in['code']) !== $loan['code']) {
            $newCode = trim((string) $in['code']);
            if (!preg_match('/^[A-Za-z0-9][A-Za-z0-9._\/-]{0,39}$/', $newCode)) {
                throw HttpException::validation(['code' => ['Chit code may only contain letters, numbers, dot, dash, slash or underscore (max 40).']]);
            }
            if ($db->scalar('SELECT 1 FROM loans_or_chits WHERE code = :c AND id <> :id', ['c' => $newCode, 'id' => $loan['id']])) {
                throw HttpException::conflict('Chit Code already exists');
            }
            $fields['code'] = $newCode;
        }
        if (!$fields) {
            throw HttpException::validation(['_' => ['Nothing to update']]);
        }
        $fields['updated_at'] = BusinessDate::utcNow();

        $paidCount = (int)$db->scalar("SELECT COUNT(*) FROM installments WHERE loan_id = :l AND (paid_amount > 0 OR status IN ('PARTIAL','COMPLETED'))", ['l' => $loan['id']]);
        if (isset($fields['tenure']) && (int)$fields['tenure'] < $paidCount) {
            throw HttpException::conflict("Tenure cannot be reduced below the number of installments already paid ($paidCount)");
        }

        $db->update('loans_or_chits', $fields, 'id = :id', ['id' => $loan['id']]);

        // Regenerate: paid/partial rows preserved, only future untouched rows change.
        $gen = ScheduleService::generate((int)$loan['id']);

        Audit::log('loan.update', 'loans', 'loan', $loan['id'],
            array_intersect_key($loan, $fields), $fields, null,
            ['id' => $user['id'], 'role_code' => $user['role_code']]);

        $fresh = $db->fetch('SELECT * FROM loans_or_chits WHERE id = :id', ['id' => $loan['id']]);
        $fresh['emi_amount'] = $fresh['installment_amount'];
        Response::ok([
            'loan' => $fresh,
            'schedule_generation' => ['created' => $gen['created'], 'updated' => $gen['updated'], 'skipped_paid' => $gen['skipped_paid']],
        ], 'Chit updated; future unpaid installments recalculated');
    }

    /** POST /api/loans/{id}/cancel */
    public function cancel(Request $req, array $args): void
    {
        $user = Guard::authorize($req, 'loans.cancel');
        $db = Database::instance();
        $loan = Guard::assertLoanInScope($user, (int)$args['id']);
        if ($loan['status'] !== 'active') {
            throw HttpException::conflict('Only active chits can be cancelled');
        }
        $reason = trim((string)$req->input('reason', ''));
        if ($reason === '') {
            throw HttpException::validation(['reason' => ['A cancellation reason is required']]);
        }
        $db->update('loans_or_chits', [
            'status' => 'cancelled',
            'cancelled_at' => BusinessDate::utcNow(),
            'cancelled_by' => $user['id'],
            'cancel_reason' => $reason,
            'updated_at' => BusinessDate::utcNow(),
        ], 'id = :id', ['id' => $loan['id']]);
        $db->run('UPDATE loan_assignments SET is_active = 0 WHERE loan_id = :l', ['l' => $loan['id']]);

        Audit::log('loan.cancel', 'loans', 'loan', $loan['id'], ['status' => 'active'], ['status' => 'cancelled'], $reason,
            ['id' => $user['id'], 'role_code' => $user['role_code']]);
        Response::ok(null, 'Chit cancelled (historical transactions preserved)');
    }

    /**
     * DELETE /api/loans/{id}
     * Soft delete so it disappears from every list immediately. Any posted
     * collections stay in the ledger for audit; the chit itself is hidden.
     */
    public function destroy(Request $req, array $args): void
    {
        $user = Guard::authorize($req, 'loans.delete');
        $db = Database::instance();
        $loan = Guard::assertLoanInScope($user, (int)$args['id']);
        if ($loan['deleted_at'] !== null) {
            Response::ok(null, 'Chit already removed');
            return;
        }
        $hasCollections = (int)$db->scalar(
            "SELECT COUNT(*) FROM collections WHERE loan_id = :l AND status = 'posted' AND deleted_at IS NULL", ['l' => $loan['id']]
        );

        $db->transaction(function ($db) use ($loan) {
            $db->update('loans_or_chits', [
                'deleted_at' => BusinessDate::utcNow(),
                'status'     => $loan['status'] === 'active' ? 'cancelled' : $loan['status'],
                'updated_at' => BusinessDate::utcNow(),
            ], 'id = :id', ['id' => $loan['id']]);
            $db->run('UPDATE loan_assignments SET is_active = 0 WHERE loan_id = :l', ['l' => $loan['id']]);
        });

        Audit::log('loan.delete', 'loans', 'loan', $loan['id'],
            ['code' => $loan['code'], 'status' => $loan['status']],
            ['deleted' => true, 'had_collections' => $hasCollections], $req->input('reason'),
            ['id' => $user['id'], 'role_code' => $user['role_code']]);

        Response::ok(
            ['had_collections' => $hasCollections],
            $hasCollections
                ? 'Chit removed. Its ' . $hasCollections . ' posted collection(s) remain in the ledger for audit.'
                : 'Chit removed'
        );
    }
}
