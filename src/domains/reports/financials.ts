// Financial statements from the general ledger. Loading is one grouped query;
// the builders are pure functions over (account → balance) maps, so the
// same numbers feed the screen, Excel, PDF and the tests.

import type { JournalSource, KpiTag, StatementSection } from "@/generated/prisma/enums";
import type { Tx } from "@/server/db";
import { toDbDate } from "@/lib/dates";
import { pct, type ReportColumn, type ReportDoc, type ReportRow } from "./doc";

type Reader = Pick<Tx, "account" | "journalLine" | "accountGroup">;

export type ChartAccount = {
  id: string;
  code: string;
  name: string;
  type: string;
  systemKey: string | null;
  isIntercompany: boolean;
  groupId: string;
  groupName: string;
  groupCode: string;
  section: StatementSection;
  kpiTag: KpiTag;
  isVariable: boolean;
  groupOrder: number;
};

export async function loadChart(db: Reader): Promise<ChartAccount[]> {
  const accounts = await db.account.findMany({ where: { isPostable: true }, include: { group: true }, orderBy: { code: "asc" } });
  return accounts.map((a) => ({
    id: a.id,
    code: a.code,
    name: a.name,
    type: a.type,
    systemKey: a.systemKey,
    isIntercompany: a.isIntercompany,
    groupId: a.groupId,
    groupName: a.group.name,
    groupCode: a.group.code,
    section: a.group.section,
    kpiTag: a.group.kpiTag,
    isVariable: a.group.isVariable,
    groupOrder: a.group.sortOrder,
  }));
}

/** Net debit − credit per account (and per location) for a date range. */
export async function loadBalances(
  db: Reader,
  opts: { from?: string; to: string; locationIds: string[]; excludeSources?: JournalSource[] },
): Promise<Map<string, Map<string, bigint>>> {
  const rows = await db.journalLine.groupBy({
    by: ["accountId", "locationId"],
    where: {
      locationId: { in: opts.locationIds },
      date: { ...(opts.from ? { gte: toDbDate(opts.from) } : {}), lte: toDbDate(opts.to) },
      // Excluding a source also excludes reversals of entries from that source.
      ...(opts.excludeSources?.length
        ? { entry: { source: { notIn: opts.excludeSources }, NOT: { reverses: { is: { source: { in: opts.excludeSources } } } } } }
        : {}),
    },
    _sum: { debitCents: true, creditCents: true },
  });
  // location → account → net
  const out = new Map<string, Map<string, bigint>>();
  for (const r of rows) {
    const m = out.get(r.locationId) ?? new Map<string, bigint>();
    m.set(r.accountId, (r._sum.debitCents ?? 0n) - (r._sum.creditCents ?? 0n));
    out.set(r.locationId, m);
  }
  return out;
}

/** Sums several locations' maps into one. */
export function combine(maps: (Map<string, bigint> | undefined)[]): Map<string, bigint> {
  const out = new Map<string, bigint>();
  for (const m of maps) if (m) for (const [k, v] of m) out.set(k, (out.get(k) ?? 0n) + v);
  return out;
}

// ── P&L ─────────────────────────────────────────────────────────────────────

export type PnlColumn = { key: string; label: string; balances: Map<string, bigint>; consolidated: boolean };

export type PnlFigures = {
  netSales: bigint;
  grossRevenue: bigint;
  contra: bigint;
  cogs: bigint;
  grossProfit: bigint;
  labor: bigint;
  opex: bigint;
  occupancy: bigint;
  ebitda: bigint;
  depreciation: bigint;
  ebit: bigint;
  otherNet: bigint;
  preTax: bigint;
  incomeTax: bigint;
  netProfit: bigint;
  variableCosts: bigint;
};

/** Amount shown on the P&L: revenue as positive income, costs as positive costs. */
function pnlAmount(a: ChartAccount, net: bigint): bigint {
  return a.section === "REVENUE" || a.section === "CONTRA_REVENUE" ? -net : net;
}

const included = (a: ChartAccount, col: PnlColumn) => !(col.consolidated && a.isIntercompany);

