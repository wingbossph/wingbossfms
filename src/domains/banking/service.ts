import "server-only";
import type { Tx } from "@/server/db";
import { writeAudit } from "@/server/audit";
import { UserFacingError } from "@/lib/errors";
import { allocate, formatPeso } from "@/lib/money";
import { toDbDate } from "@/lib/dates";
import { acct, cr, dr, key } from "@/domains/ledger/lines";
import { postEntry, reverseEntry } from "@/domains/ledger/post";
import { getSetting } from "@/domains/admin/settings";
import { dedupeHashes, type ParsedLine, type StatementConfig } from "./formats";
export { ensureStatementFormats } from "./setup";
import { autoMatch, matchSettlements, type BookLine, type StmtLine } from "./match";

type Actor = { id: string };
type Reader = Pick<Tx, "journalLine" | "bankStatementLine" | "moneyAccount" | "bankStatement" | "channelSettlement" | "reconciliation">;

const ymdOf = (d: Date) => d.toISOString().slice(0, 10);

// ── Import ──────────────────────────────────────────────────────────────────

export async function importStatement(
  tx: Tx,
  input: { moneyAccountId: string; formatId?: string; config: StatementConfig; saveFormatAs?: string; lines: ParsedLine[]; attachmentId?: string | null },
  actor: Actor,
) {
  const ma = await tx.moneyAccount.findUniqueOrThrow({ where: { id: input.moneyAccountId } });
  if (!input.lines.length) throw new UserFacingError("No transactions to import.");
  let formatId = input.formatId;
  if (input.saveFormatAs) {
    const f = await tx.statementFormat.upsert({
      where: { name: input.saveFormatAs },
      create: { name: input.saveFormatAs, institution: ma.institution, config: input.config },
      update: { config: input.config },
    });
    formatId = f.id;
  }
  if (!formatId) throw new UserFacingError("Choose a statement format or save your column mapping.");
  const format = await tx.statementFormat.findUniqueOrThrow({ where: { id: formatId } });
  if (format.isSystem && JSON.stringify(format.config) !== JSON.stringify(input.config) && !input.saveFormatAs) {
    // Remapped a built-in preset without saving: remember it for this account.
    const name = `${ma.name} (custom)`;
    const f = await tx.statementFormat.upsert({ where: { name }, create: { name, institution: ma.institution, config: input.config }, update: { config: input.config } });
    formatId = f.id;
  }
  if (!ma.defaultStatementFormatId || ma.defaultStatementFormatId !== formatId) {
    await tx.moneyAccount.update({ where: { id: ma.id }, data: { defaultStatementFormatId: formatId } });
  }

  const hashes = dedupeHashes(ma.id, input.lines);
  const existing = await tx.bankStatementLine.findMany({ where: { dedupeHash: { in: hashes }, statement: { moneyAccountId: ma.id } }, select: { dedupeHash: true } });
  const have = new Set(existing.map((e) => e.dedupeHash));
  const locked = ma.lockedThrough ? ymdOf(ma.lockedThrough) : null;
  const fresh = input.lines.map((l, i) => ({ l, hash: hashes[i] })).filter(({ l, hash }) => !have.has(hash) && !(locked && l.txnDate <= locked));
  const skippedLocked = input.lines.filter((l, i) => !have.has(hashes[i]) && locked && l.txnDate <= locked).length;
  if (!fresh.length) {
    throw new UserFacingError(skippedLocked ? `Every new line is on or before ${locked}, which is already reconciled.` : "Every line in this file was imported before.");
  }

  const dates = input.lines.map((l) => l.txnDate).sort();
  const first = input.lines[0];
  const last = input.lines[input.lines.length - 1];
  const statement = await tx.bankStatement.create({
    data: {
      moneyAccountId: ma.id,
      formatId: formatId,
      periodStart: toDbDate(dates[0]),
      periodEnd: toDbDate(dates[dates.length - 1]),
      openingBalanceCents: first.balanceCents !== null ? first.balanceCents - first.amountCents : null,
      closingBalanceCents: last.balanceCents,
      attachmentId: input.attachmentId ?? null,
      importedById: actor.id,
      lines: {
        create: fresh.map(({ l, hash }, i) => ({
          lineNo: i + 1,
          txnDate: toDbDate(l.txnDate),
          description: l.description,
          reference: l.reference,
          amountCents: l.amountCents,
          balanceCents: l.balanceCents,
          dedupeHash: hash,
        })),
      },
    },
  });
  await writeAudit(tx, {
    actorId: actor.id,
    action: "CREATE",
    entityType: "BankStatement",
    entityId: statement.id,
    after: { account: ma.name, lines: fresh.length, duplicatesSkipped: input.lines.length - fresh.length - skippedLocked, lockedSkipped: skippedLocked },
  });
  return { statementId: statement.id, imported: fresh.length, duplicates: input.lines.length - fresh.length - skippedLocked, lockedSkipped: skippedLocked };
}

