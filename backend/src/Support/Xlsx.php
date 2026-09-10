<?php
namespace App\Support;

/**
 * Minimal, dependency-free .xlsx (Office Open XML) writer.
 *
 * Produces a REAL Excel workbook (not a renamed CSV): one OR MANY worksheets,
 * a company/title banner, bold + shaded header row with thin borders, numbers
 * stored as numbers, currency cells formatted as currency, dates as real Excel
 * dates, sensible column widths, a frozen header row, an auto-filter and an
 * optional bold TOTAL row.
 *
 * Uses ext-zip's ZipArchive when available, otherwise falls back to a tiny
 * pure-PHP "stored" (uncompressed) ZIP builder — both yield a spec-valid xlsx.
 */
final class Xlsx
{
    /* Cell style indexes (see styles() below).
       0 default | 1 bold header | 2 date | 3 number | 4 money
       5 total-label (bold, top border) | 6 total-number | 7 total-money
       8 banner title (bold, large) | 9 banner sub */
    private const S_DEFAULT = 0, S_HEAD = 1, S_DATE = 2, S_NUM = 3, S_MONEY = 4;
    private const S_TLABEL = 5, S_TNUM = 6, S_TMONEY = 7, S_TITLE = 8, S_SUB = 9;

    /**
     * Backward-compatible single-sheet export.
     *
     * @param string   $filename            download name ending in .xlsx
     * @param string[] $headers              column headers
     * @param iterable $rows                 each row = ordered array of scalar values
     * @param array<int,array> $summary      optional leading label/value lines (banner)
     * @param array<int,string> $colTypes    per-column hint: 'number'|'money'|'date'|'text'
     */
    public static function stream(string $filename, array $headers, iterable $rows, array $summary = [], array $colTypes = []): void
    {
        $rows = is_array($rows) ? $rows : iterator_to_array($rows);
        $banner = [];
        foreach ($summary as $line) {
            $banner[] = is_array($line) ? implode('  ', array_map('strval', $line)) : (string) $line;
        }
        self::download($filename, [[
            'name'       => 'Data',
            'subtitle'   => $banner,
            'headers'    => $headers,
            'rows'       => $rows,
            'colTypes'   => $colTypes,
        ]]);
    }

    /**
     * Multi-sheet workbook.
     *
     * @param array<int,array{
     *   name:string, title?:string, subtitle?:string[], headers:string[],
     *   rows:iterable, colTypes?:array<int,string>, totals?:array<string,mixed>
     * }> $sheets
     */
    public static function book(string $filename, array $sheets): void
    {
        self::download($filename, $sheets);
    }

    /* ------------------------------------------------------------------ core */

