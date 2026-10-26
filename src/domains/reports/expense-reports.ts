import "server-only";
import { db } from "@/server/db";
import { toDbDate } from "@/lib/dates";
import { agingBucket, type AgingBucket } from "@/domains/expenses/rules";
import type { ReportDoc, ReportRow } from "./doc";
import { pct } from "./doc";
import { combine, loadBalances, loadChart, pnlFigures } from "./financials";
import { fmtDate, fmtRange, monthsIn } from "./params";

type Scope = { ids: string[]; locations: { id: string; name: string; type?: string }[]; label: string };
const ymd = (d: Date) => d.toISOString().slice(0, 10);
const EXPENSE_SECTIONS = ["COGS", "LABOR", "OPERATING_EXPENSE"];

/** Costs by category from the ledger (same numbers as the P&L), per location, with % of sales. */
export async function expensesByCategoryDoc(scope: Scope, from: string, to: string): Promise<ReportDoc> {
  const chart = await loadChart(db);
  const bal = await loadBalances(db, { from, to, locationIds: scope.ids });
  const all = combine([...bal.values()]);
  const consolidated = scope.ids.length > 1;
  const sales = pnlFigures(chart, { key: "t", label: "", balances: all, consolidated }).netSales;
  const locs = scope.locations.filter((l) => bal.has(l.id));
  const rows: ReportRow[] = [];
  let lastGroup = "";
  const groupTotals = new Map<string, bigint>();
  const accounts = chart.filter((a) => EXPENSE_SECTIONS.includes(a.section) && !(consolidated && a.isIntercompany) && (all.get(a.id) ?? 0n) !== 0n).sort((a, b) => a.groupOrder - b.groupOrder || a.code.localeCompare(b.code));
  for (const a of accounts) {
    if (a.groupId !== lastGroup) {
      if (lastGroup) rows.push({ cells: { account: `Total ${accounts.find((x) => x.groupId === lastGroup)!.groupName}`, total: groupTotals.get(lastGroup)!, share: pct(groupTotals.get(lastGroup)!, sales) }, style: "subtotal" });
      rows.push({ cells: { account: a.groupName }, style: "section" });
      lastGroup = a.groupId;
    }
    const v = all.get(a.id) ?? 0n;
    groupTotals.set(a.groupId, (groupTotals.get(a.groupId) ?? 0n) + v);
    rows.push({ cells: { account: `${a.code} ${a.name}`, ...Object.fromEntries(locs.map((l) => [l.id, bal.get(l.id)?.get(a.id) ?? 0n])), total: v, share: pct(v, sales) }, indent: 1, href: `/ledger/accounts/${a.id}?from=${from}&to=${to}` });
  }
  if (lastGroup) rows.push({ cells: { account: `Total ${accounts.find((x) => x.groupId === lastGroup)!.groupName}`, total: groupTotals.get(lastGroup)!, share: pct(groupTotals.get(lastGroup)!, sales) }, style: "subtotal" });
  const total = [...groupTotals.values()].reduce((a, b) => a + b, 0n);
  rows.push({ cells: { account: "Total costs", ...Object.fromEntries(locs.map((l) => [l.id, accounts.reduce((s, a) => s + (bal.get(l.id)?.get(a.id) ?? 0n), 0n)])), total, share: pct(total, sales) }, style: "total" });
  return {
    title: "Expenses by category",
    subtitle: `${scope.label} · ${fmtRange(from, to)} · % of net sales`,
    columns: [{ key: "account", label: "Category / account", kind: "text", width: 34 }, ...(locs.length > 1 ? locs.map((l) => ({ key: l.id, label: l.name, kind: "money" as const })) : []), { key: "total", label: "Total", kind: "money" }, { key: "share", label: "% of sales", kind: "pct" }],
    rows,
  };
}

