<?php
namespace App\Controllers;

use App\Auth\Guard;
use App\Core\Database;
use App\Core\HttpException;
use App\Core\Request;
use App\Core\Response;
use App\Core\Validator;
use App\Services\DistributionService;

/**
 * Actual chit distributions (money handed to the customer). See DistributionService.
 * Creating / editing / cancelling here is the ONLY path that moves money out of an
 * Office Cash / Bank account for a chit.
 */
class DistributionController
{
    /** GET /api/loans/{id}/distributions  - history + summary for one chit */
    public function forLoan(Request $req, array $args): void
    {
        $user   = Guard::authorize($req, 'distributions.view');
        $loanId = (int) $args['id'];
        Guard::assertLoanInScope($user, $loanId);

        Response::ok([
            'summary'       => DistributionService::summary($loanId),
            'distributions' => DistributionService::listFor($loanId),
        ]);
    }

    /** GET /api/distributions  - global list (reports) */
    public function index(Request $req): void
    {
        Guard::authorize($req, 'distributions.view');
        $where = [];
        $params = [];
        if (($s = $req->queryParam('status')) !== null && $s !== '') { $where[] = 'd.status = :st'; $params['st'] = $s; }
        if (($a = $req->queryParam('account_id')) !== null && $a !== '') { $where[] = 'd.account_id = :acc'; $params['acc'] = (int) $a; }
        if ($f = $req->queryParam('date_from')) { $where[] = 'd.distributed_date >= :df'; $params['df'] = $f; }
        if ($t = $req->queryParam('date_to'))   { $where[] = 'd.distributed_date <= :dt'; $params['dt'] = $t; }
        Response::ok(DistributionService::listAll($where, $params));
    }

    /** POST /api/loans/{id}/distributions  - record an actual distribution (money OUT) */
    public function store(Request $req, array $args): void
    {
        $user   = Guard::authorize($req, 'distributions.create');
        $loanId = (int) $args['id'];
        Guard::assertLoanInScope($user, $loanId);

        $in = Validator::make($req->body, [
            'amount'           => 'required|numeric|min:0.01',
            'account_id'       => 'required|int',
            'distributed_date' => 'nullable|date',
            'new_emi_amount'   => 'nullable|numeric|min:0.01',
            'remarks'          => 'nullable|string|max:500',
        ])->validated();

        $row = DistributionService::create($user, $loanId, $in);
        Response::created($row, 'Distribution recorded');
    }

    /** PUT /api/distributions/{id} */
    public function update(Request $req, array $args): void
    {
        $user = Guard::authorize($req, 'distributions.edit');
        $id   = (int) $args['id'];

        $in = Validator::make($req->body, [
            'amount'           => 'nullable|numeric|min:0.01',
            'account_id'       => 'nullable|int',
            'distributed_date' => 'nullable|date',
            'new_emi_amount'   => 'nullable|numeric|min:0.01',
            'remarks'          => 'nullable|string|max:500',
        ])->validated();

        $row = DistributionService::update($user, $id, $in);
        Response::ok($row, 'Distribution updated');
    }

    /** POST /api/distributions/{id}/cancel  - reverse the money movement */
    public function cancel(Request $req, array $args): void
    {
        $user = Guard::authorize($req, 'distributions.cancel');
        $id   = (int) $args['id'];
        $reason = $req->input('reason');
        $row = DistributionService::cancel($user, $id, is_string($reason) ? $reason : null);
        Response::ok($row, 'Distribution cancelled');
    }
}
