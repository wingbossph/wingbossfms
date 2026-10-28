# Wingboss FMS: Architecture

Status: **all nine phases built** on the defaults in [`QUESTIONS.md`](./QUESTIONS.md). This was the pre-Phase 1 proposal; notes below mark where the build differs.

- (a) Database schema: [`prisma/schema.prisma`](../prisma/schema.prisma) (Prisma 7, validated)
- (b) Folder structure: section 4 below
- (c) Open questions: [`docs/QUESTIONS.md`](./QUESTIONS.md)

---

## 1. Key design decisions

| # | Decision | Why |
|---|---|---|
| 1 | **Money = `BigInt` centavos** (`*Cents`). Quantities are `Decimal(18,4)`. Unit costs are `Decimal(18,6)`. Rates are basis points (`2000` = 20%). | Integer sums are exact, and a bigint never overflows. Unit cost needs sub-centavo precision (₱ per gram of sauce). |
| 2 | **One global chart of accounts. Location is a dimension on every journal line.** | A new branch needs no new accounts. Every report is "sum the lines WHERE location IN (…)", so per-branch and consolidated reports use the same query. |
| 3 | **Each money account owns its own GL sub-account** (BPI, GCash 1, GCash 2, Maya clearing, Grab receivable, drawer/undeposited/petty per branch). | Book balance = GL balance, with no second ledger to keep in sync. Bank reconciliation matches statement lines to that sub-account's journal lines. |
| 4 | **Double-entry ledger underneath. Users never see debits and credits.** Each domain has a `posting.ts` that turns a document (sales report, expense, transfer…) into a balanced entry. | Balancing is enforced 3 ways: the service, a Postgres deferred constraint trigger, and the unit tests. |
| 5 | **Posted = immutable.** Corrections go through a void + reversing entry (Owner) or an `AdjustmentRequest` (staff). | Keeps the audit trail and the closed periods intact. |
| 6 | **Inventory: perpetual weighted-average stock + usage from counts.** Purchases, transfers, production and waste move stock in real time. **COGS is recognised at each physical count** (`COUNT_USAGE` = beginning + in − out − waste − ending). | Loyverse doesn't deduct ingredients, and for unlimited wings consumption is only knowable by counting. This is the same "actual usage" formula as spec 7.4, so the variance report and the GL use one number. |
| 7 | **Transfers at cost through inter-location receivable/payable**, tagged with `counterpartyLocationId`. Accounts flagged `isIntercompany` are eliminated in consolidated views. | Lanang's inventory, then its COGS, rises when it receives sauce. The commissary's inventory falls. Consolidated totals are unchanged, so nothing is double counted. Markup (off by default) would post to an eliminated "interco sales" account. |
| 8 | **Sales are stored as aggregated `SalesReport`s** (location × date × shift). Raw Loyverse receipts are kept separately, deduplicated by `(location, receiptNumber)`. | Cashiers confirm one screen per shift. Re-importing is safe. The raw receipts support the by-hour/by-cashier reports and the Loyverse-vs-shift-close check. |
| 9 | **Cash flow on shift close:** cash sales move Drawer → *Undeposited cash* (per branch). Deposits move Undeposited → BPI. Over/short posts to *Cash over/short*. | Undeposited cash per branch is just that account's balance. |
| 10 | **Deferred channels (Maya, Grab) create a `ChannelSettlement`** (expected net = gross − MDR − withholding, due T+n). When bank reconciliation matches the credit, the **actual** fee is posted. | Shows the real fees paid. |
| 11 | **RBAC = roles assigned *at* a location, plus per-user ALLOW/DENY overrides.** Every server action calls `authorize(user, "expenses:approve", locationId)`. Branch IDs from the client are only requests, never trusted. | Covers "Admin for Matina only, can approve expenses but not see payroll" with no special cases. |
| 12 | **PIN login only on a registered branch device** (device token cookie). The session is pinned to that device's location, with a 15-min idle timeout. | A PIN alone is weak (10k–1M combinations). Binding it to a device plus rate limiting makes it safe enough. |
| 13 | ~~`DailySummary` table~~ **Not built (yet).** The dashboard reads indexed journal lines and sales reports directly: about 0.3 s for the whole dashboard on the 60-day demo. Most views cover a month, so query size grows with branches, not history. If it slows down as data grows, add the per-location daily summary table refreshed in the posting transactions. | Simpler and always exact; the summary table stays the next step for scale. |
| 14 | **Government tables, holidays and tax rates are data.** Generic bracket rows cover SSS, PhilHealth, Pag-IBIG and TRAIN. | Rates change yearly. Updating them is a data edit, not a deployment. |
| 15 | Auth.js v5 (credentials provider, JWT sessions, `sessionVersion` revocation, sliding idle timeout). Prisma 7 (`prisma-client` generator, `prisma.config.ts`, `@prisma/adapter-pg`). TanStack Table v8. Supabase Storage for photos. | Current stable choices that run on Vercel serverless. |