export async function expensesBySupplierDoc(scope: Scope, from: string, to: string): Promise<ReportDoc> {
  const rows0 = await db.expense.groupBy({ by: ["supplierId"], where: { locationId: { in: scope.ids }, status: "POSTED", date: { gte: toDbDate(from), lte: toDbDate(to) } }, _sum: { totalCents: true, paidCents: true }, _count: true });
  const suppliers = await db.supplier.findMany({ where: { id: { in: rows0.flatMap((r) => (r.supplierId ? [r.supplierId] : [])) } } });
  const total = rows0.reduce((a, r) => a + (r._sum.totalCents ?? 0n), 0n);
  const rows: ReportRow[] = rows0
    .sort((a, b) => ((b._sum.totalCents ?? 0n) > (a._sum.totalCents ?? 0n) ? 1 : -1))
    .map((r) => ({ cells: { supplier: suppliers.find((s) => s.id === r.supplierId)?.name ?? "(no supplier)", count: r._count, total: r._sum.totalCents ?? 0n, paid: r._sum.paidCents ?? 0n, unpaid: (r._sum.totalCents ?? 0n) - (r._sum.paidCents ?? 0n), share: pct(r._sum.totalCents ?? 0n, total) } }));
  rows.push({ cells: { supplier: "Total", count: rows0.reduce((a, r) => a + r._count, 0), total, paid: rows0.reduce((a, r) => a + (r._sum.paidCents ?? 0n), 0n), unpaid: rows0.reduce((a, r) => a + (r._sum.totalCents ?? 0n) - (r._sum.paidCents ?? 0n), 0n), share: total ? 100 : null }, style: "total" });
  return {
    title: "Expenses by supplier",
    subtitle: `${scope.label} · ${fmtRange(from, to)}`,
    columns: [
      { key: "supplier", label: "Supplier", kind: "text", width: 30 },
      { key: "count", label: "Bills / receipts", kind: "number" },
      { key: "total", label: "Total", kind: "money" },
      { key: "paid", label: "Paid", kind: "money" },
      { key: "unpaid", label: "Unpaid", kind: "money" },
      { key: "share", label: "Share", kind: "pct" },
    ],
    rows,
  };
}

const AGING_BUCKETS: AgingBucket[] = ["current", "d1_30", "d31_60", "d60_plus"];
const BUCKET_LABEL: Record<AgingBucket, string> = { current: "Not yet due", d1_30: "1–30 days", d31_60: "31–60 days", d60_plus: "Over 60 days" };

/** Unpaid supplier bills as of a date, by days past due. */
export async function apAgingDoc(scope: Scope, asOf: string): Promise<ReportDoc> {
  const bills = await db.expense.findMany({ where: { locationId: { in: scope.ids }, terms: "ON_ACCOUNT", status: "POSTED", date: { lte: toDbDate(asOf) } }, include: { supplier: true, payments: { where: { date: { lte: toDbDate(asOf) } } }, location: true } });
  const bySupplier = new Map<string, Record<string, bigint | string>>();
  const rowsDetail: ReportRow[] = [];
  for (const b of bills) {
    const balance = b.totalCents - b.payments.reduce((a, p) => a + p.amountCents, 0n);
    if (balance <= 0n) continue;
    const due = ymd(b.dueDate ?? b.date);
    const bucket = agingBucket(due, asOf);
    const name = b.supplier?.name ?? "(no supplier)";
    const s = bySupplier.get(name) ?? { supplier: name, ...Object.fromEntries(AGING_BUCKETS.map((k) => [k, 0n])), total: 0n };
    s[bucket] = (s[bucket] as bigint) + balance;
    s.total = (s.total as bigint) + balance;
    bySupplier.set(name, s);
    rowsDetail.push({ cells: { supplier: name, bill: `#${b.number}${b.receiptNo ? ` (${b.receiptNo})` : ""} · ${b.location.name}`, due: fmtDate(due), [bucket]: balance, total: balance }, href: `/expenses/${b.id}` });
  }
  const rows: ReportRow[] = [...bySupplier.values()].sort((a, b) => ((b.total as bigint) > (a.total as bigint) ? 1 : -1)).map((cells) => ({ cells }));
  const totals = Object.fromEntries([...AGING_BUCKETS, "total"].map((k) => [k, [...bySupplier.values()].reduce((a, s) => a + (s[k] as bigint), 0n)]));
  rows.push({ cells: { supplier: "Total", ...totals }, style: "total" });
  const cols = AGING_BUCKETS.map((k) => ({ key: k, label: BUCKET_LABEL[k], kind: "money" as const }));
  return {
    title: "Accounts payable aging",
    subtitle: `${scope.label} · as of ${fmtDate(asOf)}`,
    columns: [{ key: "supplier", label: "Supplier", kind: "text", width: 28 }, ...cols, { key: "total", label: "Total", kind: "money" }],
    rows,
    sections: [{ title: "Unpaid bills", columns: [{ key: "supplier", label: "Supplier", kind: "text", width: 20 }, { key: "bill", label: "Bill", kind: "text", width: 22 }, { key: "due", label: "Due", kind: "text", width: 12 }, ...cols, { key: "total", label: "Balance", kind: "money" }], rows: rowsDetail }],
  };
}