/** Removes an imported statement whose lines are all still unmatched. */
export async function deleteStatement(tx: Tx, statementId: string, actor: Actor) {
  const st = await tx.bankStatement.findUniqueOrThrow({ where: { id: statementId }, include: { lines: true, reconciliations: true } });
  if (st.lines.some((l) => l.status !== "UNMATCHED") || st.reconciliations.length) throw new UserFacingError("Some lines are already matched. Unmatch them first.");
  await tx.bankStatement.delete({ where: { id: st.id } });
  await writeAudit(tx, { actorId: actor.id, action: "DELETE", entityType: "BankStatement", entityId: st.id, before: { lines: st.lines.length, from: ymdOf(st.periodStart), to: ymdOf(st.periodEnd) } });
}

// ── Candidates ──────────────────────────────────────────────────────────────

/** Book lines on the account not yet matched (voided entries and their reversals left out). */
export async function openBookLines(db: Reader, glAccountId: string, through?: string) {
  const rows = await db.journalLine.findMany({
    where: {
      accountId: glAccountId,
      reconciliationId: null,
      bankMatchItems: { none: {} },
      entry: { status: "POSTED", reversesId: null },
      ...(through ? { date: { lte: toDbDate(through) } } : {}),
    },
    include: { entry: { select: { number: true, memo: true, source: true, sourceId: true } }, location: { select: { code: true } } },
    orderBy: [{ date: "asc" }, { entry: { number: "asc" } }],
  });
  return rows;
}

export async function openStatementLines(db: Reader, moneyAccountId: string, statuses: ("UNMATCHED" | "INVESTIGATE")[] = ["UNMATCHED", "INVESTIGATE"]) {
  return db.bankStatementLine.findMany({
    where: { status: { in: statuses }, statement: { moneyAccountId } },
    orderBy: [{ txnDate: "asc" }, { lineNo: "asc" }],
  });
}

const toBook = (l: Awaited<ReturnType<typeof openBookLines>>[number]): BookLine => ({
  id: l.id,
  date: ymdOf(l.date),
  amountCents: l.debitCents - l.creditCents,
  text: `#${l.entry.number} ${l.entry.memo} ${l.memo ?? ""}`,
});
const toStmt = (l: Awaited<ReturnType<typeof openStatementLines>>[number]): StmtLine => ({
  id: l.id,
  date: ymdOf(l.txnDate),
  amountCents: l.amountCents,
  description: l.description,
  reference: l.reference,
});

// ── Matching ────────────────────────────────────────────────────────────────

async function createMatch(tx: Tx, input: { statementLineIds: string[]; journalLineIds: string[]; method: "AUTO" | "MANUAL"; score?: number | null; status?: "MATCHED" | "CREATED" }, actor: Actor) {
  const match = await tx.bankMatch.create({
    data: {
      method: input.method,
      score: input.score ?? null,
      createdById: actor.id,
      lines: { create: input.statementLineIds.map((statementLineId) => ({ statementLineId })) },
      items: { create: input.journalLineIds.map((journalLineId) => ({ journalLineId })) },
    },
  });
  if (input.statementLineIds.length) {
    await tx.bankStatementLine.updateMany({ where: { id: { in: input.statementLineIds } }, data: { status: input.status ?? "MATCHED" } });
  }
  return match.id;
}

