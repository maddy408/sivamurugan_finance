// Chit distribution = actual money handed to the customer. Creating a chit moves NO money.
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
const D = (v) => Number(v).toFixed(2);

const run = async () => {
  const AT = (await call('POST', '/api/auth/login', { body: { username: 'admin', password: 'Admin@123' } })).j.data.token;
  const emp = await call('POST', '/api/auth/login', { body: { username: 'ravi', password: 'Employee@123' } });
  const ET = emp.j.data.token;

  await call('PUT', '/api/settings/accounts/1', { token: AT, body: { opening_balance: 50000 } });
  await call('PUT', '/api/settings/accounts/2', { token: AT, body: { opening_balance: 100000 } });
  const bal = async () => {
    const d = (await call('GET', '/api/dashboard', { token: AT })).j.data.cards;
    return { office: Number(d.office_cash), bank: Number(d.bank_cash), distributed: Number(d.distributed_amount) };
  };

  const loc = (await call('POST', '/api/locations', { token: AT, body: { code: 'DS-' + Date.now().toString(36), name: 'Dist Town' } })).j.data;
  const cust = (await call('POST', '/api/customers', { token: AT, body: { name: 'Dist Cust', mobile: '9000000555', primary_location_id: loc.id } })).j.data;
  const mkChit = (emi, extra) => call('POST', '/api/loans', { token: AT, body: Object.assign({
    customer_id: cust.id, account_type: 'chit', principal_amount: 20000, installment_amount: emi || 3000,
    tenure: 10, frequency: 'weekly', start_date: '2026-03-01', schedule_type: 'WEEKLY',
  }, extra || {}) });

  // ===== TEST 1 / 37: create chit -> ZERO financial impact =====
  const b0 = await bal();
  const chit = (await mkChit(3000)).j.data;
  const b1 = await bal();
  ok(b1.office === b0.office && b1.bank === b0.bank, 'create chit: Office Cash & Bank UNCHANGED (' + b1.office + ', ' + b1.bank + ')');
  ok(b1.distributed === 0, 'create chit: Distributed Amount still 0');
  const ds0 = (await call('GET', '/api/loans/' + chit.id + '/distributions', { token: AT })).j.data;
  ok(D(ds0.summary.total_distributed) === '0.00' && D(ds0.summary.remaining_undistributed) === '20000.00', 'create chit: distributed 0, remaining 20000');
  ok(ds0.summary.status === 'not_distributed', 'create chit: status = not_distributed');
  ok(D(ds0.summary.current_emi) === '3000.00' && D(ds0.summary.initial_emi) === '3000.00', 'create chit: initial & current EMI = 3000');
  ok(ds0.distributions.length === 0, 'create chit: NO fake distribution row in history');

  // ===== TEST 31: partial distribution from Office Cash =====
  const p1 = await call('POST', '/api/loans/' + chit.id + '/distributions', { token: AT, body: { amount: 8000, account_id: 1, distributed_date: '2026-03-05' } });
  ok(p1.status === 201, 'partial #1: 201');
  const b2 = await bal();
  ok(b2.office === b0.office - 8000, 'partial #1: Office Cash -8000 (' + b0.office + ' -> ' + b2.office + ')');
  ok(b2.bank === b0.bank, 'partial #1: Bank unchanged');
  ok(b2.distributed === 8000, 'partial #1: Distributed Amount = 8000');
  const ds1 = (await call('GET', '/api/loans/' + chit.id + '/distributions', { token: AT })).j.data;
  ok(D(ds1.summary.total_distributed) === '8000.00' && D(ds1.summary.remaining_undistributed) === '12000.00', 'partial #1: total 8000 / remaining 12000');
  ok(ds1.summary.status === 'partially_distributed', 'partial #1: status = partially_distributed');

  const p2 = await call('POST', '/api/loans/' + chit.id + '/distributions', { token: AT, body: { amount: 12000, account_id: 1, distributed_date: '2026-03-12', new_emi_amount: 4000 } });
  ok(p2.status === 201, 'partial #2 (with New EMI 4000): 201');
  const b3 = await bal();
  ok(b3.office === b0.office - 20000, 'partial #2: Office Cash -20000 total (' + b3.office + ')');
  ok(b3.distributed === 20000, 'partial #2: Distributed Amount = 20000');
  const ds2 = (await call('GET', '/api/loans/' + chit.id + '/distributions', { token: AT })).j.data;
  ok(D(ds2.summary.remaining_undistributed) === '0.00' && ds2.summary.status === 'fully_distributed', 'partial #2: remaining 0, fully_distributed');

  // ===== TEST 34 / 20: New EMI reflected everywhere =====
  ok(D(ds2.summary.current_emi) === '4000.00', 'New EMI: current_emi = 4000 (initial still ' + ds2.summary.initial_emi + ')');
  const chitFresh = (await call('GET', '/api/loans/' + chit.id, { token: AT })).j.data;
  ok(D(chitFresh.installment_amount) === '4000.00', 'New EMI: loan.installment_amount = 4000');
  const futureInst = chitFresh.installments.filter((i) => i.status !== 'COMPLETED');
  ok(futureInst.every((i) => D(i.payable_amount) === '4000.00'), 'New EMI: every future installment payable = 4000');
  const wl = ((await call('GET', '/api/collection/workload', { token: AT })).j.data.loans || []).find((x) => x.id === chit.id);
  ok(wl && D(wl.installment_amount) === '4000.00', 'New EMI: Collection workload shows EMI 4000');
  const pend = (await call('GET', '/api/pending-dues?search=' + cust.customer_code, { token: AT })).j;
  const pchit = (pend.data && pend.data[0] && pend.data[0].chits || []).find((c) => c.chit_code === chitFresh.code);
  ok(pchit && D(pchit.installment_amount) === '4000.00', 'New EMI: Pending Dues shows EMI 4000');

  // ===== TEST 36 / 21: actual collection > EMI stored verbatim, EMI unchanged =====
  const inst = futureInst.sort((a, b) => a.installment_no - b.installment_no)[0];
  const col = await call('POST', '/api/collections', { token: AT, body: {
    installment_id: inst.id, collection_date: '2026-03-06', amount: 8000, fine_amount: 0, payment_mode_id: 1, account_id: 1, idempotency_key: 'dist-' + Date.now(),
  } });
  ok(col.status === 201 && D(col.j.data.collection.amount) === '8000.00', 'collection: actual paid 8000 saved verbatim');
  const afterCol = (await call('GET', '/api/loans/' + chit.id, { token: AT })).j.data;
  ok(D(afterCol.installment_amount) === '4000.00', 'collection: EMI still 4000 (not raised to 8000)');
  const b4 = await bal();
  ok(b4.office === b3.office + 8000, 'collection: Office Cash +8000 (opposite of distribution)');

  // ===== TEST 33: edit distribution amount -> only the difference moves =====
  const chit2 = (await mkChit(3000)).j.data;
  const bA = await bal();
  const e1 = await call('POST', '/api/loans/' + chit2.id + '/distributions', { token: AT, body: { amount: 10000, account_id: 1 } });
  const distId = e1.j.data.id;
  const bB = await bal();
  ok(bB.office === bA.office - 10000, 'edit test: after 10000 dist, Office Cash -10000');
  await call('PUT', '/api/distributions/' + distId, { token: AT, body: { amount: 15000 } });
  const bC = await bal();
  ok(bC.office === bA.office - 15000, 'edit 10000 -> 15000: only -5000 more (Office Cash ' + bC.office + ')');
  await call('PUT', '/api/distributions/' + distId, { token: AT, body: { amount: 8000 } });
  const bD = await bal();
  ok(bD.office === bA.office - 8000, 'edit 15000 -> 8000: 7000 returned (Office Cash ' + bD.office + ')');

  // ===== TEST 17 / 32: change distribution account Office Cash -> Bank =====
  const bE = await bal();
  await call('PUT', '/api/distributions/' + distId, { token: AT, body: { account_id: 2 } });
  const bF = await bal();
  ok(bF.office === bE.office + 8000, 'switch to Bank: Office Cash restored (' + bE.office + ' -> ' + bF.office + ')');
  ok(bF.bank === bE.bank - 8000, 'switch to Bank: Bank reduced (' + bE.bank + ' -> ' + bF.bank + ')');
  ok(bF.distributed === bE.distributed, 'switch account: Distributed Amount total unchanged');

  // ===== TEST 18 / 19: cancel distribution -> full reversal + EMI restore =====
  const chit3 = (await mkChit(3000)).j.data;
  const bG = await bal();
  const c1 = await call('POST', '/api/loans/' + chit3.id + '/distributions', { token: AT, body: { amount: 20000, account_id: 1, new_emi_amount: 5000 } });
  const cId = c1.j.data.id;
  const bH = await bal();
  ok(bH.office === bG.office - 20000, 'cancel test: after dist Office Cash -20000');
  const emiAfterDist = (await call('GET', '/api/loans/' + chit3.id, { token: AT })).j.data.installment_amount;
  ok(D(emiAfterDist) === '5000.00', 'cancel test: EMI moved to 5000 after distribution');
  await call('POST', '/api/distributions/' + cId + '/cancel', { token: AT, body: { reason: 'test cancel' } });
  const bI = await bal();
  ok(bI.office === bG.office, 'cancel: Office Cash restored to ' + bG.office + ' (got ' + bI.office + ')');
  ok(bI.distributed === bG.distributed, 'cancel: Distributed Amount total back to pre-dist value');
  const ds3 = (await call('GET', '/api/loans/' + chit3.id + '/distributions', { token: AT })).j.data;
  ok(D(ds3.summary.remaining_undistributed) === '20000.00' && ds3.summary.status === 'not_distributed', 'cancel: remaining 20000, status not_distributed');
  ok(D(ds3.summary.current_emi) === '3000.00', 'cancel: current EMI restored to initial 3000 (from remaining history)');
  const cancelledRow = ds3.distributions.find((d) => d.id === cId);
  ok(cancelledRow && cancelledRow.status === 'cancelled', 'cancel: row kept as cancelled history');

  // ===== validation =====
  const over = await call('POST', '/api/loans/' + chit3.id + '/distributions', { token: AT, body: { amount: 25000, account_id: 1 } });
  ok(over.status === 422, 'validation: amount > remaining undistributed -> 422');
  const zero = await call('POST', '/api/loans/' + chit3.id + '/distributions', { token: AT, body: { amount: 0, account_id: 1 } });
  ok(zero.status === 422, 'validation: amount 0 -> 422');
  const noacc = await call('POST', '/api/loans/' + chit3.id + '/distributions', { token: AT, body: { amount: 1000 } });
  ok(noacc.status === 422, 'validation: missing account_id -> 422');

  // ===== RBAC =====
  const eCreate = await call('POST', '/api/loans/' + chit3.id + '/distributions', { token: ET, body: { amount: 1000, account_id: 1 } });
  ok(eCreate.status === 403, 'RBAC: employee POST distribution -> 403');
  // Location-based access removed: an employee with distributions.view can read ANY chit's distribution history.
  const eView = await call('GET', '/api/loans/' + chit3.id + '/distributions', { token: ET });
  ok(eView.status === 200, 'employee with distributions.view can read any chit (' + eView.status + ')');

  // ===== TEST 23: editing normal chit details has NO financial side effect =====
  const bJ = await bal();
  await call('PUT', '/api/loans/' + chit3.id, { token: AT, body: { notes: 'just a note', frequency: 'monthly' } });
  const bK = await bal();
  ok(bK.office === bJ.office && bK.bank === bJ.bank && bK.distributed === bJ.distributed, 'edit chit details (notes/frequency): balances untouched');

  console.log('\n  ' + pass + ' passed / ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
};
run();