/** Cash and banks day by day: opening, money in, money out, closing (owner's personal funds excluded). */
export async function cashPositionDoc(scope: Scope, from: string, to: string): Promise<ReportDoc> {
  const accounts = await db.moneyAccount.findMany({ where: { kind: { in: ["CASH_DRAWER", "UNDEPOSITED_CASH", "PETTY_CASH", "BANK", "EWALLET"] } }, select: { glAccountId: true } });
  const ids = accounts.map((a) => a.glAccountId);
  const opening = await db.journalLine.aggregate({ where: { accountId: { in: ids }, locationId: { in: scope.ids }, date: { lt: toDbDate(from) } }, _sum: { debitCents: true, creditCents: true } });
  // Transfers between our own cash accounts (deposits, cash-ins) net to zero: count only entries that touch the outside.
  const lines = await db.journalLine.findMany({ where: { accountId: { in: ids }, locationId: { in: scope.ids }, date: { gte: toDbDate(from), lte: toDbDate(to) } }, select: { date: true, debitCents: true, creditCents: true } });
  let bal = (opening._sum.debitCents ?? 0n) - (opening._sum.creditCents ?? 0n);
  const byDay = new Map<string, { inn: bigint; out: bigint }>();
  for (const l of lines) {
    const d = byDay.get(ymd(l.date)) ?? { inn: 0n, out: 0n };
    d.inn += l.debitCents;
    d.out += l.creditCents;
    byDay.set(ymd(l.date), d);
  }
  const rows: ReportRow[] = [];
  let tin = 0n,
    tout = 0n;
  for (const d of [...byDay.keys()].sort()) {
    const v = byDay.get(d)!;
    const open = bal;
    bal += v.inn - v.out;
    tin += v.inn;
    tout += v.out;
    rows.push({ cells: { date: fmtDate(d), opening: open, inn: v.inn, out: -v.out, closing: bal } });
  }
  rows.push({ cells: { date: "Period", opening: (opening._sum.debitCents ?? 0n) - (opening._sum.creditCents ?? 0n), inn: tin, out: -tout, closing: bal }, style: "total" });
  return {
    title: "Daily cash position",
    subtitle: `${scope.label} · ${fmtRange(from, to)} · cash drawers, undeposited cash, petty cash, banks and e-wallets (moves between them show on both sides)`,
    columns: [
      { key: "date", label: "Date", kind: "text", width: 16 },
      { key: "opening", label: "Opening", kind: "money" },
      { key: "inn", label: "In", kind: "money" },
      { key: "out", label: "Out", kind: "money" },
      { key: "closing", label: "Closing", kind: "money" },
    ],
    rows,
  };
}

