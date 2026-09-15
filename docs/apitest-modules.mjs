// Tests for the added production modules: Expenses, Office Income, Reports, Settings.
// Assumes a fresh `php backend/setup.php install` and the API reachable.
const B = process.env.API_BASE || 'http://localhost/siva-murugan-chit-fund/backend/public';
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  PASS ' + m); } else { fail++; console.log('  FAIL ' + m); } };
async function call(method, path, { token, body, raw } = {}) {
  const h = {};
  if (!raw) h['Content-Type'] = 'application/json';
  if (token) h.Authorization = 'Bearer ' + token;
  const r = await fetch(B + path, { method, headers: h, body: body ? (raw ? body : JSON.stringify(body)) : undefined });
  const ct = r.headers.get('content-type') || '';
  let j = null, text = null;
  if (raw) { /* binary */ } else if (ct.includes('application/json')) { try { j = await r.json(); } catch {} } else { text = await r.text(); }
  return { status: r.status, j, text, ct };
}

const run = async () => {
  const AT = (await call('POST', '/api/auth/login', { body: { username: 'admin', password: 'Admin@123' } })).j?.data?.token;
  ok(!!AT, 'admin login');

  // ---- seed a loan + collection so reports have data ----
  const loc = { id: 'Report Town', name: 'Report Town' };
  const cus = (await call('POST', '/api/customers', { token: AT, body: { name: 'Report Cust', mobile: '9001112223', location: loc.name } })).j.data;
  const ln = (await call('POST', '/api/loans', { token: AT, body: { customer_id: cus.id, account_type: 'chit', principal_amount: 5000, installment_amount: 1000, tenure: 5, frequency: 'weekly', start_date: '2026-01-05', schedule_type: 'WEEKLY' } })).j.data;
  const inst1 = (await call('GET', `/api/loans/${ln.id}`, { token: AT })).j.data.installments[0].id;
  await call('POST', '/api/collections', { token: AT, body: { installment_id: inst1, collection_date: '2026-09-04', amount: 700, payment_mode_id: 1, idempotency_key: 'rpt-' + Date.now() } });

  console.log('== expenses ==');
  const ex = await call('POST', '/api/expenses', { token: AT, body: { amount: 1200.50, expense_date: '2026-09-04', category: 'Fuel', account_id: 1, remarks: 'bike' } });
  ok(ex.status === 201 && ex.j.data.amount === '1200.50', 'expense created');
  const exId = ex.j.data.id;
  const exList = await call('GET', '/api/expenses?per_page=25', { token: AT });
  ok(Array.isArray(exList.j.data) && exList.j.pagination.total >= 1, 'expense list paginated');
  ok(Number(exList.j.pagination.summary.total_expenses) >= 1200.5, 'expense summary card total');
  ok(Number(exList.j.pagination.summary.cash_expenses) >= 1200.5, 'expense summary splits cash vs bank');
  ok((await call('PUT', `/api/expenses/${exId}`, { token: AT, body: { amount: 1000 } })).j.data.amount === '1000.00', 'expense edit');
  ok((await call('POST', `/api/expenses/${exId}/cancel`, { token: AT, body: { reason: 't' } })).status === 200, 'expense cancel');
  const exX = await call('GET', '/api/expenses/export', { token: AT, raw: true });
  ok(exX.ct.includes('spreadsheetml'), 'expense export is real .xlsx');

  console.log('== office income ==');
  const inc = await call('POST', '/api/income', { token: AT, body: { amount: 8000, received_date: '2026-09-04', category: 'Moi', account_id: 2, giver_details: 'Uncle' } });
  ok(inc.status === 201, 'income created');
  const incList = await call('GET', '/api/income?per_page=25', { token: AT });
  ok(Number(incList.j.pagination.summary.total_income) >= 8000 && Number(incList.j.pagination.summary.bank_income) >= 8000, 'income summary cards');
  ok((await call('GET', '/api/income/export', { token: AT, raw: true })).ct.includes('spreadsheetml'), 'income export is real .xlsx');
  ok((await call('GET', '/api/income/categories', { token: AT })).j.data.includes('Moi'), 'income categories include seeded set');

  console.log('== reports ==');
  const cat = await call('GET', '/api/reports', { token: AT });
  ok(cat.j.data.length === 11, '11 reports in catalogue (location-collection removed)');
  for (const rp of cat.j.data) {
    const res = await call('GET', `/api/reports/${rp.name}`, { token: AT });
    ok(res.status === 200 && Array.isArray(res.j.data.rows) && Array.isArray(res.j.data.headers), `report ${rp.name} returns rows+headers`);
  }
  const cp = await call('GET', '/api/reports/chit-collection?date_from=2026-09-01&date_to=2026-09-30', { token: AT });
  ok(cp.j.data.rows.length >= 1 && Number(cp.j.data.totals['Total Collected']) >= 700, 'chit-collection totals match DB');
  const pend = await call('GET', '/api/reports/pending-dues', { token: AT });
  ok(Number(pend.j.data.totals['Pending Amount']) > 0, 'pending-dues has outstanding balance');
  const xRep = await call('GET', '/api/reports/chit-profit/export', { token: AT, raw: true });
  ok(xRep.ct.includes('spreadsheetml'), 'report export is real .xlsx');
  const xFull = await call('GET', '/api/reports/full-export', { token: AT, raw: true });
  ok(xFull.ct.includes('spreadsheetml'), 'full workbook export is real .xlsx');

  console.log('== settings ==');
  const s0 = await call('GET', '/api/settings', { token: AT });
  ok(s0.j.data.fine_settings.length >= 1 && s0.j.data.payment_modes.length >= 4, 'settings bundle');
  ok((await call('PUT', '/api/settings/organization', { token: AT, body: { name: 'SMCF Test Co', email: 'a@b.com' } })).j.data.name === 'SMCF Test Co', 'org profile update');
  ok((await call('PUT', '/api/settings/schedule', { token: AT, body: { weekly_collection_day: 3, monthly_mode: 'MONTHLY_WEEKDAY', monthly_cycle_weeks: 4, monthly_interval_days: 30 } })).status === 200, 'schedule settings update');
  const fr = await call('POST', '/api/settings/fine', { token: AT, body: { fine_type: 'FIXED_PER_DAY', rate_value: 25, grace_days: 2, max_fine_type: 'percent_of_payable', max_fine_value: 15, effective_from: '2026-10-01' } });
  ok(fr.status === 201 && fr.j.data.length >= 2, 'new effective-dated fine rule added');
  const pm = await call('POST', '/api/settings/payment-modes', { token: AT, body: { code: 'CHEQUE', name: 'Cheque', sort_order: 5 } });
  ok(pm.status === 200 && pm.j.data.some(m => m.code === 'CHEQUE'), 'payment mode added');
  ok((await call('PUT', '/api/settings/translations', { token: AT, body: { lang: 'ta', key: 'nav.reports', value: 'அறிக்கை' } })).status === 200, 'translation upsert');

  console.log('== employee scope on reports ==');
  const ET = (await call('POST', '/api/auth/login', { body: { username: 'ravi', password: 'Employee@123' } })).j?.data?.token;
  ok((await call('GET', '/api/reports/loan-summary', { token: ET })).status === 403, 'employee without reports.view -> 403');
  ok((await call('GET', '/api/expenses', { token: ET })).status === 403, 'employee without expenses.view -> 403');

  console.log(`\n================  ${pass} passed / ${fail} failed  ================`);
  process.exit(fail ? 1 : 0);
};
run().catch(e => { console.error(e); process.exit(2); });
