# Wingboss FMS

Restaurant management and financial system for **Wingboss** (unlimited chicken wings, Davao City). It replaces the separate Google Sheets for sales, expenses, inventory, payroll and accounting, and answers one question: *is each branch, and the business as a whole, really profitable each month?*

> **Not a BIR-accredited POS or CAS.** Loyverse remains the point of sale. This system prepares figures that support BIR filing (gross sales, the SC/PWD discount log, withholding and remittance summaries). It does not file with the BIR, and it is not a substitute for an accredited Computerized Accounting System. The percentage-tax module (spec 7.10) was deferred at the Owner's request.

## Status

All nine build phases are done.

| Phase | Scope |
|---|---|
| 1 | Foundation: auth (email + device-bound PIN), roles & permissions per location, locations, users, devices, audit log, UI shell, seed |
| 2 | Sales & cash: Loyverse CSV import, daily sales with split payments, shift close and cash count, deposits, money accounts |
| 3 | Expenses & AP: expenses with receipt photos, approvals (₱5,000 Owner threshold), recurring expenses, petty cash, suppliers, bills and AP |
| 4 | Ledger: chart of accounts, auto-posting, manual entries, period close, P&L, balance sheet, cash flow, equity, trial balance, GL, journal, fixed assets, allocations |
| 5 | Inventory & commissary: items, counts, waste, recipes, production, transfers, variance and per-pax KPIs |
| 6 | Banking: statement import (BPI, GCash, Maya, Grab presets + column mapping), auto-match, card/QR/Grab payouts at the real fee, reconciliation and lock |
| 7 | Payroll: employees, DTR grid, PH holiday premiums, SSS/PhilHealth/Pag-IBIG/TRAIN tables as data, loans, 13th month, payslip PDFs, GL split by location |
| 8 | Dashboard & reports: Owner dashboard, sales/expense/inventory/payroll/bank reports, budget vs actual, break-even, scheduled emails |
| 9 | Migration & polish: import wizard for the old sheets, Loyverse API sync, export everything, 60-day demo data, deployment guide |

How each acceptance criterion is shown: [`docs/ACCEPTANCE.md`](docs/ACCEPTANCE.md). Design: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md). Owner decisions: [`docs/QUESTIONS.md`](docs/QUESTIONS.md).

## Stack

Next.js 15 (App Router, TypeScript strict) · PostgreSQL + Prisma 7 · Auth.js v5 · Tailwind CSS 4 + shadcn/ui · Recharts · Zod · exceljs / react-pdf for exports · Vitest · Playwright. Money is stored as integer centavos (`BigInt`), quantities as decimals, and the timezone is Asia/Manila.

## Local setup

Requirements: Node 22+ and PostgreSQL 16 (local, Docker, or a Supabase project).

```bash
npm install                 # also generates the Prisma client
cp .env.example .env        # set DATABASE_URL, DIRECT_URL and AUTH_SECRET (openssl rand -base64 32)
npm run db:deploy           # apply migrations
npm run db:seed             # base data: 4 locations, roles, users, chart of accounts, items, menu (₱0.00 prices)
# or, for a database full of sample activity:
npm run db:seed:demo        # base data + 60 days of demo sales, expenses, counts, transfers and payroll
npm run dev                 # http://localhost:3000
```

### Demo data (`npm run db:seed:demo`)

60 days ending yesterday: both branches' daily sales with split payments (cash, Maya card/QR, GCash 1, personal GCash 2, BPI transfer, GrabFood) and SC/PWD discounts, shift closes (a few short), deposits every other day, wings bought twice a week and counted daily (one day 15% over standard, which the variance report flags), weekly counts and restocking, weekly sauce production and twice-weekly deliveries, monthly rent and utility bills, payroll for every complete cut-off, and demo prices.

It also writes sample files to `./samples/`:

| File | Try it at |
|---|---|
| `bpi-statement-demo.csv` | Banking → Import statement → BPI Bank. About 99% of lines auto-match, including the Maya and Grab payouts (posted at the real fee). Book the two service charges and interest from the statement, clear the opening balance ("Mark cleared"), and the reconciliation shows ₱0.00. |
| `loyverse-receipts-mat-<date>.csv`, `…-lan-…` | Sales → Import Loyverse, for today. Map the item and payment names once. |