/** Runs auto-match for one account. Returns how many statement lines it matched out of those open. */
export async function runAutoMatch(tx: Tx, moneyAccountId: string, actor: Actor) {
  const ma = await tx.moneyAccount.findUniqueOrThrow({ where: { id: moneyAccountId } });
  const window = await getSetting(tx, "bank.matchWindowDays");
  const stmt = (await openStatementLines(tx, ma.id, ["UNMATCHED"])).map(toStmt);
  const book = (await openBookLines(tx, ma.glAccountId)).map(toBook);
  let matched = 0;
  const proposals = autoMatch(stmt, book, window);
  for (const p of proposals) {
    await createMatch(tx, { ...p, method: "AUTO" }, actor);
    matched += p.statementLineIds.length;
  }
  // Payouts from deferred channels (Maya, Grab) that land in this account.
  const used = new Set(proposals.flatMap((p) => p.statementLineIds));
  const remaining = stmt.filter((s) => !used.has(s.id));
  const settlements = await expectedSettlementsInto(tx, ma.id);
  const tolerance = await getSetting(tx, "bank.settlementToleranceBp");
  let settled = 0;
  for (const sp of matchSettlements(remaining, settlements, tolerance)) {
    await settleChannelPayout(tx, { statementLineId: sp.statementLineId, settlementIds: sp.settlementIds, method: "AUTO", score: sp.score }, actor);
    matched += 1;
    settled += sp.settlementIds.length;
  }
  await writeAudit(tx, { actorId: actor.id, action: "UPDATE", entityType: "BankAutoMatch", entityId: ma.id, after: { open: stmt.length, matched, settlements: settled } });
  return { open: stmt.length, matched, settlements: settled };
}

export async function expectedSettlementsInto(db: Reader, moneyAccountId: string) {
  const rows = await db.channelSettlement.findMany({
    where: { status: "EXPECTED", channel: { settlesToMoneyAccountId: moneyAccountId } },
    include: { channel: { include: { moneyAccount: true } } },
    orderBy: { expectedOn: "asc" },
  });
  return rows.map((r) => ({
    id: r.id,
    channelId: r.channelId,
    channelName: r.channel.name,
    institution: r.channel.moneyAccount?.institution ?? null,
    locationId: r.locationId,
    expectedOn: ymdOf(r.expectedOn),
    businessDate: ymdOf(r.businessDate),
    grossCents: r.grossCents,
    expectedNetCents: r.expectedNetCents,
  }));
}

async function assertOpenLines(tx: Tx, moneyAccountId: string, statementLineIds: string[], journalLineIds: string[]) {
  const ma = await tx.moneyAccount.findUniqueOrThrow({ where: { id: moneyAccountId } });
  const stmt = await tx.bankStatementLine.findMany({ where: { id: { in: statementLineIds } }, include: { statement: true, matchLines: true } });
  if (stmt.length !== statementLineIds.length) throw new UserFacingError("A statement line no longer exists. Refresh the page.");
  for (const s of stmt) {
    if (s.statement.moneyAccountId !== ma.id) throw new UserFacingError("Those statement lines belong to another account.");
    if (s.matchLines.length || !["UNMATCHED", "INVESTIGATE"].includes(s.status)) throw new UserFacingError("A statement line is already matched. Refresh the page.");
  }
  const book = await tx.journalLine.findMany({ where: { id: { in: journalLineIds } }, include: { bankMatchItems: true, entry: true } });
  if (book.length !== journalLineIds.length) throw new UserFacingError("A book entry no longer exists. Refresh the page.");
  for (const b of book) {
    if (b.accountId !== ma.glAccountId) throw new UserFacingError("Those book entries belong to another account.");
    if (b.bankMatchItems.length || b.reconciliationId) throw new UserFacingError("A book entry is already matched. Refresh the page.");
    if (b.entry.status !== "POSTED" || b.entry.reversesId) throw new UserFacingError("Voided entries can't be matched.");
  }
  return { ma, stmt, book };
}

/** Matches N statement lines to M book lines (split / merge). The totals must agree. */
export async function manualMatch(tx: Tx, input: { moneyAccountId: string; statementLineIds: string[]; journalLineIds: string[] }, actor: Actor) {
  if (!input.statementLineIds.length || !input.journalLineIds.length) throw new UserFacingError("Pick at least one statement line and one book entry.");
  const { stmt, book } = await assertOpenLines(tx, input.moneyAccountId, input.statementLineIds, input.journalLineIds);
  const s = stmt.reduce((a, l) => a + l.amountCents, 0n);
  const b = book.reduce((a, l) => a + l.debitCents - l.creditCents, 0n);
  if (s !== b) throw new UserFacingError(`The totals differ by ${formatPeso(s - b)}. Statement ${formatPeso(s)} vs books ${formatPeso(b)}.`);
  const id = await createMatch(tx, { ...input, method: "MANUAL" }, actor);
  await writeAudit(tx, { actorId: actor.id, action: "CREATE", entityType: "BankMatch", entityId: id, after: { statementLines: input.statementLineIds.length, bookLines: input.journalLineIds.length, amountCents: s } });
  return id;
}

