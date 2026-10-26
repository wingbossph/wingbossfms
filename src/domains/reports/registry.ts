import "server-only";
import { db } from "@/server/db";
import { scopeLocations, type CurrentUser } from "@/server/auth/session";
import { AuthorizationError } from "@/server/auth/session";
import type { ReportDoc } from "./doc";
import { UserFacingError } from "@/lib/errors";
import { buildBalanceSheet, buildCashFlow, buildEquityStatement, buildPnl, buildTrialBalance, combine, loadBalances, loadChart, profitOf } from "./financials";
import { asOfOf, dayBefore, fmtDate, fmtRange, monthsIn, rangeOf, type ReportParams } from "./params";
import { buildGeneralLedger, buildJournal } from "./ledger-reports";
import { dailySalesDoc, discountsLogDoc, salesByCashierDoc, salesByChannelDoc, salesByPackageDoc, salesByTimeDoc } from "./sales-reports";
import { apAgingDoc, breakEvenDoc, budgetVsActualDoc, cashPositionDoc, expensesByCategoryDoc, expensesBySupplierDoc } from "./expense-reports";
import { payrollRegisterDoc, remittancesDoc } from "./payroll-reports";
import { bankReconciliationDoc, channelSettlementsDoc } from "./banking-reports";
import { canUseAccount } from "@/domains/banking/queries";
import { commissaryStatement, stockOnHand, transfersReport, usageReport, varianceDoc, wasteReport } from "./inventory-reports";

export type ReportDef = {
  title: string;
  group: "Financial statements" | "Ledger" | "Sales" | "Expenses" | "Inventory" | "Payroll" | "Banking" | "Planning";
  description: string;
  permission: string;
  /** Which filters the report page shows. */
  filters: ("range" | "asOf" | "location" | "columns" | "basis" | "account" | "source" | "supplier" | "employee" | "run" | "moneyAccount" | "item" | "year")[];
  build: (user: CurrentUser, p: ReportParams) => Promise<ReportDoc>;
};

/** Locations in scope for a report, with their names. */
export async function reportScope(user: CurrentUser, permission: string, p: ReportParams) {
  const ids = scopeLocations(user, permission, p.location);
  if (ids.length === 0) throw new AuthorizationError();
  const locations = await db.location.findMany({ where: { id: { in: ids } }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] });
  const label = ids.length === 1 ? locations[0].name : p.location && p.location !== "all" ? locations[0]?.name : "All locations (consolidated)";
  return { ids, locations, label: label ?? "All locations" };
}

const glHref = (from?: string, to?: string) => (accountId: string) => `/ledger/accounts/${accountId}${from ? `?from=${from}&to=${to}` : to ? `?to=${to}` : ""}`;

