<?php
namespace App\Support;

use App\Core\App;

/**
 * Bilingual (English + Tamil) PDF generation for payment receipts and chit
 * statements, using mPDF (vendored via Composer - see backend/composer.json).
 *
 * mPDF ships its own Tamil-capable font (Dhyana) and switches to it
 * automatically for any element carrying lang="ta" when autoLangToFont /
 * autoScriptToLang are enabled - no manual font wrangling needed.
 */
final class Pdf
{
    private static function mpdf(string $format = 'A4'): \Mpdf\Mpdf
    {
        $mpdf = new \Mpdf\Mpdf([
            'mode'         => 'utf-8',
            'format'       => $format,
            'margin_left'  => 12, 'margin_right' => 12,
            'margin_top'   => 12, 'margin_bottom' => 12,
            'tempDir'      => sys_get_temp_dir(),
        ]);
        $mpdf->autoScriptToLang = true;
        $mpdf->autoLangToFont   = true;
        return $mpdf;
    }

    private static function stream(\Mpdf\Mpdf $mpdf, string $filename): void
    {
        while (ob_get_level() > 0) {
            ob_end_clean();
        }
        $mpdf->Output($filename, \Mpdf\Output\Destination::DOWNLOAD);
        exit;
    }

    /** data: URI for the uploaded org logo, or null if none uploaded. */
    private static function logoDataUri(): ?string
    {
        $dir = dirname(__DIR__, 2) . '/storage/uploads';
        $files = glob($dir . '/logo.*');
        if (!$files) {
            return null;
        }
        $ext  = strtolower(pathinfo($files[0], PATHINFO_EXTENSION));
        $mime = ['png' => 'image/png', 'jpg' => 'image/jpeg', 'jpeg' => 'image/jpeg', 'webp' => 'image/webp'][$ext] ?? null;
        if (!$mime) {
            return null;
        }
        $data = @file_get_contents($files[0]);
        return $data === false ? null : 'data:' . $mime . ';base64,' . base64_encode($data);
    }

    private static function money($v): string
    {
        return '₹' . number_format((float) $v, 2);
    }

    private static function date(?string $v): string
    {
        return $v ? date('d/m/Y', strtotime($v)) : '—';
    }

    /**
     * English / Tamil label pair. The Tamil span is pinned to font-weight:normal
     * regardless of an ancestor's bold styling - the bundled Tamil font (Dhyana)
     * has no bold variant, and mPDF's synthetic/"fake" bold corrupts its complex
     * script glyphs into boxes. Plain weight renders correctly everywhere.
     */
    private static function bi(string $en, string $ta): string
    {
        return htmlspecialchars($en) . ' / <span lang="ta" style="font-weight:normal">' . htmlspecialchars($ta) . '</span>';
    }

    private static function orgHeaderHtml(array $org): string
    {
        $logo = self::logoDataUri();
        $rawName = trim((string)($org['name'] ?? ''));
        $name = ($rawName !== '' && $rawName !== 'SMCF Test Co' && $rawName !== 'Organization')
            ? htmlspecialchars($rawName)
            : 'Siva Murugan Chit Fund';

        $rawEmail = trim((string)($org['email'] ?? ''));
        $email = ($rawEmail !== '' && $rawEmail !== 'a@b.com') ? $rawEmail : null;

        $lines = array_filter([
            $org['address'] ?? null,
            implode(' · ', array_filter([$org['mobile'] ?? null, $org['telephone'] ?? null, $email])),
            !empty($org['gst']) ? 'GST/Reg. No: ' . htmlspecialchars($org['gst']) : null,
        ]);
        $linesHtml = implode('<br/>', array_map('htmlspecialchars', $lines));
        $logoHtml = $logo ? '<td style="width:75px;vertical-align:middle;"><img src="' . $logo . '" style="max-width:64px;max-height:64px;"/></td>' : '';
        return '
        <table width="100%" style="border-bottom:2px solid #0d3878;padding-bottom:8px;margin-bottom:10px;">
          <tr>
            ' . $logoHtml . '
            <td style="vertical-align:middle;">
              <div style="font-size:20px;font-weight:700;color:#0d3878;">' . $name . '</div>
              ' . ($linesHtml ? '<div style="font-size:10px;color:#475569;">' . $linesHtml . '</div>' : '') . '
            </td>
          </tr>
        </table>';
    }

