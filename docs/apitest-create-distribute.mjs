// Chit creation with an OPTIONAL immediate distribution + Employee view/edit.
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
  await call('PUT', '/api/settings/accounts/1', { token: AT, body: { opening_balance: 100000 } }); // Office Cash
  await call('PUT', '/api/settings/accounts/2', { token: AT, body: { opening_balance: 200000 } }); // Bank
  const bal = async () => {
    const c = (await call('GET', '/api/dashboard', { token: AT })).j.data.cards;
    return { office: Number(c.office_cash), bank: Number(c.bank_cash), distributed: Number(c.distributed_amount) };
  };
  const mk = (body) => call('POST', '/api/loans', { token: AT, body: Object.assign({
    customer_id: 1, account_type: 'chit', principal_amount: 20000, installment_amount: 3000,
    tenure: 10, frequency: 'weekly', start_date: '2026-03-01', schedule_type: 'WEEKLY',
  }, body) });

  // ===== 26. create WITHOUT distribution -> zero financial impact =====
  const b0 = await bal();
  const c1 = await mk({});
  const b1 = await bal();
  ok(c1.status === 201, 'create chit (no distribution) -> 201');
  ok(b1.office === b0.office && b1.bank === b0.bank && b1.distributed === b0.distributed, 'no distribution: Office/Bank/Distributed all unchanged');
  ok(D(c1.j.data.distribution.total_distributed) === '0.00' && D(c1.j.data.distribution.remaining_undistributed) === '20000.00', 'no distribution: total 0 / remaining 20000');

  // ===== 27. create WITH FULL distribution (Office Cash) + New EMI =====
  const b2 = await bal();
  const c2 = await mk({ distribution: { amount: 20000, account_id: 1, distributed_date: '2026-03-01', new_emi_amount: 4000, remarks: 'Initial full' } });
  const b3 = await bal();
  ok(c2.status === 201, 'create chit + full distribution -> 201');
  ok(b3.office === b2.office - 20000, 'full distribution: Office Cash -20000 (' + b2.office + ' -> ' + b3.office + ')');
  ok(b3.bank === b2.bank, 'full distribution: Bank unchanged');
  ok(b3.distributed === b2.distributed + 20000, 'full distribution: Distributed Amount +20000');
  ok(D(c2.j.data.distribution.total_distributed) === '20000.00' && D(c2.j.data.distribution.remaining_undistributed) === '0.00' && c2.j.data.distribution.status === 'fully_distributed', 'full distribution: total 20000 / remaining 0 / fully_distributed');
  ok(D(c2.j.data.distribution.current_emi) === '4000.00', 'full distribution: current EMI = New EMI 4000');
  ok(D(c2.j.data.installment_amount) === '4000.00', 'full distribution: loan.installment_amount = 4000 (schedule regenerated)');
  ok((c2.j.data.installments || []).every((i) => D(i.payable_amount) === '4000.00'), 'full distribution: every installment payable = 4000');
  // exactly ONE distribution row, ONE financial hit
  const ds2 = (await call('GET', '/api/loans/' + c2.j.data.id + '/distributions', { token: AT })).j.data;
  ok(ds2.distributions.filter((d) => d.status === 'active').length === 1, 'full distribution: exactly ONE distribution history row (no double)');

  // Collection uses the updated EMI
  const wl = ((await call('GET', '/api/collection/workload?per_page=200', { token: AT })).j.data.loans || []).find((l) => l.id === c2.j.data.id);
  ok(wl && D(wl.installment_amount) === '4000.00', 'Collection workload shows EMI 4000 for the freshly distributed chit');

  // ===== 28. create WITH PARTIAL distribution, then distribute the rest =====
  const b4 = await bal();
  const c3 = await mk({ distribution: { amount: 8000, account_id: 1 } });
  const b5 = await bal();
  ok(b5.office === b4.office - 8000, 'partial distribution: Office Cash -8000 only');
  ok(D(c3.j.data.distribution.remaining_undistributed) === '12000.00' && c3.j.data.distribution.status === 'partially_distributed', 'partial: remaining 12000 / partially_distributed');
  // later distribution of the remaining 12000
  const later = await call('POST', '/api/loans/' + c3.j.data.id + '/distributions', { token: AT, body: { amount: 12000, account_id: 1 } });
  const b6 = await bal();
  ok(later.status === 201, 'later distribution 12000 -> 201');
  ok(b6.office === b5.office - 12000, 'later distribution: Office Cash -12000 only (previous 8000 NOT re-deducted)');
  const ds3 = (await call('GET', '/api/loans/' + c3.j.data.id + '/distributions', { token: AT })).j.data;
  ok(D(ds3.summary.total_distributed) === '20000.00' && D(ds3.summary.remaining_undistributed) === '0.00', 'total distributed 20000 / remaining 0 after both');

  // ===== 29. create WITH distribution from BANK =====
  const b7 = await bal();
  const c4 = await mk({ distribution: { amount: 10000, account_id: 2 } });
  const b8 = await bal();
  ok(b8.bank === b7.bank - 10000, 'bank distribution: Bank -10000');
  ok(b8.office === b7.office, 'bank distribution: Office Cash unchanged');

  // ===== 9. validation: distributed > chit amount -> 422, chit NOT created =====
  const loansBefore = (await call('GET', '/api/loans?per_page=200', { token: AT })).j.data.length;
  const bad = await mk({ distribution: { amount: 25000, account_id: 1 } });
  ok(bad.status === 422, 'distribution > chit amount -> 422');
  const loansAfter = (await call('GET', '/api/loans?per_page=200', { token: AT })).j.data.length;
  ok(loansAfter === loansBefore, 'rejected distribution left NO orphan chit');

  // ===== 23. EMI never auto-changes without an explicit New EMI =====
  const c5 = await mk({ distribution: { amount: 20000, account_id: 1 } }); // no new_emi_amount
  ok(D(c5.j.data.installment_amount) === '3000.00', 'distribution without New EMI: EMI stays 3000');

  // ===== Employee view + edit =====
  const emp = (await call('GET', '/api/employees/2', { token: AT })).j;
  ok(emp.success === true && emp.data?.name === 'Ravi Kumar', 'GET /api/employees/2 -> employee profile');
  ok(!('password' in emp.data) && !('password_hash' in emp.data), 'employee profile does NOT expose credentials');
  ok(Array.isArray(emp.data.assigned_locations) && emp.data.assigned_locations.length === 2, 'employee profile has assigned_locations (2)');

  const upd = await call('PUT', '/api/employees/2', { token: AT, body: { phone: '9111100000', email: 'ravi.k@example.com', location_ids: [1, 3] } });
  ok(upd.status === 200, 'PUT /api/employees/2 -> 200');
  const emp2 = (await call('GET', '/api/employees/2', { token: AT })).j.data;
  ok(emp2.phone === '9111100000' && emp2.email === 'ravi.k@example.com', 'employee edit: phone + email updated');
  ok(emp2.assigned_locations.map((l) => l.id).sort().join(',') === '1,3', 'employee edit: locations re-mapped to [1,3] (kept for reporting)');
  // Location-based access removed: the mapping no longer limits what ravi sees.
  const ET = (await call('POST', '/api/auth/login', { body: { username: 'ravi', password: 'Employee@123' } })).j.data.token;
  const raviCust = (await call('GET', '/api/customers?per_page=200', { token: ET })).j.data;
  const adminCust = (await call('GET', '/api/customers?per_page=200', { token: AT })).j.data;
  ok(raviCust.length === adminCust.length, 'after edit: ravi still sees ALL customers (location mapping is not a filter)');

  console.log('\n  ' + pass + ' passed / ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
};
run();