/** Clears book entries dated before the first imported statement (e.g. the opening balance). */
export async function clearBeforeStatements(tx: Tx, input: { moneyAccountId: string; journalLineIds: string[] }, actor: Actor) {
  const { ma, book } = await assertOpenLines(tx, input.moneyAccountId, [], input.journalLineIds);
  const first = await tx.bankStatement.findFirst({ where: { moneyAccountId: ma.id }, orderBy: { periodStart: "asc" } });
  if (!first) throw new UserFacingError("Import a statement first.");
  if (book.some((b) => b.date >= first.periodStart)) {
    throw new UserFacingError(`Only entries dated before the first statement (${ymdOf(first.periodStart)}) can be cleared without a statement line.`);
  }
  const id = await createMatch(tx, { statementLineIds: [], journalLineIds: input.journalLineIds, method: "MANUAL" }, actor);
  await writeAudit(tx, { actorId: actor.id, action: "CREATE", entityType: "BankMatch", entityId: id, after: { clearedBeforeStatements: book.length } });
}

/** Undoes a match. Channel payouts and created transactions are voided too. */
export async function unmatch(tx: Tx, matchId: string, actor: Actor, todayYmd: string) {
  const m = await tx.bankMatch.findUniqueOrThrow({
    where: { id: matchId },
    include: { lines: { include: { statementLine: true } }, items: { include: { journalLine: { include: { entry: true } } } }, settlements: true },
  });
  if (m.items.some((i) => i.journalLine.reconciliationId)) throw new UserFacingError("This is part of a completed reconciliation. Undo that reconciliation first.");
  const created = m.lines.some((l) => l.statementLine.status === "CREATED");
  const entryIds = new Set<string>();
  if (m.settlements.length || created) for (const i of m.items) entryIds.add(i.journalLine.entryId);
  await tx.bankMatch.delete({ where: { id: m.id } });
  for (const id of entryIds) await reverseEntry(tx, id, { postedById: actor.id, todayYmd, memo: undefined });
  if (m.settlements.length) {
    await tx.channelSettlement.updateMany({
      where: { id: { in: m.settlements.map((s) => s.id) } },
      data: { status: "EXPECTED", actualNetCents: null, actualFeeCents: null, bankMatchId: null, journalEntryId: null },
    });
  }
  await tx.bankStatementLine.updateMany({ where: { id: { in: m.lines.map((l) => l.statementLineId) } }, data: { status: "UNMATCHED" } });
  await writeAudit(tx, { actorId: actor.id, action: "DELETE", entityType: "BankMatch", entityId: m.id, before: { statementLines: m.lines.length, bookLines: m.items.length, settlements: m.settlements.length, voidedEntries: entryIds.size } });
}

/**
 * A payout from Maya/Grab hit the bank. Posts, per expected settlement:
 * Dr bank (actual net), Dr MDR/commission (gross − WHT − actual net),
 * Dr creditable WHT, Cr clearing/receivable (gross). The real fee replaces
 * the estimate, so the books carry the actual MDR.
 */