## 2. ERD (core relationships)

```mermaid
erDiagram
  Location ||--o{ MoneyAccount : owns
  Location ||--o{ SalesReport : "per date/shift"
  Location ||--o{ Expense : incurs
  Location ||--o{ StockBalance : holds
  Location ||--o{ JournalLine : "dimension"
  TaxEntity ||--o{ Location : registers

  User ||--o{ RoleAssignment : has
  Role ||--o{ RoleAssignment : ""
  Role ||--o{ RolePermission : grants
  RoleAssignment }o--o| Location : "scoped to"
  User ||--o{ UserPermission : overrides
  Device }o--|| Location : "PIN login at"

  Account }o--|| AccountGroup : "P&L layout"
  JournalEntry ||--|{ JournalLine : ""
  JournalLine }o--|| Account : ""
  MoneyAccount ||--|| Account : "GL sub-account"
  AccountingPeriod ||--o{ JournalEntry : ""

  SalesReport ||--o{ SalesLine : ""
  SalesReport ||--o{ SalesDiscount : ""
  SalesReport ||--o{ SalesPayment : ""
  SalesReport ||--o| CashCount : "shift close"
  SalesPayment }o--|| PaymentChannel : ""
  PaymentChannel }o--o| MoneyAccount : "lands in"
  SalesPayment ||--o| ChannelSettlement : "expected payout"
  LoyverseReceipt }o--o| SalesReport : "aggregated into"
  SalesLine }o--|| Product : ""
  Product ||--o{ PriceListItem : ""

  Expense ||--|{ ExpenseLine : ""
  Expense ||--o{ ExpensePayment : "AP payments"
  ExpensePayment }o--|| MoneyAccount : "paid from"
  Supplier ||--o{ Expense : ""

  Item ||--o{ StockMovement : ""
  Item ||--o{ StockBalance : ""
  Recipe ||--|{ RecipeLine : ""
  ProductionBatch }o--|| Recipe : ""
  Transfer ||--|{ TransferLine : ""
  Transfer }o--|| Location : from
  Transfer }o--|| Location : to
  StockCount ||--|{ StockCountLine : ""

  MoneyAccount ||--o{ BankStatement : ""
  BankStatement ||--|{ BankStatementLine : ""
  BankMatch ||--|{ BankMatchLine : "statement side"
  BankMatch ||--|{ BankMatchItem : "ledger side"
  BankMatchItem }o--|| JournalLine : ""

  Employee ||--o{ AttendanceEntry : DTR
  AttendanceEntry }o--|| Location : "worked at"
  PayrollRun ||--|{ PayrollLine : payslip
  PayrollLine ||--|{ PayrollLineItem : "split by location"
```

The full schema has 93 models and 43 enums in 10 sections: org, auth/RBAC/audit, ledger, money, sales/Loyverse, expenses/AP, inventory/commissary, banking, payroll, and reporting support.

## 3. Auto-posting rules (summary)

