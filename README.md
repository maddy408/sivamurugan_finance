# Siva Murugan Chit Fund

A standalone chit / finance management application — **PHP 8.2 REST API + React 18 (Vite) SPA + MySQL/MariaDB**.

## Database & Deployment Guidelines

### 1. Database Schema & Migration Protocol
Whenever any database structure or data change is required (such as `CREATE`, `ALTER`, `INSERT`, `UPDATE`, or `DELETE`):
- **Create Migration File**: Always create a new SQL file inside the `database/migrations/` directory.
- **Filename Format**: `YYYYMMDD_HHMMSS_relevant_name.sql` (e.g., `20260919_180000_add_nominee_columns.sql`).
- **Update Base Schema**: Update `database/schema.sql` and `database/seed.sql` to keep master schemas in sync.
- **Git Push**: Commit and push the migration file to Git immediately.

### 2. Mandatory Deployment Protocol
- **Strict Branch & Push Rule**:
  - To deploy to **DEV**: You MUST be on the `dev` branch and MUST push all commits to Git (`git push origin dev`) BEFORE running `python deploy.py --env dev`.
  - To deploy to **PRODUCTION**: You MUST be on the `main` branch and MUST push all commits to Git (`git push origin main`) BEFORE running `python deploy.py --env prod`.
- **Enforced Verification**: The deployment script (`deploy.py`) strictly verifies branch and git status before executing any remote upload.

---

## Stack

| Layer | Tech |
|---|---|
| Backend | PHP 8.2, no framework — custom router (`backend/routes.php`), PDO/MySQL |
| Frontend | React 18 + Vite 5, `react-router-dom` HashRouter |
| DB | MySQL 8 / MariaDB 10.5+ (`utf8mb4`), money as `DECIMAL(15,2)` |
| Auth | opaque bearer tokens (`sessions` table), RBAC (`ADMIN`, `EMPLOYEE`) |

## Roles

- **ADMIN** — full access.
- **EMPLOYEE** — all customers, all loans/chits, collection, pending dues.

There is **no location‑based access control** — location data is kept for
records/reporting only.

---

## Quick start (Windows / XAMPP)

```bat
:: 1. put this folder at  C:\xampp\htdocs\siva-murugan-chit-fund
:: 2. backend env
copy C:\xampp\htdocs\siva-murugan-chit-fund\backend\.env.example C:\xampp\htdocs\siva-murugan-chit-fund\backend\.env

:: 3. create the database + schema + seed  (creates `siva_murugan_chit_fund`; never touches other DBs)
C:\xampp\php\php.exe C:\xampp\htdocs\siva-murugan-chit-fund\backend\setup.php install

:: 4. frontend
cd C:\xampp\htdocs\siva-murugan-chit-fund\frontend
npm install
npm run build          :: outputs to ..\web\
```

Open **http://localhost/siva-murugan-chit-fund/web/** and sign in:

| User | Password | Role |
|---|---|---|
| `admin` | `Admin@123` | ADMIN |
| `ravi` | `Employee@123` | EMPLOYEE |

API base: **http://localhost/siva-murugan-chit-fund/backend/public** (Apache serves `backend/public` via `.htaccess`).

### Dev mode (hot reload)

```bat
cd C:\xampp\htdocs\siva-murugan-chit-fund\frontend
npm run dev            :: http://localhost:5173 , talks to the Apache API
```

---

## Configuration

Everything is environment‑driven — no hard‑coded localhost URLs in shipped code (fallbacks only).

### `backend/.env`

| Var | Purpose |
|---|---|
| `APP_URL` | Public API base URL |
| `APP_DEBUG` | `true` shows stack traces; set `false` in production |
| `DB_HOST` / `DB_PORT` / `DB_DATABASE` / `DB_USERNAME` / `DB_PASSWORD` | **This app's own DB** — default `siva_murugan_chit_fund` |
| `CORS_ALLOWED_ORIGINS` | Comma‑separated browser origins allowed to call the API |
| `TOKEN_TTL_HOURS` | Bearer token lifetime |

### `frontend/.env.local`

| Var | Purpose |
|---|---|
| `VITE_API_BASE_URL` | API base the SPA calls (baked in at build time) |

---

## What's different from the reference app

1. **Collection day is optional.** No forced Monday / fixed weekday. Weekly,
   monthly and daily chits all work with or without a preferred day. If no day
   is chosen the schedule simply runs from the chit's start date.
   (`ScheduleService::computeDueDates`, `LoanController::normScheduleConfig`,
   "Preferred collection day" select on New/Edit Chit.)
2. **No location‑based access.** `Auth::loadScope` returns an unrestricted scope
   for employees too. Admin and Employee see every customer / chit / pending due
   / collection. Location tables and `employee_locations` are preserved for
   reporting; `location_id` is still available as a plain filter.
3. **Pending Dues in the top navigation** (Admin + Employee). Search by customer
   name / phone / loan id / chit code, see due / paid / pending / due‑date /
   installment number, and **collect the pending amount inline**. All figures
   come from the backend (`installments.balance_amount`), never the frontend.
4. **Chit amount ⧸ due amount ⧸ distributed amount stay separate.** Changing a
   chit's due/installment amount recalculates only future **unpaid** dues. The
   original chit amount, every recorded distribution, and all paid/partial
   installments are frozen — historical rows are never rewritten.
5. **Create forms** (Customer, Employee, Chit, Location) use a clean 2‑column
   grid in a wide modal — no cramped internal scrolling. Reports UI polished
   (icon summary cards, filter panel, sticky table header) — no calculation
   changes.
6. **Branding** — "Siva Murugan Chit Fund" in the header, browser title, login
   screen, organization record and translations. Storage keys are namespaced
   (`smcf.*`) so a browser can hold this app's session and another app's session
   independently.

---

## Database

- Schema: `database/schema.sql` — run by `setup.php install`.
- Seed: `database/seed.sql` — demo locations, 2 users, payment modes, accounts,
  fine rule, organization = "Siva Murugan Chit Fund", translations.
- Migrations: `database/migrations/` — one‑off, re‑runnable, data‑safe SQL for
  updating an **already‑populated** DB:
  ```bat
  C:\xampp\php\php.exe backend\setup.php apply database\migrations\2026-09-10_business-flow.sql
  ```

`setup.php` commands: `check` · `install` · `migrate` · `seed` · `apply <file>` ·
`set-password <user> <pass>`.

---

## Tests

Node 18+ integration suites in `docs/` hit the running Apache API. They default
to `http://localhost/siva-murugan-chit-fund/backend/public`; override with
`API_BASE`.

```bat
C:\xampp\php\php.exe backend\setup.php install      :: reset to clean seed first
node docs\apitest-business-flow.mjs                 :: spec test cases 1-12
node docs\apitest.local.mjs                         :: core end-to-end
node docs\apitest-reports.mjs
:: ...etc (see docs/)
```

---

## Production notes

- **Frontend:** `npm run build` → static files in `web/`. Set
  `VITE_API_BASE_URL` before building. `vite.config.js` uses `base: './'` so the
  build works under any sub‑path.
- **Backend:** point Apache/nginx at `backend/public`. Set `APP_DEBUG=false`,
  a strong DB password, and real `CORS_ALLOWED_ORIGINS`. `backend/.env` is
  git‑ignored — deploy it out of band or use real environment variables (they
  override the file).
- **DB:** run `php backend/setup.php install` once on the target, or import
  `database/schema.sql` + `database/seed.sql` manually, then change the seeded
  passwords with `setup.php set-password`.