export async function settleChannelPayout(tx: Tx, input: { statementLineId: string; settlementIds: string[]; method: "AUTO" | "MANUAL"; score?: number }, actor: Actor) {
  const line = await tx.bankStatementLine.findUniqueOrThrow({ where: { id: input.statementLineId }, include: { statement: { include: { moneyAccount: true } }, matchLines: true } });
  const ma = line.statement.moneyAccount;
  if (line.matchLines.length || line.status === "MATCHED" || line.status === "CREATED") throw new UserFacingError("This statement line is already matched.");
  if (line.amountCents <= 0n) throw new UserFacingError("Payouts are money coming in.");
  const settlements = await tx.channelSettlement.findMany({ where: { id: { in: input.settlementIds } }, include: { channel: { include: { moneyAccount: true } } }, orderBy: { businessDate: "asc" } });
  if (settlements.length !== input.settlementIds.length || settlements.some((s) => s.status !== "EXPECTED")) throw new UserFacingError("Some of those payouts are already settled. Refresh the page.");
  if (settlements.some((s) => s.channel.settlesToMoneyAccountId !== ma.id)) throw new UserFacingError(`Those payouts don't settle into ${ma.name}.`);
  const date = ymdOf(line.txnDate);
  const actualNets = allocate(line.amountCents, settlements.map((s) => Number(s.expectedNetCents > 0n ? s.expectedNetCents : 1n)));
  const matchId = await tx.bankMatch.create({ data: { method: input.method, score: input.score ?? null, createdById: actor.id, lines: { create: [{ statementLineId: line.id }] } } }).then((m) => m.id);
  for (const [i, s] of settlements.entries()) {
    const clearing = s.channel.moneyAccount;
    if (!clearing) throw new UserFacingError(`${s.channel.name} has no clearing account.`);
    const net = actualNets[i];
    const fee = s.grossCents - s.expectedWhtCents - net;
    const feeKey = s.channel.kind === "DELIVERY_PLATFORM" ? "PLATFORM_COMMISSIONS" : "MDR_FEES";
    const L = s.locationId;
    const entryId = await postEntry(tx, {
      date,
      source: "CHANNEL_SETTLEMENT",
      sourceId: s.id,
      memo: `${s.channel.name} payout for ${ymdOf(s.businessDate)} (fee ${formatPeso(fee)} vs ${formatPeso(s.expectedFeeCents)} expected)`,
      postedById: actor.id,
      lines: [...dr(acct(ma.glAccountId), L, net), ...dr(key(feeKey), L, fee), ...dr(key("CREDITABLE_WHT"), L, s.expectedWhtCents), ...cr(acct(clearing.glAccountId), L, s.grossCents)],
    });
    const bankLines = await tx.journalLine.findMany({ where: { entryId, accountId: ma.glAccountId } });
    for (const bl of bankLines) await tx.bankMatchItem.create({ data: { matchId, journalLineId: bl.id } });
    await tx.channelSettlement.update({ where: { id: s.id }, data: { status: "SETTLED", actualNetCents: net, actualFeeCents: fee, bankMatchId: matchId, journalEntryId: entryId } });
  }
  await tx.bankStatementLine.update({ where: { id: line.id }, data: { status: "MATCHED" } });
  await writeAudit(tx, { actorId: actor.id, action: "POST", entityType: "ChannelSettlement", entityId: matchId, after: { payoutCents: line.amountCents, settlements: settlements.length, expectedNetCents: settlements.reduce((a, s) => a + s.expectedNetCents, 0n) } });
  return matchId;
}

/** Books a statement line that has no entry yet (bank charge, interest, a transfer) and matches it. */
export async function createFromStatementLine(tx: Tx, input: { statementLineId: string; accountId: string; locationId: string; memo: string }, actor: Actor) {
  const line = await tx.bankStatementLine.findUniqueOrThrow({ where: { id: input.statementLineId }, include: { statement: { include: { moneyAccount: true } }, matchLines: true } });
  if (line.matchLines.length || line.status === "MATCHED" || line.status === "CREATED") throw new UserFacingError("This statement line is already matched.");
  const ma = line.statement.moneyAccount;
  if (input.accountId === ma.glAccountId) throw new UserFacingError("Choose the other side of the transaction (e.g. Bank charges), not the bank account itself.");
  const entryId = await postEntry(tx, {
    date: ymdOf(line.txnDate),
    source: "BANK_LINE",
    sourceId: line.id,
    memo: input.memo || line.description,
    postedById: actor.id,
    lines: [...dr(acct(ma.glAccountId), input.locationId, line.amountCents, { memo: line.reference }), ...cr(acct(input.accountId), input.locationId, line.amountCents)],
  });
  const bankLine = await tx.journalLine.findFirstOrThrow({ where: { entryId, accountId: ma.glAccountId } });
  await createMatch(tx, { statementLineIds: [line.id], journalLineIds: [bankLine.id], method: "MANUAL", status: "CREATED" }, actor);
  await writeAudit(tx, { actorId: actor.id, action: "POST", entityType: "BankStatementLine", entityId: line.id, after: { entryId, accountId: input.accountId, amountCents: line.amountCents } });
  return entryId;
}