export function pnlFigures(chart: readonly ChartAccount[], col: PnlColumn): PnlFigures {
  let grossRevenue = 0n,
    contra = 0n,
    cogs = 0n,
    labor = 0n,
    opexExDep = 0n,
    occupancy = 0n,
    depreciation = 0n,
    otherNet = 0n,
    incomeTax = 0n,
    variableCosts = 0n;
  for (const a of chart) {
    if (!included(a, col)) continue;
    const net = col.balances.get(a.id) ?? 0n;
    if (net === 0n) continue;
    const v = pnlAmount(a, net);
    switch (a.section) {
      case "REVENUE":
        grossRevenue += v;
        break;
      case "CONTRA_REVENUE":
        contra += v; // negative
        break;
      case "COGS":
        cogs += v;
        break;
      case "LABOR":
        labor += v;
        break;
      case "OPERATING_EXPENSE":
        if (a.kpiTag === "DEPRECIATION") depreciation += v;
        else opexExDep += v;
        if (a.kpiTag === "OCCUPANCY") occupancy += v;
        break;
      case "OTHER_INCOME_EXPENSE":
        otherNet += v;
        break;
      case "INCOME_TAX":
        incomeTax += v;
        break;
      default:
        continue;
    }
    if (a.isVariable && (a.section === "COGS" || a.section === "OPERATING_EXPENSE")) variableCosts += v;
  }
  const netSales = grossRevenue + contra;
  const grossProfit = netSales - cogs;
  const ebitda = grossProfit - labor - opexExDep;
  const ebit = ebitda - depreciation;
  const preTax = ebit - otherNet;
  return {
    netSales,
    grossRevenue,
    contra,
    cogs,
    grossProfit,
    labor,
    opex: opexExDep,
    occupancy,
    ebitda,
    depreciation,
    ebit,
    otherNet,
    preTax,
    incomeTax,
    netProfit: preTax - incomeTax,
    variableCosts,
  };
}