    private static function download(string $filename, array $sheets): void
    {
        while (ob_get_level() > 0) {
            ob_end_clean();
        }
        if (!$sheets) {
            $sheets = [['name' => 'Data', 'headers' => [], 'rows' => []]];
        }

        $used = [];
        $sheetParts = [];
        $sheetEntries = [];
        $ctOverrides = [];
        $wbRels = [];

        foreach (array_values($sheets) as $idx => $sheet) {
            $n = $idx + 1;
            $safeName = self::sheetName($sheet['name'] ?? "Sheet$n", $used);
            [$xml, $widths, $frozenRow, $dataRows, $colCount] = self::buildSheet($sheet);
            $sheetParts["xl/worksheets/sheet$n.xml"] = self::sheetWrap($xml, $widths, $frozenRow, $dataRows, $colCount);
            $sheetEntries[] = "<sheet name=\"" . self::xml($safeName) . "\" sheetId=\"$n\" r:id=\"rId$n\"/>";
            $ctOverrides[] = "<Override PartName=\"/xl/worksheets/sheet$n.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml\"/>";
            $wbRels[] = "<Relationship Id=\"rId$n\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet\" Target=\"worksheets/sheet$n.xml\"/>";
        }
        $stylesRid = count($sheets) + 1;
        $wbRels[] = "<Relationship Id=\"rId$stylesRid\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles\" Target=\"styles.xml\"/>";

        $files = [
            '[Content_Types].xml' => self::contentTypes($ctOverrides),
            '_rels/.rels' => self::rootRels(),
            'xl/workbook.xml' => self::workbook($sheetEntries),
            'xl/_rels/workbook.xml.rels' => self::rels($wbRels),
            'xl/styles.xml' => self::styles(),
        ] + $sheetParts;

        $binary = self::zip($files);

        header('Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        header('Content-Disposition: attachment; filename="' . preg_replace('/[^\w.\- ]/', '', $filename) . '"');
        header('Content-Length: ' . strlen($binary));
        header('Cache-Control: no-store');
        echo $binary;
        exit;
    }

    /**
     * @return array{0:string,1:array<int,float>,2:int,3:int,4:int}
     *         [rowsXml, widths, frozenHeaderRowIndex, dataRowCount, colCount]
     */
    private static function buildSheet(array $sheet): array
    {
        $headers  = array_values($sheet['headers'] ?? []);
        $rows     = $sheet['rows'] ?? [];
        $rows     = is_array($rows) ? $rows : iterator_to_array($rows);
        $colTypes = $sheet['colTypes'] ?? [];
        $totals   = $sheet['totals'] ?? null;
        $title    = $sheet['title'] ?? null;
        $subtitle = $sheet['subtitle'] ?? [];

        $colCount = max(1, count($headers));
        $widths = array_fill(0, $colCount, 12);
        $out = [];
        $r = 0;

        if ($title !== null && $title !== '') {
            $r++;
            $out[] = "<row r=\"$r\">" . self::cell(0, $r, $title, 'text', self::S_TITLE) . "</row>";
        }
        foreach ((array) $subtitle as $line) {
            if ($line === '' || $line === null) { continue; }
            $r++;
            $out[] = "<row r=\"$r\">" . self::cell(0, $r, (string) $line, 'text', self::S_SUB) . "</row>";
        }
        if ($r > 0) {
            $r++;
            $out[] = "<row r=\"$r\"></row>";
        }

        // header row
        $r++;
        $frozenRow = $r;
        $cells = '';
        foreach ($headers as $c => $h) {
            $cells .= self::cell($c, $r, (string) $h, 'text', self::S_HEAD);
            $widths[$c] = max($widths[$c] ?? 10, min(46, mb_strlen((string) $h) + 4));
        }
        $out[] = "<row r=\"$r\">$cells</row>";

        $dataRows = 0;
        foreach ($rows as $row) {
            $r++; $dataRows++;
            $cells = '';
            $c = 0;
            foreach (array_values($row) as $v) {
                $type = $colTypes[$c] ?? self::guessType($v);
                $cells .= self::cell($c, $r, $v, $type, self::styleFor($type, false));
                $widths[$c] = max($widths[$c] ?? 10, min(46, mb_strlen(self::plain($v)) + 2));
                $c++;
            }
            $out[] = "<row r=\"$r\">$cells</row>";
        }

        if (is_array($totals) && $totals) {
            $r++;
            $cells = '';
            foreach ($headers as $c => $h) {
                if (!array_key_exists($h, $totals)) {
                    $cells .= self::cell($c, $r, '', 'text', self::S_TLABEL);
                    continue;
                }
                $v = $totals[$h];
                if (is_numeric($v)) {
                    $type = ($colTypes[$c] ?? '') === 'number' ? 'number' : 'money';
                    $cells .= self::cell($c, $r, $v, $type, $type === 'number' ? self::S_TNUM : self::S_TMONEY);
                } else {
                    $cells .= self::cell($c, $r, (string) $v, 'text', self::S_TLABEL);
                }
            }
            $out[] = "<row r=\"$r\">$cells</row>";
        }

        return [implode('', $out), $widths, $frozenRow, $dataRows, $colCount];
    }

    private static function styleFor(string $type, bool $head): int
    {
        return match ($type) {
            'money'  => self::S_MONEY,
            'number' => self::S_NUM,
            'date'   => self::S_DATE,
            default  => self::S_DEFAULT,
        };
    }

    private static function guessType($v): string
    {
        if ($v === null || $v === '') return 'text';
        if (is_int($v) || is_float($v)) return 'number';
        if (is_string($v) && preg_match('/^-?\d{1,15}(\.\d{1,6})?$/', $v)) return 'number';
        if (is_string($v) && preg_match('/^\d{4}-\d{2}-\d{2}$/', $v)) return 'date';
        return 'text';
    }

    private static function plain($v): string
    {
        return $v === null ? '' : (string) $v;
    }

    private static function cell(int $col, int $row, $v, string $type, int $style): string
    {
        $ref = self::colLetter($col) . $row;
        $s = $style ? " s=\"$style\"" : '';
        if ($v === null || $v === '') {
            return "<c r=\"$ref\"$s/>";
        }
        if ($type === 'number' || $type === 'money') {
            $num = is_string($v) ? $v : (string) $v;
            if (!is_numeric($num)) {
                return "<c r=\"$ref\"$s t=\"inlineStr\"><is><t xml:space=\"preserve\">" . self::xml((string) $v) . "</t></is></c>";
            }
            return "<c r=\"$ref\"$s><v>" . self::xml($num) . "</v></c>";
        }
        if ($type === 'date') {
            $serial = self::excelDate((string) $v);
            if ($serial !== null) {
                return "<c r=\"$ref\" s=\"" . self::S_DATE . "\"><v>$serial</v></c>";
            }
        }
        return "<c r=\"$ref\"$s t=\"inlineStr\"><is><t xml:space=\"preserve\">" . self::xml((string) $v) . "</t></is></c>";
    }

    private static function xml(string $s): string
    {
        return htmlspecialchars($s, ENT_XML1 | ENT_QUOTES);
    }

    private static function excelDate(string $ymd): ?int
    {
        if (!preg_match('/^(\d{4})-(\d{2})-(\d{2})/', $ymd, $m)) return null;
        $days = gregoriantojd((int) $m[2], (int) $m[3], (int) $m[1]) - gregoriantojd(12, 30, 1899);
        return $days > 0 ? $days : null;
    }

    private static function colLetter(int $i): string
    {
        $s = '';
        $i++;
        while ($i > 0) {
            $mod = ($i - 1) % 26;
            $s = chr(65 + $mod) . $s;
            $i = intdiv($i - 1, 26);
        }
        return $s;
    }

    private static function sheetName(string $name, array &$used): string
    {
        $name = preg_replace('/[\\\\\/\?\*\[\]:]/', ' ', trim($name)) ?: 'Sheet';
        $name = mb_substr($name, 0, 31);
        $base = $name; $i = 2;
        while (isset($used[mb_strtolower($name)])) {
            $name = mb_substr($base, 0, 28) . '_' . $i++;
        }
        $used[mb_strtolower($name)] = true;
        return $name;
    }

    private static function sheetWrap(string $rowsXml, array $widths, int $frozenRow, int $dataRows, int $colCount): string
    {
        $cols = '';
        foreach (array_values($widths) as $i => $w) {
            $n = $i + 1;
            $cols .= "<col min=\"$n\" max=\"$n\" width=\"" . round($w, 1) . "\" customWidth=\"1\"/>";
        }
        // freeze everything above the first data row
        $topLeft = 'A' . ($frozenRow + 1);
        $pane = "<sheetView workbookViewId=\"0\"><pane ySplit=\"$frozenRow\" topLeftCell=\"$topLeft\" activePane=\"bottomLeft\" state=\"frozen\"/>"
              . "<selection pane=\"bottomLeft\" activeCell=\"$topLeft\" sqref=\"$topLeft\"/></sheetView>";
        // auto-filter over the header + data block
        $filter = '';
        if ($colCount > 0 && $dataRows > 0) {
            $ref = 'A' . $frozenRow . ':' . self::colLetter($colCount - 1) . ($frozenRow + $dataRows);
            $filter = "<autoFilter ref=\"$ref\"/>";
        }
        return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            . '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
            . "<sheetViews>$pane</sheetViews>"
            . "<cols>$cols</cols><sheetData>$rowsXml</sheetData>$filter</worksheet>";
    }

    /* ------------------------------------------------------------ boilerplate */

    private static function contentTypes(array $overrides): string
    {
        return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            . '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
            . '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
            . '<Default Extension="xml" ContentType="application/xml"/>'
            . '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
            . '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
            . implode('', $overrides)
            . '</Types>';
    }

    private static function rootRels(): string
    {
        return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            . '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            . '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
            . '</Relationships>';
    }

    private static function workbook(array $sheetEntries): string
    {
        return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            . '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
            . 'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
            . '<sheets>' . implode('', $sheetEntries) . '</sheets></workbook>';
    }

    private static function rels(array $rels): string
    {
        return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            . '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            . implode('', $rels) . '</Relationships>';
    }

    private static function styles(): string
    {
        // numFmt 164 = #,##0.00 (currency-style, no symbol so it stays language-neutral)
        return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            . '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
            . '<numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0.00"/></numFmts>'
            . '<fonts count="4">'
            . '<font><sz val="11"/><name val="Calibri"/></font>'                      // 0 normal
            . '<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>' // 1 bold white (header)
            . '<font><b/><sz val="11"/><name val="Calibri"/></font>'                  // 2 bold
            . '<font><b/><sz val="14"/><name val="Calibri"/></font>'                  // 3 bold large (title)
            . '</fonts>'
            . '<fills count="4">'
            . '<fill><patternFill patternType="none"/></fill>'                        // 0
            . '<fill><patternFill patternType="gray125"/></fill>'                     // 1 (reserved)
            . '<fill><patternFill patternType="solid"><fgColor rgb="FF1E293B"/></patternFill></fill>' // 2 header slate
            . '<fill><patternFill patternType="solid"><fgColor rgb="FFF1F5F9"/></patternFill></fill>' // 3 total light
            . '</fills>'
            . '<borders count="3">'
            . '<border><left/><right/><top/><bottom/><diagonal/></border>'            // 0 none
            . '<border><left style="thin"><color rgb="FFCBD5E1"/></left><right style="thin"><color rgb="FFCBD5E1"/></right>'
            . '<top style="thin"><color rgb="FFCBD5E1"/></top><bottom style="thin"><color rgb="FFCBD5E1"/></bottom></border>' // 1 thin box
            . '<border><left/><right/><top style="medium"><color rgb="FF64748B"/></top><bottom/></border>' // 2 total top
            . '</borders>'
            . '<cellStyleXfs count="1"><xf/></cellStyleXfs>'
            . '<cellXfs count="10">'
            . '<xf xfId="0"/>'                                                                                   // 0 default
            . '<xf xfId="0" fontId="1" fillId="2" borderId="1" applyFont="1" applyFill="1" applyBorder="1"><alignment vertical="center"/></xf>' // 1 header
            . '<xf xfId="0" numFmtId="14" borderId="1" applyNumberFormat="1" applyBorder="1"/>'                    // 2 date
            . '<xf xfId="0" borderId="1" applyBorder="1"/>'                                                        // 3 number
            . '<xf xfId="0" numFmtId="164" borderId="1" applyNumberFormat="1" applyBorder="1"/>'                   // 4 money
            . '<xf xfId="0" fontId="2" fillId="3" borderId="2" applyFont="1" applyFill="1" applyBorder="1"/>'      // 5 total label
            . '<xf xfId="0" fontId="2" fillId="3" borderId="2" applyFont="1" applyFill="1" applyBorder="1"/>'      // 6 total number
            . '<xf xfId="0" fontId="2" fillId="3" borderId="2" numFmtId="164" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"/>' // 7 total money
            . '<xf xfId="0" fontId="3" applyFont="1"/>'                                                            // 8 title
            . '<xf xfId="0" fontId="2" applyFont="1"/>'                                                            // 9 subtitle
            . '</cellXfs></styleSheet>';
    }

    /* ------------------------------------------------------------------- zip */

    private static function zip(array $files): string
    {
        if (class_exists('ZipArchive')) {
            $tmp = tempnam(sys_get_temp_dir(), 'xlsx');
            $z = new \ZipArchive();
            $z->open($tmp, \ZipArchive::OVERWRITE);
            foreach ($files as $name => $content) {
                $z->addFromString($name, $content);
            }
            $z->close();
            $data = file_get_contents($tmp);
            @unlink($tmp);
            return $data;
        }
        return self::storedZip($files);
    }

    /** Pure-PHP ZIP with the "stored" (no compression) method. */
    private static function storedZip(array $files): string
    {
        $local = '';
        $central = '';
        $offset = 0;
        foreach ($files as $name => $content) {
            $crc = crc32($content);
            $len = strlen($content);
            $nameLen = strlen($name);

            $lf = "\x50\x4b\x03\x04" . pack('v', 20) . pack('v', 0) . pack('v', 0)
                . pack('v', 0) . pack('v', 0)
                . pack('V', $crc) . pack('V', $len) . pack('V', $len)
                . pack('v', $nameLen) . pack('v', 0) . $name . $content;
            $local .= $lf;

            $central .= "\x50\x4b\x01\x02" . pack('v', 20) . pack('v', 20) . pack('v', 0)
                . pack('v', 0) . pack('v', 0) . pack('v', 0)
                . pack('V', $crc) . pack('V', $len) . pack('V', $len)
                . pack('v', $nameLen) . pack('v', 0) . pack('v', 0)
                . pack('v', 0) . pack('v', 0) . pack('V', 0)
                . pack('V', $offset) . $name;

            $offset += strlen($lf);
        }
        $eocd = "\x50\x4b\x05\x06" . pack('v', 0) . pack('v', 0)
            . pack('v', count($files)) . pack('v', count($files))
            . pack('V', strlen($central)) . pack('V', strlen($local)) . pack('v', 0);

        return $local . $central . $eocd;
    }
}