| Event | Debit | Credit | Location |
|---|---|---|---|
| Sales report submitted | Drawer (cash), Maya clearing, GCash 1/2, BPI, Grab receivable; contra-revenue (discounts) | Revenue by product type; service charge payable | branch |
| Shift close | Undeposited cash; Cash short (if short) | Drawer; Cash over (if over) | branch |
| Cash deposit | BPI | Undeposited cash | branch |
| Maya/Grab settlement matched | BPI; MDR / commission expense; CWT receivable | Maya clearing / Grab receivable | branch |
| Expense paid now | Expense account or Inventory | Money account (drawer/petty/GCash/BPI/**Due to owner** for owner's personal money) | expense location |
| Bill on account → payment | Expense / Inventory → AP | AP → money account | expense location |
| Production batch | Sauce inventory | Ingredient inventory; overhead absorbed (if a rate is set) | commissary |
| Transfer dispatched | Interco receivable (cp = receiver) | Inventory | sender |
| Transfer received | Inventory | Interco payable (cp = sender) | receiver |
| Stock count posted | COGS sub-account per item (usage) | Inventory | counted location |
| Waste / staff meal | Waste expense / Staff meals | Inventory | location |
| Payroll run | Salaries, OT, gov't ER share (split by attendance location) | Salaries payable, SSS/PHIC/HDMF payable, WTax payable, loans receivable | each worked-at location |
| Depreciation (monthly cron) | Depreciation expense | Accumulated depreciation | asset location |

## 4. Folder structure

```
wingbossfms/
├─ prisma/
│  ├─ schema.prisma
│  ├─ migrations/                 # + raw SQL: balance trigger, CHECKs, closed-period guard
│  └─ seed/                       # index.ts, coa.ts, items.ts, demo-60-days.ts, loyverse-samples/*.csv
├─ prisma.config.ts
├─ public/
│  ├─ logo.png, logo-dark.png     # white (dark backgrounds) and black (print, PDFs) logo
│  ├─ icons/                      # PWA icons (192, 512, maskable)
│  └─ manifest.webmanifest        # PWA
├─ src/
│  ├─ app/                        # Next.js App Router: routing + thin pages only
│  │  ├─ (auth)/login/            # email + password
│  │  ├─ (auth)/pin/              # device PIN pad
│  │  ├─ (app)/layout.tsx         # shell: black nav, location switcher, theme toggle
│  │  ├─ (app)/dashboard/
│  │  ├─ (app)/sales/             # reports, import, [id], shift-close
│  │  ├─ (app)/cash/              # deposits, transfers, money accounts
│  │  ├─ (app)/expenses/          # list, new, approvals, recurring, payables, suppliers
│  │  ├─ (app)/inventory/         # items, counts, adjustments, variance
│  │  ├─ (app)/commissary/        # production, transfers, dispatch (mobile), statement
│  │  ├─ (app)/payroll/           # employees, attendance, runs, payslips
│  │  ├─ (app)/banking/           # statements, match, reconciliations
│  │  ├─ (app)/ledger/            # journal, manual JE, periods, fixed assets, COA
│  │  ├─ (app)/reports/[report]/
│  │  ├─ (app)/admin/             # users, roles matrix, locations, devices, settings, audit, import wizard
│  │  └─ api/
│  │     ├─ auth/[...nextauth]/
│  │     ├─ cron/[job]/           # recurring-expenses, depreciation, settlements-due, report-emails, loyverse-sync
│  │     ├─ export/[report]/      # pdf | xlsx | csv
│  │     └─ upload/               # signed Supabase upload URLs
│  ├─ domains/                    # business logic by domain (no React)
│  │  ├─ sales/        { schemas.ts, service.ts, posting.ts, repo.ts, actions.ts, loyverse/ { parse.ts, map.ts } }
│  │  ├─ cash/         { … shift-close.ts, deposits.ts, settlement.ts }
│  │  ├─ expenses/     { … approval.ts, recurring.ts, aging.ts }
│  │  ├─ inventory/    { … wac.ts, usage.ts, variance.ts, counts.ts }
│  │  ├─ commissary/   { … production.ts, transfers.ts, statement.ts }
│  │  ├─ payroll/      { … compute.ts, contributions.ts, withholding.ts, holidays.ts }
│  │  ├─ banking/      { … statement-parse.ts, auto-match.ts, reconcile.ts }
│  │  ├─ ledger/       { post.ts (the only writer of JournalEntry), accounts.ts, periods.ts, depreciation.ts }
│  │  ├─ reports/      { pnl.ts, balance-sheet.ts, cash-flow.ts, trial-balance.ts, kpis.ts, consolidate.ts, … }
│  │  └─ admin/        { locations.ts (one-form "add branch"), users.ts, roles.ts }
│  ├─ server/                     # cross-cutting server code
│  │  ├─ db.ts                    # Prisma client singleton
│  │  ├─ auth/                    # auth.ts, permissions.ts (keys), authorize.ts, device.ts, rate-limit.ts
│  │  ├─ audit.ts                 # withAudit(tx, …) helper
│  │  ├─ storage.ts               # Supabase Storage
│  │  └─ export/                  # xlsx.ts, pdf/, csv.ts
│  ├─ lib/                        # pure, isomorphic helpers
│  │  ├─ money.ts                 # cents math, ₱ formatting, allocation-with-remainder
│  │  ├─ dates.ts                 # Asia/Manila business dates, MMM DD, YYYY
│  │  └─ zod.ts
│  ├─ components/
│  │  ├─ ui/                      # shadcn/ui
│  │  ├─ shell/                   # nav, location switcher, theme toggle
│  │  ├─ data-table/              # TanStack table + filters (date range, branch, category) + Export
│  │  ├─ charts/                  # Recharts wrappers
│  │  └─ forms/                   # money input, qty input, photo capture, draft autosave (localStorage)
│  └─ generated/prisma/           # Prisma client output (git-ignored)
├─ tests/
│  ├─ unit/                       # Vitest: ledger balance, WAC, usage/variance, payroll, matching, consolidation
│  ├─ integration/                # Vitest + test Postgres: posting services end-to-end, TB balances
│  └─ e2e/                        # Playwright: the 11 acceptance criteria
├─ docs/
│  ├─ ARCHITECTURE.md
│  └─ QUESTIONS.md
├─ vercel.json                    # cron schedules
└─ README.md                      # setup, Vercel + Supabase deploy, backups, "not a BIR-accredited POS/CAS"
```

**Rules:**
- `app/` pages call `domains/*/actions.ts` (server actions).
- Actions do `authorize → zod parse → service (pure) → repo/posting in one DB transaction → audit`.
- `service.ts` files hold no Prisma or React code, so they can be unit-tested directly.
- Only `ledger/post.ts` writes journal entries.