export function buildPnl(chart: readonly ChartAccount[], cols: PnlColumn[], opts: { title: string; subtitle: string; glHref?: (accountId: string) => string }): ReportDoc {
  const pctBase = cols[cols.length - 1];
  const showPct = true;
  const columns: ReportColumn[] = [
    { key: "label", label: "Account", kind: "text", width: 42 },
    ...cols.map((c) => ({ key: c.key, label: c.label, kind: "money" as const })),
    ...(showPct ? [{ key: "pct", label: `% of sales${cols.length > 1 ? ` (${pctBase.label})` : ""}`, kind: "pct" as const }] : []),
  ];
  const figs = new Map(cols.map((c) => [c.key, pnlFigures(chart, c)]));
  const baseSales = figs.get(pctBase.key)!.netSales;
  const rows: ReportRow[] = [];
  const row = (label: string, values: (c: PnlColumn) => bigint | null, style: ReportRow["style"] = "normal", indent = 0, href?: string) => {
    const cells: ReportRow["cells"] = { label };
    for (const c of cols) cells[c.key] = values(c);
    const base = values(pctBase);
    cells.pct = base === null ? null : pct(base, baseSales);
    rows.push({ cells, style, indent, href });
  };
  const accountRows = (filter: (a: ChartAccount) => boolean) => {
    const accts = chart.filter(filter).filter((a) => cols.some((c) => included(a, c) && (c.balances.get(a.id) ?? 0n) !== 0n));
    for (const a of accts) {
      row(a.name, (c) => (included(a, c) ? pnlAmount(a, c.balances.get(a.id) ?? 0n) : 0n), "normal", 1, opts.glHref?.(a.id));
    }
  };
  const fig = (k: keyof PnlFigures) => (c: PnlColumn) => figs.get(c.key)![k];

  row("Revenue", () => null, "section");
  accountRows((a) => a.section === "REVENUE");
  accountRows((a) => a.section === "CONTRA_REVENUE");
  row("Net sales", fig("netSales"), "subtotal");

  row("Cost of goods sold", () => null, "section");
  accountRows((a) => a.section === "COGS");
  row("Total cost of goods sold", fig("cogs"), "subtotal");
  row("Gross profit", fig("grossProfit"), "subtotal");

  row("Payroll and labor", () => null, "section");
  accountRows((a) => a.section === "LABOR");
  row("Total labor", fig("labor"), "subtotal");

  const opexGroups = [...new Map(chart.filter((a) => a.section === "OPERATING_EXPENSE" && a.kpiTag !== "DEPRECIATION").map((a) => [a.groupId, a])).values()].sort((x, y) => x.groupOrder - y.groupOrder);
  row("Operating expenses", () => null, "section");
  for (const g of opexGroups) {
    const inGroup = (a: ChartAccount) => a.groupId === g.groupId;
    const groupTotal = (c: PnlColumn) => chart.filter(inGroup).reduce((s, a) => s + (included(a, c) ? pnlAmount(a, c.balances.get(a.id) ?? 0n) : 0n), 0n);
    if (cols.every((c) => groupTotal(c) === 0n)) continue;
    row(g.groupName, groupTotal, "normal", 1);
  }
  row("Total operating expenses", fig("opex"), "subtotal");
  row("EBITDA", fig("ebitda"), "subtotal");
  accountRows((a) => a.kpiTag === "DEPRECIATION");
  row("Operating income", fig("ebit"), "subtotal");
  accountRows((a) => a.section === "OTHER_INCOME_EXPENSE");
  row("Income before tax", fig("preTax"), "subtotal");
  accountRows((a) => a.section === "INCOME_TAX");
  row("Net profit", fig("netProfit"), "total");

  const kpiCols: ReportColumn[] = [{ key: "label", label: "Key ratio", kind: "text" }, ...cols.map((c) => ({ key: c.key, label: c.label, kind: "pct" as const }))];
  const kpi = (label: string, num: (f: PnlFigures) => bigint): ReportRow => ({
    cells: { label, ...Object.fromEntries(cols.map((c) => [c.key, pct(num(figs.get(c.key)!), figs.get(c.key)!.netSales)])) },
  });
  return {
    title: opts.title,
    subtitle: opts.subtitle,
    columns,
    rows,
    sections: [
      {
        title: "Key ratios (% of net sales)",
        columns: kpiCols,
        rows: [
          kpi("Food cost %", (f) => f.cogs),
          kpi("Labor cost %", (f) => f.labor),
          kpi("Prime cost % (food + labor)", (f) => f.cogs + f.labor),
          kpi("Occupancy %", (f) => f.occupancy),
          kpi("EBITDA margin", (f) => f.ebitda),
          kpi("Net profit margin", (f) => f.netProfit),
        ],
      },
    ],
    notes: [
      "Amounts in pesos. Costs in parentheses reduce profit. Inter-location markup is eliminated in consolidated columns.",
    ],
  };
}

// ── Balance sheet ───────────────────────────────────────────────────────────

const ASSET_SECTIONS: StatementSection[] = ["CURRENT_ASSET", "NONCURRENT_ASSET"];
const LIAB_SECTIONS: StatementSection[] = ["CURRENT_LIABILITY", "NONCURRENT_LIABILITY"];
const PNL_SECTIONS: StatementSection[] = ["REVENUE", "CONTRA_REVENUE", "COGS", "LABOR", "OPERATING_EXPENSE", "OTHER_INCOME_EXPENSE", "INCOME_TAX"];

export type BsColumn = { key: string; label: string; balances: Map<string, bigint>; ytdProfit: bigint; consolidated: boolean };

/** Net profit (credit-positive) from a P&L balance map. */
export function profitOf(chart: readonly ChartAccount[], balances: Map<string, bigint>): bigint {
  let total = 0n;
  for (const a of chart) if (PNL_SECTIONS.includes(a.section)) total -= balances.get(a.id) ?? 0n;
  return total;
}

