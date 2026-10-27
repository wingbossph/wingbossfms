// Bank / e-wallet statement column mappings and the parser that turns a
// statement table into signed lines. Pure: no database access.

import { createHash } from "node:crypto";
import { normHeader } from "@/lib/csv-parse";

export type DateOrder = "MDY" | "DMY" | "YMD";

export type StatementConfig = {
  /** Rows to skip before the header row (bank letterheads). */
  skipRows: number;
  dateOrder: DateOrder;
  columns: {
    date: string;
    description: string;
    reference?: string;
    /** Separate debit (money out) and credit (money in) columns… */
    debit?: string;
    credit?: string;
    /** …or one signed amount column. */
    amount?: string;
    balance?: string;
  };
  /** For a single amount column: is money in positive ("inflowPositive") or negative? */
  sign: "inflowPositive" | "inflowNegative";
};

export type ParsedLine = { lineNo: number; txnDate: string; description: string; reference: string | null; amountCents: bigint; balanceCents: bigint | null };

/** Built-in presets. Banks change exports now and then: the import page lets the user remap and save. */
export const SYSTEM_FORMATS: { name: string; institution: string; config: StatementConfig }[] = [
  {
    name: "BPI (online banking CSV)",
    institution: "BPI",
    config: { skipRows: 0, dateOrder: "MDY", columns: { date: "Transaction Date", description: "Description", reference: "Reference Number", debit: "Debit", credit: "Credit", balance: "Running Balance" }, sign: "inflowPositive" },
  },
  {
    name: "GCash (transaction history)",
    institution: "GCash",
    config: { skipRows: 0, dateOrder: "YMD", columns: { date: "Date and Time", description: "Description", reference: "Reference No.", debit: "Debit", credit: "Credit", balance: "Balance" }, sign: "inflowPositive" },
  },
  {
    name: "Maya Business (settlement report)",
    institution: "Maya",
    config: { skipRows: 0, dateOrder: "YMD", columns: { date: "Transaction Date", description: "Description", reference: "Reference ID", amount: "Amount" }, sign: "inflowPositive" },
  },
  {
    name: "Grab Merchant (payout statement)",
    institution: "Grab",
    config: { skipRows: 0, dateOrder: "YMD", columns: { date: "Date", description: "Description", reference: "Transaction ID", amount: "Net Amount" }, sign: "inflowPositive" },
  },
];

const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };
const pad = (n: number) => String(n).padStart(2, "0");

/** Parses a statement date to "YYYY-MM-DD". Accepts numeric dates in the given order, "Oct 26, 2026", "26 Oct 2026", and ISO; ignores any time part. */
export function parseStatementDate(raw: string, order: DateOrder): string | null {
  const s = raw.trim();
  if (!s) return null;
  let y = 0,
    m = 0,
    d = 0;
  let r: RegExpExecArray | null;
  if ((r = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/.exec(s))) [y, m, d] = [+r[1], +r[2], +r[3]];
  else if ((r = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/.exec(s))) {
    const yy = +r[3] < 100 ? 2000 + +r[3] : +r[3];
    [y, m, d] = order === "DMY" ? [yy, +r[2], +r[1]] : [yy, +r[1], +r[2]];
  } else if ((r = /^([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})/.exec(s))) [y, m, d] = [+r[3], MONTHS[r[1].toLowerCase().slice(0, 4)] ?? MONTHS[r[1].toLowerCase().slice(0, 3)] ?? 0, +r[2]];
  else if ((r = /^(\d{1,2})[\s-]([A-Za-z]{3,9})[\s-,]+(\d{2,4})/.exec(s))) [y, m, d] = [+r[3] < 100 ? 2000 + +r[3] : +r[3], MONTHS[r[2].toLowerCase().slice(0, 3)] ?? 0, +r[1]];
  else return null;
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 2000 || y > 2100) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCMonth() !== m - 1) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}

/** "1,234.56", "₱1,234.56", "PHP 50", "(12.30)", "-12.30", "12.30 DR", "" → centavos (null when blank). */
export function parseStatementAmount(raw: string | undefined): bigint | null | "invalid" {
  if (raw === undefined) return null;
  let s = raw.trim();
  if (!s || s === "-" || s === "—") return null;
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  if (/\s*(DR|CR)$/i.test(s)) {
    negative = /DR$/i.test(s) !== negative;
    s = s.replace(/\s*(DR|CR)$/i, "");
  }
  s = s.replace(/PHP|₱|,|\s/gi, "");
  if (s.startsWith("-")) {
    negative = !negative;
    s = s.slice(1);
  } else if (s.startsWith("+")) s = s.slice(1);
  const m = /^(\d+)(?:\.(\d{1,2})\d*)?$/.exec(s);
  if (!m) return "invalid";
  const cents = BigInt(m[1]) * 100n + BigInt((m[2] ?? "").padEnd(2, "0"));
  return negative ? -cents : cents;
}

/** Locates the header row (after `skipRows`) and returns its cells. */
export function headerOf(table: string[][], config: Pick<StatementConfig, "skipRows">) {
  return (table[config.skipRows] ?? []).map((h) => (h ?? "").trim());
}

