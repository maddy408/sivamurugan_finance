// Reports module: dynamic data, filters, running totals, role scope, real .xlsx.
// Run after: php backend/setup.php install
const B = process.env.API_BASE || 'http://localhost/siva-murugan-chit-fund/backend/public';
let pass = 0, fail = 0;
const ok = (c, m) => { c ? (pass++, console.log('  PASS ' + m)) : (fail++, console.log('  FAIL ' + m)); };
const call = async (method, path, opts = {}) => {
  const { token, body } = opts;
  const h = { 'Content-Type': 'application/json' };
  if (token) h.Authorization = 'Bearer ' + token;
  const r = await fetch(B + path, { method, headers: h, body: body ? JSON.stringify(body) : undefined });
  let j = null; try { j = await r.json(); } catch (e) {}
  return { status: r.status, j };
};
const raw = async (path, token) => {
  const r = await fetch(B + path, { headers: token ? { Authorization: 'Bearer ' + token } : {} });
  const buf = Buffer.from(await r.arrayBuffer());
  return { status: r.status, ct: r.headers.get('content-type') || '', buf };
};
const D = (v) => Number(v).toFixed(2);
const rowsOf = (rep, colWanted) => rep.rows.map((x) => x[colWanted]);

// verify a downloaded .xlsx by unzipping it with PHP and dumping part contents
import { writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const PHP = process.env.PHP || 'C:/xampp/php/php.exe';
const xlsxParts = (buf) => {
  const tmp = process.env.TEMP + '/rep_' + Date.now() + '_' + Math.random().toString(36).slice(2) + '.xlsx';
  writeFileSync(tmp, buf);
  const out = execFileSync(PHP, ['-r', `
    $z = new ZipArchive; $z->open($argv[1]);
    $names = []; for ($i=0;$i<$z->numFiles;$i++) $names[] = $z->getNameIndex($i);
    echo json_encode([
      "names" => $names,
      "workbook" => $z->getFromName("xl/workbook.xml"),
      "styles" => $z->getFromName("xl/styles.xml"),
      "sheet1" => $z->getFromName("xl/worksheets/sheet1.xml"),
    ]);
  `, tmp]);
  return JSON.parse(out.toString());
};

const run = async () => {
  const AT = (await call('POST', '/api/auth/login', { body: { username: 'admin', password: 'Admin@123' } })).j.data.token;
  await call('PUT', '/api/settings/accounts/1', { token: AT, body: { opening_balance: 500000 } });

  // seed only has 2 customers; add a 3rd (location 3 = Srirangam) for the July chit
  const C3 = (await call('POST', '/api/customers', { token: AT, body: {
    name: 'Kamaraj Test', mobile: '9998887770', location: 'Srirangam',
  } })).j.data;

  const MONTH = '2026-05';
  const mk = async (cid, amt, emi, tenure, start, dist) => {
    const c = (await call('POST', '/api/loans', { token: AT, body: {
      customer_id: cid, account_type: 'chit', principal_amount: amt, installment_amount: emi,
      tenure, frequency: 'weekly', start_date: start, schedule_type: 'WEEKLY',
      distribution: dist ? { amount: dist.amount, account_id: 1, distributed_date: start, new_emi_amount: dist.new_emi || '' } : undefined,
    } })).j.data;
    return c;
  };
  // Chit A: full distribution, will be CLOSED. Chit B: partial. Chit C: none, different month.
  const A = await mk(1, 20000, 4000, 5, MONTH + '-04', { amount: 20000, new_emi: 4000 });
  const Bc = await mk(2, 30000, 3000, 10, MONTH + '-10', { amount: 12000 });
  const Cc = await mk(C3.id, 15000, 1500, 10, '2026-07-01', null);

  const insts = (id) => call('GET', '/api/loans/' + id, { token: AT }).then((r) => r.j.data.installments);

  // ---- collections ----
  // Chit A: pay ALL 5 dues -> chit becomes completed/closed inside MONTH
  let ia = await insts(A.id);
  const rA = await call('POST', '/api/collections', { token: AT, body: {
    installment_ids: ia.map((x) => x.id), collection_date: MONTH + '-20',
    amount: 20000, fine_amount: 500, payment_mode_id: 1, account_id: 1, idempotency_key: 'rep-A-' + Date.now(),
  } });
  ok(rA.status === 201, 'chit A: multi-due collect all -> 201');
  const closedLoan = (await call('GET', '/api/loans/' + A.id, { token: AT })).j.data;
  ok(closedLoan.status === 'completed', 'chit A now status=completed (real closure)');

  // Chit B: pay 2 dues + a fine, then a 3rd that we CANCEL
  let ib = await insts(Bc.id);
  await call('POST', '/api/collections', { token: AT, body: {
    installment_ids: [ib[0].id, ib[1].id], collection_date: MONTH + '-12',
    amount: 6000, fine_amount: 100, payment_mode_id: 1, account_id: 1, idempotency_key: 'rep-B1-' + Date.now(),
  } });
  const rBc = await call('POST', '/api/collections', { token: AT, body: {
    installment_id: ib[2].id, collection_date: MONTH + '-13',
    amount: 3000, payment_mode_id: 1, account_id: 1, idempotency_key: 'rep-B2-' + Date.now(),
  } });
  await call('POST', '/api/collections/' + rBc.j.data.collection.id + '/cancel', { token: AT, body: { reason: 'test cancel' } });

  const R = async (name, params = '') => (await call('GET', `/api/reports/${name}${params}`, { token: AT })).j.data;
  const monthQ = `?month=5&year=2026`;

  // ===== 1. Chit Opening =====
  const opening = await R('chit-opening', monthQ);
  ok(opening.rows.length === 2, 'chit-opening (May 2026): exactly A + B (C is July) -> 2 rows');
  ok(opening.headers.includes('Chit Amount Total') && opening.headers.includes('Distributed Total'),
     'chit-opening: running-total columns appended');
  const caTotals = rowsOf(opening, 'Chit Amount Total');
  ok(D(caTotals[0]) === '20000.00' && D(caTotals[caTotals.length - 1]) === '50000.00',
     'chit-opening: running Chit Amount Total 20000 -> 50000');
  ok(D(opening.totals['Chit Amount']) === '50000.00', 'chit-opening: TOTAL Chit Amount = 50000');
  ok(D(opening.totals['Distributed Amount']) === '32000.00', 'chit-opening: TOTAL Distributed = 20000 + 12000 = 32000');
  ok(D(opening.totals['Remaining Undistributed']) === '18000.00', 'chit-opening: TOTAL Remaining = 18000');

  // ===== 2. Chit Closing =====
  const closing = await R('chit-closing', monthQ);
  ok(closing.rows.length === 1 && closing.rows[0]['Chit Code'] === A.code, 'chit-closing: only chit A');
  ok(D(closing.rows[0]['Total Collection']) === '20500.00', 'chit-closing: A total collection = 20000 + 500 fine = 20500');
  ok(D(closing.rows[0]['Distributed Amount']) === '20000.00', 'chit-closing: A distributed = 20000');
  ok(D(closing.rows[0]['Profit / Surplus']) === '500.00', 'chit-closing: A profit = 20500 - 20000 = 500');
  ok(closing.headers.includes('Profit Total'), 'chit-closing: running Profit Total column');

  // ===== 3. Chit Collection (per due) =====
  const coll = await R('chit-collection', monthQ);
  // A: 5 allocations, B: 2 allocations (cancelled one excluded) => 7
  ok(coll.rows.length === 7, 'chit-collection: 7 allocation rows (5 A + 2 B; cancelled excluded)');
  ok(coll.rows.every((r) => /^Due \d+$/.test(r['Due Number'])), 'chit-collection: each row carries its Due Number');
  ok(D(coll.totals['Installment Amount']) === '26000.00', 'chit-collection: TOTAL installment 20000 + 6000 = 26000');
  ok(D(coll.totals['Fine Amount']) === '600.00', 'chit-collection: TOTAL fine 500 + 100 = 600');
  ok(D(coll.totals['Total Collected']) === '26600.00', 'chit-collection: TOTAL 26600 (fine separate, not added to EMI)');

  // cancelled visible only when explicitly asked
  const collCancelled = await R('chit-collection', monthQ + '&status=cancelled');
  ok(collCancelled.rows.length === 1 && D(collCancelled.rows[0]['Installment Amount']) === '3000.00',
     'chit-collection?status=cancelled: shows the 1 cancelled allocation');

  // ===== 4. Customer-wise =====
  const cust = await R('customer-collection', monthQ);
  const ajith = cust.rows.find((r) => r['Customer Code'] === (cust.rows[0]['Customer Code']));
  ok(cust.rows.length >= 2, 'customer-collection: >= 2 customers with activity');
  ok(D(cust.totals['Total Collection']) === D(26000 + 600), 'customer-collection: TOTAL collection = 26600');

  // ===== 5. Daily =====
  const daily = await R('daily-collection', monthQ);
  const dTotal = daily.rows.reduce((s, r) => s + Number(r['Total']), 0);
  ok(D(dTotal) === '26600.00', 'daily-collection: sum of daily Total = 26600');
  ok(daily.rows.every((r) => D(Number(r['Cash']) + Number(r['Bank'])) === D(r['Total'])),
     'daily-collection: Cash + Bank = Total on every row');
  ok(D(daily.totals['Total']) === '26600.00', 'daily-collection: TOTAL row = 26600');

  // ===== 6. Employee-wise (admin collected -> employee_id null -> no rows) =====
  const emp = await R('employee-collection', monthQ);
  ok(Array.isArray(emp.rows), 'employee-collection: returns rows array');

  // ===== 7. Location-wise =====
  const loc = await R('location-collection', monthQ);
  ok(D(loc.totals['Total Collection']) === '26600.00', 'location-collection: TOTAL = 26600');
  ok(loc.rows.reduce((s, r) => s + Number(r['Customers']), 0) >= 2, 'location-collection: customers counted');

  // ===== 8. Distribution =====
  const dist = await R('chit-distribution', monthQ);
  ok(dist.rows.length === 2, 'chit-distribution (May): A + B distributions');
  ok(D(dist.totals['Distributed Amount']) === '32000.00', 'chit-distribution: TOTAL distributed = 32000');
  const bRow = dist.rows.find((r) => r['Chit Code'] === Bc.code);
  ok(D(bRow['Remaining Undistributed']) === '18000.00', 'chit-distribution: B remaining = 30000 - 12000 = 18000');

  // ===== 9. Pending Dues =====
  const pend = await R('pending-dues');
  ok(pend.rows.length > 0, 'pending-dues: has rows');
  ok(pend.rows.every((r) => Number(r['Pending Amount']) > 0), 'pending-dues: every row has balance > 0');
  ok(pend.rows.every((r) => r['Status'] !== 'COMPLETED'), 'pending-dues: no completed dues listed');

  // ===== 10. Chit Profit =====
  const profit = await R('chit-profit', monthQ);
  const pa = profit.rows.find((r) => r['Chit Code'] === A.code);
  ok(D(pa['Profit / Surplus']) === '500.00', 'chit-profit: A profit = collected+fine-distributed = 500');

  // ===== 11. Monthly Summary =====
  const ms = await R('monthly-summary', monthQ);
  const msv = (label) => Number(ms.rows.find((r) => r['Metric'] === label)?.['Value']);
  ok(msv('Chits Opened') === 2, 'monthly-summary: Chits Opened = 2');
  ok(msv('Chits Closed') === 1, 'monthly-summary: Chits Closed = 1');
  ok(D(msv('Total Collection')) === '26000.00', 'monthly-summary: Total Collection = 26000 (installment portion)');
  ok(D(msv('Total Fine')) === '600.00', 'monthly-summary: Total Fine = 600');
  ok(D(msv('Total Distributed')) === '32000.00', 'monthly-summary: Total Distributed = 32000');
  ok(D(msv('Actual Profit / Surplus')) === D(26000 + 600 - 32000), 'monthly-summary: Profit = 26600 - 32000');

  // ===== 12. Financial ledger =====
  const fin = await R('financial-ledger', monthQ);
  ok(fin.rows.length >= 3, 'financial-ledger: collection + distribution rows present');
  const lastBal = Number(fin.rows[fin.rows.length - 1]['Balance']);
  ok(D(fin.totals['Balance']) === D(lastBal), 'financial-ledger: TOTAL Balance = last running balance');
  // opening 500000 + collections(26600) - distributions(32000) = 494600
  ok(D(lastBal) === '494600.00', 'financial-ledger: running balance = 500000 + 26600 - 32000 = 494600');

  // ===== summary cards =====
  const sum = (await call('GET', '/api/reports/summary' + monthQ, { token: AT })).j.data;
  ok(sum.cards.chits_opened === 2 && sum.cards.chits_closed === 1, 'summary cards: opened 2 / closed 1');
  ok(D(sum.cards.total_collection) === '26000.00', 'summary cards: total_collection = 26000');

  // ===== filter behaviour: clear = no params -> A + B + C all opened =====
  const noFilter = await R('chit-opening');
  ok(noFilter.rows.length === 3, 'chit-opening no filter (Clear): all 3 chits');
  const julyOnly = await R('chit-opening', '?date_from=2026-07-01&date_to=2026-07-31');
  ok(julyOnly.rows.length === 1 && julyOnly.rows[0]['Chit Code'] === Cc.code, 'chit-opening July filter: only chit C');

  // ===== last-day inclusion (§30) =====
  const lastDay = await R('chit-opening', `?date_from=${MONTH}-10&date_to=${MONTH}-10`);
  ok(lastDay.rows.length === 1 && lastDay.rows[0]['Chit Code'] === Bc.code, 'chit-opening: single-day range includes that day');

  // ===== EXCEL: individual export =====
  const x1 = await raw(`/api/reports/chit-opening/export${monthQ}`, AT);
  ok(x1.status === 200 && x1.ct.includes('spreadsheetml'), 'export chit-opening -> 200 xlsx content-type');
  ok(x1.buf.slice(0, 2).toString() === 'PK', 'export chit-opening -> real ZIP/xlsx (PK magic)');
  const p1 = xlsxParts(x1.buf);
  ok(p1.names.includes('xl/worksheets/sheet1.xml') && p1.names.includes('xl/styles.xml'),
     'export chit-opening -> valid workbook parts');
  ok(p1.styles.includes('#,##0.00'), 'export chit-opening -> currency number format in styles.xml');
  ok(p1.sheet1.includes('<pane ') && p1.sheet1.includes('autoFilter'),
     'export chit-opening -> frozen header + auto-filter');
  ok(p1.sheet1.includes('NEW CHITS'), 'export chit-opening -> report title banner in sheet');

  // ===== EXCEL: full workbook (multi-sheet) =====
  const xf = await raw(`/api/reports/full-export${monthQ}`, AT);
  ok(xf.status === 200 && xf.buf.slice(0, 2).toString() === 'PK', 'full-export -> 200 real xlsx');
  const pf = xlsxParts(xf.buf);
  ok(pf.names.filter((n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n)).length === 13,
     'full-export -> 13 worksheet parts (Summary + 12 reports)');
  ok(pf.workbook.includes('name="Summary"') && pf.workbook.includes('name="Chit Opening"')
     && pf.workbook.includes('name="Pending Dues"') && pf.workbook.includes('name="Financial"'),
     'full-export -> named sheets in workbook.xml');

  // ===== EXCEL: templates =====
  for (const t of ['chit', 'collection', 'expense']) {
    const xt = await raw(`/api/reports/templates/${t}`, AT);
    ok(xt.status === 200 && xt.buf.slice(0, 2).toString() === 'PK', `template ${t} -> real xlsx`);
  }
  const badT = await raw('/api/reports/templates/nope', AT);
  ok(badT.status === 404, 'template unknown type -> 404');

  // ===== ROLE SCOPE (§34) =====
  const ravi0 = await call('GET', '/api/reports/chit-opening', { token: (await call('POST', '/api/auth/login', { body: { username: 'ravi', password: 'Employee@123' } })).j.data.token });
  ok(ravi0.status === 403, 'employee without reports.view -> 403');

  // grant ravi reports.view/export + map to location 1 only
  await call('PUT', '/api/employees/2/permissions', { token: AT, body: {
    overrides: [{ code: 'reports.view', effect: 'allow' }, { code: 'reports.export', effect: 'allow' }],
    
  } });
  const RT = (await call('POST', '/api/auth/login', { body: { username: 'ravi', password: 'Employee@123' } })).j.data.token;
  const raviOpen = (await call('GET', '/api/reports/chit-opening', { token: RT })).j.data;
  const adminOpen = (await call('GET', '/api/reports/chit-opening', { token: AT })).j.data;
  ok(Array.isArray(raviOpen.rows), 'employee with reports.view can read a report');
  // Location-based access removed: an employee's report set == the admin's.
  ok(raviOpen.rows.length === adminOpen.rows.length, 'employee report row set == admin row set (no location scoping)');
  const probe = await call('GET', '/api/reports/chit-opening?location_id=2', { token: RT });
  ok(probe.status === 200, 'employee filtering a report by any location_id -> 200 (plain filter, not a guard)');
  const probeOk = await call('GET', '/api/reports/chit-opening?location_id=1', { token: RT });
  ok(probeOk.status === 200, 'employee filtering by location 1 -> 200');

  console.log('\n  ' + pass + ' passed / ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
};
run().catch((e) => { console.error(e); process.exit(1); });