export function bsFigures(chart: readonly ChartAccount[], col: BsColumn) {
  let assets = 0n,
    liabilities = 0n,
    equity = 0n,
    pnlToDate = 0n;
  for (const a of chart) {
    const net = col.balances.get(a.id) ?? 0n;
    if (ASSET_SECTIONS.includes(a.section)) assets += net;
    else if (LIAB_SECTIONS.includes(a.section)) liabilities -= net;
    else if (a.section === "EQUITY") equity -= net;
    else pnlToDate -= net;
  }
  const priorEarnings = pnlToDate - col.ytdProfit;
  return { assets, liabilities, equity, priorEarnings, currentEarnings: col.ytdProfit, liabilitiesAndEquity: liabilities + equity + pnlToDate };
}

export function buildBalanceSheet(chart: readonly ChartAccount[], cols: BsColumn[], opts: { title: string; subtitle: string; glHref?: (accountId: string) => string }): ReportDoc {
  const columns: ReportColumn[] = [{ key: "label", label: "Account", kind: "text", width: 42 }, ...cols.map((c) => ({ key: c.key, label: c.label, kind: "money" as const }))];
  const rows: ReportRow[] = [];
  const figs = new Map(cols.map((c) => [c.key, bsFigures(chart, c)]));
  const row = (label: string, v: (c: BsColumn) => bigint | null, style: ReportRow["style"] = "normal", indent = 0, href?: string) =>
    rows.push({ cells: { label, ...Object.fromEntries(cols.map((c) => [c.key, v(c)])) }, style, indent, href });
  const accountRows = (sections: StatementSection[], sign: 1n | -1n) => {
    const groups = [...new Map(chart.filter((a) => sections.includes(a.section)).map((a) => [a.groupId, a])).values()].sort((x, y) => x.groupOrder - y.groupOrder);
    for (const g of groups) {
      const accts = chart.filter((a) => a.groupId === g.groupId && cols.some((c) => (c.balances.get(a.id) ?? 0n) !== 0n));
      // In consolidated columns, inter-location balances are shown net in one line.
      const visible = accts.filter((a) => !a.isIntercompany);
      if (!visible.length && !accts.length) continue;
      row(g.groupName, () => null, "muted", 1);
      for (const a of visible) row(a.name, (c) => sign * (c.balances.get(a.id) ?? 0n), "normal", 2, opts.glHref?.(a.id));
      const interco = accts.filter((a) => a.isIntercompany);
      if (interco.length) {
        row(
          sign === 1n ? "Inter-location receivable" : "Inter-location payable",
          (c) => sign * interco.reduce((s, a) => s + (c.balances.get(a.id) ?? 0n), 0n),
          "normal",
          2,
        );
      }
    }
  };
  row("Assets", () => null, "section");
  accountRows(ASSET_SECTIONS, 1n);
  row("Total assets", (c) => figs.get(c.key)!.assets, "subtotal");
  row("Liabilities", () => null, "section");
  accountRows(LIAB_SECTIONS, -1n);
  row("Total liabilities", (c) => figs.get(c.key)!.liabilities, "subtotal");
  row("Owner's equity", () => null, "section");
  for (const a of chart.filter((x) => x.section === "EQUITY" && cols.some((c) => (c.balances.get(x.id) ?? 0n) !== 0n))) {
    row(a.name, (c) => -(c.balances.get(a.id) ?? 0n), "normal", 2, opts.glHref?.(a.id));
  }
  row("Earnings of prior years", (c) => figs.get(c.key)!.priorEarnings, "normal", 2);
  row("Earnings this year", (c) => figs.get(c.key)!.currentEarnings, "normal", 2);
  row("Total equity", (c) => figs.get(c.key)!.equity + figs.get(c.key)!.priorEarnings + figs.get(c.key)!.currentEarnings, "subtotal");
  row("Total liabilities and equity", (c) => figs.get(c.key)!.liabilitiesAndEquity, "total");
  const unbalanced = cols.filter((c) => figs.get(c.key)!.assets !== figs.get(c.key)!.liabilitiesAndEquity);
  return {
    title: opts.title,
    subtitle: opts.subtitle,
    columns,
    rows,
    notes: [
      unbalanced.length ? `⚠ Out of balance in: ${unbalanced.map((c) => c.label).join(", ")}` : "Assets = liabilities + equity in every column ✓",
      "Per-location columns show each location's share of shared accounts (e.g. BPI). Inter-location receivables and payables cancel out in the consolidated column, except goods still in transit.",
    ],
  };
}