export async function setStatementLineStatus(tx: Tx, input: { statementLineId: string; status: "UNMATCHED" | "IGNORED" | "INVESTIGATE"; note?: string }, actor: Actor) {
  const line = await tx.bankStatementLine.findUniqueOrThrow({ where: { id: input.statementLineId }, include: { matchLines: true } });
  if (line.matchLines.length) throw new UserFacingError("Unmatch this line first.");
  await tx.bankStatementLine.update({ where: { id: line.id }, data: { status: input.status, note: input.note || line.note } });
  await writeAudit(tx, { actorId: actor.id, action: "UPDATE", entityType: "BankStatementLine", entityId: line.id, before: { status: line.status }, after: { status: input.status, note: input.note } });
}

// ── Reconciliation ──────────────────────────────────────────────────────────

/**
 * Bank reconciliation as of a date:
 *   statement balance + outstanding deposits − outstanding withdrawals
 *   = book balance + statement items not yet in the books.
 * A book line counts as cleared when it is matched to statement lines dated
 * on/before the as-of date (or cleared before the first statement).
 */
export async function reconciliationPreview(db: Reader, moneyAccountId: string, asOf: string, statementBalanceOverride?: bigint | null) {
  const ma = await db.moneyAccount.findUniqueOrThrow({ where: { id: moneyAccountId } });
  const through = toDbDate(asOf);
  const glLines = await db.journalLine.findMany({
    where: { accountId: ma.glAccountId, date: { lte: through } },
    include: {
      entry: { select: { number: true, memo: true, status: true, reversesId: true } },
      bankMatchItems: { include: { match: { include: { lines: { include: { statementLine: { select: { txnDate: true } } } } } } } },
    },
    orderBy: [{ date: "asc" }],
  });
  const book = glLines.reduce((a, l) => a + l.debitCents - l.creditCents, 0n);
  const voidPair = (l: (typeof glLines)[number]) => l.entry.status === "VOIDED" || l.entry.reversesId !== null;
  const cleared = (l: (typeof glLines)[number]) =>
    l.reconciliationId !== null || l.bankMatchItems.some((i) => i.match.lines.every((ml) => ml.statementLine.txnDate <= through));
  const outstanding = glLines.filter((l) => !voidPair(l) && !cleared(l)).map((l) => ({ id: l.id, date: ymdOf(l.date), text: `#${l.entry.number} ${l.entry.memo}`, amountCents: l.debitCents - l.creditCents }));
  const deposits = outstanding.filter((l) => l.amountCents > 0n);
  const withdrawals = outstanding.filter((l) => l.amountCents < 0n);

  const stmtLines = await db.bankStatementLine.findMany({
    where: { statement: { moneyAccountId: ma.id }, txnDate: { lte: through } },
    include: { matchLines: { include: { match: { include: { items: { include: { journalLine: { select: { date: true } } } } } } } } },
    orderBy: [{ txnDate: "asc" }, { lineNo: "asc" }],
  });
  // Statement items not (yet) in the books as of the date: unmatched, or matched to entries dated later.
  const notInBooks = stmtLines
    .filter((s) => s.status !== "IGNORED" && !s.matchLines.some((m) => m.match.items.length > 0 && m.match.items.every((i) => i.journalLine.date <= through)))
    .map((s) => ({ id: s.id, date: ymdOf(s.txnDate), text: s.description, amountCents: s.amountCents, status: s.status }));
  const unresolved = notInBooks.filter((s) => s.status === "UNMATCHED" || s.status === "INVESTIGATE");

  const lastWithBalance = [...stmtLines].reverse().find((s) => s.balanceCents !== null);
  const statementBalance = statementBalanceOverride ?? lastWithBalance?.balanceCents ?? null;
  const outstandingDeposits = deposits.reduce((a, l) => a + l.amountCents, 0n);
  const outstandingWithdrawals = -withdrawals.reduce((a, l) => a + l.amountCents, 0n);
  const notInBooksTotal = notInBooks.reduce((a, l) => a + l.amountCents, 0n);
  const adjustedBank = statementBalance === null ? null : statementBalance + outstandingDeposits - outstandingWithdrawals;
  const adjustedBook = book + notInBooksTotal;
  return {
    moneyAccount: ma,
    asOf,
    statementBalance,
    statementBalanceFromFile: lastWithBalance?.balanceCents ?? null,
    book,
    deposits,
    withdrawals,
    outstandingDeposits,
    outstandingWithdrawals,
    notInBooks,
    unresolved,
    adjustedBank,
    adjustedBook,
    difference: adjustedBank === null ? null : adjustedBank - adjustedBook,
  };
}

