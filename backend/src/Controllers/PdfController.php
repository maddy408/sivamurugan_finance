<?php
namespace App\Controllers;

use App\Auth\Guard;
use App\Core\App;
use App\Core\Database;
use App\Core\HttpException;
use App\Core\Request;
use App\Services\CollectionService;
use App\Services\DistributionService;
use App\Support\Pdf;

/**
 * PDF (and statement Excel) downloads. Read-only presentation layer: reuses
 * the exact same data CollectionController/LoanController already expose via
 * JSON, just rendered to a file instead of returned as JSON.
 */
class PdfController
{
    /** GET /api/collections/{id}/receipt.pdf */
    public function receipt(Request $req, array $args): void
    {
        $user = Guard::authorize($req, ['collection.view', 'reports.view']);
        $db = Database::instance();
        $col = $db->fetch(
            "SELECT col.*, pm.name AS payment_mode, a.name AS account_name,
                    cu.name AS customer_name, cu.customer_code, cu.mobile,
                    l.code AS chit_code, l.installment_amount, l.principal_amount,
                    ub.name AS collected_by_name
             FROM collections col
             JOIN payment_modes pm ON pm.id = col.payment_mode_id
             LEFT JOIN accounts a ON a.id = col.account_id
             JOIN customers cu ON cu.id = col.customer_id
             JOIN loans_or_chits l ON l.id = col.loan_id
             LEFT JOIN users ub ON ub.id = col.collected_by
             WHERE col.id = :id", ['id' => (int) $args['id']]
        );
        if (!$col) {
            throw HttpException::notFound('Collection not found');
        }
        Guard::assertLoanInScope($user, (int) $col['loan_id']);
        $allocations = $db->fetchAll(
            "SELECT ca.*, i.installment_no, i.due_date FROM collection_allocations ca
             JOIN installments i ON i.id = ca.installment_id
             WHERE ca.collection_id = :c ORDER BY i.installment_no", ['c' => $col['id']]
        );
        $loan = ['code' => $col['chit_code']];
        $customer = ['name' => $col['customer_name'], 'customer_code' => $col['customer_code'], 'mobile' => $col['mobile']];
        Pdf::receipt($col, $loan, $customer, $allocations, App::setting('organization', []));
    }

    /**
     * GET /api/installments/{id}/statement.pdf - one due's complete payment
     * history (every transaction, own Bill No each) - works for Partial or
     * Completed dues alike. See Pdf::installmentStatement().
     */
    public function installmentStatement(Request $req, array $args): void
    {
        $user = Guard::authorize($req, ['collection.view', 'collection.create', 'reports.view']);
        $db = Database::instance();
        $inst = $db->fetch(
            "SELECT i.*, l.code AS loan_code, cu.name AS customer_name, cu.customer_code, cu.mobile
             FROM installments i
             JOIN loans_or_chits l ON l.id = i.loan_id
             JOIN customers cu ON cu.id = l.customer_id
             WHERE i.id = :id", ['id' => (int) $args['id']]
        );
        if (!$inst) {
            throw HttpException::notFound('Installment not found');
        }
        Guard::assertLoanInScope($user, (int) $inst['loan_id']);
        $payments = CollectionService::installmentPayments((int) $inst['id']);
        Pdf::installmentStatement(
            $inst,
            ['code' => $inst['loan_code']],
            ['name' => $inst['customer_name'], 'customer_code' => $inst['customer_code'], 'mobile' => $inst['mobile']],
            $payments,
            App::setting('organization', [])
        );
    }

    /**
     * MAIN STATEMENT RULE (see Pdf::statement docblock): only FULLY PAID
     * (status = COMPLETED) installments are included. Partial and pending
     * dues never appear here - a partial due's full payment history belongs
     * to the per-installment statement (installmentStatement() below), not
     * this loan-wide document. Same rule for auto and custom due_date_mode.
     */
    private function statementData(Request $req, array $args): array
    {
        $user = Guard::authorize($req, 'loans.view');
        $loan = Guard::assertLoanInScope($user, (int) $args['id']);
        $db = Database::instance();

        $loan['customer'] = $db->fetch('SELECT id, customer_code, name, mobile, location FROM customers WHERE id = :id', ['id' => $loan['customer_id']]);
        $loan['summary']  = CollectionService::loanSummary((int) $loan['id']);
        $loan['distribution'] = DistributionService::summary((int) $loan['id']);
        $installments = $db->fetchAll(
            "SELECT * FROM installments WHERE loan_id = :l AND status = 'COMPLETED' ORDER BY installment_no",
            ['l' => $loan['id']]
        );
        $collections = $db->fetchAll(
            "SELECT col.*, pm.name AS payment_mode, ub.name AS collected_by_name,
                    (SELECT GROUP_CONCAT(CONCAT('#', i.installment_no) ORDER BY i.installment_no SEPARATOR ', ')
                       FROM collection_allocations ca JOIN installments i ON i.id = ca.installment_id
                      WHERE ca.collection_id = col.id) AS installment_labels
             FROM collections col
             JOIN payment_modes pm ON pm.id = col.payment_mode_id
             LEFT JOIN users ub ON ub.id = col.collected_by
             WHERE col.loan_id = :l AND col.deleted_at IS NULL
             ORDER BY col.collection_date DESC, col.id DESC",
            ['l' => $loan['id']]
        );
        $distributions = DistributionService::listFor((int) $loan['id']);
        $paymentsByInstallment = [];
        foreach ($installments as $i) {
            $paymentsByInstallment[$i['id']] = CollectionService::installmentPayments((int) $i['id']);
        }

        return [$loan, $installments, $collections, $distributions, $paymentsByInstallment];
    }