export const REPORTS: Record<string, ReportDef> = {
  pnl: {
    title: "Profit & loss",
    group: "Financial statements",
    description: "Revenue, costs and profit per location or month, with % of sales and key ratios.",
    permission: "reports:pnl:view",
    filters: ["range", "location", "columns", "basis"],
    async build(user, p) {
      const { from, to } = rangeOf(p);
      const scope = await reportScope(user, "reports:pnl:view", p);
      const chart = await loadChart(db);
      const exclude = p.basis === "direct" ? (["ALLOCATION"] as const) : [];
      let cols;
      if (p.columns === "months") {
        const months = monthsIn(from, to);
        cols = await Promise.all(
          months.map(async (m) => {
            const bal = await loadBalances(db, { from: m.from, to: m.to, locationIds: scope.ids, excludeSources: [...exclude] });
            return { key: m.key, label: m.label, balances: combine([...bal.values()]), consolidated: scope.ids.length > 1 };
          }),
        );
        const all = await loadBalances(db, { from, to, locationIds: scope.ids, excludeSources: [...exclude] });
        if (cols.length > 1) cols.push({ key: "total", label: "Total", balances: combine([...all.values()]), consolidated: scope.ids.length > 1 });
      } else {
        const bal = await loadBalances(db, { from, to, locationIds: scope.ids, excludeSources: [...exclude] });
        cols = scope.locations.map((l) => ({ key: l.id, label: l.name, balances: bal.get(l.id) ?? new Map<string, bigint>(), consolidated: false }));
        if (scope.ids.length > 1) cols.push({ key: "consolidated", label: "Consolidated", balances: combine([...bal.values()]), consolidated: true });
      }
      return buildPnl(chart, cols, {
        title: "Profit & loss",
        subtitle: `${scope.label} · ${fmtRange(from, to)}${p.basis === "direct" ? " · direct costs only (before allocations)" : ""}`,
        glHref: glHref(from, to),
      });
    },
  },
  "balance-sheet": {
    title: "Balance sheet",
    group: "Financial statements",
    description: "Assets, liabilities and owner's equity as of a date.",
    permission: "reports:balance-sheet:view",
    filters: ["asOf", "location", "columns"],
    async build(user, p) {
      const asOf = asOfOf(p);
      const scope = await reportScope(user, "reports:balance-sheet:view", p);
      const chart = await loadChart(db);
      const yearStart = `${asOf.slice(0, 4)}-01-01`;
      const [bal, ytd] = await Promise.all([loadBalances(db, { to: asOf, locationIds: scope.ids }), loadBalances(db, { from: yearStart, to: asOf, locationIds: scope.ids })]);
      const cols = (p.columns === "single" || scope.ids.length === 1 ? [] : scope.locations).map((l) => ({
        key: l.id,
        label: l.name,
        balances: bal.get(l.id) ?? new Map<string, bigint>(),
        ytdProfit: profitOf(chart, ytd.get(l.id) ?? new Map()),
        consolidated: false,
      }));
      cols.push({ key: "total", label: scope.ids.length > 1 ? "Consolidated" : scope.label, balances: combine([...bal.values()]), ytdProfit: profitOf(chart, combine([...ytd.values()])), consolidated: true });
      return buildBalanceSheet(chart, cols, { title: "Balance sheet", subtitle: `${scope.label} · as of ${fmtDate(asOf)}`, glHref: glHref(undefined, asOf) });
    },
  },
  "cash-flow": {
    title: "Cash flow statement",
    group: "Financial statements",
    description: "Where cash came from and went (indirect method).",
    permission: "reports:balance-sheet:view",
    filters: ["range", "location"],
    async build(user, p) {
      const { from, to } = rangeOf(p);
      const scope = await reportScope(user, "reports:balance-sheet:view", p);
      const chart = await loadChart(db);
      const [open, close, period] = await Promise.all([
        loadBalances(db, { to: dayBefore(from), locationIds: scope.ids }),
        loadBalances(db, { to, locationIds: scope.ids }),
        loadBalances(db, { from, to, locationIds: scope.ids }),
      ]);
      return buildCashFlow(chart, combine([...open.values()]), combine([...close.values()]), combine([...period.values()]), {
        title: "Cash flow statement",
        subtitle: `${scope.label} · ${fmtRange(from, to)}`,
      });
    },
  },
  equity: {
    title: "Changes in owner's equity",
    group: "Financial statements",
    description: "Capital, drawings and profit for the period.",
    permission: "reports:balance-sheet:view",
    filters: ["range", "location"],
    async build(user, p) {
      const { from, to } = rangeOf(p);
      const scope = await reportScope(user, "reports:balance-sheet:view", p);
      const chart = await loadChart(db);
      const [open, period] = await Promise.all([loadBalances(db, { to: dayBefore(from), locationIds: scope.ids }), loadBalances(db, { from, to, locationIds: scope.ids })]);
      return buildEquityStatement(chart, combine([...open.values()]), combine([...period.values()]), { title: "Statement of changes in owner's equity", subtitle: `${scope.label} · ${fmtRange(from, to)}` });
    },
  },
  "trial-balance": {
    title: "Trial balance",
    group: "Ledger",
    description: "Every account's debit or credit balance. Debits always equal credits.",
    permission: "ledger:view",
    filters: ["asOf", "location"],
    async build(user, p) {
      const asOf = asOfOf(p);
      const scope = await reportScope(user, "ledger:view", p);
      const chart = await loadChart(db);
      const bal = await loadBalances(db, { to: asOf, locationIds: scope.ids });
      return buildTrialBalance(chart, combine([...bal.values()]), { title: "Trial balance", subtitle: `${scope.label} · as of ${fmtDate(asOf)}`, glHref: glHref(undefined, asOf) });
    },
  },
  "general-ledger": {
    title: "General ledger",
    group: "Ledger",
    description: "Every posting to an account, with a running balance.",
    permission: "ledger:view",
    filters: ["range", "location", "account"],
    async build(user, p) {
      const { from, to } = rangeOf(p);
      const scope = await reportScope(user, "ledger:view", p);
      return buildGeneralLedger(db, { accountId: p.account, from, to, locationIds: scope.ids, scopeLabel: scope.label });
    },
  },
  journal: {
    title: "Journal",
    group: "Ledger",
    description: "All journal entries with their lines, for the accountant.",
    permission: "ledger:view",
    filters: ["range", "location", "source"],
    async build(user, p) {
      const { from, to } = rangeOf(p);
      const scope = await reportScope(user, "ledger:view", p);
      return buildJournal(db, { from, to, locationIds: scope.ids, source: p.source, scopeLabel: scope.label });
    },
  },
};

