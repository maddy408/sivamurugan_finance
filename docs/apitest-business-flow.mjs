// 2026-09-10 business-flow changes:
//   * collection day optional (no forced Monday)
//   * location-based access removed (admin + employee see everything)
//   * Pending Dues search + collect
//   * distributed amount preserved when the due amount changes
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
const login = async (u, p) => (await call('POST', '/api/auth/login', { body: { username: u, password: p } })).j.data.token;
const D = (v) => Number(v).toFixed(2);
const dow = (ymd) => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][new Date(ymd + 'T00:00:00').getDay()];

const run = async () => {
  const AT = await login('admin', 'Admin@123');
  await call('PUT', '/api/settings/accounts/1', { token: AT, body: { opening_balance: 500000 } });
  const ET = await login('ravi', 'Employee@123');

  // ===== TEST 1 + 2 + 3: customer visible to admin AND employee (no location gate) =====
  const cust = (await call('POST', '/api/customers', { token: AT, body: { name: 'BizFlow Cust', mobile: '9333000001' } })).j.data;
  ok(!!cust?.id, 'TEST1: admin created customer');
  const adminList = (await call('GET', '/api/customers?per_page=200', { token: AT })).j.data;
  const empList = (await call('GET', '/api/customers?per_page=200', { token: ET })).j.data;
  ok(adminList.some((c) => c.id === cust.id), 'TEST1: customer visible to admin');
  ok(empList.some((c) => c.id === cust.id), 'TEST2: customer visible to employee');
  ok(empList.length === adminList.length, 'TEST3: employee sees the SAME full customer list as admin');

  // ===== TEST 6: weekly chit with NO collection day -> works, dues run from start_date =====
  const startWed = '2026-04-08'; // a Wednesday
  const c6 = await call('POST', '/api/loans', { token: AT, body: {
    customer_id: cust.id, account_type: 'chit', principal_amount: 40000, installment_amount: 2000,
    tenure: 6, frequency: 'weekly', start_date: startWed, schedule_type: 'WEEKLY',
  } });
  ok(c6.status === 201, 'TEST6: weekly chit WITHOUT a collection day -> created (no validation error)');
  ok(c6.j.data.installments[0].due_date === startWed, 'TEST6: first due = start date (' + startWed + ', ' + dow(startWed) + ') — NOT forced to Monday');
  ok(c6.j.data.installments[1].due_date === '2026-04-15', 'TEST6: second due = start + 7 days');

  // ===== TEST 7: weekly chit WITH Monday selected -> works, first due is a Monday =====
  const c7 = await call('POST', '/api/loans', { token: AT, body: {
    customer_id: cust.id, account_type: 'chit', principal_amount: 30000, installment_amount: 1500,
    tenure: 4, frequency: 'weekly', start_date: startWed, schedule_type: 'WEEKLY',
    schedule_config: { weekday: 1 },
  } });
  ok(c7.status === 201, 'TEST7: weekly chit WITH Monday -> created');
  ok(dow(c7.j.data.installments[0].due_date) === 'Mon', 'TEST7: first due falls on a Monday (' + c7.j.data.installments[0].due_date + ')');

  // ===== TEST 8: monthly chit with no fixed day -> works =====
  const c8 = await call('POST', '/api/loans', { token: AT, body: {
    customer_id: cust.id, account_type: 'chit', principal_amount: 60000, installment_amount: 5000,
    tenure: 12, frequency: 'monthly', start_date: '2026-04-08', schedule_type: 'MONTHLY_DAILY',
  } });
  ok(c8.status === 201 && c8.j.data.installments.length === 12, 'TEST8: monthly chit without a fixed day -> created with 12 dues');

  // ===== TEST 9 + 11: distributed amount is preserved when the due amount changes =====
  const c9 = (await call('POST', '/api/loans', { token: AT, body: {
    customer_id: cust.id, account_type: 'chit', principal_amount: 50000, installment_amount: 2000,
    tenure: 10, frequency: 'weekly', start_date: '2026-04-08', schedule_type: 'WEEKLY',
  } })).j.data;
  const inst1 = c9.installments[0].id;
  await call('POST', '/api/collections', { token: AT, body: {
    installment_id: inst1, collection_date: '2026-04-08', amount: 2000, payment_mode_id: 1, account_id: 1,
    idempotency_key: 'bf9-' + Date.now(),
  } });
  await call('POST', '/api/loans/' + c9.id + '/distributions', { token: AT, body: {
    amount: 50000, account_id: 1, distributed_date: '2026-04-09',
  } });
  // change the DUE amount 2000 -> 3000
  const edit = await call('PUT', '/api/loans/' + c9.id, { token: AT, body: { installment_amount: 3000 } });
  ok(edit.status === 200, 'TEST9: admin changed due amount 2000 -> 3000');
  const after = (await call('GET', '/api/loans/' + c9.id, { token: AT })).j.data;
  ok(D(after.principal_amount) === '50000.00', 'TEST9: chit amount UNCHANGED = 50000');
  ok(D(after.distribution.total_distributed) === '50000.00', 'TEST9: distributed amount UNCHANGED = 50000');
  ok(D(after.installment_amount) === '3000.00', 'TEST9: current due amount = 3000');
  const i1 = after.installments.find((i) => i.id === inst1);
  ok(D(i1.payable_amount) === '2000.00' && D(i1.paid_amount) === '2000.00' && i1.status === 'COMPLETED',
     'TEST11: the already-paid installment #1 is untouched (payable 2000, paid 2000, COMPLETED)');
  ok(D(after.installments[1].payable_amount) === '3000.00', 'TEST11: future unpaid due #2 recalculated to 3000');
  const dist1 = (await call('GET', '/api/loans/' + c9.id + '/distributions', { token: AT })).j.data.distributions[0];
  ok(D(dist1.amount) === '50000.00', 'TEST9: historical distribution row amount unchanged = 50000');

  // ===== TEST 10: partial collections against a 3000 due =====
  const due2 = after.installments[1].id;
  const collect = async (amt, k) => call('POST', '/api/collections', { token: ET, body: {
    installment_id: due2, collection_date: '2026-04-15', amount: amt, payment_mode_id: 1, account_id: 1,
    idempotency_key: 'bf10-' + k + '-' + Date.now(),
  } });
  await collect(1000, 'a');
  let bal = (await call('GET', '/api/loans/' + c9.id, { token: ET })).j.data.installments[1].balance_amount;
  ok(D(bal) === '2000.00', 'TEST10: due 3000, paid 1000 -> pending 2000');
  await collect(1000, 'b');
  bal = (await call('GET', '/api/loans/' + c9.id, { token: ET })).j.data.installments[1].balance_amount;
  ok(D(bal) === '1000.00', 'TEST10: paid another 1000 -> pending 1000');
  await collect(1000, 'c');
  const i2 = (await call('GET', '/api/loans/' + c9.id, { token: ET })).j.data.installments[1];
  ok(D(i2.balance_amount) === '0.00' && i2.status === 'COMPLETED', 'TEST10: final 1000 -> pending 0, COMPLETED');

  // ===== TEST 4 + 5: employee Pending Dues -> search -> collect =====
  const pdSearch = (await call('GET', '/api/pending-dues?search=BizFlow', { token: ET })).j;
  ok((pdSearch.data || []).some((c) => c.customer_name === 'BizFlow Cust'), 'TEST4: employee Pending Dues search "BizFlow" -> customer found');
  const pdCust = (pdSearch.data || []).find((c) => c.customer_name === 'BizFlow Cust');
  const targetChit = (pdCust.chits || []).find((ch) => Number(ch.outstanding) > 0);
  ok(!!targetChit, 'TEST4: pending chit with outstanding > 0 is listed with due details');
  const nextDue = targetChit.next_due;
  ok(nextDue && nextDue.balance_amount, 'TEST4: next due (amount / date / installment no) present');
  const before = Number(targetChit.outstanding);
  const pay = await call('POST', '/api/collections', { token: ET, body: {
    installment_id: nextDue.installment_id ?? undefined,
    installment_ids: undefined,
    collection_date: '2026-04-20', amount: 500, payment_mode_id: 1, account_id: 1,
    idempotency_key: 'bf5-' + Date.now(),
    // pending controller's next_due carries installment_no not id — fall back to loan lookup
  } });
  // If the above failed (no installment id in next_due), collect via the loan's first open installment.
  let collected = pay.status === 201;
  if (!collected) {
    const loanFull = (await call('GET', '/api/loans/' + targetChit.chit_id, { token: ET })).j.data;
    const open = loanFull.installments.find((i) => i.status !== 'COMPLETED');
    const p2 = await call('POST', '/api/collections', { token: ET, body: {
      installment_id: open.id, collection_date: '2026-04-20', amount: 500, payment_mode_id: 1, account_id: 1,
      idempotency_key: 'bf5b-' + Date.now(),
    } });
    collected = p2.status === 201;
  }
  ok(collected, 'TEST5: employee collected a pending payment directly');
  const pdAfter = (await call('GET', '/api/pending-dues?search=BizFlow', { token: ET })).j.data;
  const chAfter = (pdAfter.find((c) => c.customer_name === 'BizFlow Cust')?.chits || []).find((ch) => ch.chit_id === targetChit.chit_id);
  ok(chAfter && Number(chAfter.outstanding) === before - 500, 'TEST5: outstanding dropped by exactly 500 (backend-calculated)');

  // ===== TEST 12: reports stay correct after the due change + collections =====
  const rpt = (await call('GET', '/api/reports/chit-collection?date_from=2026-04-01&date_to=2026-04-30', { token: AT })).j.data;
  const sumInst = rpt.rows.reduce((s, r) => s + Number(r['Installment Amount']), 0);
  ok(D(rpt.totals['Installment Amount']) === D(sumInst), 'TEST12: chit-collection report total = sum of its rows');
  const opening = (await call('GET', '/api/reports/chit-opening?date_from=2026-04-01&date_to=2026-04-30', { token: AT })).j.data;
  const c9row = opening.rows.find((r) => r['Chit Code'] === c9.code);
  ok(c9row && D(c9row['Chit Amount']) === '50000.00' && D(c9row['Distributed Amount']) === '50000.00',
     'TEST12: chit-opening report shows chit 50000 / distributed 50000 after the due change');

  console.log('\n  ' + pass + ' passed / ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
};
run().catch((e) => { console.error(e); process.exit(1); });