// ── Cash flow (indirect) ────────────────────────────────────────────────────

const CASH_GROUP = "CASH";
const NON_CASH_KPI: KpiTag[] = ["DEPRECIATION"];

/**
 * Indirect method from two balance snapshots (start − 1 day, end) and the
 * period P&L. Cash = cash drawers, undeposited, petty cash, banks, e-wallets.
 */
export function buildCashFlow(
  chart: readonly ChartAccount[],
  opening: Map<string, bigint>,
  closing: Map<string, bigint>,
  period: Map<string, bigint>,
  opts: { title: string; subtitle: string },
): ReportDoc {
  const change = (a: ChartAccount) => (closing.get(a.id) ?? 0n) - (opening.get(a.id) ?? 0n);
  const netIncome = profitOf(chart, period);
  const depreciation = chart.filter((a) => NON_CASH_KPI.includes(a.kpiTag)).reduce((s, a) => s + (period.get(a.id) ?? 0n), 0n);
  const rows: ReportRow[] = [];
  const row = (label: string, value: bigint | null, style: ReportRow["style"] = "normal", indent = 0) => rows.push({ cells: { label, amount: value }, style, indent });

  row("Operating activities", null, "section");
  row("Net profit", netIncome, "normal", 1);
  row("Add back: depreciation", depreciation, "normal", 1);
  let operating = netIncome + depreciation;
  const workingCapital = chart.filter(
    (a) =>
      (a.section === "CURRENT_ASSET" && a.groupCode !== CASH_GROUP) ||
      (a.section === "CURRENT_LIABILITY" && a.systemKey !== "LOANS_PAYABLE" && !a.groupCode.startsWith("NONCURRENT")),
  );
  // Owner-funded expenses (due to owner) are financing, not operating.
  const isOwnerFunding = (a: ChartAccount) => a.groupCode === "CURRENT_LIABILITIES" && a.code.startsWith("2120");
  for (const a of workingCapital.filter((x) => !isOwnerFunding(x))) {
    const d = change(a);
    if (d === 0n) continue;
    const effect = -d; // asset up = cash down; liability up (credit, negative net) = cash up
    row(`${a.section === "CURRENT_ASSET" ? (d > 0n ? "Increase" : "Decrease") : d < 0n ? "Increase" : "Decrease"} in ${a.name.toLowerCase()}`, effect, "normal", 1);
    operating += effect;
  }
  row("Net cash from operating activities", operating, "subtotal");

  row("Investing activities", null, "section");
  let investing = 0n;
  for (const a of chart.filter((x) => x.section === "NONCURRENT_ASSET")) {
    let d = change(a);
    if (a.systemKey === "ACCUM_DEPRECIATION") d += depreciation; // remove the non-cash part
    if (d === 0n) continue;
    row(`${d > 0n ? "Purchase of" : "Disposal of"} ${a.name.toLowerCase()}`, -d, "normal", 1);
    investing -= d;
  }
  row("Net cash from investing activities", investing, "subtotal");

  row("Financing activities", null, "section");
  let financing = 0n;
  for (const a of chart.filter((x) => x.section === "EQUITY" || x.section === "NONCURRENT_LIABILITY" || isOwnerFunding(x))) {
    const d = change(a);
    if (d === 0n) continue;
    row(a.name, -d, "normal", 1);
    financing -= d;
  }
  row("Net cash from financing activities", financing, "subtotal");

  const cashAccounts = chart.filter((a) => a.groupCode === CASH_GROUP);
  const cashOpen = cashAccounts.reduce((s, a) => s + (opening.get(a.id) ?? 0n), 0n);
  const cashClose = cashAccounts.reduce((s, a) => s + (closing.get(a.id) ?? 0n), 0n);
  row("Net change in cash", operating + investing + financing, "subtotal");
  row("Cash at the beginning", cashOpen, "normal");
  row("Cash at the end", cashClose, "total");
  const diff = cashClose - cashOpen - (operating + investing + financing);
  return {
    title: opts.title,
    subtitle: opts.subtitle,
    columns: [
      { key: "label", label: "", kind: "text", width: 50 },
      { key: "amount", label: "Amount", kind: "money" },
    ],
    rows,
    notes: [
      diff === 0n ? "Ties to the change in cash ✓" : `⚠ Difference of ${diff} centavos against the change in cash`,
      "Cash = cash drawers, undeposited cash, petty cash, bank accounts and e-wallets. Card/QR and Grab amounts not yet paid out are receivables.",
    ],
  };
}

