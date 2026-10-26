import type { JournalSource } from "@/generated/prisma/enums";
import type { Tx } from "@/server/db";
import { toDbDate } from "@/lib/dates";
import type { ReportDoc, ReportRow } from "./doc";
import { dayBefore, fmtDate, fmtRange } from "./params";

type Reader = Pick<Tx, "account" | "journalLine" | "journalEntry">;

export const SOURCE_LABEL: Record<JournalSource, string> = {
  OPENING_BALANCE: "Opening balance",
  SALES_REPORT: "Sales",
  CASH_COUNT: "Shift close",
  CHANNEL_SETTLEMENT: "Card/QR/Grab payout",
  MONEY_TRANSFER: "Deposit / transfer",
  EXPENSE: "Expense",
  EXPENSE_PAYMENT: "Bill payment",
  STOCK_RECEIPT: "Stock receipt",
  STOCK_COUNT: "Stock count (usage)",
  STOCK_ADJUSTMENT: "Waste / adjustment",
  PRODUCTION: "Production",
  TRANSFER_DISPATCH: "Transfer dispatched",
  TRANSFER_RECEIVE: "Transfer received",
  INTERCO_SETTLEMENT: "Inter-location settlement",
  PAYROLL: "Payroll",
  DEPRECIATION: "Depreciation",
  ALLOCATION: "Cost allocation",
  OWNER_EQUITY: "Owner capital / drawing",
  BANK_LINE: "Bank statement item",
  MANUAL: "Manual entry",
  REVERSAL: "Reversal",
};

/** Where the source document of an entry can be opened. */
export function sourceHref(source: JournalSource, sourceId: string | null): string | undefined {
  if (!sourceId) return undefined;
  switch (source) {
    case "SALES_REPORT":
      return `/sales/${sourceId}`;
    case "EXPENSE":
      return `/expenses/${sourceId}`;
    default:
      return undefined;
  }
}

export async function buildGeneralLedger(
  db: Reader,
  opts: { accountId?: string; from: string; to: string; locationIds: string[]; scopeLabel: string },
): Promise<ReportDoc> {
  const account = opts.accountId ? await db.account.findUnique({ where: { id: opts.accountId } }) : null;
  const columns = [
    { key: "date", label: "Date", kind: "text" as const, width: 14 },
    { key: "entry", label: "Entry", kind: "text" as const, width: 8 },
    { key: "memo", label: "Description", kind: "text" as const, width: 46 },
    { key: "debit", label: "Debit", kind: "money" as const },
    { key: "credit", label: "Credit", kind: "money" as const },
    { key: "balance", label: "Balance", kind: "money" as const },
  ];
  if (!account) {
    return { title: "General ledger", subtitle: "Choose an account", columns, rows: [] };
  }
  const where = { accountId: account.id, locationId: { in: opts.locationIds } };
  const [opening, lines] = await Promise.all([
    db.journalLine.aggregate({ where: { ...where, date: { lte: toDbDate(dayBefore(opts.from)) } }, _sum: { debitCents: true, creditCents: true } }),
    db.journalLine.findMany({
      where: { ...where, date: { gte: toDbDate(opts.from), lte: toDbDate(opts.to) } },
      include: { entry: true, location: { select: { code: true } } },
      orderBy: [{ date: "asc" }, { entry: { number: "asc" } }],
      take: 5000,
    }),
  ]);
  let balance = (opening._sum.debitCents ?? 0n) - (opening._sum.creditCents ?? 0n);
  const rows: ReportRow[] = [{ cells: { date: fmtDate(opts.from), entry: "", memo: "Opening balance", debit: null, credit: null, balance }, style: "muted" }];
  let debit = 0n;
  let credit = 0n;
  for (const l of lines) {
    balance += l.debitCents - l.creditCents;
    debit += l.debitCents;
    credit += l.creditCents;
    rows.push({
      cells: {
        date: fmtDate(l.date.toISOString().slice(0, 10)),
        entry: `#${l.entry.number}`,
        memo: `${l.memo ?? l.entry.memo}${opts.locationIds.length > 1 ? ` [${l.location.code}]` : ""}`,
        debit: l.debitCents || null,
        credit: l.creditCents || null,
        balance,
      },
      href: `/ledger/entries/${l.entryId}`,
    });
  }
  rows.push({ cells: { date: "", entry: "", memo: "Totals / closing balance", debit, credit, balance }, style: "total" });
  return {
    title: `General ledger · ${account.code} ${account.name}`,
    subtitle: `${opts.scopeLabel} · ${fmtRange(opts.from, opts.to)}`,
    columns,
    rows,
    notes: ["Balance is debit − credit. Liability, equity and income accounts normally show negative (credit) balances."],
  };
}

export async function buildJournal(db: Reader, opts: { from: string; to: string; locationIds: string[]; source?: string; scopeLabel: string }): Promise<ReportDoc> {
  const entries = await db.journalEntry.findMany({
    where: {
      date: { gte: toDbDate(opts.from), lte: toDbDate(opts.to) },
      lines: { some: { locationId: { in: opts.locationIds } } },
      ...(opts.source && opts.source in SOURCE_LABEL ? { source: opts.source as JournalSource } : {}),
    },
    include: { lines: { include: { account: true, location: { select: { code: true } } } } },
    orderBy: [{ date: "asc" }, { number: "asc" }],
    take: 2000,
  });
  const rows: ReportRow[] = [];
  for (const e of entries) {
    rows.push({
      cells: { date: fmtDate(e.date.toISOString().slice(0, 10)), entry: `#${e.number}`, account: `${SOURCE_LABEL[e.source]}${e.status === "VOIDED" ? " (voided)" : ""}: ${e.memo}`, location: "", debit: null, credit: null },
      style: "subtotal",
      href: `/ledger/entries/${e.id}`,
    });
    for (const l of e.lines.filter((x) => opts.locationIds.includes(x.locationId))) {
      rows.push({
        cells: { date: "", entry: "", account: `${l.account.code} ${l.account.name}`, location: l.location.code, debit: l.debitCents || null, credit: l.creditCents || null },
        indent: 1,
      });
    }
  }
  return {
    title: "Journal",
    subtitle: `${opts.scopeLabel} · ${fmtRange(opts.from, opts.to)}${entries.length === 2000 ? " · first 2,000 entries" : ""}`,
    columns: [
      { key: "date", label: "Date", kind: "text", width: 14 },
      { key: "entry", label: "Entry", kind: "text", width: 8 },
      { key: "account", label: "Account / description", kind: "text", width: 50 },
      { key: "location", label: "Loc.", kind: "text", width: 6 },
      { key: "debit", label: "Debit", kind: "money" },
      { key: "credit", label: "Credit", kind: "money" },
    ],
    rows,
  };
}
