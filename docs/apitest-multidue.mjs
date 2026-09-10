// Multiple-due selection in one collection: each selected due gets its own
// allocation; unselected dues untouched; cancel reverses exactly. Fine separate.
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
  await call('PUT', '/api/settings/accounts/1', { token: AT, body: { opening_balance: 100000 } });
  const office = async () => Number((await call('GET', '/api/dashboard', { token: AT })).j.data.cards.office_cash);

  const chit = (await call('POST', '/api/loans', { token: AT, body: {
    customer_id: 1, account_type: 'chit', principal_amount: 30000, installment_amount: 3000,
    tenure: 10, frequency: 'weekly', start_date: '2026-03-01', schedule_type: 'WEEKLY',
  } })).j.data;
  const insts = () => call('GET', '/api/loans/' + chit.id, { token: AT }).then((r) => r.j.data.installments);
  let I = await insts();
  const byNo = (n) => I.find((x) => x.installment_no === n);

  // ===== TEST 3: select Due 1 + Due 2 (skip 3), pay 6000 =====
  const o0 = await office();
  const r1 = await call('POST', '/api/collections', { token: AT, body: {
    installment_ids: [byNo(1).id, byNo(2).id],
    collection_date: '2026-03-05', amount: 6000, fine_amount: 0, payment_mode_id: 1, account_id: 1,
    idempotency_key: 'md-1-' + Date.now(),
  } });
  ok(r1.status === 201, 'multi-due (Due 1 + Due 2) collect -> 201');
  ok(D(r1.j.data.collection.amount) === '6000.00', 'collection.amount = 6000 (sum of 2 dues, verbatim)');
  ok((r1.j.data.allocations || []).length === 2, 'exactly 2 allocation rows (one per selected due)');
  I = await insts();
  ok(byNo(1).status === 'COMPLETED' && D(byNo(1).paid_amount) === '3000.00', 'Due 1 -> COMPLETED, paid 3000');
  ok(byNo(2).status === 'COMPLETED' && D(byNo(2).paid_amount) === '3000.00', 'Due 2 -> COMPLETED, paid 3000');
  ok(byNo(3).status !== 'COMPLETED' && D(byNo(3).paid_amount) === '0.00', 'Due 3 -> untouched (still pending, 0 paid)');
  ok(D(byNo(3).installment_amount ?? byNo(3).emi_amount) === '3000.00', 'Due 3 amount unchanged (no auto EMI change)');
  const o1 = await office();
  ok(o1 === o0 + 6000, 'Office Cash +6000 (collection is money IN) (' + o0 + ' -> ' + o1 + ')');

  // ===== TEST: non-contiguous — select Due 4 + Due 6, skip Due 5 =====
  const r2 = await call('POST', '/api/collections', { token: AT, body: {
    installment_ids: [byNo(4).id, byNo(6).id],
    collection_date: '2026-03-12', amount: 6000, payment_mode_id: 1, account_id: 1,
    idempotency_key: 'md-2-' + Date.now(),
  } });
  ok(r2.status === 201, 'non-contiguous (Due 4 + Due 6) -> 201');
  I = await insts();
  ok(byNo(4).status === 'COMPLETED' && byNo(6).status === 'COMPLETED', 'Due 4 & Due 6 -> COMPLETED');
  ok(byNo(5).status !== 'COMPLETED' && D(byNo(5).paid_amount) === '0.00', 'Due 5 in between -> untouched');

  // ===== TEST 5: cancel a multi-due collection -> exact reversal =====
  const o2 = await office();
  const cancel = await call('POST', '/api/collections/' + r1.j.data.collection.id + '/cancel', { token: AT, body: { reason: 'test' } });
  ok(cancel.status === 200, 'cancel multi-due collection -> 200');
  I = await insts();
  ok(byNo(1).status !== 'COMPLETED' && D(byNo(1).paid_amount) === '0.00', 'after cancel: Due 1 restored to pending, 0 paid');
  ok(byNo(2).status !== 'COMPLETED' && D(byNo(2).paid_amount) === '0.00', 'after cancel: Due 2 restored to pending, 0 paid');
  ok(byNo(4).status === 'COMPLETED' && byNo(6).status === 'COMPLETED', 'after cancel: the OTHER collection (Due 4 & 6) untouched');
  const o3 = await office();
  ok(o3 === o2 - 6000, 'after cancel: Office Cash -6000 exact reversal (' + o2 + ' -> ' + o3 + ')');

  // ===== fine is separate, added on top =====
  I = await insts();
  const r3 = await call('POST', '/api/collections', { token: AT, body: {
    installment_ids: [byNo(1).id, byNo(2).id],
    collection_date: '2026-03-20', amount: 6000, fine_amount: 100, payment_mode_id: 1, account_id: 1,
    idempotency_key: 'md-3-' + Date.now(),
  } });
  ok(D(r3.j.data.collection.amount) === '6000.00' && D(r3.j.data.collection.fine_amount) === '100.00'
     && D(r3.j.data.collection.total_amount) === '6100.00', 'fine separate: amount 6000 / fine 100 / total 6100');
  const o4 = await office();
  ok(o4 === o3 + 6100, 'Office Cash +6100 (installment 6000 + fine 100), no double count');

  // ===== validation: due from a different chit rejected =====
  const chit2 = (await call('POST', '/api/loans', { token: AT, body: {
    customer_id: 2, account_type: 'chit', principal_amount: 9000, installment_amount: 3000,
    tenure: 3, frequency: 'weekly', start_date: '2026-03-01', schedule_type: 'WEEKLY',
  } })).j.data;
  const c2i = (await call('GET', '/api/loans/' + chit2.id, { token: AT })).j.data.installments;
  const mixed = await call('POST', '/api/collections', { token: AT, body: {
    installment_ids: [byNo(3).id, c2i[0].id], collection_date: '2026-03-21', amount: 6000, payment_mode_id: 1,
    idempotency_key: 'md-x-' + Date.now(),
  } });
  ok(mixed.status === 422, 'dues from two different chits in one collection -> 422');

  // ===== empty selection rejected =====
  const empty = await call('POST', '/api/collections', { token: AT, body: {
    installment_ids: [], collection_date: '2026-03-21', amount: 3000, payment_mode_id: 1, idempotency_key: 'md-e-' + Date.now(),
  } });
  ok(empty.status === 422, 'no dues selected -> 422');

  // ===== single installment_id path still forward-fills (regression) =====
  I = await insts();
  const fwd = await call('POST', '/api/collections', { token: AT, body: {
    installment_id: byNo(3).id, collection_date: '2026-03-22', amount: 6000, payment_mode_id: 1, account_id: 1,
    idempotency_key: 'md-f-' + Date.now(),
  } });
  ok((fwd.j.data.allocations || []).length >= 2, 'single installment_id + overpay still spreads forward across >=2 dues');

  console.log('\n  ' + pass + ' passed / ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
};
run();
