# Wingboss FMS

Restaurant management and financial system for **Wingboss** (unlimited chicken wings, Davao City). It replaces the separate Google Sheets for sales, expenses, inventory, payroll and accounting, and answers one question: *is each branch, and the business as a whole, really profitable each month?*

> **Not a BIR-accredited POS or CAS.** Loyverse remains the point of sale. This system prepares figures that support BIR filing (gross sales, the SC/PWD log, percentage tax, withholding). It does not file with the BIR, and it is not a substitute for an accredited Computerized Accounting System.

## Status

| Phase | Scope | Status |
|---|---|---|
| 1 | Foundation: auth, roles & permissions, locations, users, devices, audit log, UI shell, seed | ✅ Done |
| 2 | Sales & cash: Loyverse CSV import, daily sales, payment channels, shift close, deposits | Next |
| 3–9 | Expenses & AP, ledger, inventory & commissary, banking, payroll, dashboard & reports, migration | Planned |

Design: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) · Owner decisions: [`docs/QUESTIONS.md`](docs/QUESTIONS.md) · Schema: [`prisma/schema.prisma`](prisma/schema.prisma)

## Stack

Next.js 15 (App Router, TypeScript strict) · PostgreSQL + Prisma 7 · Auth.js v5 · Tailwind CSS 4 + shadcn/ui · TanStack Table · Zod · Vitest · Playwright. Money is stored as integer centavos (`BigInt`), and the timezone is Asia/Manila.

## Local setup

Requirements: Node 22+ and PostgreSQL 16 (local, Docker, or a Supabase project).

```bash
npm install                 # also generates the Prisma client
cp .env.example .env        # then set DATABASE_URL, DIRECT_URL and AUTH_SECRET (openssl rand -base64 32)
npm run db:deploy           # apply migrations
npm run db:seed             # demo data: 4 locations, roles, users, chart of accounts, items
npm run dev                 # http://localhost:3000
```

### Demo logins (from the seed)

| Who | Login | PIN |
|---|---|---|
| Owner | `SEED_OWNER_EMAIL` / `SEED_OWNER_PASSWORD` from `.env` | 1111 |
| Admin (Matina + Lanang) | admin@wingboss.ph / `Wingboss2026!` | 2222 |
| Cashiers, Matina | PIN only: Carlo 3001, Mika 3002 | |
| Cashiers, Lanang | PIN only: Lito 4001, Joy 4002 | |
| Commissary staff | PIN only: Ben 5001 | |

**PIN login needs a registered device.** On the branch tablet:
1. Log in with email as Owner or Admin.
2. Go to **Admin → Devices → Register this device** and pick the branch.
3. Log out. The tablet now shows the PIN pad for that branch's staff only.

Change all demo passwords and PINs before real use.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` / `build` / `start` | Next.js |
| `npm run typecheck` / `lint` | TypeScript and ESLint |
| `npm test` | Unit tests (Vitest): permissions, money math, chart of accounts, dates |
| `npm run test:e2e` | Playwright flows against a seeded DB (builds must exist; starts `next start` on :3100) |
| `npm run db:migrate` | Create/apply a migration in development |
| `npm run db:deploy` | Apply migrations (production) |
| `npm run db:seed` | Seed an empty database |
| `npm run db:reset` | Drop everything and reseed (development only) |

## Security model (Phase 1)

- **Passwords** are bcrypt-hashed. **PINs** are hashed too, and only accepted from a registered device for that device's location.
- **Rate limiting:** 5 failed attempts per account (or per device + user) and 30 per IP in 15 minutes.
- **Idle logout:** sessions end after 15 minutes idle on branch devices (configurable per device) and 2 hours for email logins. Changing a password or PIN, or deactivating a user, ends their sessions immediately.
- **Every server action re-checks permissions** against the database (`module:action` keys, scoped per location). Branch IDs from the browser are never trusted.
- **Owner-only actions** can't be granted to anyone else: users, roles, locations, settings, voids, deletes, period close, and the chart of accounts.
- **Audit log:** every change records who, when, which location, and the before/after values. It is written in the same transaction as the change.

## Deployment (Vercel + Supabase)

1. **Supabase:** create a project (region: Singapore). From *Project Settings → Database*, copy:
   - the **pooled** connection string (port 6543, add `?pgbouncer=true&connection_limit=1`) as `DATABASE_URL`
   - the **direct** connection string (port 5432) as `DIRECT_URL`
2. **Vercel:** import the GitHub repo. Set these environment variables:
   - `DATABASE_URL`
   - `DIRECT_URL`
   - `AUTH_SECRET`
   - `AUTH_TRUST_HOST=true`
3. **Migrations:** run `npm run db:deploy` against `DIRECT_URL`, either from your machine or as a Vercel build step: `prisma migrate deploy && next build`.
4. **First data:** seed once with `npm run db:seed` (set `SEED_OWNER_EMAIL` and a strong `SEED_OWNER_PASSWORD`). Then log in and change the PINs.
5. **Backups:**
   - Supabase Pro takes daily backups automatically. Enable Point-in-Time Recovery if you want finer restore points.
   - For an extra off-site copy, schedule `pg_dump "$DIRECT_URL" -Fc > wingboss-$(date +%F).dump` to cloud storage.
   - A one-click "export everything" for the Owner arrives in Phase 9.

The full deployment and backup guide is finished in Phase 9.

## Project layout

```
prisma/              schema, migrations, seed (catalog + demo data)
src/app/             routes only: (auth) login/PIN, (app) shell and pages, api/
src/domains/<area>/  business logic per domain: schemas, services, actions
src/server/          db client, auth/RBAC, audit, action helpers
src/lib/             pure helpers: money (centavos), dates (Asia/Manila), CSV
src/components/      shadcn/ui, shell, data table + filters, form helpers
tests/unit, tests/e2e
```

Business rules live in plain, unit-tested functions (e.g. `src/server/auth/rbac.ts`, `src/lib/money.ts`), not in UI components.

The logo at `public/logo.svg` is a placeholder. Replace it with the real Wingboss logo, keeping the same file name.
