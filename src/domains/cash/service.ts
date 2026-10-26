import type { MoneyTransferType } from "@/generated/prisma/enums";
import type { Tx } from "@/server/db";
import { writeAudit } from "@/server/audit";
import { UserFacingError } from "@/lib/errors";
import { toDbDate } from "@/lib/dates";
import { acct, cr, dr, key } from "@/domains/ledger/lines";
import { postEntry } from "@/domains/ledger/post";

type Reader = Pick<Tx, "journalLine" | "moneyAccount">;

/** Book balance (GL) of each money account, optionally only the share booked to some locations. */
export async function moneyAccountBalances(db: Reader, opts: { locationIds?: string[]; asOf?: Date; moneyAccountIds?: string[] } = {}) {
  const accounts = await db.moneyAccount.findMany({
    where: { isActive: true, ...(opts.moneyAccountIds ? { id: { in: opts.moneyAccountIds } } : {}) },
    include: { location: true, glAccount: true },
    orderBy: [{ kind: "asc" }, { name: "asc" }],
  });
  const sums = await db.journalLine.groupBy({
    by: ["accountId"],
    where: {
      accountId: { in: accounts.map((a) => a.glAccountId) },
      ...(opts.locationIds ? { locationId: { in: opts.locationIds } } : {}),
      ...(opts.asOf ? { date: { lte: opts.asOf } } : {}),
    },
    _sum: { debitCents: true, creditCents: true },
  });
  const bal = new Map(sums.map((s) => [s.accountId, (s._sum.debitCents ?? 0n) - (s._sum.creditCents ?? 0n)]));
  // Liability-type money accounts (owner's personal funds) show as positive amounts owed.
  return accounts.map((a) => {
    const raw = bal.get(a.glAccountId) ?? 0n;
    return { ...a, balanceCents: a.glAccount.type === "LIABILITY" ? -raw : raw };
  });
}

export type TransferInput = {
  type: MoneyTransferType;
  date: string;
  locationId: string;
  fromAccountId: string;
  toAccountId: string;
  amountCents: bigint;
  feeCents: bigint;
  reference: string;
  notes: string;
};

/** Moves money between two money accounts (deposit, GCash → bank, replenishment…). */
export async function recordMoneyTransfer(tx: Tx, input: TransferInput, actorId: string) {
  if (input.fromAccountId === input.toAccountId) throw new UserFacingError("Choose two different accounts.");
  if (input.amountCents <= 0n) throw new UserFacingError("Amount must be more than zero.");
  if (input.feeCents < 0n) throw new UserFacingError("Fee can't be negative.");
  const [from, to, location] = await Promise.all([
    tx.moneyAccount.findUniqueOrThrow({ where: { id: input.fromAccountId } }),
    tx.moneyAccount.findUniqueOrThrow({ where: { id: input.toAccountId } }),
    tx.location.findUniqueOrThrow({ where: { id: input.locationId } }),
  ]);
  for (const a of [from, to]) {
    if (a.locationId && a.locationId !== input.locationId) {
      throw new UserFacingError(`${a.name} belongs to another location.`);
    }
  }
  if (input.type === "CASH_DEPOSIT") {
    if (!["UNDEPOSITED_CASH", "CASH_DRAWER"].includes(from.kind)) throw new UserFacingError("Deposits come from undeposited cash or the drawer.");
    if (!["BANK", "EWALLET"].includes(to.kind)) throw new UserFacingError("Deposits go to a bank or e-wallet.");
  }

  const transfer = await tx.moneyTransfer.create({
    data: {
      type: input.type,
      date: toDbDate(input.date),
      locationId: input.locationId,
      fromAccountId: from.id,
      toAccountId: to.id,
      amountCents: input.amountCents,
      feeCents: input.feeCents,
      reference: input.reference || null,
      notes: input.notes || null,
      createdById: actorId,
    },
  });
  const L = input.locationId;
  const labels: Record<MoneyTransferType, string> = {
    TRANSFER: "Transfer",
    CASH_DEPOSIT: "Cash deposit",
    PETTY_REPLENISH: "Petty cash replenishment",
    WITHDRAWAL: "Withdrawal",
  };
  const entryId = await postEntry(tx, {
    date: input.date,
    source: "MONEY_TRANSFER",
    sourceId: transfer.id,
    memo: `${labels[input.type]} ${location.code}: ${from.name} → ${to.name}${input.reference ? ` (${input.reference})` : ""}`,
    postedById: actorId,
    lines: [
      ...dr(acct(to.glAccountId), L, input.amountCents),
      ...dr(key("BANK_CHARGES"), L, input.feeCents),
      ...cr(acct(from.glAccountId), L, input.amountCents + input.feeCents),
    ],
  });
  await tx.moneyTransfer.update({ where: { id: transfer.id }, data: { journalEntryId: entryId } });
  await writeAudit(tx, {
    actorId,
    action: "CREATE",
    entityType: "MoneyTransfer",
    entityId: transfer.id,
    locationId: L,
    after: { type: input.type, from: from.name, to: to.name, amountCents: input.amountCents, feeCents: input.feeCents, reference: input.reference },
  });
  return transfer;
}