    /** GET /api/loans/{id}/statement.pdf */
    public function statement(Request $req, array $args): void
    {
        [$loan, $installments, $collections, $distributions, $paymentsByInstallment] = $this->statementData($req, $args);
        Pdf::statement($loan, $loan['customer'], $installments, $collections, $distributions, App::setting('organization', []), $paymentsByInstallment);
    }

    /** GET /api/loans/{id}/statement.xlsx */
    public function statementExcel(Request $req, array $args): void
    {
        [$loan, $installments, $collections, , $paymentsByInstallment] = $this->statementData($req, $args);
        $c = $loan['customer'];

        $instRows = array_map(fn ($i) => [
            $c['name'], $c['customer_code'], $c['mobile'], $loan['code'],
            (int) $i['installment_no'], $i['due_date'], (float) $i['payable_amount'],
            (float) $i['paid_amount'], (float) $i['fine_paid'], (float) $i['balance_amount'],
            $i['last_paid_date'] ?: '', $i['status'],
        ], $installments);
        $instHeaders = ['Customer Name', 'Customer Code', 'Mobile', 'Loan/Chit Code', 'Installment No', 'Due Date',
            'Amount Due', 'Amount Paid', 'Fine/Charges', 'Balance Amount', 'Paid Date', 'Status'];
        $instColTypes = ['text', 'text', 'text', 'text', 'number', 'date', 'money', 'money', 'money', 'money', 'date', 'text'];

        $colRows = array_map(fn ($col) => [
            $c['name'], $c['customer_code'], $c['mobile'], $loan['code'],
            $col['installment_labels'] ?: '', $col['bill_no'] ?: '', $col['collection_date'],
            (float) $col['amount'], (float) ($col['fine_amount'] ?? 0),
            (float) ($col['total_amount'] ?? ((float) $col['amount'] + (float) ($col['fine_amount'] ?? 0))),
            $col['payment_mode'], $col['collected_by_name'] ?? '',
            $col['status'] === 'posted' ? 'COMPLETED' : strtoupper($col['status']),
        ], $collections);
        $colHeaders = ['Customer Name', 'Customer Code', 'Mobile', 'Loan/Chit Code', 'Installment No(s)', 'Bill No', 'Collection Date',
            'Amount Paid', 'Fine/Charges', 'Total Paid', 'Payment Mode', 'Collected By', 'Status'];
        $colColTypes = ['text', 'text', 'text', 'text', 'text', 'text', 'date', 'money', 'money', 'money', 'text', 'text', 'text'];

        $payRows = [];
        foreach ($installments as $i) {
            foreach ($paymentsByInstallment[$i['id']] ?? [] as $p) {
                $payRows[] = [
                    $c['name'], $c['customer_code'], $loan['code'], (int) $i['installment_no'],
                    $p['bill_no'] ?: '', $p['collection_date'], (float) $p['principal_alloc'],
                    (float) $p['fine_alloc'], $p['payment_mode'], $p['collected_by_name'] ?? '',
                ];
            }
        }
        $payHeaders = ['Customer Name', 'Customer Code', 'Loan/Chit Code', 'Installment No', 'Bill No',
            'Payment Date', 'Amount Paid', 'Fine/Charges', 'Payment Mode', 'Collected By'];
        $payColTypes = ['text', 'text', 'text', 'number', 'text', 'date', 'money', 'money', 'text', 'text'];

        \App\Support\Xlsx::book('Statement-' . $loan['code'] . '.xlsx', [
            [
                'name' => 'Installment Schedule', 'title' => 'Chit Statement — ' . $loan['code'],
                'subtitle' => [$c['name'] . ' (' . $c['customer_code'] . ')', 'Only fully completed installments are listed'],
                'headers' => $instHeaders, 'rows' => $instRows, 'colTypes' => $instColTypes,
            ],
            [
                'name' => 'Collection History',
                'headers' => $colHeaders, 'rows' => $colRows, 'colTypes' => $colColTypes,
            ],
            [
                'name' => 'Payment History',
                'headers' => $payHeaders, 'rows' => $payRows, 'colTypes' => $payColTypes,
            ],
        ]);
    }
}