// ── Changes in equity ───────────────────────────────────────────────────────

export function buildEquityStatement(
  chart: readonly ChartAccount[],
  opening: Map<string, bigint>,
  period: Map<string, bigint>,
  opts: { title: string; subtitle: string },
): ReportDoc {
  const key = (k: string) => chart.find((a) => a.systemKey === k)?.id ?? "";
  const capital = key("OWNER_CAPITAL");
  const drawings = key("OWNER_DRAWINGS");
  const openingBalanceEq = key("OPENING_BALANCE_EQUITY");
  const retained = key("RETAINED_EARNINGS");
  const openEquity =
    -((opening.get(capital) ?? 0n) + (opening.get(drawings) ?? 0n) + (opening.get(openingBalanceEq) ?? 0n) + (opening.get(retained) ?? 0n)) + profitOf(chart, opening);
  const contributions = -(period.get(capital) ?? 0n);
  const draws = -(period.get(drawings) ?? 0n);
  const other = -((period.get(openingBalanceEq) ?? 0n) + (period.get(retained) ?? 0n));
  const profit = profitOf(chart, period);
  const close = openEquity + contributions + draws + other + profit;
  const r = (label: string, amount: bigint, style: ReportRow["style"] = "normal"): ReportRow => ({ cells: { label, amount }, style });
  return {
    title: opts.title,
    subtitle: opts.subtitle,
    columns: [
      { key: "label", label: "", kind: "text", width: 50 },
      { key: "amount", label: "Amount", kind: "money" },
    ],
    rows: [
      r("Owner's equity at the beginning", openEquity, "subtotal"),
      r("Capital contributed", contributions),
      r("Owner drawings", draws),
      ...(other !== 0n ? [r("Opening balances and other adjustments", other)] : []),
      r("Net profit for the period", profit),
      r("Owner's equity at the end", close, "total"),
    ],
  };
}

// ── Trial balance ───────────────────────────────────────────────────────────

export function buildTrialBalance(chart: readonly ChartAccount[], balances: Map<string, bigint>, opts: { title: string; subtitle: string; glHref?: (accountId: string) => string }): ReportDoc {
  let debit = 0n;
  let credit = 0n;
  const rows: ReportRow[] = [];
  for (const a of chart) {
    const net = balances.get(a.id) ?? 0n;
    if (net === 0n) continue;
    if (net > 0n) debit += net;
    else credit -= net;
    rows.push({ cells: { code: a.code, label: a.name, debit: net > 0n ? net : null, credit: net < 0n ? -net : null }, href: opts.glHref?.(a.id) });
  }
  rows.push({ cells: { code: "", label: "Totals", debit, credit }, style: "total" });
  return {
    title: opts.title,
    subtitle: opts.subtitle,
    columns: [
      { key: "code", label: "Code", kind: "text", width: 10 },
      { key: "label", label: "Account", kind: "text", width: 40 },
      { key: "debit", label: "Debit", kind: "money" },
      { key: "credit", label: "Credit", kind: "money" },
    ],
    rows: rows.map((r) => ({ ...r, cells: { ...r.cells } })),
    notes: [debit === credit ? "Debits equal credits ✓" : `⚠ Out of balance by ${debit - credit} centavos`],
  };
}
