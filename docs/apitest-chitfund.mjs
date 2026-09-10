// Verifies the CHIT FUND rules from the fix spec (TEST 1..10 + ledger + xlsx + CRUD).
// Run after: php backend/setup.php install
const B = process.env.API_BASE || 'http://localhost/siva-murugan-chit-fund/backend/public';
let pass = 0, fail = 0;
const ok = (c, m) => { c ? (pass++, console.log('  PASS ' + m)) : (fail++, console.log('  FAIL ' + m)); };
async function call(method, path, { token, body, raw } = {}) {
  const h = {}; if (!raw) h['Content-Type'] = 'application/json';
  if (token) h.Authorization = 'Bearer ' + token;
  const r = await fetch(B + path, { method, headers: h, body: body ? JSON.stringify(body) : undefined });
  const ct = r.headers.get('content-type') || '';
  let j = null, buf = null;
  if (ct.includes('application/json')) { try { j = await r.json(); } catch {} }
  else buf = Buffer.from(await r.arrayBuffer());
  return { status: r.status, j, buf, ct, cd: r.headers.get('content-disposition') || '' };
}
const D = (v) => Number(v).toFixed(2);

const run = async () => {
  const AT = (await call('POST', '/api/auth/login', { body: { username: 'admin', password: 'Admin@123' } })).j.data.token;
  ok(!!AT, 'admin login');
  const loc = (await call('POST', '/api/locations', { token: AT, body: { code: 'CF-' + Date.now().toString(36), name: 'Chit Town' } })).j.data;
  const cust = (await call('POST', '/api/customers', { token: AT, body: { name: 'Chit Cust', mobile: '9111100000', primary_location_id: loc.id } })).j.data;
  const pmCash = 1, pmBank = 3;

  const makeChit = async () => (await call('POST', '/api/loans', { token: AT, body: {
    customer_id: cust.id, principal_amount: 20000, installment_amount: 2000, tenure: 10,
    frequency: 'weekly', start_date: '2026-01-05', schedule_type: 'WEEKLY', location_id: loc.id,
  } })).j.data;

  console.log('== TEST 1: chit creation keeps installment = 2000 ==');
  const c1 = await makeChit();
  ok(D(c1.installment_amount) === '2000.00', `chit1 installment_amount = ${c1.installment_amount}`);
  ok(c1.installments.every((i) => D(i.payable_amount) === '2000.00' && D(i.emi_amount) === '2000.00'), 'every installment payable = 2000.00 (flat, no interest)');
  ok(c1.installments.length === 10, '10 installments');
  const g1 = await call('GET', `/api/loans/${c1.id}`, { token: AT });
  ok(D(g1.j.data.installment_amount) === '2000.00', 'GET chit1 still 2000.00');
  ok(g1.j.data.interest_amount === '0.00' && g1.j.data.other_charges === '0.00', 'interest & other charges are 0');

  console.log('== TEST 2: second chit is ALSO 2000 (no +100/+200) ==');
  const c2 = await makeChit();
  ok(D(c2.installment_amount) === '2000.00', `chit2 installment_amount = ${c2.installment_amount} (must NOT be 2100/2200)`);
  const wl = await call('GET', '/api/collection/workload', { token: AT });
  const loans = wl.j.data.loans;
  ok(loans.every((L) => L.installments.every((i) => D(i.payable_amount) === '2000.00')),
     'collection workload shows 2000.00 for BOTH chits');

  console.log('== TEST 3: partial payment 1000 -> paid 1000, remaining 1000 ==');
  const i1 = c1.installments[0].id;
  const p1 = await call('POST', '/api/collections', { token: AT, body: { installment_id: i1, collection_date: new Date().toISOString().slice(0,10), amount: 1000, payment_mode_id: pmCash, idempotency_key: 'cf-p1-' + Date.now() } });
  ok(D(p1.j.data.installment.paid_amount) === '1000.00', 'paid_amount = 1000.00 (saved exactly)');
  ok(D(p1.j.data.installment.balance_amount) === '1000.00', 'remaining balance = 1000.00');
  ok(p1.j.data.installment.status === 'PARTIAL', 'status PARTIAL');
  const chitAfterPartial = await call('GET', `/api/loans/${c1.id}`, { token: AT });
  ok(D(chitAfterPartial.j.data.installment_amount) === '2000.00', 'configured installment STILL 2000.00 after partial payment');

  console.log('== TEST 4: pay remaining 1500? no -> pay 1000 -> COMPLETED at 2000 ==');
  const p2 = await call('POST', '/api/collections', { token: AT, body: { installment_id: i1, collection_date: new Date().toISOString().slice(0,10), amount: 1000, payment_mode_id: pmCash, idempotency_key: 'cf-p2-' + Date.now() } });
  ok(D(p2.j.data.installment.paid_amount) === '2000.00', 'total paid for installment = 2000.00');
  ok(D(p2.j.data.installment.balance_amount) === '0.00' && p2.j.data.installment.status === 'COMPLETED', 'balance 0, COMPLETED');

  console.log('== TEST 5: overpayment 2500 saved as 2500, installment stays 2000 ==');
  const i2 = c1.installments[1].id;
  const p3 = await call('POST', '/api/collections', { token: AT, body: { installment_id: i2, collection_date: new Date().toISOString().slice(0,10), amount: 2500, payment_mode_id: pmCash, idempotency_key: 'cf-p3-' + Date.now() } });
  ok(D(p3.j.data.collection.amount) === '2500.00', 'collection.amount = 2500.00 (actual paid preserved verbatim)');
  ok(D(p3.j.data.collection.amount) === '2500.00', 'collection.amount = 2500.00');
  ok(D(p3.j.data.installment.balance_amount) === '0.00' && p3.j.data.installment.status === 'COMPLETED', 'balance 0, COMPLETED');
  const chitAfterOver = await call('GET', `/api/loans/${c1.id}`, { token: AT });
  ok(D(chitAfterOver.j.data.installment_amount) === '2000.00', 'configured installment STILL 2000.00 after overpayment');
  ok(D(chitAfterOver.j.data.installments[2].payable_amount) === '2000.00', 'future installment #3 still 2000.00');

  console.log('== TEST 29: collection totals use ACTUAL payments (2000+1500+2500 style) ==');
  // three payments already: 1000,1000,2500 on chit1 + we add 1500 on chit2 inst1
  await call('POST', '/api/collections', { token: AT, body: { installment_id: c2.installments[0].id, collection_date: new Date().toISOString().slice(0,10), amount: 1500, payment_mode_id: pmCash, idempotency_key: 'cf-p4-' + Date.now() } });
  const summ = await call('GET', '/api/reports/chit-collection?date_from=2026-09-01&date_to=2026-09-30', { token: AT });
  ok(D(summ.j.data.totals['Installment Amount']) === '6000.00', `collected total = actual sum 1000+1000+2500+1500 = 6000.00 (got ${summ.j.data.totals['Installment Amount']})`);

  console.log('== TEST 6+3: expense from Office Cash decreases it ==');
  // set opening balances first
  await call('PUT', '/api/settings/accounts/1', { token: AT, body: { opening_balance: 10000 } });
  await call('PUT', '/api/settings/accounts/2', { token: AT, body: { opening_balance: 20000 } });
  let dash = (await call('GET', '/api/dashboard', { token: AT })).j.data;
  // office cash = 10000 opening + collections into cash (all our payments were CASH: 1000+1000+2500+1500 = 6000) = 16000
  ok(D(dash.cards.office_cash) === '16000.00', `office cash = 10000 opening + 6000 cash collections = ${dash.cards.office_cash}`);
  await call('POST', '/api/expenses', { token: AT, body: { amount: 1000, expense_date: '2026-09-07', category: 'Rent', account_id: 1 } });
  dash = (await call('GET', '/api/dashboard', { token: AT })).j.data;
  ok(D(dash.cards.office_cash) === '15000.00', `office cash after 1000 expense = ${dash.cards.office_cash} (16000 - 1000)`);

  console.log('== TEST 7: bank expense decreases Bank Cash ==');
  await call('POST', '/api/expenses', { token: AT, body: { amount: 5000, expense_date: '2026-09-07', category: 'Equipment', account_id: 2 } });
  dash = (await call('GET', '/api/dashboard', { token: AT })).j.data;
  ok(D(dash.cards.bank_cash) === '15000.00', `bank cash after 5000 expense = ${dash.cards.bank_cash} (20000 - 5000)`);

  console.log('== TEST 8: office income increases Office Cash ==');
  await call('POST', '/api/income', { token: AT, body: { amount: 2000, received_date: '2026-09-07', category: 'Investment', account_id: 1 } });
  dash = (await call('GET', '/api/dashboard', { token: AT })).j.data;
  ok(D(dash.cards.office_cash) === '17000.00', `office cash after 2000 income = ${dash.cards.office_cash} (15000 + 2000)`);

  console.log('== TEST 9: bank income increases Bank Cash ==');
  await call('POST', '/api/income', { token: AT, body: { amount: 5000, received_date: '2026-09-07', category: 'Investment', account_id: 2 } });
  dash = (await call('GET', '/api/dashboard', { token: AT })).j.data;
  ok(D(dash.cards.bank_cash) === '20000.00', `bank cash after 5000 income = ${dash.cards.bank_cash} (15000 + 5000)`);
  ok(D(dash.cards.total_amount) === D(Number(dash.cards.office_cash) + Number(dash.cards.bank_cash)),
     `Total (${dash.cards.total_amount}) = Office (${dash.cards.office_cash}) + Bank (${dash.cards.bank_cash})`);

  console.log('== TEST 10 + TEST: employee collection shows on admin dashboard ==');
  const emp = await call('POST', '/api/auth/login', { body: { username: 'ravi', password: 'Employee@123' } });
  const EUID = emp.j.data.user.id;
  await call('PUT', `/api/employees/${EUID}/permissions`, { token: AT, body: { loan_ids: [c2.id], location_ids: [loc.id], overrides: [{ code: 'collection.create', effect: 'allow' }, { code: 'collection.view', effect: 'allow' }, { code: 'loans.view', effect: 'allow' }] } });
  const emp2 = await call('POST', '/api/auth/login', { body: { username: 'ravi', password: 'Employee@123' } });
  const ET = emp2.j.data.token;
  const empChit = (await call('GET', `/api/loans/${c2.id}`, { token: ET })).j.data;
  const ec = await call('POST', '/api/collections', { token: ET, body: { installment_id: empChit.installments[1].id, collection_date: new Date().toISOString().slice(0,10), amount: 2000, payment_mode_id: pmCash, idempotency_key: 'cf-emp-' + Date.now() } });
  ok(ec.status === 201, 'employee posts a 2000 collection');
  dash = (await call('GET', '/api/dashboard', { token: AT })).j.data;
  const raviRow = dash.employee_collections.find((r) => /ravi/i.test(r.employee_name));
  ok(raviRow && D(raviRow.collected_today) === '2000.00', `admin dashboard shows Ravi collected_today = ${raviRow?.collected_today}`);
  ok(D(dash.today.collected) === '8000.00', `admin "today collected" = 6000 admin + 2000 employee = ${dash.today.collected}`);

  console.log('== CRUD: delete customer / view+edit+delete chit / view+delete location ==');
  const c3 = await makeChit();
  const ed = await call('PUT', `/api/loans/${c3.id}`, { token: AT, body: { installment_amount: 2500 } });
  ok(D(ed.j.data.loan.installment_amount) === '2500.00', 'edit chit installment -> 2500.00');
  const ec3 = await call('GET', `/api/loans/${c3.id}`, { token: AT });
  ok(ec3.j.data.installments.every((i) => D(i.payable_amount) === '2500.00'), 'all future installments now 2500.00 after edit');
  const del = await call('DELETE', `/api/loans/${c3.id}`, { token: AT });
  ok(del.status === 200, 'delete chit -> 200');
  ok((await call('GET', `/api/loans/${c3.id}`, { token: AT })).status === 404, 'deleted chit -> 404');
  ok(!(await call('GET', '/api/loans?per_page=200', { token: AT })).j.data.some((L) => L.id === c3.id), 'deleted chit gone from list');

  const cust2 = (await call('POST', '/api/customers', { token: AT, body: { name: 'Temp Cust', mobile: '9111100099', primary_location_id: loc.id } })).j.data;
  ok((await call('DELETE', `/api/customers/${cust2.id}`, { token: AT })).status === 200, 'delete customer -> 200');
  ok(!(await call('GET', '/api/customers?per_page=200', { token: AT })).j.data.some((c) => c.id === cust2.id), 'deleted customer gone from list');

  const loc2 = (await call('POST', '/api/locations', { token: AT, body: { code: 'DEL-' + Date.now().toString(36), name: 'Delete Me' } })).j.data;
  const locView = await call('GET', `/api/locations/${loc2.id}`, { token: AT });
  ok(locView.status === 200 && Array.isArray(locView.j.data.employees), 'GET location detail has employees[]');
  ok((await call('DELETE', `/api/locations/${loc2.id}`, { token: AT })).status === 200, 'delete empty location -> 200');
  ok((await call('DELETE', `/api/locations/${loc.id}`, { token: AT })).status === 409, 'delete location with customers -> 409 (blocked)');

  console.log('== XLSX exports are real workbooks ==');
  for (const p of ['/api/export/customers', '/api/export/chits', '/api/export/collections', '/api/export/employees', '/api/export/locations', '/api/expenses/export', '/api/income/export', '/api/reports/chit-profit/export']) {
    const r = await call('GET', p, { token: AT, raw: true });
    const isZip = r.buf && r.buf[0] === 0x50 && r.buf[1] === 0x4b; // "PK"
    const isXlsxName = /\.xlsx"?$/.test(r.cd);
    ok(r.status === 200 && isZip && isXlsxName && r.ct.includes('spreadsheetml'), `${p} -> real .xlsx (${r.buf?.length} bytes)`);
  }

  console.log('== RBAC: employee blocked from admin modules on the SERVER ==');
  ok((await call('GET', '/api/settings', { token: ET })).status === 403, 'employee GET /settings -> 403');
  ok((await call('POST', '/api/expenses', { token: ET, body: { amount: 1, expense_date: '2026-09-07', category: 'x' } })).status === 403, 'employee POST /expenses -> 403');
  ok((await call('DELETE', `/api/customers/${cust.id}`, { token: ET })).status === 403, 'employee DELETE customer -> 403');

  console.log('== force logout takes effect on next call ==');
  await call('POST', `/api/employees/${EUID}/force-logout`, { token: AT, body: { reason: 't' } });
  const fl = await call('GET', '/api/collection/workload', { token: ET });
  ok(fl.status === 401 && fl.j.error_code === 'SESSION_TERMINATED', 'employee call after force-logout -> 401 SESSION_TERMINATED');

  console.log(`\n================  ${pass} passed / ${fail} failed  ================`);
  process.exit(fail ? 1 : 0);
};
run().catch((e) => { console.error(e); process.exit(2); });
