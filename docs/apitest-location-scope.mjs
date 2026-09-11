// NO LOCATION MASTER, NO LOCATION FIELD, NO LOCATION-BASED ACCESS CONTROL.
//   - `/api/locations` CRUD is removed (404).
//   - Customers have a single free-text `address_line1` field. There is no
//     separate "location" concept, no distinct-values list, no filter driven
//     by one (`meta.locations` no longer exists in the bootstrap payload).
//   - Admin AND Employee see every customer / chit / loan / pending due,
//     regardless of address, with no assignment/location scoping at all.
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

  // Customer has only a free-text address. Typing a place name into it must
  // NOT create anything location-shaped.
  const arun = (await call('POST', '/api/customers', {
    token: AT, body: { name: 'Arun NLS', mobile: '9700000001', address_line1: '12 Main Road, Surandai, Tenkasi' },
  })).j.data;
  ok(arun?.address_line1 === '12 Main Road, Surandai, Tenkasi', 'customer stores the address verbatim as plain text');
  ok(!('location_id' in arun), 'customer payload has no location_id');
  const locsAfter = await call('GET', '/api/locations', { token: AT });
  ok(locsAfter.status === 404, 'creating a customer with "Surandai" in the address did not resurrect /api/locations');

  const chit = (await call('POST', '/api/loans', { token: AT, body: {
    customer_id: arun.id, account_type: 'chit', principal_amount: 20000, installment_amount: 3000,
    tenure: 10, frequency: 'weekly', start_date: '2026-03-01', schedule_type: 'WEEKLY',
  } })).j.data;
  ok(chit?.id > 0, 'chit created without any location field');

  // Employee ravi — sees everything, no location/assignment restriction.
  const ET = await login('ravi', 'Employee@123');
  const cust = (await call('GET', '/api/customers?per_page=200', { token: ET })).j.data;
  const wl = (await call('GET', '/api/collection/workload?per_page=200', { token: ET })).j.data.loans;
  ok(custNames(cust).includes('Arun NLS'), 'employee sees the customer (no location/assignment filter)');
  ok(wlNames(wl).includes('Arun NLS'), 'employee sees the chit in Collection workload');
  ok((await call('GET', '/api/loans/' + chit.id, { token: ET })).status === 200, 'employee can open any chit detail -> 200');
  ok((await call('GET', '/api/pending-dues', { token: ET })).j.pagination.total >= 1, 'employee sees pending dues across all customers');

  // The old `?location_id=` list filter has been removed entirely (not just
  // hidden in the UI) — the param is now simply unrecognised and ignored.
  const allForEmployee = (await call('GET', '/api/customers?per_page=200', { token: ET })).j.data;
  const withStrayParam = (await call('GET', '/api/customers?location_id=Surandai&per_page=200', { token: ET })).j.data;
  ok(withStrayParam.length === allForEmployee.length, '?location_id= is no longer a recognised filter (ignored, not a 4xx)');

  // Free-text search still works across the address field.
  const byAddress = (await call('GET', '/api/customers?q=Surandai', { token: ET })).j.data;
  ok(custNames(byAddress).includes('Arun NLS'), 'employee search "Surandai" finds the customer via address text');

  // meta.bootstrap no longer exposes any location list.
  const meta = (await call('GET', '/api/meta/bootstrap', { token: ET })).j.data;
  ok(!('locations' in meta), 'meta.bootstrap has no "locations" key (no master-style picker)');

  // admin unchanged
  const adminAll = (await call('GET', '/api/customers?per_page=200', { token: AT })).j.data;
  ok(custNames(adminAll).includes('Arun NLS'), 'admin still sees everything');

  console.log('\n  ' + pass + ' passed / ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
};
run();
