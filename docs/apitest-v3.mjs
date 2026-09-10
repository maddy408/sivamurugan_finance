// NEW requirements: dashboard privacy + cards, calendar filter, pending dues,
// collection actual-paid / multi-installment / fine, cancel + delete, customer
// new-location, chit code prefix/auto/manual/duplicate. Run after setup.php install.
const B = process.env.API_BASE || 'http://localhost/siva-murugan-chit-fund/backend/public';
let pass = 0, fail = 0;
const ok = (c, m) => { c ? (pass++, console.log('  PASS ' + m)) : (fail++, console.log('  FAIL ' + m)); };
async function call(method, path, { token, body } = {}) {
  const h = { 'Content-Type': 'application/json' };
  if (token) h.Authorization = 'Bearer ' + token;
  const r = await fetch(B + path, { method, headers: h, body: body ? JSON.stringify(body) : undefined });
  let j = null; try { j = await r.json(); } catch {}
  return { status: r.status, j };
}
const D = (v) => Number(v).toFixed(2);

const run = async () => {
  const AT = (await call('POST', '/api/auth/login', { body: { username: 'admin', password: 'Admin@123' } })).j.data.token;
  const emp = await call('POST', '/api/auth/login', { body: { username: 'ravi', password: 'Employee@123' } });
  const ET0 = emp.j.data.token, EUID = emp.j.data.user.id, EEID = emp.j.data.user.employee_id;
  ok(!!AT && !!ET0, 'admin + employee login');

  // opening balances
  await call('PUT', '/api/settings/accounts/1', { token: AT, body: { opening_balance: 10000 } });
  await call('PUT', '/api/settings/accounts/2', { token: AT, body: { opening_balance: 20000 } });

  console.log('== CHIT CODE: prefix / auto-increment / manual / duplicate ==');
  const loc = (await call('POST', '/api/locations', { token: AT, body: { code: 'V3-' + Date.now().toString(36), name: 'V3 Town' } })).j.data;
  const cust = (await call('POST', '/api/customers', { token: AT, body: { name: 'Arun', mobile: '9876543210', primary_location_id: loc.id } })).j.data;
  const mk = async (extra = {}) => (await call('POST', '/api/loans', { token: AT, body: {
    customer_id: cust.id, account_type: 'chit', principal_amount: 20000, installment_amount: 3000, tenure: 6,
    frequency: 'weekly', start_date: '2026-01-05', schedule_type: 'WEEKLY', location_id: loc.id, ...extra,
  } })).j;
  const nc = (await call('GET', '/api/loans/next-code', { token: AT })).j.data;
  ok(nc.prefix === 'JRM' && nc.next_code === 'JRM-1', `next-code = ${nc.next_code} (JRM-1)`);
  const c1 = (await mk()).data;
  ok(c1.code === 'JRM-1', `chit 1 auto code = ${c1.code}`);
  const c2 = (await mk()).data;
  ok(c2.code === 'JRM-2', `chit 2 auto code = ${c2.code} (auto increment)`);
  const cm = (await mk({ code: 'SPECIAL-001' })).data;
  ok(cm.code === 'SPECIAL-001', 'manual chit code SPECIAL-001 saved');
  const dup = await call('POST', '/api/loans', { token: AT, body: { customer_id: cust.id, account_type: 'chit', principal_amount: 20000, installment_amount: 3000, tenure: 6, frequency: 'weekly', start_date: '2026-01-05', schedule_type: 'WEEKLY', code: 'SPECIAL-001' } });
  ok(dup.status === 409, 'duplicate chit code rejected by backend (409)');
  const c3 = (await mk()).data;
  ok(c3.code === 'JRM-3', `next auto still JRM-3 (unaffected by manual/deleted) = ${c3.code}`);

  console.log('== CHIT PREFIX SETTING ==');
  const sp = await call('PUT', '/api/settings/chit-prefix', { token: AT, body: { prefix: 'abc' } });
  ok(sp.status === 200 && sp.j.data.prefix === 'ABC' && sp.j.data.next_example === 'ABC-1', `prefix -> ABC, next ${sp.j.data.next_example}`);
  const c4 = (await mk()).data;
  ok(c4.code === 'ABC-1', `after prefix change new chit = ${c4.code}; JRM-1 unchanged`);
  ok((await call('GET', `/api/loans/${c1.id}`, { token: AT })).j.data.code === 'JRM-1', 'existing chit code NOT rewritten by prefix change');
  ok((await call('PUT', '/api/settings/chit-prefix', { token: ET0, body: { prefix: 'X' } })).status === 403, 'employee cannot change chit prefix (403)');
  await call('PUT', '/api/settings/chit-prefix', { token: AT, body: { prefix: 'JRM' } }); // restore

  console.log('== COLLECTION: actual paid 3000 vs 6000, multi-installment, fine ==');
  const det = (await call('GET', `/api/loans/${c1.id}`, { token: AT })).j.data;
  const i1 = det.installments[0].id, i2 = det.installments[1].id, i3 = det.installments[2].id;
  // exact 3000
  const p1 = await call('POST', '/api/collections', { token: AT, body: { installment_id: i1, collection_date: '2026-09-07', amount: 3000, payment_mode_id: 1, idempotency_key: 'v3-a' } });
  ok(D(p1.j.data.collection.amount) === '3000.00', 'exact pay: collection.amount = 3000.00');
  ok(D(p1.j.data.installment.paid_amount) === '3000.00' && p1.j.data.installment.status === 'COMPLETED', 'installment 1 -> paid 3000 COMPLETED');
  // THE BUG: pay 6000 on a 3000 installment
  const p2 = await call('POST', '/api/collections', { token: AT, body: { installment_id: i2, collection_date: '2026-09-07', amount: 6000, payment_mode_id: 1, idempotency_key: 'v3-b' } });
  ok(D(p2.j.data.collection.amount) === '6000.00', 'THE BUG FIXED: collection.amount = 6000.00 (not 3000)');
  ok((p2.j.data.allocations || []).length === 2, `6000 allocated across 2 installments (got ${(p2.j.data.allocations||[]).length})`);
  ok(p2.j.data.allocations.every((a) => D(a.principal_alloc) === '3000.00'), 'each installment got exactly 3000.00');
  const detB = (await call('GET', `/api/loans/${c1.id}`, { token: AT })).j.data;
  ok(detB.installments[1].status === 'COMPLETED' && detB.installments[2].status === 'COMPLETED', 'installments 2 & 3 both COMPLETED by the 6000 payment');
  ok(D(detB.installment_amount) === '3000.00', 'configured installment_amount STILL 3000.00 after 6000 payment');
  ok(D(detB.installments[3].payable_amount) === '3000.00', 'installment 4 still 3000.00 (not inflated)');
  // fine
  const p3 = await call('POST', '/api/collections', { token: AT, body: { installment_id: detB.installments[3].id, collection_date: '2026-09-07', amount: 3000, fine_amount: 100, payment_mode_id: 1, idempotency_key: 'v3-c' } });
  ok(D(p3.j.data.collection.amount) === '3000.00' && D(p3.j.data.collection.fine_amount) === '100.00' && D(p3.j.data.collection.total_amount) === '3100.00',
     `fine: amount 3000 + fine 100 = total ${p3.j.data.collection.total_amount}`);
  // fine + overpay
  const p4 = await call('POST', '/api/collections', { token: AT, body: { installment_id: detB.installments[4].id, collection_date: '2026-09-07', amount: 6000, fine_amount: 100, payment_mode_id: 1, idempotency_key: 'v3-d' } });
  ok(D(p4.j.data.collection.amount) === '6000.00' && D(p4.j.data.collection.fine_amount) === '100.00' && D(p4.j.data.collection.total_amount) === '6100.00',
     `fine+overpay: actual paid 6000 preserved, total ${p4.j.data.collection.total_amount}`);

  console.log('== DASHBOARD: role-based privacy ==');
  const dashA = (await call('GET', '/api/dashboard', { token: AT })).j.data;
  ok(dashA.is_admin === true, 'admin dashboard is_admin=true');
  for (const k of ['office_cash', 'bank_cash', 'total_amount', 'total_expense', 'distributed_amount', 'total_collection', 'monthly_collection', 'weekly_collection']) {
    ok(dashA.cards[k] !== undefined, `admin card present: ${k}`);
  }
  ok(D(dashA.cards.total_collection) === '18000.00', `total_collection = actual amounts 3000+6000+3000+6000 = ${dashA.cards.total_collection}`);
  const dashE = (await call('GET', '/api/dashboard', { token: ET0 })).j.data;
  ok(dashE.is_admin === false, 'employee dashboard is_admin=false');
  for (const k of ['office_cash', 'bank_cash', 'total_amount', 'total_expense', 'distributed_amount']) {
    ok(dashE.cards[k] === undefined, `PRIVACY: employee response does NOT expose ${k}`);
  }
  ok(JSON.stringify(dashE).indexOf('office_cash') === -1, 'PRIVACY: "office_cash" string absent from employee dashboard JSON');
  ok(dashE.cards.my_collection_total !== undefined, 'employee sees own my_collection_total');

  console.log('== DASHBOARD: Total Expense + Distributed + calendar filter ==');
  await call('POST', '/api/expenses', { token: AT, body: { amount: 1000, expense_date: '2026-09-07', category: 'A', account_id: 1 } });
  await call('POST', '/api/expenses', { token: AT, body: { amount: 2000, expense_date: '2026-09-07', category: 'B', account_id: 1 } });
  await call('POST', '/api/expenses', { token: AT, body: { amount: 500, expense_date: '2026-09-07', category: 'C', account_id: 2 } });
  const dA2 = (await call('GET', '/api/dashboard', { token: AT })).j.data;
  ok(D(dA2.cards.total_expense) === '3500.00', `Total Expense = 1000+2000+500 = ${dA2.cards.total_expense}`);
  // Distributed Amount = sum of ACTUAL distribution transactions; no chit has been
  // distributed in this suite, so it must be 0 (creating a chit moves no money).
  ok(D(dA2.cards.distributed_amount) === '0.00', `Distributed Amount = ${dA2.cards.distributed_amount} (no actual distributions yet)`);
  const fltr = (await call('GET', '/api/dashboard?month_from=2026-08-01&month_to=2026-08-31', { token: AT })).j.data;
  ok(D(fltr.cards.monthly_collection) === '0.00', 'calendar filter: Aug 2026 monthly_collection = 0.00 (all our payments are in Sept)');
  const fltr2 = (await call('GET', '/api/dashboard?month_from=2026-09-01&month_to=2026-09-30', { token: AT })).j.data;
  ok(D(fltr2.cards.monthly_collection) === '18000.00', `calendar filter: Sept monthly_collection = ${fltr2.cards.monthly_collection}`);

  console.log('== CANCEL completed collection: reverse cash + totals + outstanding ==');
  const cashBefore = Number((await call('GET', '/api/dashboard', { token: AT })).j.data.cards.office_cash);
  const totColBefore = Number((await call('GET', '/api/dashboard', { token: AT })).j.data.cards.total_collection);
  const cx = await call('POST', `/api/collections/${p1.j.data.collection.id}/cancel`, { token: AT, body: { reason: 'test cancel' } });
  ok(cx.status === 200 && cx.j.data.collection.status === 'cancelled', 'cancel -> status=cancelled (history kept)');
  const dAfter = (await call('GET', '/api/dashboard', { token: AT })).j.data;
  ok(D(dAfter.cards.office_cash) === D(cashBefore - 3000), `office cash reversed by 3000 (${cashBefore} -> ${dAfter.cards.office_cash})`);
  ok(D(dAfter.cards.total_collection) === D(totColBefore - 3000), `total_collection reduced by 3000 (${totColBefore} -> ${dAfter.cards.total_collection})`);
  const detC = (await call('GET', `/api/loans/${c1.id}`, { token: AT })).j.data;
  ok(detC.installments[0].status !== 'COMPLETED' && D(detC.installments[0].balance_amount) === '3000.00', 'installment 1 outstanding restored to 3000 after cancel');

  console.log('== DELETE collection: soft delete, no double reversal ==');
  const cashBeforeDel = Number((await call('GET', '/api/dashboard', { token: AT })).j.data.cards.office_cash);
  const dl = await call('DELETE', `/api/collections/${p3.j.data.collection.id}`, { token: AT, body: { reason: 'test delete' } });
  ok(dl.status === 200, 'delete posted collection -> 200');
  const cashAfterDel = Number((await call('GET', '/api/dashboard', { token: AT })).j.data.cards.office_cash);
  ok(D(cashAfterDel) === D(cashBeforeDel - 3100), `delete reverses once: office cash -3100 (3000 principal + 100 fine) (${cashBeforeDel} -> ${cashAfterDel})`);
  // delete an already-cancelled one -> must NOT reverse again
  const cashBeforeDel2 = cashAfterDel;
  const dl2 = await call('DELETE', `/api/collections/${p1.j.data.collection.id}`, { token: AT, body: { reason: 'delete cancelled' } });
  const cashAfterDel2 = Number((await call('GET', '/api/dashboard', { token: AT })).j.data.cards.office_cash);
  ok(dl2.status === 200 && D(cashAfterDel2) === D(cashBeforeDel2), 'deleting an already-cancelled collection does NOT double-reverse');
  ok(!(await call('GET', '/api/collections?per_page=200', { token: AT })).j.data.some((c) => c.id === p1.j.data.collection.id), 'deleted collection gone from ledger list');

  console.log('== RBAC: employee cannot cancel/delete without permission ==');
  await call('PUT', `/api/employees/${EUID}/permissions`, { token: AT, body: { loan_ids: [c1.id], location_ids: [loc.id] } });
  const ET = (await call('POST', '/api/auth/login', { body: { username: 'ravi', password: 'Employee@123' } })).j.data.token;
  ok((await call('POST', `/api/collections/${p4.j.data.collection.id}/cancel`, { token: ET, body: { reason: 'x' } })).status === 403, 'employee cancel without collection.cancel -> 403');
  ok((await call('DELETE', `/api/collections/${p4.j.data.collection.id}`, { token: ET, body: { reason: 'x' } })).status === 403, 'employee delete without collection.delete -> 403');

  console.log('== PENDING DUES ==');
  const cust2 = (await call('POST', '/api/customers', { token: AT, body: { name: 'Bala', mobile: '9000000001', primary_location_id: loc.id } })).j.data;
  const pc = (await mk({ customer_id: cust2.id, installment_amount: 3000 })).data;
  const pi1 = (await call('GET', `/api/loans/${pc.id}`, { token: AT })).j.data.installments[0].id;
  await call('POST', '/api/collections', { token: AT, body: { installment_id: pi1, collection_date: '2026-09-07', amount: 1000, payment_mode_id: 1, idempotency_key: 'v3-pend' } });
  const pd = await call('GET', '/api/pending-dues?per_page=200', { token: AT });
  const bala = pd.j.data.find((c) => c.customer_name === 'Bala');
  ok(!!bala, 'Bala appears in pending dues after partial payment');
  ok(bala.mobile === '9000000001' && bala.location === loc.name, 'pending row has customer phone + location');
  const balaChit = bala.chits.find((ch) => ch.chit_id === pc.id);
  ok(balaChit && D(balaChit.installment_amount) === '3000.00' && D(balaChit.paid_total) === '1000.00',
     `pending chit shows Installment 3000 / Paid 1000`);
  ok(D(balaChit.next_due.balance_amount) === '2000.00', 'Outstanding for the installment = 3000 - 1000 = 2000');
  // pay the rest -> drops off
  await call('POST', '/api/collections', { token: AT, body: { installment_id: pi1, collection_date: '2026-09-07', amount: 2000, payment_mode_id: 1, idempotency_key: 'v3-pend2' } });
  const pd2 = await call('GET', '/api/pending-dues?per_page=200', { token: AT });
  const balaChit2 = (pd2.j.data.find((c) => c.customer_name === 'Bala')?.chits || []).find((ch) => ch.chit_id === pc.id);
  ok(!balaChit2 || Number(balaChit2.due_installments.find((d) => d.installment_no === 1) === undefined),
     'installment 1 no longer pending after being fully paid');

  console.log('== CUSTOMER: new location creation + reuse ==');
  const nl1 = await call('POST', '/api/customers', { token: AT, body: { name: 'Loc Test 1', mobile: '9111000001', new_location: 'Surandai' } });
  ok(nl1.status === 201 && nl1.j.data.created_location?.name === 'Surandai', 'new_location "Surandai" created & returned');
  const surId = nl1.j.data.primary_location_id;
  ok(!!surId, 'customer linked to the new location id');
  const inLocList = (await call('GET', '/api/locations?per_page=200', { token: AT })).j.data.some((l) => l.name === 'Surandai');
  ok(inLocList, 'Surandai now appears in the Locations list');
  const nl2 = await call('POST', '/api/customers', { token: AT, body: { name: 'Loc Test 2', mobile: '9111000002', new_location: 'surandai' } });
  ok(nl2.j.data.primary_location_id === surId && !nl2.j.data.created_location, 'same location name (case-insensitive) REUSED, no duplicate');
  const surandaiCount = (await call('GET', '/api/locations?q=Surandai&per_page=200', { token: AT })).j.data.filter((l) => /surandai/i.test(l.name)).length;
  ok(surandaiCount === 1, `exactly one "Surandai" location exists (got ${surandaiCount})`);

  console.log('== regression: existing suites still meaningful (installment amount fixed) ==');
  ok(D((await call('GET', `/api/loans/${c1.id}`, { token: AT })).j.data.installment_amount) === '3000.00', 'JRM-1 installment_amount still 3000.00 at end of run');

  console.log(`\n================  ${pass} passed / ${fail} failed  ================`);
  process.exit(fail ? 1 : 0);
};
run().catch((e) => { console.error(e); process.exit(2); });
