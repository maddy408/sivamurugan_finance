// End-to-end vertical-slice test for the Chit Fund API. Node 18+ (global fetch).
const B = 'http://127.0.0.1:8080';
const RUN = Date.now().toString(36);
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  PASS ' + m); } else { fail++; console.log('  FAIL ' + m); } };

async function call(method, path, { token, body } = {}) {
  const h = { 'Content-Type': 'application/json' };
  if (token) h.Authorization = 'Bearer ' + token;
  const r = await fetch(B + path, { method, headers: h, body: body ? JSON.stringify(body) : undefined });
  let j = null; try { j = await r.json(); } catch {}
  return { status: r.status, j };
}

const run = async () => {
  console.log('== health ==');
  ok((await call('GET', '/api/health')).j?.data?.status === 'ok', 'health');

  console.log('== auth ==');
  const login = await call('POST', '/api/auth/login', { body: { username: 'admin', password: 'Admin@123' } });
  const AT = login.j?.data?.token;
  ok(login.status === 200 && !!AT, 'admin login returns token');
  ok(login.j?.data?.user?.role === 'ADMIN', 'admin role');
  ok(login.j?.data?.user?.permissions?.includes('collection.create'), 'admin has permissions list');
  ok((await call('POST', '/api/auth/login', { body: { username: 'admin', password: 'nope' } })).status === 401, 'bad password -> 401');
  ok((await call('GET', '/api/customers')).status === 401, 'no token -> 401');
  const me = await call('GET', '/api/auth/me', { token: AT });
  ok(me.j?.data?.username === 'admin', '/auth/me works with token');

  console.log('== customer (location is now a free-text field) ==');
  ok((await call('POST', '/api/locations', { token: AT, body: { name: 'x' } })).status === 404, 'Location Master endpoint removed -> 404');

  const cus = await call('POST', '/api/customers', { token: AT, body: { name: 'Test Customer ' + RUN, mobile: '9990001111', location: 'Test Nagar', nominee_name: 'N' } });
  const CID = cus.j?.data?.id;
  ok(cus.status === 201 && cus.j?.data?.customer_code?.startsWith('CUST-'), 'customer created with code ' + cus.j?.data?.customer_code);
  const search = await call('GET', '/api/customers?q=Test%20Customer%20' + RUN + '&per_page=10', { token: AT });
  ok(search.j?.pagination?.total === 1, 'server-side search finds the customer');
  ok(Array.isArray(search.j?.data), 'customer list is paginated array');

  console.log('== EMI + schedule ==');
  const pv = await call('POST', '/api/loans/preview', { token: AT, body: { principal_amount: 10000, tenure: 10, frequency: 'weekly', start_date: '2026-01-05', schedule_type: 'WEEKLY', installment_amount: 1000 } });
  ok(pv.j?.data?.emi_amount === '1000.00', 'EMI = 1000.00 (installment amount echoed back)');
  ok(pv.j?.data?.schedule?.[0]?.due_date === '2026-01-05', 'first due date follows start_date (2026-01-05), no hard-coded weekday');
  ok(pv.j?.data?.schedule?.[9]?.due_date === '2026-03-09', '10th due date = +9 weeks (2026-03-09)');

  const ln = await call('POST', '/api/loans', { token: AT, body: { customer_id: CID, account_type: 'loan', principal_amount: 10000, tenure: 10, frequency: 'weekly', start_date: '2026-01-05', schedule_type: 'WEEKLY', installment_amount: 1000 } });
  const LOANID = ln.j?.data?.id;
  ok(ln.status === 201 && ln.j?.data?.emi_amount === '1000.00', 'loan created, backend EMI 1000.00');
  ok(ln.j?.data?.installments?.length === 10, '10 installments auto-generated');
  ok(/^[A-Z]{2,6}-\d+$/.test(ln.j?.data?.code || ''), 'loan code format ' + ln.j?.data?.code);

  const rg = await call('POST', `/api/loans/${LOANID}/generate-schedule`, { token: AT, body: {} });
  ok(rg.j?.data?.created === 0 && rg.j?.data?.installments?.length === 10, 'idempotent regen: 0 created, still 10 (no dupes)');

  console.log('== installment schedule shape ==');
  const detail = await call('GET', `/api/loans/${LOANID}`, { token: AT });
  const inst1 = detail.j.data.installments[0].id;
  const inst2 = detail.j.data.installments[1].id;
  const inst3 = detail.j.data.installments[2].id;
  const row0 = detail.j.data.installments[0];
  ok(row0.status === 'OVERDUE' && row0.balance_amount === '1000.00', 'past-due installment marked OVERDUE with full balance');
  ok('fine_accrued' in row0 && 'fine_paid' in row0 && 'fine_waived' in row0, 'installment carries fine accrual fields');

  console.log('== partial payments ==');
  const p1 = await call('POST', '/api/collections', { token: AT, body: { installment_id: inst1, collection_date: '2026-09-03', amount: 600, fine_amount: 0, payment_mode_id: 1, idempotency_key: 'k-p1-'+RUN } });
  ok(p1.j?.data?.installment?.paid_amount === '600.00', 'paid = 600.00');
  ok(p1.j?.data?.installment?.balance_amount === '400.00', 'balance = 400.00');
  ok(p1.j?.data?.installment?.status === 'PARTIAL', 'status = PARTIAL');

  const p1replay = await call('POST', '/api/collections', { token: AT, body: { installment_id: inst1, collection_date: '2026-09-03', amount: 600, fine_amount: 0, payment_mode_id: 1, idempotency_key: 'k-p1-'+RUN } });
  ok(p1replay.j?.data?.idempotent_replay === true, 'same idempotency key -> replay, not double post');
  const afterReplay = await call('GET', `/api/loans/${LOANID}`, { token: AT });
  ok(afterReplay.j.data.installments[0].paid_amount === '600.00', 'still 600.00 after replay');

  const p2 = await call('POST', '/api/collections', { token: AT, body: { installment_id: inst1, collection_date: '2026-09-03', amount: 400, fine_amount: 0, payment_mode_id: 1, idempotency_key: 'k-p2-'+RUN } });
  ok(p2.j?.data?.installment?.balance_amount === '0.00', 'balance = 0.00 after 2nd partial');
  ok(p2.j?.data?.installment?.status === 'COMPLETED', 'status = COMPLETED');
  const colId = p2.j?.data?.collection?.id;

  const over = await call('POST', '/api/collections', { token: AT, body: { installment_id: inst3, collection_date: '2026-09-03', amount: 5000, payment_mode_id: 1, idempotency_key: 'k-adv-'+RUN } });
  ok(over.status === 201, 'advance payment accepted (allow_advance on by default) -> 201');
  ok(over.j?.data?.installment?.status === 'COMPLETED' && over.j?.data?.installment?.balance_amount === '0.00', 'target installment cleared, surplus carried as advance');

  console.log('== reversal ==');
  const rev = await call('POST', `/api/collections/${colId}/reverse`, { token: AT, body: { reason: 'test reversal' } });
  ok(rev.status === 200 && rev.j?.data?.collection?.status === 'cancelled', 'collection reversal marks it cancelled');
  const afterRev = await call('GET', `/api/loans/${LOANID}`, { token: AT });
  ok(afterRev.j.data.installments[0].status === 'PARTIAL', 'installment reverted to PARTIAL');
  ok(afterRev.j.data.installments[0].balance_amount === '400.00', 'balance restored to 400.00');

  console.log('== employee RBAC (no location / no loan scoping) ==');
  const emp = await call('POST', '/api/auth/login', { body: { username: 'ravi', password: 'Employee@123' } });
  const ET = emp.j?.data?.token;
  const RUID = emp.j?.data?.user?.id;
  ok((await call('GET', '/api/locations', { token: ET })).status === 404, 'Location Master endpoint removed for everyone -> 404');
  ok((await call('POST', '/api/customers', { token: ET, body: { name: 'x', mobile: '1' } })).status === 403, 'employee without customers.create -> 403');
  // With location-based access control removed, an employee sees every customer/loan
  // regardless of assignment or the customer's typed location.
  ok((await call('GET', '/api/customers', { token: ET })).j?.pagination?.total >= 1, 'employee sees all customers (no location scope)');
  ok((await call('GET', `/api/loans/${LOANID}`, { token: ET })).status === 200, 'employee opens any loan without assignment (no loan scope)');
  ok((await call('GET', '/api/collection/workload', { token: ET })).j?.pagination?.total >= 1, 'employee workload includes the loan with overdue installments');

  console.log('== permission update still rotates the session ==');
  await call('PUT', `/api/employees/${RUID}/permissions`, { token: AT, body: { loan_ids: [LOANID] } });
  ok((await call('GET', `/api/loans/${LOANID}`, { token: ET })).status === 401, 'permission change revoked old employee token -> 401');
  const emp2 = await call('POST', '/api/auth/login', { body: { username: 'ravi', password: 'Employee@123' } });
  const ET2 = emp2.j?.data?.token;
  ok((await call('GET', `/api/loans/${LOANID}`, { token: ET2 })).status === 200, 'after re-login employee still sees the loan');
  ok((await call('GET', '/api/collection/workload', { token: ET2 })).j?.pagination?.total >= 1, 'employee workload still populated');
  const empCollect = await call('POST', '/api/collections', { token: ET2, body: { installment_id: inst2, collection_date: '2026-09-03', amount: 1000, payment_mode_id: 2, idempotency_key: 'k-emp-'+RUN } });
  ok(empCollect.status === 201 && empCollect.j?.data?.installment?.status === 'COMPLETED', 'employee collects full installment #2 -> COMPLETED');

  console.log('== force logout ==');
  await call('POST', `/api/employees/${RUID}/force-logout`, { token: AT, body: { reason: 'test' } });
  const flo = await call('GET', `/api/collection/workload`, { token: ET2 });
  ok(flo.status === 401 && flo.j?.error_code === 'SESSION_TERMINATED', 'force logout -> SESSION_TERMINATED on next call');

  console.log('== audit trail ==');
  const al = await call('GET', '/api/audit-logs?per_page=200', { token: AT });
  const actions = new Set((al.j?.data || []).map((r) => r.action));
  for (const ev of ['login.success', 'login.failure', 'customer.create', 'loan.create', 'collection.create', 'collection.cancel', 'permission.update', 'auth.force_logout']) {
    ok(actions.has(ev), 'audit captured ' + ev);
  }

  console.log(`\n================  ${pass} passed / ${fail} failed  ================`);
  process.exit(fail ? 1 : 0);
};
run().catch((e) => { console.error(e); process.exit(2); });
