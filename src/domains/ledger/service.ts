import type { Tx } from "@/server/db";
import { writeAudit } from "@/server/audit";
import { UserFacingError } from "@/lib/errors";
import { allocate } from "@/lib/money";
import { toDbDate } from "@/lib/dates";
import { acct, cr, dr, key, type DraftLine } from "./lines";
import { periodBounds, postEntry, reverseEntry } from "./post";
import { depreciationForMonth } from "./depreciation";
import { getSetting } from "@/domains/admin/settings";

type Can = (permission: string, locationId: string) => boolean;

export type ManualLine = { accountId: string; locationId: string; debit: bigint; credit: bigint; memo: string };

/** Accountant/Owner journal entry. Each location's lines must balance. */
export async function postManualEntry(
  tx: Tx,
  input: { date: string; memo: string; lines: ManualLine[]; source?: "MANUAL" | "OPENING_BALANCE" },
  actor: { id: string; can: Can },
) {
  for (const l of input.lines) {
    if (!actor.can("ledger:journal:create", l.locationId)) throw new UserFacingError("You can't post journal entries for one of those locations.");
    if ((l.debit > 0n) === (l.credit > 0n)) throw new UserFacingError("Each line needs either a debit or a credit.");
  }
  const lines: DraftLine[] = input.lines.map((l) => ({
    account: acct(l.accountId),
    locationId: l.locationId,
    debitCents: l.debit,
    creditCents: l.credit,
    memo: l.memo || null,
  }));
  const id = await postEntry(tx, { date: input.date, source: input.source ?? "MANUAL", sourceId: null, memo: input.memo, postedById: actor.id, lines });
  await writeAudit(tx, {
    actorId: actor.id,
    action: "POST",
    entityType: "JournalEntry",
    entityId: id,
    locationId: input.lines[0]?.locationId,
    after: { date: input.date, memo: input.memo, lines: input.lines },
  });
  return id;
}

/** Owner: voids an entry posted from the ledger screens (not from a source document). */
export async function voidLedgerEntry(tx: Tx, entryId: string, actorId: string, reason: string, todayYmd: string) {
  const e = await tx.journalEntry.findUniqueOrThrow({ where: { id: entryId }, include: { lines: true } });
  if (!["MANUAL", "OPENING_BALANCE", "OWNER_EQUITY", "DEPRECIATION", "ALLOCATION"].includes(e.source)) {
    throw new UserFacingError("This entry belongs to a document (sale, expense, transfer…). Void or reopen that document instead.");
  }
  const reversal = await reverseEntry(tx, entryId, { postedById: actorId, todayYmd, memo: `Void #${e.number}: ${reason}` });
  if (e.source === "DEPRECIATION") await tx.fixedAssetDepreciation.deleteMany({ where: { journalEntryId: e.id } });
  if (e.source === "OWNER_EQUITY") await tx.ownerEquityTransaction.updateMany({ where: { journalEntryId: e.id }, data: { journalEntryId: null } });
  await writeAudit(tx, { actorId, action: "VOID", entityType: "JournalEntry", entityId: e.id, locationId: e.lines[0]?.locationId, reason, after: { reversal } });
}

// ── Periods ─────────────────────────────────────────────────────────────────

/** Things that should be finished before a month is closed. */
export async function closeChecklist(tx: Tx, year: number, month: number) {
  const b = periodBounds(`${year}-${String(month).padStart(2, "0")}-01`);
  const range = { gte: b.startsOn, lte: b.endsOn };
  const [draftSales, unclosedShifts, pendingExpenses, unreceivedTransfers] = await Promise.all([
    tx.salesReport.count({ where: { businessDate: range, status: "DRAFT" } }),
    tx.salesReport.count({ where: { businessDate: range, status: "POSTED", cashCount: null } }),
    tx.expense.count({ where: { date: range, status: { in: ["DRAFT", "SUBMITTED"] } } }),
    tx.transfer.count({ where: { status: "DISPATCHED", dispatchedAt: { lte: new Date(b.endsOn.getTime() + 86_400_000) } } }),
  ]);
  return [
    { label: "Sales reports still in draft", count: draftSales },
    { label: "Shifts without a cash count", count: unclosedShifts },
    { label: "Expenses not yet approved", count: pendingExpenses },
    { label: "Transfers dispatched but not received", count: unreceivedTransfers },
  ];
}

