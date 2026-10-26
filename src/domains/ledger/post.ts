// The only code that writes journal entries. Every module (sales, cash,
// expenses, inventory, payroll, banking) builds DraftLines and calls postEntry
// inside its own DB transaction.

import type { JournalSource } from "@/generated/prisma/enums";
import type { Tx } from "@/server/db";
import { UserFacingError } from "@/lib/errors";
import { toDbDate } from "@/lib/dates";
import { assertBalanced, assertBalancedPerLocation, consolidate, reverseLines, type DraftLine } from "./lines";

export type PostInput = {
  /** Business date "YYYY-MM-DD" (Asia/Manila). */
  date: string;
  source: JournalSource;
  sourceId?: string | null;
  memo: string;
  lines: DraftLine[];
  postedById: string | null;
};

export function periodBounds(ymd: string) {
  const [y, m] = ymd.split("-").map(Number);
  const startsOn = new Date(Date.UTC(y, m - 1, 1));
  const endsOn = new Date(Date.UTC(y, m, 0));
  return { year: y, month: m, startsOn, endsOn };
}

/** The accounting period for a date, created on first use. Throws if it is closed. */
export async function openPeriodFor(tx: Tx, ymd: string) {
  const b = periodBounds(ymd);
  const period = await tx.accountingPeriod.upsert({
    where: { year_month: { year: b.year, month: b.month } },
    create: { year: b.year, month: b.month, startsOn: b.startsOn, endsOn: b.endsOn },
    update: {},
  });
  if (period.status === "CLOSED") {
    throw new UserFacingError(
      `${b.startsOn.toLocaleString("en-US", { month: "long", timeZone: "UTC" })} ${b.year} is closed. Ask the Owner to reopen it, or date this in an open period.`,
    );
  }
  return period;
}

/** Resolves { key } / { id } references to account ids and checks they can be posted to. */
async function resolveAccounts(tx: Tx, lines: readonly DraftLine[]) {
  const keys = [...new Set(lines.flatMap((l) => ("key" in l.account ? [l.account.key] : [])))];
  const ids = [...new Set(lines.flatMap((l) => ("id" in l.account ? [l.account.id] : [])))];
  const accounts = await tx.account.findMany({
    where: { OR: [{ systemKey: { in: keys } }, { id: { in: ids } }] },
    include: { moneyAccount: true },
  });
  const byKey = new Map(accounts.filter((a) => a.systemKey).map((a) => [a.systemKey!, a]));
  const byId = new Map(accounts.map((a) => [a.id, a]));
  for (const k of keys) if (!byKey.has(k)) throw new Error(`Missing system account ${k}`);
  for (const i of ids) if (!byId.has(i)) throw new UserFacingError("Unknown account.");
  for (const a of accounts) {
    if (!a.isPostable || !a.isActive) throw new UserFacingError(`Account ${a.code} ${a.name} can't be posted to.`);
  }
  return (l: DraftLine) => ("key" in l.account ? byKey.get(l.account.key)! : byId.get(l.account.id)!);
}

/** Posts a balanced journal entry. Returns the entry id. */
export async function postEntry(tx: Tx, input: PostInput): Promise<string> {
  const lines = consolidate(input.lines).filter((l) => l.debitCents !== 0n || l.creditCents !== 0n);
  assertBalanced(lines);
  assertBalancedPerLocation(lines);
  const period = await openPeriodFor(tx, input.date);
  const lookup = await resolveAccounts(tx, lines);
  const date = toDbDate(input.date);

  for (const l of lines) {
    const account = lookup(l);
    const locked = account.moneyAccount?.lockedThrough;
    if (locked && date <= locked) {
      throw new UserFacingError(
        `${account.moneyAccount!.name} is reconciled and locked through ${locked.toISOString().slice(0, 10)}. Date this after that.`,
      );
    }
  }

  const entry = await tx.journalEntry.create({
    data: {
      date,
      periodId: period.id,
      source: input.source,
      sourceId: input.sourceId ?? null,
      memo: input.memo,
      postedById: input.postedById,
      lines: {
        create: lines.map((l) => ({
          accountId: lookup(l).id,
          locationId: l.locationId,
          counterpartyLocationId: l.counterpartyLocationId ?? null,
          debitCents: l.debitCents,
          creditCents: l.creditCents,
          date,
          memo: l.memo ?? null,
          supplierId: l.supplierId ?? null,
          employeeId: l.employeeId ?? null,
        })),
      },
    },
  });
  return entry.id;
}

/**
 * Voids a posted entry by posting its exact reversal. The reversal is dated
 * `date` (default: the original date, or today if that period is closed).
 */
export async function reverseEntry(
  tx: Tx,
  entryId: string,
  opts: { postedById: string | null; memo?: string; date?: string; todayYmd: string },
): Promise<string> {
  const original = await tx.journalEntry.findUniqueOrThrow({ where: { id: entryId }, include: { lines: true, period: true } });
  if (original.status === "VOIDED") throw new UserFacingError("This entry is already voided.");
  const matched = await tx.bankMatchItem.count({ where: { journalLine: { entryId: original.id } } });
  if (matched) throw new UserFacingError("This entry is matched to a bank statement line. Unmatch it in Banking first.");

  let date = opts.date ?? original.date.toISOString().slice(0, 10);
  if (!opts.date && original.period.status === "CLOSED") date = opts.todayYmd;

  const reversal = await postEntry(tx, {
    date,
    source: "REVERSAL",
    sourceId: original.id,
    memo: opts.memo ?? `Reversal of #${original.number}: ${original.memo}`,
    postedById: opts.postedById,
    lines: reverseLines(original.lines).map((l) => ({
      account: { id: l.accountId },
      locationId: l.locationId,
      counterpartyLocationId: l.counterpartyLocationId,
      debitCents: l.debitCents,
      creditCents: l.creditCents,
      memo: l.memo,
      supplierId: l.supplierId,
      employeeId: l.employeeId,
    })),
  });
  await tx.journalEntry.update({ where: { id: original.id }, data: { status: "VOIDED" } });
  await tx.journalEntry.update({ where: { id: reversal }, data: { reversesId: original.id } });
  return reversal;
}

/** Location money account (drawer, undeposited, petty) → its GL account id. */
export async function locationMoneyAccount(tx: Tx, locationId: string, kind: "CASH_DRAWER" | "UNDEPOSITED_CASH" | "PETTY_CASH") {
  const ma = await tx.moneyAccount.findFirst({ where: { locationId, kind, isActive: true } });
  if (!ma) {
    const names = { CASH_DRAWER: "cash drawer", UNDEPOSITED_CASH: "undeposited cash", PETTY_CASH: "petty cash" };
    throw new UserFacingError(`This location has no ${names[kind]} account. Add one in Admin → Payments.`);
  }
  return ma;
}
