// Repayment frequency: daily / weekly / monthly -> schedule cadence. Run after setup.php install.
const B = process.env.API_BASE || 'http://localhost/siva-murugan-chit-fund/backend/public';
let pass = 0, fail = 0;
const ok = (c, m) => { c ? (pass++, console.log('  PASS ' + m)) : (fail++, console.log('  FAIL ' + m)); };
const call = async (method, path, { token, body } = {}) => {
  const h = { 'Content-Type': 'application/json' };
  if (token) h.Authorization = 'Bearer ' + token;
  const r = await fetch(B + path, { method, headers: h, body: body ? JSON.stringify(body) : undefined });
  let j = null; try { j = await r.json(); } catch {}
  return { status: r.status, j };
};
const days = (a, b) => Math.round((new Date(b) - new Date(a)) / 86400000);

const run = async () => {
  const AT = (await call('POST', '/api/auth/login', { body: { username: 'admin', password: 'Admin@123' } })).j.data.token;
  const ET = (await call('POST', '/api/auth/login', { body: { username: 'ravi', password: 'Employee@123' } })).j.data.token;
  const loc = { id: 'Freq Town', name: 'Freq Town' };
  const cust = (await call('POST', '/api/customers', { token: AT, body: { name: 'Freq Cust', mobile: '9000000777', location: loc.name } })).j.data;

  const mk = (freq, extra = {}) => call('POST', '/api/loans', { token: AT, body: {
    customer_id: cust.id, account_type: 'chit', principal_amount: 100000, installment_amount: 5000,
    tenure: 5, frequency: freq, start_date: '2026-03-01', schedule_type: 'WEEKLY', ...extra,
  }});

  // ---- DAILY ----
  const d = await mk('daily');
  ok(d.status === 201, 'create daily chit -> 201');
  ok(d.j?.data?.frequency === 'daily', 'daily: frequency persisted = daily');
  ok(d.j?.data?.schedule_type === 'DAILY', 'daily: schedule_type synced to DAILY (was sent WEEKLY)');
  const di = d.j.data.installments;
  ok(di.length === 5, 'daily: 5 installments');
  ok(di[0].due_date.startsWith('2026-03-01'), 'daily: #1 due 2026-03-01');
  ok(days(di[0].due_date, di[1].due_date) === 1 && days(di[1].due_date, di[2].due_date) === 1, 'daily: consecutive days (1-day gap)');
  ok(di.every(x => Number(x.payable_amount) === 5000), 'daily: every installment payable = 5000');

  // ---- WEEKLY ----
  const w = await mk('weekly', { installment_amount: 3000, principal_amount: 50000 });
  ok(w.j?.data?.frequency === 'weekly' && w.j?.data?.schedule_type === 'WEEKLY', 'weekly: frequency+schedule_type = weekly/WEEKLY');
  const wi = w.j.data.installments;
  ok(days(wi[0].due_date, wi[1].due_date) === 7 && days(wi[1].due_date, wi[2].due_date) === 7, 'weekly: 7-day gap between installments');
  ok(wi.every(x => Number(x.payable_amount) === 3000), 'weekly: every installment payable = 3000');

  // ---- MONTHLY ----
  const m = await mk('monthly', { installment_amount: 6000, schedule_type: 'MONTHLY_DAILY' });
  ok(m.j?.data?.frequency === 'monthly' && m.j?.data?.schedule_type === 'MONTHLY_DAILY', 'monthly: frequency/schedule_type = monthly/MONTHLY_DAILY');
  const mi = m.j.data.installments;
  const g1 = days(mi[0].due_date, mi[1].due_date), g2 = days(mi[1].due_date, mi[2].due_date);
  ok(g1 >= 28 && g1 <= 31 && g2 >= 28 && g2 <= 31, `monthly: ~1 month gap (got ${g1}, ${g2} days)`);
  ok(mi.every(x => Number(x.payable_amount) === 6000), 'monthly: every installment payable = 6000');

  // monthly keeps an explicit MONTHLY_WEEKDAY variant
  const mw = await mk('monthly', { installment_amount: 6000, schedule_type: 'MONTHLY_WEEKDAY' });
  ok(mw.j?.data?.schedule_type === 'MONTHLY_WEEKDAY', 'monthly: MONTHLY_WEEKDAY variant preserved, not forced to MONTHLY_DAILY');

  // ---- validation ----
  const bad = await mk('yearly');
  ok(bad.status === 422, 'invalid frequency "yearly" -> 422');

  // ---- edit: change weekly chit to daily re-syncs schedule + regenerates future dates ----
  const up = await call('PUT', '/api/loans/' + w.j.data.id, { token: AT, body: { frequency: 'daily' } });
  ok(up.status === 200, 'edit weekly chit -> daily -> 200');
  const fresh = (await call('GET', '/api/loans/' + w.j.data.id, { token: AT })).j.data;
  ok(fresh.frequency === 'daily' && fresh.schedule_type === 'DAILY', 'edit: frequency+schedule_type both moved to daily/DAILY');
  const fi = fresh.installments.filter(x => x.status !== 'COMPLETED').sort((a,b)=>a.installment_no-b.installment_no);
  ok(days(fi[0].due_date, fi[1].due_date) === 1, 'edit: future installments now 1 day apart');

  // ---- collection still stores actual amount, EMI unchanged (regression guard) ----
  const inst1 = di[0];
  const col = await call('POST', '/api/collections', { token: AT, body: {
    installment_id: inst1.id, collection_date: '2026-03-01', amount: 10000, fine_amount: 0,
    payment_mode_id: 1, idempotency_key: 'freq-' + Date.now(),
  }});
  ok(col.status === 201 && Number(col.j.data.collection.amount) === 10000, 'daily chit: actual paid 10000 saved verbatim (EMI 5000 unchanged)');
  const dl = (await call('GET', '/api/loans/' + d.j.data.id, { token: AT })).j.data;
  ok(Number(dl.installment_amount) === 5000, 'daily chit: installment_amount still 5000 after overpayment');

  console.log(`\n  ${pass} passed / ${fail} failed`);
  process.exit(fail ? 1 : 0);
};
run();
