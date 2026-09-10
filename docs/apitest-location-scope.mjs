// NO LOCATION-BASED ACCESS CONTROL and NO LOCATION MASTER.
//   - `/api/locations` CRUD is removed (404).
//   - A customer's location is a plain typed VARCHAR field.
//   - Admin AND Employee see every customer / chit / loan / pending due,
//     regardless of the typed location. `?location_id=` is still an ordinary
//     filter (its value is the location text) that never hides anything.
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
const custNames = (arr) => (arr || []).map((c) => c.name).sort();
const wlNames = (arr) => (arr || []).map((l) => l.customer_name).sort();

const run = async () => {
  const AT = await login('admin', 'Admin@123');

  // Location Master is gone.
  ok((await call('GET', '/api/locations', { token: AT })).status === 404, 'GET /api/locations -> 404 (Location Master removed)');
  ok((await call('POST', '/api/locations', { token: AT, body: { code: 'X', name: 'X' } })).status === 404, 'POST /api/locations -> 404');

  // Customer with a typed location. No employee is "assigned" to anything.
  const arun = (await call('POST', '/api/customers', { token: AT, body: { name: 'Arun NLS', mobile: '9700000001', location: 'Surandai' } })).j.data;
  ok(arun?.location === 'Surandai', 'customer stores typed location "Surandai" verbatim');
  const chit = (await call('POST', '/api/loans', { token: AT, body: {
    customer_id: arun.id, account_type: 'chit', principal_amount: 20000, installment_amount: 3000,
    tenure: 10, frequency: 'weekly', start_date: '2026-03-01', schedule_type: 'WEEKLY',
  } })).j.data;
  ok(chit?.location === 'Surandai', 'chit copies the customer typed location (reporting convenience)');

  // Employee ravi — sees everything, no location restriction.
  const ET = await login('ravi', 'Employee@123');
  const cust = (await call('GET', '/api/customers?per_page=200', { token: ET })).j.data;
  const wl = (await call('GET', '/api/collection/workload?per_page=200', { token: ET })).j.data.loans;
  ok(custNames(cust).includes('Arun NLS'), 'employee sees the customer (no location filter)');
  ok(wlNames(wl).includes('Arun NLS'), 'employee sees the chit in Collection workload');
  ok((await call('GET', '/api/loans/' + chit.id, { token: ET })).status === 200, 'employee can open any chit detail -> 200');
  ok((await call('GET', '/api/pending-dues', { token: ET })).j.pagination.total >= 1, 'employee sees pending dues across all locations');

  // `?location_id=` (value = the location text) is a plain filter for everyone.
  const filtered = (await call('GET', '/api/customers?location_id=Surandai', { token: ET })).j.data;
  ok(filtered.length >= 1 && custNames(filtered).every((n) => n === 'Arun NLS'),
     'employee ?location_id=Surandai filters (does NOT 403) -> only Surandai customers');
  const otherLoc = await call('GET', '/api/customers?location_id=Anna Nagar', { token: ET });
  ok(otherLoc.status === 200, 'employee filtering by ANY location text -> 200 (no scope error)');

  // search across everything
  const byName = (await call('GET', '/api/customers?q=Surandai', { token: ET })).j.data;
  ok(custNames(byName).includes('Arun NLS'), 'employee search "Surandai" finds the customer by location text');

  // meta.locations = distinct typed values, same for admin and employee
  const meta = (await call('GET', '/api/meta/bootstrap', { token: ET })).j.data;
  const adminMeta = (await call('GET', '/api/meta/bootstrap', { token: AT })).j.data;
  ok(JSON.stringify(meta.locations) === JSON.stringify(adminMeta.locations), 'employee meta.locations == admin meta.locations');
  ok(meta.locations.some((l) => l.name === 'Surandai'), 'the new typed location appears in meta.locations');

  // admin unchanged
  const adminAll = (await call('GET', '/api/customers?per_page=200', { token: AT })).j.data;
  ok(custNames(adminAll).includes('Arun NLS'), 'admin still sees everything');

  console.log('\n  ' + pass + ' passed / ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
};
run();
