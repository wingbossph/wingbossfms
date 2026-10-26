import "server-only";
import { db } from "@/server/db";
import { toDbDate } from "@/lib/dates";
import { getSetting } from "@/domains/admin/settings";
import { combine, loadBalances, loadChart, pnlFigures, type ChartAccount } from "@/domains/reports/financials";
import { lowStock, perPaxKpis, varianceReport } from "@/domains/inventory/analytics";

// Numbers behind the Owner dashboard. Every figure comes from the same
// ledger and sales records as the reports, so they always agree.

const DAY = 86_400_000;
const addDays = (ymd: string, n: number) => new Date(Date.parse(`${ymd}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
const daysIn = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY) + 1;
const ratio = (n: bigint, d: bigint) => (d === 0n ? null : Number((n * 100000n) / d) / 1000);

export type Range = { from: string; to: string };

export function presetRange(preset: string, today: string, custom?: Partial<Range>): Range {
  if (preset === "today") return { from: today, to: today };
  if (preset === "week") {
    const wd = (new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7; // Monday = 0
    return { from: addDays(today, -wd), to: today };
  }
  if (preset === "custom" && custom?.from && custom?.to) return custom.from <= custom.to ? { from: custom.from, to: custom.to } : { from: custom.to, to: custom.from };
  return { from: `${today.slice(0, 8)}01`, to: today };
}

export function comparisonRange(r: Range, mode: string): Range {
  if (mode === "yoy") {
    const back = (d: string) => `${Number(d.slice(0, 4)) - 1}${d.slice(4)}`.replace(/-02-29$/, "-02-28");
    return { from: back(r.from), to: back(r.to) };
  }
  const n = daysIn(r.from, r.to);
  return { from: addDays(r.from, -n), to: addDays(r.from, -1) };
}

export type Kpis = {
  netSales: bigint;
  pax: number;
  avgPerPax: bigint | null;
  expenses: bigint;
  netProfit: bigint;
  marginPct: number | null;
  foodCostPct: number | null;
  laborCostPct: number | null;
  cashAndBanks: bigint;
};

async function salesTotals(ids: string[], r: Range) {
  const agg = await db.salesReport.aggregate({ where: { locationId: { in: ids }, status: "POSTED", businessDate: { gte: toDbDate(r.from), lte: toDbDate(r.to) } }, _sum: { netCents: true, pax: true } });
  return { net: agg._sum.netCents ?? 0n, pax: Number(agg._sum.pax ?? 0) };
}

export async function cashAndBanks(ids: string[], to: string) {
  const accounts = await db.moneyAccount.findMany({ where: { kind: { in: ["CASH_DRAWER", "UNDEPOSITED_CASH", "PETTY_CASH", "BANK", "EWALLET", "OWNER_PERSONAL"] } }, select: { glAccountId: true, kind: true } });
  const owner = new Set(accounts.filter((a) => a.kind === "OWNER_PERSONAL").map((a) => a.glAccountId));
  const rows = await db.journalLine.groupBy({ by: ["accountId"], where: { accountId: { in: accounts.filter((a) => !owner.has(a.glAccountId)).map((a) => a.glAccountId) }, locationId: { in: ids }, date: { lte: toDbDate(to) } }, _sum: { debitCents: true, creditCents: true } });
  return rows.reduce((a, r) => a + (r._sum.debitCents ?? 0n) - (r._sum.creditCents ?? 0n), 0n);
}

export async function kpis(ids: string[], r: Range, chart?: ChartAccount[]): Promise<Kpis> {
  const c = chart ?? (await loadChart(db));
  const [bal, sales, cash] = await Promise.all([loadBalances(db, { from: r.from, to: r.to, locationIds: ids }), salesTotals(ids, r), cashAndBanks(ids, r.to)]);
  const f = pnlFigures(c, { key: "x", label: "", balances: combine([...bal.values()]), consolidated: ids.length > 1 });
  const expenses = f.cogs + f.labor + f.opex + f.depreciation;
  return {
    netSales: f.netSales,
    pax: sales.pax,
    avgPerPax: sales.pax > 0 ? BigInt(Math.round(Number(sales.net) / sales.pax)) : null,
    expenses,
    netProfit: f.netProfit,
    marginPct: ratio(f.netProfit, f.netSales),
    foodCostPct: ratio(f.cogs, f.netSales),
    laborCostPct: ratio(f.labor, f.netSales),
    cashAndBanks: cash,
  };
}

// ── Money in ────────────────────────────────────────────────────────────────

export const MONEY_IN_BUCKETS = ["Cash drawer", "Card terminal", "QR", "GCash (business)", "Personal GCash", "Bank transfer", "Delivery platforms", "Other"] as const;

export async function moneyIn(ids: string[], r: Range) {
  const payments = await db.salesPayment.findMany({
    where: { report: { locationId: { in: ids }, status: "POSTED", businessDate: { gte: toDbDate(r.from), lte: toDbDate(r.to) } } },
    include: { channel: { include: { moneyAccount: true } } },
  });
  const bucket = (ch: (typeof payments)[number]["channel"]): (typeof MONEY_IN_BUCKETS)[number] => {
    switch (ch.kind) {
      case "CASH":
        return "Cash drawer";
      case "CARD":
        return "Card terminal";
      case "QR":
        return "QR";
      case "EWALLET":
        return ch.moneyAccount?.isPersonal ? "Personal GCash" : "GCash (business)";
      case "BANK_TRANSFER":
        return "Bank transfer";
      case "DELIVERY_PLATFORM":
        return "Delivery platforms";
      default:
        return "Other";
    }
  };
  const byBucket = new Map<string, bigint>();
  const byChannel = new Map<string, { name: string; bucket: string; cents: bigint }>();
  for (const p of payments) {
    const b = bucket(p.channel);
    byBucket.set(b, (byBucket.get(b) ?? 0n) + p.amountCents);
    const c = byChannel.get(p.channelId) ?? { name: p.channel.name, bucket: b, cents: 0n };
    c.cents += p.amountCents;
    byChannel.set(p.channelId, c);
  }
  const total = [...byBucket.values()].reduce((a, b) => a + b, 0n);
  const [deposits, undeposited, pending] = await Promise.all([
    db.moneyTransfer.aggregate({ where: { status: "POSTED", locationId: { in: ids }, date: { gte: toDbDate(r.from), lte: toDbDate(r.to) }, fromAccount: { kind: { in: ["UNDEPOSITED_CASH", "CASH_DRAWER"] } }, toAccount: { kind: "BANK" } }, _sum: { amountCents: true } }),
    db.moneyAccount.findMany({ where: { kind: "UNDEPOSITED_CASH", locationId: { in: ids } }, select: { glAccountId: true } }).then(async (accs) => {
      const s = await db.journalLine.aggregate({ where: { accountId: { in: accs.map((a) => a.glAccountId) }, date: { lte: toDbDate(r.to) } }, _sum: { debitCents: true, creditCents: true } });
      return (s._sum.debitCents ?? 0n) - (s._sum.creditCents ?? 0n);
    }),
    db.channelSettlement.aggregate({ where: { status: "EXPECTED", locationId: { in: ids } }, _sum: { expectedNetCents: true }, _count: true }),
  ]);
  const personal = byBucket.get("Personal GCash") ?? 0n;
  const threshold = await getSetting(db, "alerts.personalGcashShareBp");
  const personalShare = total > 0n ? Number((personal * 10000n) / total) : 0;
  return {
    total,
    buckets: MONEY_IN_BUCKETS.map((name) => ({ name, cents: byBucket.get(name) ?? 0n, pct: ratio(byBucket.get(name) ?? 0n, total) })).filter((b) => b.cents !== 0n || b.name !== "Other"),
    channels: [...byChannel.values()].sort((a, b) => (b.cents > a.cents ? 1 : -1)),
    cashDeposits: deposits._sum.amountCents ?? 0n,
    undeposited,
    pendingSettlements: pending._sum.expectedNetCents ?? 0n,
    pendingSettlementCount: pending._count,
    personalShareBp: personalShare,
    personalAlert: total > 0n && personalShare > threshold,
    personalThresholdBp: threshold,
  };
}

// ── Trend, expenses, branches ───────────────────────────────────────────────

export async function salesTrend(ids: string[], r: Range) {
  const rows = await db.salesReport.groupBy({ by: ["businessDate", "locationId"], where: { locationId: { in: ids }, status: "POSTED", businessDate: { gte: toDbDate(r.from), lte: toDbDate(r.to) } }, _sum: { netCents: true, pax: true } });
  return rows.map((x) => ({ date: x.businessDate.toISOString().slice(0, 10), locationId: x.locationId, netCents: x._sum.netCents ?? 0n, pax: Number(x._sum.pax ?? 0) }));
}

export async function expensesByGroup(ids: string[], r: Range, chart?: ChartAccount[]) {
  const c = chart ?? (await loadChart(db));
  const bal = combine([...(await loadBalances(db, { from: r.from, to: r.to, locationIds: ids })).values()]);
  const groups = new Map<string, { name: string; cents: bigint; accounts: { id: string; name: string; cents: bigint }[] }>();
  for (const a of c) {
    if (!["COGS", "LABOR", "OPERATING_EXPENSE"].includes(a.section)) continue;
    if (ids.length > 1 && a.isIntercompany) continue;
    const v = bal.get(a.id) ?? 0n;
    if (v === 0n) continue;
    const g = groups.get(a.groupId) ?? { name: a.groupName, cents: 0n, accounts: [] };
    g.cents += v;
    g.accounts.push({ id: a.id, name: a.name, cents: v });
    groups.set(a.groupId, g);
  }
  const list = [...groups.values()].sort((a, b) => (b.cents > a.cents ? 1 : -1));
  const drivers = list.flatMap((g) => g.accounts).sort((a, b) => (b.cents > a.cents ? 1 : -1)).slice(0, 5);
  return { groups: list, drivers };
}

export async function branchComparison(ids: string[], r: Range, chart?: ChartAccount[]) {
  const c = chart ?? (await loadChart(db));
  const locations = await db.location.findMany({ where: { id: { in: ids } }, orderBy: [{ sortOrder: "asc" }] });
  const bal = await loadBalances(db, { from: r.from, to: r.to, locationIds: ids });
  const out = [];
  for (const l of locations) {
    const f = pnlFigures(c, { key: l.id, label: l.name, balances: bal.get(l.id) ?? new Map(), consolidated: false });
    const s = await salesTotals([l.id], r);
    if (l.type !== "BRANCH" && f.netSales === 0n && f.netProfit === 0n) continue;
    out.push({ id: l.id, name: l.name, type: l.type, netSales: f.netSales, pax: s.pax, avgPerPax: s.pax > 0 ? BigInt(Math.round(Number(s.net) / s.pax)) : null, foodCostPct: ratio(f.cogs, f.netSales), laborCostPct: ratio(f.labor, f.netSales), netProfit: f.netProfit, marginPct: ratio(f.netProfit, f.netSales) });
  }
  return out;
}

// ── Inventory panel ─────────────────────────────────────────────────────────

export async function inventoryPanel(ids: string[], r: Range) {
  const branches = await db.location.findMany({ where: { id: { in: ids }, type: "BRANCH" }, orderBy: { sortOrder: "asc" } });
  const perPax = [];
  const variances = [];
  for (const b of branches) {
    const [today, period] = await Promise.all([perPaxKpis(db, b.id, r.to, r.to), perPaxKpis(db, b.id, r.from, r.to)]);
    perPax.push({ id: b.id, name: b.name, todayKgPerPax: today.wingsKgPerPax, periodKgPerPax: period.wingsKgPerPax, standard: period.standardKgPerPax ?? today.standardKgPerPax });
    for (const v of (await varianceReport(db, b.id, r.from, r.to)).filter((x) => x.flagged)) variances.push({ location: b.name, ...v });
  }
  variances.sort((a, b) => Math.abs(b.variancePct ?? 0) - Math.abs(a.variancePct ?? 0));
  return { perPax, variances: variances.slice(0, 6), low: (await lowStock(db, ids)).slice(0, 8) };
}

// ── Alerts ──────────────────────────────────────────────────────────────────

export type DashAlert = { severity: "critical" | "serious" | "warning"; text: string; href: string };

export async function alerts(ids: string[], r: Range, today: string): Promise<DashAlert[]> {
  const out: DashAlert[] = [];
  const shortThreshold = BigInt(await getSetting(db, "alerts.cashShortThresholdCents"));
  const [counts, unapproved, bills, staleLines, overdue] = await Promise.all([
    db.cashCount.findMany({ where: { report: { locationId: { in: ids }, businessDate: { gte: toDbDate(r.from), lte: toDbDate(r.to) } }, OR: [{ overShortCents: { gte: shortThreshold } }, { overShortCents: { lte: -shortThreshold } }] }, include: { report: { include: { location: true } } }, orderBy: { countedAt: "desc" }, take: 10 }),
    db.expense.aggregate({ where: { locationId: { in: ids }, status: "SUBMITTED" }, _count: true, _sum: { totalCents: true } }),
    db.expense.findMany({ where: { locationId: { in: ids }, terms: "ON_ACCOUNT", status: "POSTED", dueDate: { lte: toDbDate(addDays(today, 7)) } }, include: { supplier: true } }),
    db.bankStatementLine.groupBy({ by: ["statementId"], where: { status: { in: ["UNMATCHED", "INVESTIGATE"] }, txnDate: { lt: toDbDate(addDays(today, -7)) } }, _count: true }),
    db.channelSettlement.aggregate({ where: { status: "EXPECTED", locationId: { in: ids }, expectedOn: { lt: toDbDate(addDays(today, -2)) } }, _count: true, _sum: { expectedNetCents: true } }),
  ]);
  const peso = (c: bigint) => `₱${(Number(c) / 100).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  for (const c of counts) {
    out.push({ severity: c.overShortCents < 0n ? "serious" : "warning", text: `${c.report.location.name} ${c.report.businessDate.toISOString().slice(0, 10)}: cash ${c.overShortCents < 0n ? "short" : "over"} ${peso(c.overShortCents < 0n ? -c.overShortCents : c.overShortCents)}`, href: `/sales/${c.reportId}` });
  }
  if (unapproved._count) out.push({ severity: "warning", text: `${unapproved._count} expense(s) waiting for approval (${peso(unapproved._sum.totalCents ?? 0n)})`, href: "/expenses/approvals" });
  const unpaid = bills.filter((b) => b.paidCents < b.totalCents);
  const overdueBills = unpaid.filter((b) => b.dueDate && b.dueDate < toDbDate(today));
  if (overdueBills.length) out.push({ severity: "serious", text: `${overdueBills.length} supplier bill(s) overdue (${peso(overdueBills.reduce((a, b) => a + b.totalCents - b.paidCents, 0n))})`, href: "/expenses/payables" });
  if (unpaid.length > overdueBills.length) out.push({ severity: "warning", text: `${unpaid.length - overdueBills.length} bill(s) due within 7 days`, href: "/expenses/payables" });
  if (staleLines.length) {
    const statements = await db.bankStatement.findMany({ where: { id: { in: staleLines.map((s) => s.statementId) } }, include: { moneyAccount: true } });
    const byAccount = new Map<string, { name: string; id: string; n: number }>();
    for (const s of staleLines) {
      const st = statements.find((x) => x.id === s.statementId)!;
      const cur = byAccount.get(st.moneyAccountId) ?? { name: st.moneyAccount.name, id: st.moneyAccountId, n: 0 };
      cur.n += s._count;
      byAccount.set(st.moneyAccountId, cur);
    }
    for (const a of byAccount.values()) out.push({ severity: "serious", text: `${a.name}: ${a.n} statement line(s) unmatched for over a week`, href: `/banking/${a.id}` });
  }
  if (overdue._count) out.push({ severity: "warning", text: `${overdue._count} card/QR/Grab payout(s) overdue (${peso(overdue._sum.expectedNetCents ?? 0n)})`, href: "/banking/payouts" });
  return out;
}
