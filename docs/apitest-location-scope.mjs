// LOCATION-BASED ACCESS WAS REMOVED.
// Admin AND Employee both see every customer / chit / loan regardless of any
// employee<->location mapping. Location data still exists (a customer's master
// location still drives the chit's stored location_id) and `?location_id=` is
// still available as an ordinary FILTER for everyone — it just never hides data.
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

  // A master location that NO employee is mapped to.
  const loc = (await call('POST', '/api/locations', { token: AT, body: { code: 'NLS-' + Date.now().toString(36), name: 'Surandai' } })).j.data;
  ok(!!loc?.id, 'created master location Surandai id=' + loc?.id);

  // Customer mapped to that location + a chit (location still derives from the customer).
  const arun = (await call('POST', '/api/customers', { token: AT, body: { name: 'Arun NLS', mobile: '9700000001', primary_location_id: loc.id } })).j.data;
  ok(arun?.primary_location_id === loc.id, 'customer saved with primary_location_id = Surandai');
  const chit = (await call('POST', '/api/loans', { token: AT, body: {
    customer_id: arun.id, account_type: 'chit', principal_amount: 20000, installment_amount: 3000,
    tenure: 10, frequency: 'weekly', start_date: '2026-03-01', schedule_type: 'WEEKLY',
  } })).j.data;
  ok(chit?.location_id === loc.id, 'chit inherited the customer master location (data behaviour preserved)');

  // ravi is NOT mapped to Surandai — but location access control is gone.
  const ET = await login('ravi', 'Employee@123');
  const cust = (await call('GET', '/api/customers?per_page=200', { token: ET })).j.data;
  const wl = (await call('GET', '/api/collection/workload?per_page=200', { token: ET })).j.data.loans;
  ok(custNames(cust).includes('Arun NLS'), 'employee sees the customer even though not mapped to its location');
  ok(wlNames(wl).includes('Arun NLS'), 'employee sees the chit in Collection workload (no location filter)');
  ok((await call('GET', '/api/loans/' + chit.id, { token: ET })).status === 200, 'employee can open any chit detail -> 200');
  ok((await call('GET', '/api/pending-dues', { token: ET })).j.pagination.total >= 1, 'employee sees pending dues across all locations');

  // location_id is still a plain filter for the employee (not a guard).
  const filtered = (await call('GET', '/api/customers?location_id=' + loc.id, { token: ET })).j.data;
  ok(custNames(filtered).length >= 1 && custNames(filtered).every((n) => n === 'Arun NLS'),
     'employee ?location_id= filters (does not 403) -> only Surandai customers');
  const otherLoc = (await call('GET', '/api/customers?location_id=1', { token: ET }));
  ok(otherLoc.status === 200, 'employee filtering by a location they are NOT mapped to -> 200 (no scope error)');

  // search still works
  const byName = (await call('GET', '/api/customers?search=Surandai', { token: ET })).j.data;
  ok(custNames(byName).includes('Arun NLS'), 'employee search "Surandai" -> customer shows (location-name match)');

  // meta: employee gets the full location list (not a filtered subset)
  const meta = (await call('GET', '/api/meta/bootstrap', { token: ET })).j.data;
  const adminMeta = (await call('GET', '/api/meta/bootstrap', { token: AT })).j.data;
  ok(meta.locations.length === adminMeta.locations.length, 'employee meta.locations == admin meta.locations (all locations)');

  // admin unchanged
  const adminAll = (await call('GET', '/api/customers?per_page=200', { token: AT })).j.data;
  ok(custNames(adminAll).includes('Arun NLS'), 'admin still sees everything');

  console.log('\n  ' + pass + ' passed / ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
};
run();