/** Guesses a mapping for an unknown file from its header names. */
export function guessConfig(headers: string[]): StatementConfig {
  const find = (...names: string[]) => headers.find((h) => names.some((n) => normHeader(h) === normHeader(n))) ?? headers.find((h) => names.some((n) => normHeader(h).includes(normHeader(n))));
  const debit = find("Debit", "Withdrawal", "Withdrawals", "Money out", "Debit Amount");
  const credit = find("Credit", "Deposit", "Deposits", "Money in", "Credit Amount");
  return {
    skipRows: 0,
    dateOrder: "MDY",
    columns: {
      date: find("Transaction Date", "Date", "Posting Date", "Date and Time", "Value Date") ?? headers[0] ?? "",
      description: find("Description", "Particulars", "Details", "Transaction Description", "Remarks") ?? headers[1] ?? "",
      reference: find("Reference", "Reference No.", "Ref No", "Reference Number", "Check No", "Transaction ID"),
      debit,
      credit,
      amount: debit || credit ? undefined : find("Amount", "Net Amount", "Net"),
      balance: find("Balance", "Running Balance", "Ending Balance"),
    },
    sign: "inflowPositive",
  };
}

/** Turns a statement table into signed lines (+ money in, − money out). */
export function parseStatement(table: string[][], config: StatementConfig): { lines: ParsedLine[]; errors: string[] } {
  const header = headerOf(table, config);
  const col = (name?: string) => (name ? header.findIndex((h) => normHeader(h) === normHeader(name)) : -1);
  const idx = {
    date: col(config.columns.date),
    description: col(config.columns.description),
    reference: col(config.columns.reference),
    debit: col(config.columns.debit),
    credit: col(config.columns.credit),
    amount: col(config.columns.amount),
    balance: col(config.columns.balance),
  };
  const errors: string[] = [];
  if (idx.date < 0) errors.push(`No "${config.columns.date}" column in this file.`);
  if (idx.description < 0) errors.push(`No "${config.columns.description}" column in this file.`);
  if (idx.amount < 0 && idx.debit < 0 && idx.credit < 0) errors.push("Choose the amount column, or the debit and credit columns.");
  if (errors.length) return { lines: [], errors };

  const lines: ParsedLine[] = [];
  const cell = (row: string[], i: number) => (i >= 0 ? (row[i] ?? "").trim() : "");
  table.slice(config.skipRows + 1).forEach((row, i) => {
    const rowNo = config.skipRows + i + 2;
    if (row.every((c) => !c || !String(c).trim())) return;
    const rawDate = cell(row, idx.date);
    const date = parseStatementDate(rawDate, config.dateOrder);
    if (!date) {
      // Footer rows ("Total", "Ending balance") have no date: skip them quietly.
      if (!rawDate || !/\d/.test(rawDate)) return;
      errors.push(`Row ${rowNo}: can't read the date "${rawDate}".`);
      return;
    }
    let amount: bigint | null = null;
    if (idx.amount >= 0) {
      const a = parseStatementAmount(cell(row, idx.amount));
      if (a === "invalid") return void errors.push(`Row ${rowNo}: can't read the amount "${cell(row, idx.amount)}".`);
      amount = a === null ? null : config.sign === "inflowPositive" ? a : -a;
    } else {
      const dr = parseStatementAmount(cell(row, idx.debit));
      const crd = parseStatementAmount(cell(row, idx.credit));
      if (dr === "invalid" || crd === "invalid") return void errors.push(`Row ${rowNo}: can't read the debit/credit amount.`);
      // Some banks print debits as negatives in the debit column: use the size.
      const abs = (v: bigint | null) => (v === null ? 0n : v < 0n ? -v : v);
      if (dr !== null || crd !== null) amount = abs(crd) - abs(dr);
    }
    if (amount === null || amount === 0n) return;
    const bal = idx.balance >= 0 ? parseStatementAmount(cell(row, idx.balance)) : null;
    lines.push({
      lineNo: lines.length + 1,
      txnDate: date,
      description: cell(row, idx.description).replace(/\s+/g, " ").slice(0, 300) || "(no description)",
      reference: cell(row, idx.reference) || null,
      amountCents: amount,
      balanceCents: bal === "invalid" ? null : bal,
    });
  });
  if (lines.length === 0 && errors.length === 0) errors.push("No transactions found. Check the header row and column mapping.");
  // Many banks list newest first: store oldest first so balances read naturally.
  if (lines.length > 1 && lines[0].txnDate > lines[lines.length - 1].txnDate) {
    lines.reverse();
    lines.forEach((l, i) => (l.lineNo = i + 1));
  }
  return { lines, errors };
}

/**
 * Stable fingerprint so re-importing an overlapping statement skips lines
 * already in. Identical lines on the same day are told apart by occurrence.
 */
export function dedupeHashes(moneyAccountId: string, lines: readonly ParsedLine[]): string[] {
  const seen = new Map<string, number>();
  return lines.map((l) => {
    const base = [moneyAccountId, l.txnDate, l.amountCents.toString(), (l.reference ?? "").toLowerCase(), l.description.toLowerCase()].join("|");
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return createHash("sha256").update(`${base}|${n}`).digest("hex");
  });
}