/** Budget vs actual per account for the months in range (revenue and costs). */
export async function budgetVsActualDoc(scope: Scope, from: string, to: string): Promise<ReportDoc> {
  const chart = await loadChart(db);
  const months = monthsIn(from, to);
  const budgets = await db.budgetLine.findMany({ where: { locationId: { in: scope.ids }, OR: months.map((m) => ({ year: Number(m.key.slice(0, 4)), month: Number(m.key.slice(5, 7)) })) } });
  const bal = combine([...(await loadBalances(db, { from: months[0].from, to: months[months.length - 1].to, locationIds: scope.ids })).values()]);
  const consolidated = scope.ids.length > 1;
  const budgetBy = new Map<string, bigint>();
  for (const b of budgets) budgetBy.set(b.accountId, (budgetBy.get(b.accountId) ?? 0n) + b.amountCents);
  const rows: ReportRow[] = [];
  const sections: [string, string[]][] = [
    ["Revenue", ["REVENUE", "CONTRA_REVENUE"]],
    ["Costs", EXPENSE_SECTIONS],
  ];
  for (const [title, secs] of sections) {
    rows.push({ cells: { account: title }, style: "section" });
    let tb = 0n,
      ta = 0n;
    for (const a of chart.filter((x) => secs.includes(x.section) && !(consolidated && x.isIntercompany))) {
      const net = bal.get(a.id) ?? 0n;
      const actual = a.section === "REVENUE" || a.section === "CONTRA_REVENUE" ? -net : net;
      const budget = budgetBy.get(a.id) ?? 0n;
      if (!actual && !budget) continue;
      const variance = title === "Revenue" ? actual - budget : budget - actual; // + = favourable
      rows.push({ cells: { account: `${a.code} ${a.name}`, budget, actual, variance, pct: budget ? pct(actual, budget) : null }, indent: 1 });
      tb += budget;
      ta += actual;
    }
    rows.push({ cells: { account: `Total ${title.toLowerCase()}`, budget: tb, actual: ta, variance: title === "Revenue" ? ta - tb : tb - ta, pct: tb ? pct(ta, tb) : null }, style: "subtotal" });
  }
  return {
    title: "Budget vs actual",
    subtitle: `${scope.label} · ${months[0].label}${months.length > 1 ? ` to ${months[months.length - 1].label}` : ""} (whole months)`,
    columns: [
      { key: "account", label: "Account", kind: "text", width: 34 },
      { key: "budget", label: "Budget", kind: "money" },
      { key: "actual", label: "Actual", kind: "money" },
      { key: "variance", label: "Better / (worse)", kind: "money" },
      { key: "pct", label: "Actual % of budget", kind: "pct" },
    ],
    rows,
    notes: budgets.length ? undefined : ["No budget set for these months yet: set one under Reports → Budget."],
  };
}

/**
 * Break-even per branch: fixed costs ÷ contribution margin per pax = pax
 * needed. Variable costs are the cost groups flagged variable (food, packaging,
 * card fees…); everything else is fixed.
 */
export async function breakEvenDoc(scope: Scope, from: string, to: string): Promise<ReportDoc> {
  const chart = await loadChart(db);
  const bal = await loadBalances(db, { from, to, locationIds: scope.ids });
  const days = Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1;
  const rows: ReportRow[] = [];
  for (const l of scope.locations.filter((x) => x.type === "BRANCH")) {
    const f = pnlFigures(chart, { key: l.id, label: l.name, balances: bal.get(l.id) ?? new Map(), consolidated: false });
    const paxAgg = await db.salesReport.aggregate({ where: { locationId: l.id, status: "POSTED", businessDate: { gte: toDbDate(from), lte: toDbDate(to) } }, _sum: { pax: true } });
    const pax = Number(paxAgg._sum.pax ?? 0);
    const totalCosts = f.cogs + f.labor + f.opex + f.depreciation + f.otherNet;
    const fixed = totalCosts - f.variableCosts;
    const contribution = f.netSales - f.variableCosts;
    const cmPerPax = pax > 0 ? Number(contribution) / pax : null;
    const bePax = cmPerPax && cmPerPax > 0 ? Math.ceil(Number(fixed) / cmPerPax) : null;
    rows.push({
      cells: {
        branch: l.name,
        sales: f.netSales,
        pax,
        variable: f.variableCosts,
        cmPerPax: cmPerPax === null ? null : BigInt(Math.round(cmPerPax)),
        fixed,
        bePax,
        bePaxDay: bePax === null ? null : Math.round((bePax / days) * 10) / 10,
        paxDay: Math.round((pax / days) * 10) / 10,
        safety: bePax && pax ? Math.round(((pax - bePax) / pax) * 1000) / 10 : null,
      },
    });
  }
  return {
    title: "Break-even analysis",
    subtitle: `${fmtRange(from, to)} (${days} days)`,
    columns: [
      { key: "branch", label: "Branch", kind: "text", width: 18 },
      { key: "sales", label: "Net sales", kind: "money" },
      { key: "pax", label: "Pax", kind: "number" },
      { key: "variable", label: "Variable costs", kind: "money" },
      { key: "cmPerPax", label: "Contribution / pax", kind: "money" },
      { key: "fixed", label: "Fixed costs", kind: "money" },
      { key: "bePax", label: "Break-even pax", kind: "number" },
      { key: "bePaxDay", label: "Break-even pax / day", kind: "number" },
      { key: "paxDay", label: "Actual pax / day", kind: "number" },
      { key: "safety", label: "Margin of safety", kind: "pct" },
    ],
    rows,
    notes: ["Pax needed = fixed costs ÷ (net sales − variable costs) per pax. Set which cost groups are variable in the chart of accounts."],
  };
}