export async function setPeriodStatus(tx: Tx, year: number, month: number, status: "OPEN" | "CLOSED", actorId: string, reason: string) {
  const b = periodBounds(`${year}-${String(month).padStart(2, "0")}-01`);
  const before = await tx.accountingPeriod.findUnique({ where: { year_month: { year, month } } });
  if (before?.status === status) throw new UserFacingError(`That month is already ${status.toLowerCase()}.`);
  if (status === "OPEN" && reason.length < 5) throw new UserFacingError("Give a reason for reopening a closed month.");
  const p = await tx.accountingPeriod.upsert({
    where: { year_month: { year, month } },
    create: { year, month, startsOn: b.startsOn, endsOn: b.endsOn, status, closedAt: status === "CLOSED" ? new Date() : null, closedById: status === "CLOSED" ? actorId : null },
    update: { status, closedAt: status === "CLOSED" ? new Date() : null, closedById: status === "CLOSED" ? actorId : null },
  });
  await writeAudit(tx, { actorId, action: status === "CLOSED" ? "CLOSE_PERIOD" : "REOPEN_PERIOD", entityType: "AccountingPeriod", entityId: p.id, reason: reason || null, after: { year, month, status } });
}

// ── Fixed assets ────────────────────────────────────────────────────────────

/** Posts depreciation for every active asset for the month containing monthYmd. Idempotent. */
export async function runDepreciation(tx: Tx, monthYmd: string, actorId: string | null) {
  const b = periodBounds(monthYmd);
  const endYmd = b.endsOn.toISOString().slice(0, 10);
  const assets = await tx.fixedAsset.findMany({ where: { isActive: true, acquiredOn: { lte: b.endsOn } }, include: { depreciations: true } });
  let posted = 0;
  let total = 0n;
  for (const a of assets) {
    if (a.depreciations.some((d) => d.year === b.year && d.month === b.month)) continue;
    const already = a.depreciations.reduce((s, d) => s + d.amountCents, 0n);
    const amount = depreciationForMonth(
      {
        costCents: a.costCents,
        salvageCents: a.salvageCents,
        usefulLifeMonths: a.usefulLifeMonths,
        acquiredOn: a.acquiredOn.toISOString().slice(0, 10),
        disposedOn: a.disposedOn?.toISOString().slice(0, 10) ?? null,
      },
      endYmd,
      already,
    );
    if (amount <= 0n) continue;
    const entryId = await postEntry(tx, {
      date: endYmd,
      source: "DEPRECIATION",
      sourceId: a.id,
      memo: `Depreciation ${b.year}-${String(b.month).padStart(2, "0")}: ${a.name}`,
      postedById: actorId,
      lines: [...dr(acct(a.depExpenseAccountId), a.locationId, amount), ...cr(acct(a.accumDepAccountId), a.locationId, amount)],
    });
    await tx.fixedAssetDepreciation.create({ data: { assetId: a.id, year: b.year, month: b.month, amountCents: amount, journalEntryId: entryId } });
    posted++;
    total += amount;
  }
  return { posted, totalCents: total };
}

// ── Owner equity ────────────────────────────────────────────────────────────