Object.assign(REPORTS, {
  "stock-on-hand": {
    title: "Stock on hand & valuation",
    group: "Inventory",
    description: "Quantity and value of every item per location (weighted-average cost).",
    permission: "reports:inventory:view",
    filters: ["asOf", "location"],
    async build(user, p) {
      return stockOnHand(await reportScope(user, "reports:inventory:view", p), asOfOf(p));
    },
  },
  "inventory-usage": {
    title: "Inventory usage",
    group: "Inventory",
    description: "Beginning, received, sent, waste, counted usage and ending per item.",
    permission: "reports:inventory:view",
    filters: ["range", "location"],
    async build(user, p) {
      const { from, to } = rangeOf(p);
      return usageReport(await reportScope(user, "reports:inventory:view", p), from, to);
    },
  },
  variance: {
    title: "Usage variance",
    group: "Inventory",
    description: "Actual vs theoretical usage per count, flagged beyond tolerance. Finds losses.",
    permission: "reports:inventory:view",
    filters: ["range", "location"],
    async build(user, p) {
      const { from, to } = rangeOf(p);
      return varianceDoc(await reportScope(user, "reports:inventory:view", p), from, to);
    },
  },
  waste: {
    title: "Waste & staff meals",
    group: "Inventory",
    description: "Every waste, spoilage and staff meal with its reason and cost.",
    permission: "reports:inventory:view",
    filters: ["range", "location"],
    async build(user, p) {
      const { from, to } = rangeOf(p);
      return wasteReport(await reportScope(user, "reports:inventory:view", p), from, to);
    },
  },
  transfers: {
    title: "Transfers",
    group: "Inventory",
    description: "Deliveries between locations with quantities sent and received.",
    permission: "reports:inventory:view",
    filters: ["range", "location"],
    async build(user, p) {
      const { from, to } = rangeOf(p);
      return transfersReport(await reportScope(user, "reports:inventory:view", p), from, to);
    },
  },
  "commissary-statement": {
    title: "Commissary statement",
    group: "Inventory",
    description: "What each branch received from the commissary, its value, and what is owed or settled.",
    permission: "reports:inventory:view",
    filters: ["range", "location"],
    async build(user, p) {
      const { from, to } = rangeOf(p);
      return commissaryStatement(await reportScope(user, "reports:inventory:view", p), from, to);
    },
  },
  "daily-sales": {
    title: "Daily sales summary",
    group: "Sales",
    description: "Gross, discounts, net sales, pax and cash over/short per day.",
    permission: "reports:sales:view",
    filters: ["range", "location"],
    async build(user, p) {
      const { from, to } = rangeOf(p);
      return dailySalesDoc(await reportScope(user, "reports:sales:view", p), from, to);
    },
  },
  "sales-by-package": {
    title: "Sales by package",
    group: "Sales",
    description: "Quantity, pax and sales per package and product.",
    permission: "reports:sales:view",
    filters: ["range", "location"],
    async build(user, p) {
      const { from, to } = rangeOf(p);
      return salesByPackageDoc(await reportScope(user, "reports:sales:view", p), from, to);
    },
  },
  "sales-by-channel": {
    title: "Sales by payment channel",
    group: "Sales",
    description: "Cash, card, QR, GCash (business and personal), bank transfer and Grab, per location.",
    permission: "reports:sales:view",
    filters: ["range", "location"],
    async build(user, p) {
      const { from, to } = rangeOf(p);
      return salesByChannelDoc(await reportScope(user, "reports:sales:view", p), from, to);
    },
  },
  "sales-by-cashier": {
    title: "Sales by cashier",
    group: "Sales",
    description: "Net sales per cashier from Loyverse receipts or manual entry.",
    permission: "reports:sales:view",
    filters: ["range", "location"],
    async build(user, p) {
      const { from, to } = rangeOf(p);
      return salesByCashierDoc(await reportScope(user, "reports:sales:view", p), from, to);
    },
  },
  "sales-by-time": {
    title: "Sales by weekday and hour",
    group: "Sales",
    description: "Busiest days of the week and hours of the day.",
    permission: "reports:sales:view",
    filters: ["range", "location"],
    async build(user, p) {
      const { from, to } = rangeOf(p);
      return salesByTimeDoc(await reportScope(user, "reports:sales:view", p), from, to);
    },
  },
  "discounts-log": {
    title: "Discounts and SC/PWD log",
    group: "Sales",
    description: "Every discount with senior citizen / PWD name and ID number.",
    permission: "reports:sales:view",
    filters: ["range", "location"],
    async build(user, p) {
      const { from, to } = rangeOf(p);
      return discountsLogDoc(await reportScope(user, "reports:sales:view", p), from, to);
    },
  },
  "expenses-by-category": {
    title: "Expenses by category",
    group: "Expenses",
    description: "Costs by category and account, per location, with % of sales.",
    permission: "reports:pnl:view",
    filters: ["range", "location"],
    async build(user, p) {
      const { from, to } = rangeOf(p);
      return expensesByCategoryDoc(await reportScope(user, "reports:pnl:view", p), from, to);
    },
  },
  "expenses-by-supplier": {
    title: "Expenses by supplier",
    group: "Expenses",
    description: "What you bought from each supplier, paid and unpaid.",
    permission: "payables:manage",
    filters: ["range", "location"],
    async build(user, p) {
      const { from, to } = rangeOf(p);
      return expensesBySupplierDoc(await reportScope(user, "payables:manage", p), from, to);
    },
  },
  "ap-aging": {
    title: "Accounts payable aging",
    group: "Expenses",
    description: "Unpaid supplier bills by how long they are past due.",
    permission: "payables:manage",
    filters: ["asOf", "location"],
    async build(user, p) {
      return apAgingDoc(await reportScope(user, "payables:manage", p), asOfOf(p));
    },
  },
  "cash-position": {
    title: "Daily cash position",
    group: "Financial statements",
    description: "Cash drawers, undeposited cash, banks and e-wallets day by day.",
    permission: "reports:balance-sheet:view",
    filters: ["range", "location"],
    async build(user, p) {
      const { from, to } = rangeOf(p);
      return cashPositionDoc(await reportScope(user, "reports:balance-sheet:view", p), from, to);
    },
  },
  "budget-vs-actual": {
    title: "Budget vs actual",
    group: "Planning",
    description: "Monthly budget per account against what actually happened.",
    permission: "reports:pnl:view",
    filters: ["range", "location"],
    async build(user, p) {
      const { from, to } = rangeOf(p);
      return budgetVsActualDoc(await reportScope(user, "reports:pnl:view", p), from, to);
    },
  },
  "break-even": {
    title: "Break-even analysis",
    group: "Planning",
    description: "Pax needed per month and per day for each branch to cover fixed costs.",
    permission: "reports:pnl:view",
    filters: ["range", "location"],
    async build(user, p) {
      const { from, to } = rangeOf(p);
      return breakEvenDoc(await reportScope(user, "reports:pnl:view", p), from, to);
    },
  },
  "payroll-register": {
    title: "Payroll register",
    group: "Payroll",
    description: "Every payslip of a payroll run: pay, deductions, net and employer share.",
    permission: "reports:payroll:view",
    filters: ["run", "location"],
    async build(user, p) {
      const run = p.run ? await db.payrollRun.findUnique({ where: { id: p.run } }) : await db.payrollRun.findFirst({ where: { status: "POSTED" }, orderBy: { periodEnd: "desc" } });
      if (!run) throw new UserFacingError("No payroll runs yet.");
      return payrollRegisterDoc(await reportScope(user, "reports:payroll:view", p), run.id);
    },
  },
  "payroll-remittances": {
    title: "Government remittances",
    group: "Payroll",
    description: "SSS, PhilHealth, Pag-IBIG and withholding tax per employee, for the monthly forms.",
    permission: "reports:payroll:view",
    filters: ["range", "location"],
    async build(user, p) {
      const { from, to } = rangeOf(p);
      return remittancesDoc(await reportScope(user, "reports:payroll:view", p), from, to);
    },
  },
  "bank-reconciliation": {
    title: "Bank reconciliation",
    group: "Banking",
    description: "Statement balance vs books with deposits in transit and outstanding cheques, for one account.",
    permission: "banking:view",
    filters: ["asOf", "moneyAccount"],
    async build(user, p) {
      const ma = p.moneyAccount ? await db.moneyAccount.findUnique({ where: { id: p.moneyAccount } }) : null;
      if (!ma) throw new UserFacingError("Choose an account.");
      if (!canUseAccount(user, ma, "banking:view")) throw new AuthorizationError();
      return bankReconciliationDoc(ma.id, asOfOf(p));
    },
  },
  "channel-settlements": {
    title: "Card, QR and Grab payouts",
    group: "Banking",
    description: "Expected vs received payouts per sales day, and the actual fee rate you paid.",
    permission: "banking:view",
    filters: ["range", "location"],
    async build(user, p) {
      const { from, to } = rangeOf(p);
      return channelSettlementsDoc(await reportScope(user, "banking:view", p), from, to);
    },
  },
} satisfies Record<string, ReportDef>);

export async function buildReport(name: string, user: CurrentUser, p: ReportParams): Promise<{ def: ReportDef; doc: ReportDoc }> {
  const def = REPORTS[name];
  if (!def) throw new Error("Unknown report");
  if (!user.access.canAnywhere(def.permission)) throw new AuthorizationError();
  return { def, doc: await def.build(user, p) };
}