### Logins (from the seed)

| Who | Login | PIN |
|---|---|---|
| Owner | `SEED_OWNER_EMAIL` / `SEED_OWNER_PASSWORD` from `.env` | 1111 |
| Admin (Matina + Lanang) | admin@wingboss.ph / `Wingboss2026!` | 2222 |
| Cashiers, Matina | PIN only: Carlo 3001, Mika 3002 | |
| Cashiers, Lanang | PIN only: Lito 4001, Joy 4002 | |
| Commissary staff | PIN only: Ben 5001 | |

**PIN login needs a registered device.** On the branch tablet: log in with email as Owner or Admin, go to **Admin → Devices → Register this device**, pick the branch, and log out. The tablet then shows the PIN pad for that branch's staff only.

Change all demo passwords and PINs before real use.

## Going live with real data

The home page shows the Owner a setup checklist that ticks itself off. In order:

1. **Prices and channels:** Admin → Menu & prices (real packages and prices); Admin → Payments (Maya/Grab fee rates and settlement days, Loyverse store names).
2. **Standards:** Inventory → Recipes → standard kg of wings per pax for each package. After 2–4 weeks of daily counts the inventory page offers a suggestion from actual usage.
3. **Import the old sheets:** Admin → Import data. Download a template or upload the sheet as it is, match the columns, run the check (a dry run that saves nothing and lists every problem by row), then import. It handles items, opening inventory, chart of accounts, opening balances, employees, historical daily sales and historical expenses.
4. **Opening balances:** cash, banks, GCash, payables and loans as of the go-live date (Ledger → Opening balances, or the import).
5. **Staff and devices:** users and roles per branch, employees and pay rates, register each branch tablet.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` / `build` / `start` | Next.js |
| `npm run typecheck` / `lint` | TypeScript and ESLint |
| `npm test` | Unit tests (Vitest): ledger and money math, permissions, WAC, payroll rules and tables, DTR codes, statement parsing and matching, Loyverse mapping |
| `npm run test:integration` | Service tests against a real Postgres (rebuilds a `wingboss_test` database from the migrations): every acceptance flow, trial balance always 0 |
| `npm run test:e2e` | Playwright flows against a freshly seeded database (run `npm run build` first; starts `next start` on :3100, or set `E2E_BASE_URL`) |
| `npm run db:deploy` | Apply migrations (production) |
| `npm run db:migrate` | Create/apply a migration in development |
| `npm run db:seed` / `db:seed:demo` | Seed an empty database (base, or base + 60 days of demo activity) |
| `npm run db:reset` | Drop everything and reseed (development only) |

## Security model

- **Passwords** are bcrypt-hashed. **PINs** are hashed too, and only accepted from a registered device for that device's location.
- **Rate limiting:** 5 failed attempts per account (or per device + user) and 30 per IP in 15 minutes.
- **Idle logout:** 15 minutes on branch devices (configurable per device) and 2 hours for email logins. Changing a password or PIN, or deactivating a user, ends their sessions immediately.
- **Every server action and API route re-checks permissions** against the database (`module:action` keys, scoped per location). Branch IDs from the browser are never trusted. Cashiers can't see other branches, profit, payroll or reports.
- **Owner-only actions** can't be granted to anyone else: users, roles, locations, settings, voids, deletes, period close, the chart of accounts, government tables, budgets, data import and "export everything".
- **Audit log:** every change records who, when, which location, and the before/after values, written in the same transaction as the change. Exports are logged too.
- **Ledger integrity:** every posting runs in a database transaction and must balance (per location too). A deferred database trigger rejects unbalanced entries, posted lines can't be edited, closed periods and reconciled bank periods can't be posted into.

## Deployment (Vercel + Supabase)

1. **Supabase** (region: Southeast Asia / Singapore):
   - Create a project. From *Project Settings → Database*, copy the **pooled** connection string (port 6543, add `?pgbouncer=true&connection_limit=1`) as `DATABASE_URL`, and the **direct** connection string (port 5432) as `DIRECT_URL`.
   - *Storage*: create a private bucket named `attachments`. Copy the project URL and the `service_role` key (Project Settings → API) as `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. Receipt photos, DTR photos and imported files go there.