export async function recordOwnerEquity(
  tx: Tx,
  input: { type: "CAPITAL_CONTRIBUTION" | "DRAWING"; date: string; locationId: string; moneyAccountId: string; amountCents: bigint; memo: string },
  actorId: string,
) {
  if (input.amountCents <= 0n) throw new UserFacingError("Amount must be more than zero.");
  const ma = await tx.moneyAccount.findUniqueOrThrow({ where: { id: input.moneyAccountId } });
  if (ma.locationId && ma.locationId !== input.locationId) throw new UserFacingError(`${ma.name} belongs to another location.`);
  const t = await tx.ownerEquityTransaction.create({
    data: { type: input.type, date: toDbDate(input.date), locationId: input.locationId, moneyAccountId: ma.id, amountCents: input.amountCents, memo: input.memo || null, createdById: actorId },
  });
  // Money from the owner's own pocket (owner advance) converted to capital: Dr due to owner, Cr capital.
  const lines =
    input.type === "CAPITAL_CONTRIBUTION"
      ? [...dr(acct(ma.glAccountId), input.locationId, input.amountCents), ...cr(key("OWNER_CAPITAL"), input.locationId, input.amountCents)]
      : [...dr(key("OWNER_DRAWINGS"), input.locationId, input.amountCents), ...cr(acct(ma.glAccountId), input.locationId, input.amountCents)];
  const entryId = await postEntry(tx, {
    date: input.date,
    source: "OWNER_EQUITY",
    sourceId: t.id,
    memo: `${input.type === "CAPITAL_CONTRIBUTION" ? "Capital contribution" : "Owner drawing"}: ${ma.name}${input.memo ? ` · ${input.memo}` : ""}`,
    postedById: actorId,
    lines,
  });
  await tx.ownerEquityTransaction.update({ where: { id: t.id }, data: { journalEntryId: entryId } });
  await writeAudit(tx, { actorId, action: "POST", entityType: "OwnerEquityTransaction", entityId: t.id, locationId: input.locationId, after: { type: input.type, amountCents: input.amountCents, account: ma.name } });
}

/** Opening balances on a go-live date: each line against Opening balance equity, per location. */
export async function postOpeningBalances(
  tx: Tx,
  input: { date: string; lines: { accountId: string; locationId: string; amountCents: bigint }[] },
  actor: { id: string; can: Can },
) {
  const accounts = await tx.account.findMany({ where: { id: { in: input.lines.map((l) => l.accountId) } } });
  const byId = new Map(accounts.map((a) => [a.id, a]));
  const lines: ManualLine[] = [];
  const perLocation = new Map<string, bigint>();
  for (const l of input.lines) {
    const a = byId.get(l.accountId);
    if (!a) throw new UserFacingError("Unknown account.");
    if (l.amountCents === 0n) continue;
    // Amounts are entered as normal balances: assets as debits, liabilities/equity as credits.
    const debitNormal = a.type === "ASSET" || a.type === "EXPENSE";
    const signed = debitNormal ? l.amountCents : -l.amountCents;
    lines.push({ accountId: a.id, locationId: l.locationId, debit: signed > 0n ? signed : 0n, credit: signed < 0n ? -signed : 0n, memo: "Opening balance" });
    perLocation.set(l.locationId, (perLocation.get(l.locationId) ?? 0n) + signed);
  }
  const obe = await tx.account.findUniqueOrThrow({ where: { systemKey: "OPENING_BALANCE_EQUITY" } });
  for (const [locationId, net] of perLocation) {
    if (net !== 0n) lines.push({ accountId: obe.id, locationId, debit: net < 0n ? -net : 0n, credit: net > 0n ? net : 0n, memo: "Opening balance equity" });
  }
  if (lines.length < 2) throw new UserFacingError("Enter at least one opening balance.");
  return postManualEntry(tx, { date: input.date, memo: "Opening balances", lines, source: "OPENING_BALANCE" }, actor);
}

// ── Cost allocation ─────────────────────────────────────────────────────────

const COST_SECTIONS = ["REVENUE", "CONTRA_REVENUE", "COGS", "LABOR", "OPERATING_EXPENSE", "OTHER_INCOME_EXPENSE"] as const;

/**
 * Spreads a source location's month of P&L (or one account) to other
 * locations: fixed shares, or by the value of transfers each received.
 * Posts one ALLOCATION entry per rule and month; re-running replaces it.
 */
