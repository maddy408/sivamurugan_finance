# Build status

Deployed and verified on **XAMPP** (Apache + `C:\xampp\php\php.exe` 8.2 + MySQL,
database `chit_fund`). Served at:

- API  — `http://localhost/siva-murugan-chit-fund/backend/public`
- Web  — `http://localhost/siva-murugan-chit-fund/web/`  (built SPA, `npm run build` → `web/`)

## Automated API tests — 81 / 81 pass

Reproduce:

```bat
C:\xampp\php\php.exe backend\setup.php install
node docs\apitest.local.mjs        :: core   — 49 checks
C:\xampp\php\php.exe backend\setup.php install
node docs\apitest-modules.mjs      :: modules — 32 checks
```

### Core (49) — auth, RBAC, scope, force-logout, EMI, schedule, fine, collections

Login / bad-password 401 / no-token 401 / `/me` · customer create + **server-side**
search + pagination · location create + duplicate 409 · **EMI 10000/10 = 1000.00** ·
**WEEKLY** first due Mon 2026-01-05, 10th 2026-03-09, 10 rows auto-generated ·
**idempotent regen — 0 duplicates** · fine ₹50/day **capped at 10 % = 100.00** ·
**partial payments** 600→PARTIAL→+400→COMPLETED, balances exact · idempotency-key
replay · **overpayment → 422** · **reversal** restores state, original kept ·
**employee scope** (unassigned → 0 workload / 403) · RBAC 403s · assignment revokes
session (401) → re-login sees loan → collects · **force-logout → SESSION_TERMINATED** ·
audit captured 8 event types.

### Modules (32) — Expenses, Office Income, Reports, Settings

Expenses: create / edit / cancel / list+pagination / **summary cards** (total, cash,
bank) / **CSV export of the full filtered set**. Office Income: same + seeded
categories (Moi/Gift/Donation/Investment) + cash-vs-bank split. Reports: catalogue of
**8**, every one returns headers + rows, `collected-payments` & `pending-dues` totals
match the DB, **CSV export**. Settings: bundle load, org-profile update, schedule
update, **new effective-dated fine rule**, payment-mode add, translation upsert.
Employee without `reports.view` / `expenses.view` → 403.

## Browser-verified on the Apache-served build

Login → Dashboard (live totals) → Reports (Customer Collection Summary with TOTAL
row) → Expenses (summary cards + table + actions) → Office Income (bank/cash split) →
Settings (Organization / Schedule / Fine rules / Payment modes / Accounts / Language
tabs, logo upload control). Stale/expired token cleanly redirects to Login.

## Not yet built (schema + permissions already present)

- PDF export of reports (CSV export is done; `dompdf`/`mpdf` writer is the next step).
- Excel `.xlsx` import wizard (mapping / preview / dedupe) for master data.
- React Native 0.76 mobile app — see `mobile/README.md`.