/** Completes a reconciliation at ₱0 difference and locks the account through the date. */
export async function completeReconciliation(tx: Tx, input: { moneyAccountId: string; asOf: string; statementBalanceCents: bigint }, actor: Actor) {
  const p = await reconciliationPreview(tx, input.moneyAccountId, input.asOf, input.statementBalanceCents);
  const ma = p.moneyAccount;
  if (ma.lockedThrough && input.asOf <= ymdOf(ma.lockedThrough)) throw new UserFacingError(`Already reconciled through ${ymdOf(ma.lockedThrough)}.`);
  if (p.unresolved.length) throw new UserFacingError(`${p.unresolved.length} statement line(s) on or before ${input.asOf} still need matching, booking or ignoring.`);
  if (p.difference !== 0n) throw new UserFacingError(`The reconciliation is off by ${formatPeso(p.difference ?? 0n)}. It must be ₱0.00 to complete.`);
  const statement = await tx.bankStatement.findFirst({ where: { moneyAccountId: ma.id, periodStart: { lte: toDbDate(input.asOf) } }, orderBy: { periodEnd: "desc" } });
  const rec = await tx.reconciliation.create({
    data: {
      moneyAccountId: ma.id,
      statementId: statement?.id ?? null,
      asOfDate: toDbDate(input.asOf),
      statementBalanceCents: input.statementBalanceCents,
      bookBalanceCents: p.book,
      outstandingDepositsCents: p.outstandingDeposits,
      outstandingWithdrawalsCents: p.outstandingWithdrawals,
      adjustedBalanceCents: p.adjustedBank!,
      differenceCents: 0n,
      status: "POSTED",
      completedById: actor.id,
      completedAt: new Date(),
    },
  });
  const outstandingIds = new Set([...p.deposits, ...p.withdrawals].map((l) => l.id));
  const candidates = await tx.journalLine.findMany({ where: { accountId: ma.glAccountId, date: { lte: toDbDate(input.asOf) }, reconciliationId: null }, select: { id: true } });
  await tx.journalLine.updateMany({ where: { id: { in: candidates.map((c) => c.id).filter((id) => !outstandingIds.has(id)) } }, data: { reconciliationId: rec.id } });
  await tx.moneyAccount.update({ where: { id: ma.id }, data: { lockedThrough: toDbDate(input.asOf) } });
  await writeAudit(tx, {
    actorId: actor.id,
    action: "APPROVE",
    entityType: "Reconciliation",
    entityId: rec.id,
    before: { lockedThrough: ma.lockedThrough ? ymdOf(ma.lockedThrough) : null },
    after: { account: ma.name, asOf: input.asOf, statementBalanceCents: input.statementBalanceCents, bookBalanceCents: p.book, lockedThrough: input.asOf },
  });
  return rec.id;
}

/** Re-opens the latest reconciliation of an account (Owner): unlocks the period. */
export async function undoReconciliation(tx: Tx, reconciliationId: string, actor: Actor) {
  const rec = await tx.reconciliation.findUniqueOrThrow({ where: { id: reconciliationId } });
  if (rec.status !== "POSTED") throw new UserFacingError("This reconciliation is not active.");
  const later = await tx.reconciliation.findFirst({ where: { moneyAccountId: rec.moneyAccountId, status: "POSTED", asOfDate: { gt: rec.asOfDate } } });
  if (later) throw new UserFacingError("Undo the later reconciliations first.");
  await tx.journalLine.updateMany({ where: { reconciliationId: rec.id }, data: { reconciliationId: null } });
  await tx.reconciliation.update({ where: { id: rec.id }, data: { status: "VOIDED" } });
  const prev = await tx.reconciliation.findFirst({ where: { moneyAccountId: rec.moneyAccountId, status: "POSTED" }, orderBy: { asOfDate: "desc" } });
  await tx.moneyAccount.update({ where: { id: rec.moneyAccountId }, data: { lockedThrough: prev?.asOfDate ?? null } });
  await writeAudit(tx, { actorId: actor.id, action: "VOID", entityType: "Reconciliation", entityId: rec.id, before: { lockedThrough: ymdOf(rec.asOfDate) }, after: { lockedThrough: prev ? ymdOf(prev.asOfDate) : null } });
}