2. **Vercel:** import the GitHub repository. Framework: Next.js. Set the environment variables:

   | Variable | Value |
   |---|---|
   | `DATABASE_URL`, `DIRECT_URL` | from Supabase (above) |
   | `AUTH_SECRET` | `openssl rand -base64 32` |
   | `AUTH_TRUST_HOST` | `true` |
   | `CRON_SECRET` | a long random string (Vercel sends it to the cron routes) |
   | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_STORAGE_BUCKET` | from Supabase; bucket `attachments` |
   | `RESEND_API_KEY`, `EMAIL_FROM` | from [resend.com](https://resend.com) after verifying your sending domain (for the daily/monthly emails) |
   | `LOYVERSE_API_TOKEN` | optional: Loyverse Back Office → Integrations → Access tokens |

3. **Migrations:** run `npm run db:deploy` with `DIRECT_URL` set, from your machine or as the Vercel build command: `prisma migrate deploy && next build`.
4. **First data:** seed once with `npm run db:seed` (set `SEED_OWNER_EMAIL` and a strong `SEED_OWNER_PASSWORD` first). Don't run the demo seed on the live database. Log in, change the PINs, and follow *Going live* above.
5. **Scheduled jobs** (`vercel.json`, times in UTC; all are safe to re-run):

   | Job | When (Manila) | What |
   |---|---|---|
   | `recurring-expenses` | 00:05 daily | Draft expenses from recurring templates (rent, internet…) |
   | `loyverse-sync` | 23:40 daily | Pull Loyverse receipts for branches with a store ID (needs `LOYVERSE_API_TOKEN`) |
   | `daily-sales-email` | 06:55 daily | Yesterday's sales, money in by channel and undeposited cash, with a PDF |
   | `monthly-pnl-email` | 07:10 on the 1st | Last month's P&L (each location + consolidated) as a PDF |

   Recipients are the Owner plus Admin → Business settings → *Also send to*. Every run is recorded in the `JobRun` table. To run one by hand: `curl -H "Authorization: Bearer $CRON_SECRET" https://<your-app>/api/cron/daily-sales-email`.

## Backups

- **Supabase** takes daily backups (Pro plan: 7 days kept; add Point-in-Time Recovery for restore to any second). Restore from *Database → Backups*.
- **Off-site copy:** schedule `pg_dump "$DIRECT_URL" -Fc -f wingboss-$(date +%F).dump` (e.g. a GitHub Action or a home PC) and keep the files in cloud storage. Restore with `pg_restore --clean --no-owner -d "$DIRECT_URL" wingboss-YYYY-MM-DD.dump`.
- **One click for the Owner:** Admin → Business settings → **Export everything** downloads a ZIP with one CSV per table (password and PIN hashes are left out). Uploaded photos stay in the storage bucket; download the bucket from the Supabase dashboard if you need them too.
- Test a restore into a scratch database once in a while.

## Project layout

```
prisma/              schema, migrations, seed (base.ts, catalog.ts, demo.ts)
samples/             sample BPI statement and Loyverse exports (written by the demo seed)
src/app/             routes only: (auth) login/PIN, (app) shell and pages, api/ (exports, cron, files)
src/domains/<area>/  business logic per domain: pure rules, services, server actions
                     sales · cash · expenses · ledger · inventory · banking · payroll · dashboard · reports · migration · admin
src/server/          db client, auth/RBAC, audit, jobs, email, exports (Excel, PDF, CSV)
src/lib/             pure helpers: money (centavos), dates (Asia/Manila), CSV
src/components/      shadcn/ui, shell, charts, report view, form helpers
tests/unit, tests/integration, tests/e2e, tests/fixtures
```

Business rules live in plain, unit-tested functions (e.g. `src/domains/payroll/compute.ts`, `src/domains/banking/match.ts`, `src/domains/inventory/wac.ts`, `src/domains/ledger/lines.ts`), not in UI components.

The logo at `public/logo.svg` is a placeholder. Replace it with the real Wingboss logo, keeping the same file name.