export async function runAllocation(tx: Tx, ruleId: string, monthYmd: string, actorId: string, todayYmd: string) {
  if (!(await getSetting(tx, "allocation.enabled"))) throw new UserFacingError("Cost allocation is turned off. Turn it on in the allocation settings first.");
  const rule = await tx.allocationRule.findUniqueOrThrow({ where: { id: ruleId }, include: { shares: true, sourceLocation: true } });
  if (!rule.isActive) throw new UserFacingError("This rule is inactive.");
  const b = periodBounds(monthYmd);
  const sourceId = `${rule.id}:${b.year}-${String(b.month).padStart(2, "0")}`;
  const existing = await tx.journalEntry.findFirst({ where: { source: "ALLOCATION", sourceId, status: "POSTED" } });
  if (existing) await reverseEntry(tx, existing.id, { postedById: actorId, todayYmd, memo: `Re-run allocation ${sourceId}` });

  // Weights
  let weights: { locationId: string; weight: number }[];
  if (rule.method === "FIXED_SHARES") {
    const total = rule.shares.reduce((s, x) => s + x.shareBp, 0);
    if (total !== 10000) throw new UserFacingError("Shares must add up to 100%.");
    weights = rule.shares.map((s) => ({ locationId: s.locationId, weight: s.shareBp }));
  } else {
    const received = await tx.transfer.groupBy({
      by: ["toLocationId"],
      where: { fromLocationId: rule.sourceLocationId, status: { in: ["RECEIVED", "RECEIVED_WITH_DISCREPANCY"] }, receivedAt: { gte: b.startsOn, lt: new Date(b.endsOn.getTime() + 86_400_000) } },
      _sum: { valueCents: true },
    });
    weights = received.filter((r) => (r._sum.valueCents ?? 0n) > 0n).map((r) => ({ locationId: r.toLocationId, weight: Number(r._sum.valueCents) }));
    if (!weights.length) throw new UserFacingError(`No transfers from ${rule.sourceLocation.name} were received that month.`);
  }
  if (weights.some((w) => w.locationId === rule.sourceLocationId)) throw new UserFacingError("A location can't allocate to itself.");

  // Source balances for the month (direct postings only).
  const balances = await tx.journalLine.groupBy({
    by: ["accountId"],
    where: {
      locationId: rule.sourceLocationId,
      date: { gte: b.startsOn, lte: b.endsOn },
      // Direct postings only: skip allocations and the reversals of earlier runs.
      entry: { source: { not: "ALLOCATION" }, NOT: { reverses: { is: { source: "ALLOCATION" } } } },
      account: { isIntercompany: false, group: { section: { in: [...COST_SECTIONS] } }, ...(rule.accountId ? { id: rule.accountId } : {}) },
    },
    _sum: { debitCents: true, creditCents: true },
  });
  const lines: DraftLine[] = [];
  let net = 0n;
  for (const bal of balances) {
    const amount = (bal._sum.debitCents ?? 0n) - (bal._sum.creditCents ?? 0n);
    if (amount === 0n) continue;
    net += amount;
    lines.push(...cr(acct(bal.accountId), rule.sourceLocationId, amount));
    const parts = allocate(amount, weights.map((w) => w.weight));
    weights.forEach((w, i) => lines.push(...dr(acct(bal.accountId), w.locationId, parts[i])));
  }
  if (net === 0n) return { posted: false, netCents: 0n };
  // Inter-location receivable/payable keeps every location's books balanced.
  lines.push(...dr(key("INTERCO_RECEIVABLE"), rule.sourceLocationId, net));
  const netParts = allocate(net, weights.map((w) => w.weight));
  weights.forEach((w, i) => lines.push(...cr(key("INTERCO_PAYABLE"), w.locationId, netParts[i], { counterpartyLocationId: rule.sourceLocationId })));
  // Receiving locations' account parts were allocated per account; fix rounding so each location balances.
  const perLoc = new Map<string, bigint>();
  for (const l of lines) perLoc.set(l.locationId, (perLoc.get(l.locationId) ?? 0n) + l.debitCents - l.creditCents);
  for (const [loc, diff] of perLoc) if (diff !== 0n) lines.push(...cr(key(loc === rule.sourceLocationId ? "INTERCO_RECEIVABLE" : "INTERCO_PAYABLE"), loc, diff));

  await postEntry(tx, {
    date: b.endsOn.toISOString().slice(0, 10),
    source: "ALLOCATION",
    sourceId,
    memo: `Allocation of ${rule.sourceLocation.name} (${rule.name}) for ${b.year}-${String(b.month).padStart(2, "0")}`,
    postedById: actorId,
    lines,
  });
  await writeAudit(tx, { actorId, action: "POST", entityType: "AllocationRule", entityId: rule.id, after: { month: sourceId, netCents: net, weights } });
  return { posted: true, netCents: net };
}