    /* ------------------------------------------------------------------ */

    /**
     * One collection's payment receipt. $allocations rows carry
     * installment_no, due_date, principal_alloc, fine_alloc (see
     * CollectionController::show()).
     */
    public static function receipt(array $collection, array $loan, array $customer, array $allocations, array $org): void
    {
        $isSplit = !empty($collection['cash_amount']) || !empty($collection['upi_amount']);
        $total = (float)($collection['total_amount'] ?? ((float)$collection['amount'] + (float)($collection['fine_amount'] ?? 0)));

        $rows = '';
        foreach ($allocations as $a) {
            $rows .= '<tr>
                <td>' . self::bi('Installment No', 'தவணை எண்') . ': #' . (int)$a['installment_no'] . '</td>
                <td>' . self::bi('Due Date', 'செலுத்த வேண்டிய தேதி') . ': ' . self::date($a['due_date']) . '</td>
                <td class="right">' . self::money($a['principal_alloc']) . '</td>
            </tr>';
        }
        if (!$rows) {
            $rows = '<tr><td colspan="3">' . self::bi('Installment Amount', 'தவணைத் தொகை') . '</td></tr>';
        }

        $splitHtml = '';
        if ($isSplit) {
            $splitHtml = '
            <tr><td>Cash</td><td></td><td class="right">' . self::money($collection['cash_amount'] ?? 0) . '</td></tr>
            <tr><td>UPI</td><td></td><td class="right">' . self::money($collection['upi_amount'] ?? 0) . '</td></tr>';
        }

        $fineRow = (float)($collection['fine_amount'] ?? 0) > 0
            ? '<tr><td colspan="2">' . self::bi('Fine / Charges', 'அபராதம்') . '</td><td class="right">' . self::money($collection['fine_amount']) . '</td></tr>'
            : '';

        $remarksHtml = !empty($collection['remarks'])
            ? '<p style="font-size:11px;color:#475569;"><b>Remarks:</b> ' . htmlspecialchars($collection['remarks']) . '</p>'
            : '';

        $html = '
        <html><head><style>
          body { font-family: dejavusans, sans-serif; font-size: 12px; color:#0f172a; }
          table { border-collapse: collapse; width:100%; }
          td, th { padding: 5px 6px; font-size: 11px; }
          .right { text-align: right; }
          .box { border:1px solid #cbd5e1; border-radius:4px; padding:8px; margin-bottom:10px; background:#f8fafc; }
          .meta td { padding:3px 6px; }
          .paytable th { background:#eef2f7; text-align:left; border-bottom:1px solid #cbd5e1; }
          .paytable td { border-bottom:1px solid #e2e8f0; }
          .total-row td { font-weight:700; font-size:13px; border-top:2px solid #0f172a; }
          .sign td { padding-top: 40px; border-top:1px dashed #94a3b8; font-size:11px; text-align:center; }
        </style></head><body>
        ' . self::orgHeaderHtml($org) . '
        <h2 style="text-align:center;margin:4px 0;">' . self::bi('Payment Receipt', 'பணம் செலுத்திய ரசீது') . '</h2>
        <table class="meta">
          <tr>
            <td width="50%"><b>' . self::bi('Receipt No', 'ரசீது எண்') . ':</b> ' . htmlspecialchars($collection['receipt_no']) . '</td>
            <td width="50%"><b>' . self::bi('Collection Date', 'வசூல் தேதி') . ':</b> ' . self::date($collection['collection_date']) . '</td>
          </tr>
          <tr>
            <td><b>' . self::bi('Loan Code', 'கடன் குறியீடு') . ':</b> ' . htmlspecialchars($loan['code']) . '</td>
            <td><b>' . self::bi('Payment Mode', 'பணம் செலுத்தும் முறை') . ':</b> ' . htmlspecialchars($collection['payment_mode'] ?? '—') . '</td>
          </tr>' . (!empty($collection['bill_no']) ? '
          <tr>
            <td colspan="2"><b>Bill No:</b> ' . htmlspecialchars($collection['bill_no']) . '</td>
          </tr>' : '') . '
        </table>
        <div class="box">
          <b>' . self::bi('Customer Name', 'வாடிக்கையாளர் பெயர்') . ':</b> ' . htmlspecialchars($customer['name'] ?? '') . '<br/>
          Code: ' . htmlspecialchars($customer['customer_code'] ?? '—') . ' | Mobile: ' . htmlspecialchars($customer['mobile'] ?? '—') . '
        </div>
        <table class="paytable">
          <tr><th>' . self::bi('Installment No', 'தவணை எண்') . '</th><th>' . self::bi('Due Date', 'செலுத்த வேண்டிய தேதி') . '</th><th class="right">' . self::bi('Amount Paid', 'செலுத்திய தொகை') . '</th></tr>
          ' . $rows . $splitHtml . $fineRow . '
          <tr class="total-row"><td colspan="2">' . self::bi('Total Amount Received', 'மொத்தம் பெறப்பட்ட தொகை') . '</td><td class="right">' . self::money($total) . '</td></tr>
        </table>
        ' . $remarksHtml . '
        <table style="margin-top:36px;">
          <tr class="sign">
            <td width="50%">' . self::bi('Customer Signature', 'வாடிக்கையாளர் கையொப்பம்') . '</td>
            <td width="50%">' . self::bi('Collected By', 'வசூலித்தவர்') . ': ' . htmlspecialchars($collection['collected_by_name'] ?? 'Staff') . '</td>
          </tr>
        </table>
        </body></html>';

        $mpdf = self::mpdf();
        $mpdf->WriteHTML($html);
        self::stream($mpdf, 'Receipt-' . $collection['receipt_no'] . '.pdf');
    }

    /**
     * ONE installment's complete payment history - used by the Collect
     * form's "Print" / "Download PDF" and by Custom Schedule History's
     * per-row actions. Unlike receipt() (one collection transaction) this
     * shows EVERY transaction ever posted against this single due, each with
     * its own Bill No, date, amount and mode - never merged into one row.
     * Works identically whether the due is still Partial or already
     * Completed (the MAIN statement's completed-only rule does not apply
     * here - that's a different document for a different purpose).
     */
    public static function installmentStatement(array $installment, array $loan, array $customer, array $payments, array $org): void
    {
        $due     = (float) $installment['payable_amount'];
        $paid    = (float) $installment['paid_amount'];
        $balance = (float) $installment['balance_amount'];

        $rows = '';
        foreach ($payments as $n => $p) {
            $rows .= '<tr>
                <td>' . ($n + 1) . '</td>
                <td>' . self::date($p['collection_date']) . '</td>
                <td>' . htmlspecialchars($p['bill_no'] ?: '—') . '</td>
                <td class="right">' . self::money($p['principal_alloc']) . '</td>
                <td>' . htmlspecialchars($p['payment_mode'] ?? '') . '</td>
            </tr>';
        }
        if (!$rows) {
            $rows = '<tr><td colspan="5" style="text-align:center;color:#64748b;">No payments recorded against this installment yet</td></tr>';
        }

        $html = '
        <html><head><style>
          body { font-family: dejavusans, sans-serif; font-size: 12px; color:#0f172a; }
          table { border-collapse: collapse; width:100%; }
          td, th { padding: 5px 6px; font-size: 11px; }
          .right { text-align: right; }
          .box { border:1px solid #cbd5e1; border-radius:4px; padding:8px; margin-bottom:10px; background:#f8fafc; }
          .meta td { padding:3px 6px; }
          .paytable th { background:#eef2f7; text-align:left; border-bottom:1px solid #cbd5e1; }
          .paytable td { border-bottom:1px solid #e2e8f0; }
          .total-row td { font-weight:700; font-size:13px; border-top:2px solid #0f172a; }
        </style></head><body>
        ' . self::orgHeaderHtml($org) . '
        <h2 style="text-align:center;margin:4px 0;">' . self::bi('Installment Payment Statement', 'தவணை கட்டண அறிக்கை') . '</h2>
        <table class="meta">
          <tr>
            <td width="50%"><b>' . self::bi('Customer Name', 'வாடிக்கையாளர் பெயர்') . ':</b> ' . htmlspecialchars($customer['name'] ?? '') . '</td>
            <td width="50%"><b>Customer Code:</b> ' . htmlspecialchars($customer['customer_code'] ?? '—') . '</td>
          </tr>
          <tr>
            <td><b>Mobile:</b> ' . htmlspecialchars($customer['mobile'] ?? '—') . '</td>
            <td><b>' . self::bi('Loan Code', 'கடன் குறியீடு') . ':</b> ' . htmlspecialchars($loan['code'] ?? '') . '</td>
          </tr>
        </table>
        <div class="box">
          <b>' . self::bi('Installment No', 'தவணை எண்') . ':</b> #' . (int) $installment['installment_no'] . ' &nbsp; | &nbsp;
          <b>' . self::bi('Due Date', 'செலுத்த வேண்டிய தேதி') . ':</b> ' . self::date($installment['due_date']) . '<br/>
          <b>Amount Due:</b> ' . self::money($due) . ' &nbsp; | &nbsp;
          <b>Total Paid:</b> ' . self::money($paid) . ' &nbsp; | &nbsp;
          <b>Remaining:</b> ' . self::money($balance) . ' &nbsp; | &nbsp;
          <b>Status:</b> ' . htmlspecialchars($installment['status']) . '
        </div>
        <h3 style="font-size:13px;color:#0d3878;">' . self::bi('Payment History', 'கட்டண வரலாறு') . '</h3>
        <table class="paytable">
          <tr><th>#</th><th>Date</th><th>Bill No</th><th class="right">Amount Paid</th><th>Payment Mode</th></tr>
          ' . $rows . '
          <tr class="total-row"><td colspan="3">' . self::bi('Total Paid', 'மொத்தம் செலுத்தியது') . '</td><td class="right">' . self::money($paid) . '</td><td></td></tr>
        </table>
        </body></html>';

        $mpdf = self::mpdf();
        $mpdf->WriteHTML($html);
        self::stream($mpdf, 'Installment-' . ($loan['code'] ?? '') . '-' . (int) $installment['installment_no'] . '.pdf');
    }

    /**
     * Full chit statement of account: chit/customer summary, installment
     * schedule and collection/disbursement history.
     *
     * MAIN STATEMENT RULE: only FULLY PAID (status = COMPLETED) installments
     * are shown - `$installments` must already be pre-filtered by the caller;
     * a partial or untouched PENDING due is never passed in here (its payment
     * history belongs to the per-installment statement instead - see
     * installmentStatement() below). `$paymentsByInstallment` (installment_id
     * => CollectionService::installmentPayments() rows) renders each
     * qualifying installment's own payment-by-payment history (date, bill no, amount)
     * directly under it.
     */
    public static function statement(array $loan, array $customer, array $installments, array $collections, array $distributions, array $org, array $paymentsByInstallment = []): void
    {
        $instRows = '';
        foreach ($installments as $i) {
            $instRows .= '<tr>
                <td>#' . (int)$i['installment_no'] . '</td>
                <td>' . self::date($i['due_date']) . '</td>
                <td class="right">' . self::money($i['payable_amount']) . '</td>
                <td class="right">' . self::money($i['paid_amount']) . '</td>
                <td class="right">' . self::money($i['balance_amount']) . '</td>
                <td>' . self::date($i['last_paid_date'] ?? null) . '</td>
                <td>' . htmlspecialchars($i['status']) . '</td>
            </tr>';
            $payments = $paymentsByInstallment[$i['id']] ?? [];
            if ($payments) {
                $payRows = '';
                foreach ($payments as $p) {
                    $payRows .= '<tr>
                        <td>' . self::date($p['collection_date']) . '</td>
                        <td>Bill No: ' . htmlspecialchars($p['bill_no'] ?: '—') . '</td>
                        <td class="right">' . self::money($p['principal_alloc']) . '</td>
                    </tr>';
                }
                $instRows .= '<tr><td colspan="7" style="padding:2px 6px 8px 24px;background:#fafafa;">
                    <div style="font-size:9px;font-weight:700;color:#64748b;margin-bottom:2px;">' .
                        self::bi('Payment History', 'கட்டண வரலாறு') . '</div>
                    <table style="width:100%;"><tbody>' . $payRows . '</tbody></table>
                </td></tr>';
            }
        }
        if (!$instRows) {
            $instRows = '<tr><td colspan="7" style="text-align:center;color:#64748b;">No fully completed installments yet</td></tr>';
        }

        $colRows = '';
        foreach ($collections as $c) {
            $status = ($c['status'] ?? '') === 'posted' ? 'COMPLETED' : strtoupper($c['status'] ?? '');
            $insts = $c['installment_labels'] ?? '';
            $total = (float)($c['total_amount'] ?? ((float)$c['amount'] + (float)($c['fine_amount'] ?? 0)));
            $colRows .= '<tr>
                <td>' . self::date($c['collection_date']) . '</td>
                <td>' . htmlspecialchars($insts) . '</td>
                <td>' . htmlspecialchars($c['bill_no'] ?? '') . '</td>
                <td class="right">' . self::money($total) . '</td>
                <td>' . htmlspecialchars($c['payment_mode'] ?? '') . '</td>
                <td>' . htmlspecialchars($c['collected_by_name'] ?? '') . '</td>
                <td>' . $status . '</td>
            </tr>';
        }
        if (!$colRows) {
            $colRows = '<tr><td colspan="7" style="text-align:center;color:#64748b;">No collections recorded yet</td></tr>';
        }

        $distRows = '';
        foreach ($distributions as $d) {
            $distRows .= '<tr>
                <td>' . self::date($d['distributed_date']) . '</td>
                <td class="right">' . self::money($d['amount']) . '</td>
                <td>' . htmlspecialchars($d['account_name'] ?? '') . '</td>
                <td>' . htmlspecialchars($d['status']) . '</td>
            </tr>';
        }
        if (!$distRows) {
            $distRows = '<tr><td colspan="4" style="text-align:center;color:#64748b;">No disbursements recorded yet</td></tr>';
        }

        $html = '
        <html><head><style>
          body { font-family: dejavusans, sans-serif; font-size: 11px; color:#0f172a; }
          table { border-collapse: collapse; width:100%; margin-bottom: 12px; }
          td, th { padding: 4px 6px; font-size: 10px; }
          .right { text-align: right; }
          .box { border:1px solid #cbd5e1; border-radius:4px; padding:8px; margin-bottom:10px; background:#f8fafc; }
          .meta td { padding:3px 6px; }
          h3 { font-size:13px; margin: 10px 0 4px; color:#0d3878; }
          table.data th { background:#eef2f7; text-align:left; border-bottom:1px solid #cbd5e1; }
          table.data td { border-bottom:1px solid #e2e8f0; }
        </style></head><body>
        ' . self::orgHeaderHtml($org) . '
        <h2 style="text-align:center;margin:4px 0;">' . self::bi('Chit Statement of Account', 'சிட் கணக்கு அறிக்கை') . '</h2>
        <p style="text-align:center;font-size:10px;color:#64748b;">Generated on ' . date('d/m/Y') . '</p>
        <table class="meta">
          <tr>
            <td width="50%"><b>' . self::bi('Customer Name', 'வாடிக்கையாளர் பெயர்') . ':</b> ' . htmlspecialchars($customer['name'] ?? '') . ' (' . htmlspecialchars($customer['customer_code'] ?? '') . ')</td>
            <td width="50%"><b>Mobile:</b> ' . htmlspecialchars($customer['mobile'] ?? '—') . '</td>
          </tr>
          <tr>
            <td><b>' . self::bi('Loan Code', 'கடன் குறியீடு') . ':</b> ' . htmlspecialchars($loan['code']) . ' (' . htmlspecialchars($loan['frequency'] ?? '') . ')</td>
            <td><b>Status:</b> ' . strtoupper($loan['status'] ?? '') . '</td>
          </tr>
          <tr>
            <td><b>Total Chit Amount:</b> ' . self::money($loan['principal_amount']) . '</td>
            <td><b>Installment Amount:</b> ' . self::money($loan['installment_amount']) . '</td>
          </tr>
          <tr>
            <td><b>Tenure:</b> ' . (int)$loan['tenure'] . '</td>
            <td><b>Start Date:</b> ' . self::date($loan['start_date']) . '</td>
          </tr>
        </table>
        <div class="box">
          <b>Total Paid:</b> ' . self::money($loan['summary']['collected_principal'] ?? 0) . ' &nbsp; | &nbsp;
          <b>Outstanding Balance:</b> ' . self::money($loan['summary']['outstanding_balance'] ?? 0) . ' &nbsp; | &nbsp;
          <b>Disbursed:</b> ' . self::money($loan['distribution']['total_distributed'] ?? 0) . '
        </div>
        <h3>' . self::bi('Installment Schedule', 'தவணை அட்டவணை') . '
          <span style="font-size:9px;font-weight:400;color:#64748b;">(fully completed dues only)</span></h3>
        <table class="data">
          <tr>
            <th>#</th><th>' . self::bi('Due Date', 'தேதி') . '</th>
            <th class="right">' . self::bi('Amount Due', 'தொகை') . '</th>
            <th class="right">' . self::bi('Amount Paid', 'செலுத்தியது') . '</th>
            <th class="right">Balance</th><th>Paid Date</th><th>Status</th>
          </tr>
          ' . $instRows . '
        </table>
        <h3>Collection History</h3>
        <table class="data">
          <tr><th>Date</th><th>Installment #</th><th>Bill No</th><th class="right">Total Received</th><th>Payment Mode</th><th>Collected By</th><th>Status</th></tr>
          ' . $colRows . '
        </table>
        <h3>Disbursement History</h3>
        <table class="data">
          <tr><th>Date</th><th class="right">Amount</th><th>Account</th><th>Status</th></tr>
          ' . $distRows . '
        </table>
        <table style="margin-top:24px;">
          <tr>
            <td width="50%" style="padding-top:36px;border-top:1px dashed #94a3b8;text-align:center;font-size:10px;">Customer Signature</td>
            <td width="50%" style="padding-top:36px;border-top:1px dashed #94a3b8;text-align:center;font-size:10px;">Authorized Signature</td>
          </tr>
        </table>
        </body></html>';

        $mpdf = self::mpdf();
        $mpdf->WriteHTML($html);
        self::stream($mpdf, 'Statement-' . $loan['code'] . '.pdf');
    }

    /**
     * Generic report PDF - works for ANY report in the catalogue and ANY
     * filter combination (all customers/all chits, one customer, one chit,
     * customer+chit, etc.) since it just renders whatever headers/rows/totals
     * ReportController::build() already computed - the exact same backend
     * data the JSON and Excel endpoints use. Money/number/date columns are
     * formatted per $colTypes, same convention as the Excel export.
     *
     * NIL RULE: when $rows is empty, the table is replaced with a clear
     * "NIL / No Data Available" notice instead of an empty or malformed
     * table - never a blank/broken PDF.
     */
    public static function report(string $title, array $headers, array $colTypes, array $rows, array $totals, array $filterLines, array $org): void
    {
        $filterHtml = '';
        foreach ($filterLines as $label => $val) {
            if ($val === null || $val === '') {
                continue;
            }
            $filterHtml .= ($filterHtml ? ' &nbsp;|&nbsp; ' : '') . '<b>' . htmlspecialchars($label) . ':</b> ' . htmlspecialchars((string) $val);
        }

        $fmtCell = function ($type, $val) {
            if ($val === null || $val === '') {
                return '—';
            }
            if ($type === 'money') {
                return self::money($val);
            }
            if ($type === 'date') {
                return self::date($val);
            }
            if ($type === 'number') {
                return number_format((float) $val);
            }
            return htmlspecialchars((string) $val);
        };

        $headHtml = '<tr>' . implode('', array_map(fn ($h) => '<th' . ((($colTypes[$h] ?? '') === 'money' || ($colTypes[$h] ?? '') === 'number') ? ' class="right"' : '') . '>' . htmlspecialchars($h) . '</th>', $headers)) . '</tr>';

        $bodyHtml = '';
        foreach ($rows as $idx => $row) {
            $bg = ($idx % 2 === 1) ? ' style="background:#f8fafc;"' : '';
            $bodyHtml .= '<tr' . $bg . '>';
            foreach ($headers as $h) {
                $type = $colTypes[$h] ?? 'text';
                $right = ($type === 'money' || $type === 'number') ? ' class="right"' : '';
                $bodyHtml .= '<td' . $right . '>' . $fmtCell($type, $row[$h] ?? null) . '</td>';
            }
            $bodyHtml .= '</tr>';
        }

        $totalsHtml = '';
        if ($totals) {
            $totalsHtml = '<tr class="total-row">';
            foreach ($headers as $h) {
                $type = $colTypes[$h] ?? 'text';
                $right = ($type === 'money' || $type === 'number') ? ' class="right"' : '';
                $val = array_key_exists($h, $totals) ? $totals[$h] : '';
                $totalsHtml .= '<td' . $right . '>' . (is_numeric($val) ? $fmtCell($type, $val) : htmlspecialchars((string) $val)) . '</td>';
            }
            $totalsHtml .= '</tr>';
        }

        $bodyOrNil = $rows
            ? '<table class="data"><thead>' . $headHtml . '</thead><tbody>' . $bodyHtml . '</tbody>' . ($totalsHtml ? '<tfoot>' . $totalsHtml . '</tfoot>' : '') . '</table>'
            : '<div class="nil-box">' . self::bi('NIL — No Data Available', 'தரவு இல்லை') . '<div style="font-size:11px;font-weight:400;margin-top:4px;color:#94a3b8;">No records match the selected filters.</div></div>';

        $html = '
        <html><head><style>
          body { font-family: dejavusans, sans-serif; font-size: 11px; color:#0f172a; }
          table { border-collapse: collapse; width:100%; margin-bottom: 12px; }
          td, th { padding: 6px 8px; font-size: 10px; border:1px solid #cbd5e1; }
          .right { text-align: right; }
          .box { border:1px solid #cbd5e1; border-radius:4px; padding:8px 12px; margin-bottom:12px; background:#f8fafc; font-size:11px; }
          h2.report-title { text-align:center; font-size:16px; margin:6px 0 2px; color:#0d3878; font-weight:700; text-transform:uppercase; letter-spacing:0.5px; }
          .gen-date { text-align:center; font-size:10px; color:#64748b; margin-bottom:12px; }
          table.data th { background:#0d3878; color:#ffffff; font-weight:700; text-align:left; border:1px solid #092a5c; padding:7px 8px; }
          table.data th.right { text-align:right; }
          table.data td { border:1px solid #e2e8f0; font-size:10px; }
          .total-row td { font-weight:700; border-top:2px solid #0d3878; background:#eef2f7; color:#0f172a; font-size:10px; }
          .nil-box { text-align:center; padding:40px 10px; font-size:16px; font-weight:700; color:#64748b; border:1px dashed #cbd5e1; border-radius:8px; }
          .sign-table { margin-top:30px; border:none; }
          .sign-table td { border:none; padding-top:36px; text-align:center; font-size:10px; color:#475569; }
          .sign-line { border-top:1px dashed #94a3b8; width:70%; margin:0 auto; padding-top:4px; }
        </style></head><body>
        ' . self::orgHeaderHtml($org) . '
        <h2 class="report-title">' . htmlspecialchars($title) . '</h2>
        <div class="gen-date">Generated on ' . date('d/m/Y H:i') . '</div>
        ' . ($filterHtml ? '<div class="box"><b>Report Filters:</b> &nbsp;' . $filterHtml . '</div>' : '') . '
        ' . $bodyOrNil . '
        <table class="sign-table">
          <tr>
            <td width="50%"><div class="sign-line">Prepared By</div></td>
            <td width="50%"><div class="sign-line">Authorized Signature</div></td>
          </tr>
        </table>
        </body></html>';

        $format = count($headers) > 6 ? 'A4-L' : 'A4';
        $mpdf = self::mpdf($format);
        $mpdf->WriteHTML($html);
        self::stream($mpdf, preg_replace('/[^A-Za-z0-9_-]+/', '_', $title) . '_' . date('Ymd_His') . '.pdf');
    }
}
