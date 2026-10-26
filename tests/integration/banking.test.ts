import { afterAll, beforeAll, describe, expect, it } from "vitest";
import Papa from "papaparse";
import { createMoneyAccount } from "@/domains/cash/money-accounts";
import { acct, cr, dr, key } from "@/domains/ledger/lines";
import { postEntry } from "@/domains/ledger/post";
import { openDraft, saveDraft, submitReport } from "@/domains/sales/service";
import { SYSTEM_FORMATS, parseStatement } from "@/domains/banking/formats";
import {
  completeReconciliation,
  createFromStatementLine,
  ensureStatementFormats,
  importStatement,
  manualMatch,
  openBookLines,
  openStatementLines,
  reconciliationPreview,
  runAutoMatch,
  undoReconciliation,
  unmatch,
} from "@/domains/banking/service";
import { db, fixtures, systemAccount, trialBalanceDifference, tx, ymd } from "./helpers";

let f: Awaited<ReturnType<typeof fixtures>>;
const actor = () => ({ id: f.owner.id });
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const peso = (c: bigint) => (Number(c) / 100).toFixed(2);

let bank: Awaited<ReturnType<typeof createMoneyAccount>>;
let counter: Awaited<ReturnType<typeof createMoneyAccount>>;
const start = ymd(25);
const end = addDays(start, 14);

beforeAll(async () => {
  f = await fixtures();
  bank = await tx((t) => createMoneyAccount(t, { name: "Test BDO", kind: "BANK", locationId: null, institution: "BDO" }));
  // Other test files assert absolute balances of the seeded cash accounts: book against our own.
  counter = await tx((t) => createMoneyAccount(t, { name: "Test cash box", kind: "EWALLET", locationId: null }));
});
afterAll(() => db.$disconnect());

async function book(date: string, locationId: string, amount: bigint, memo: string) {
  return tx((t) =>
    postEntry(t, {
      date,
      source: "MANUAL",
      memo,
      postedById: f.owner.id,
      lines: amount > 0n ? [...dr(acct(bank.glAccountId), locationId, amount), ...cr(acct(counter.glAccountId), locationId, amount)] : [...dr(key("INTEREST_EXPENSE"), locationId, -amount), ...cr(acct(bank.glAccountId), locationId, -amount)],
    }),
  );
}

describe("bank reconciliation (acceptance #5)", () => {
  it("imports a statement, auto-matches ≥80%, settles a card payout at the real MDR, and reconciles to ₱0", async () => {
    // Opening balance before the first statement.
    await tx((t) => postEntry(t, { date: addDays(start, -3), source: "MANUAL", memo: "Opening balance", postedById: f.owner.id, lines: [...dr(acct(bank.glAccountId), f.office.id, 10_000_000n), ...cr(key("OPENING_BALANCE_EQUITY"), f.office.id, 10_000_000n)] }));

    // Book side: deposits (bank shows them a day later), cheques, a GCash-style day total, a two-branch deposit.
    const stmt: { date: string; desc: string; ref: string; amount: bigint }[] = [];
    for (let i = 0; i < 8; i++) {
      const d = addDays(start, i);
      const amount = 1_234_500n + BigInt(i) * 10_000n;
      await book(d, i % 2 ? f.matina.id : f.lanang.id, amount, `Cash deposit slip DS${7100 + i}`);
      stmt.push({ date: addDays(d, 1), desc: "CASH DEPOSIT", ref: `DS${7100 + i}`, amount });
    }
    await book(addDays(start, 3), f.office.id, -450_000n, "Cheque 000123 to supplier");
    stmt.push({ date: addDays(start, 5), desc: "CHECK ENCASHMENT 000123", ref: "000123", amount: -450_000n });
    // One book line, three statement receipts the same day.
    await book(addDays(start, 9), f.matina.id, 300_000n, "Online receipts");
    stmt.push({ date: addDays(start, 9), desc: "INSTAPAY FROM J DELA CRUZ", ref: "", amount: 100_000n }, { date: addDays(start, 9), desc: "INSTAPAY FROM M SANTOS", ref: "", amount: 150_000n }, { date: addDays(start, 9), desc: "INSTAPAY FROM R REYES", ref: "", amount: 50_000n });
    // Two book lines, one statement deposit.
    await book(addDays(start, 10), f.matina.id, 200_000n, "Matina cash");
    await book(addDays(start, 10), f.lanang.id, 300_000n, "Lanang cash");
    stmt.push({ date: addDays(start, 11), desc: "CASH DEPOSIT", ref: "", amount: 500_000n });

    // Card sale at Lanang settling into this bank: ₱10,000 gross, 2.5% expected fee.
    const channel = await db.paymentChannel.create({
      data: { name: "Test Card", kind: "CARD", moneyAccountId: f.money("Maya terminal / merchant wallet").id, isDeferred: true, feeRateBp: 250, settlementDelayDays: 1, settlesToMoneyAccountId: bank.id, locations: { create: [{ locationId: f.lanang.id }] } },
    });
    const saleDate = addDays(start, 11);
    const r = await tx((t) => openDraft(t, { locationId: f.lanang.id, ymd: saleDate, shiftNo: 7, userId: f.owner.id }));
    await tx((t) => saveDraft(t, { reportId: r.id, lines: [], discounts: [], voids: [], serviceCharge: 0n, payments: [{ channelId: channel.id, amount: 1_000_000n, reference: "" }], mismatchExplanation: "Card-only test shift" }, f.owner.id));
    await tx((t) => submitReport(t, r.id, f.owner.id));
    // Actual MDR 2.2%: ₱9,780 lands (₱9,750 expected).
    stmt.push({ date: addDays(saleDate, 1), desc: "PAYMAYA SETTLEMENT CR", ref: "MY88231", amount: 978_000n });

    // Bank-only items: a service charge (not in books yet).
    stmt.push({ date: addDays(start, 13), desc: "SERVICE CHARGE", ref: "", amount: -5_000n });
    // A cheque issued on the last day, not yet cleared: stays outstanding.
    await book(end, f.office.id, -120_000n, "Cheque 000124");

    stmt.sort((a, b) => a.date.localeCompare(b.date));
    let running = 10_000_000n;
    const rows = stmt.map((s) => {
      running += s.amount;
      return { "Transaction Date": `${s.date.slice(5, 7)}/${s.date.slice(8, 10)}/${s.date.slice(0, 4)}`, Description: s.desc, "Reference Number": s.ref, Debit: s.amount < 0n ? peso(-s.amount) : "", Credit: s.amount > 0n ? peso(s.amount) : "", "Running Balance": peso(running) };
    });
    // BPI lists newest first.
    const csv = Papa.unparse(rows.reverse());
    const table = Papa.parse<string[]>(csv, { skipEmptyLines: "greedy" }).data;
    const config = SYSTEM_FORMATS[0].config;
    const parsed = parseStatement(table, config);
    expect(parsed.errors).toEqual([]);
    expect(parsed.lines[0].txnDate <= parsed.lines[parsed.lines.length - 1].txnDate).toBe(true);

    await tx((t) => ensureStatementFormats(t));
    const format = await db.statementFormat.findUniqueOrThrow({ where: { name: SYSTEM_FORMATS[0].name } });
    const imp = await tx((t) => importStatement(t, { moneyAccountId: bank.id, formatId: format.id, config, lines: parsed.lines }, actor()));
    expect(imp.imported).toBe(stmt.length);
    // Re-importing the same file adds nothing.
    await expect(tx((t) => importStatement(t, { moneyAccountId: bank.id, formatId: format.id, config, lines: parsed.lines }, actor()))).rejects.toThrow(/imported before/);

    const auto = await tx((t) => runAutoMatch(t, bank.id, actor()));
    expect(auto.open).toBe(stmt.length);
    expect(auto.matched / auto.open).toBeGreaterThanOrEqual(0.8);
    expect(auto.settlements).toBe(1);

    // The payout posted the real fee: ₱10,000 − ₱9,780 = ₱220 MDR.
    const settlement = await db.channelSettlement.findFirstOrThrow({ where: { channelId: channel.id } });
    expect(settlement.status).toBe("SETTLED");
    expect(settlement.actualFeeCents).toBe(22_000n);
    const mdr = await systemAccount("MDR_FEES");
    const feeLine = await db.journalLine.findFirstOrThrow({ where: { entryId: settlement.journalEntryId!, accountId: mdr.id } });
    expect(feeLine.debitCents).toBe(22_000n);
    expect(feeLine.locationId).toBe(f.lanang.id);

    // What's left: the service charge (book it) — and the opening balance (cleared before statements).
    const left = await openStatementLines(db, bank.id);
    expect(left.map((l) => l.description)).toEqual(["SERVICE CHARGE"]);
    const charges = await systemAccount("BANK_CHARGES");
    await tx((t) => createFromStatementLine(t, { statementLineId: left[0].id, accountId: charges.id, locationId: f.office.id, memo: "" }, actor()));

    let preview = await reconciliationPreview(db, bank.id, end);
    // The opening balance is already inside the statement's opening balance: until it is
    // cleared it counts as an outstanding deposit and the reconciliation is off by that much.
    expect(preview.difference).toBe(10_000_000n);
    expect(preview.outstandingDeposits).toBe(10_000_000n);
    expect(preview.outstandingWithdrawals).toBe(120_000n);
    const opening = (await openBookLines(db, bank.glAccountId)).find((l) => l.entry.memo === "Opening balance")!;
    await expect(tx((t) => manualMatch(t, { moneyAccountId: bank.id, statementLineIds: [], journalLineIds: [opening.id] }, actor()))).rejects.toThrow(/at least one/);
    const { clearBeforeStatements } = await import("@/domains/banking/service");
    await tx((t) => clearBeforeStatements(t, { moneyAccountId: bank.id, journalLineIds: [opening.id] }, actor()));

    preview = await reconciliationPreview(db, bank.id, end);
    expect(preview.unresolved).toEqual([]);
    expect(preview.statementBalance).toBe(running);
    expect(preview.outstandingDeposits).toBe(0n);
    expect(preview.difference).toBe(0n);

    // A wrong statement balance can't be completed.
    await expect(tx((t) => completeReconciliation(t, { moneyAccountId: bank.id, asOf: end, statementBalanceCents: running + 100n }, actor()))).rejects.toThrow(/off by/);
    const recId = await tx((t) => completeReconciliation(t, { moneyAccountId: bank.id, asOf: end, statementBalanceCents: running }, actor()));

    // Locked: nothing can post on or before the date, and matches can't be undone.
    await expect(book(addDays(start, 2), f.matina.id, 1_000n, "Late entry")).rejects.toThrow(/locked/);
    const match = await db.bankMatch.findFirstOrThrow({ where: { settlements: { some: { id: settlement.id } } } });
    await expect(tx((t) => unmatch(t, match.id, actor(), ymd()))).rejects.toThrow(/reconciliation/);
    expect(await trialBalanceDifference()).toBe(0n);

    // The owner can undo it, which unlocks the period.
    await tx((t) => undoReconciliation(t, recId, actor()));
    expect((await db.moneyAccount.findUniqueOrThrow({ where: { id: bank.id } })).lockedThrough).toBeNull();
    await tx((t) => unmatch(t, match.id, actor(), ymd()));
    const reopened = await db.channelSettlement.findUniqueOrThrow({ where: { id: settlement.id } });
    expect(reopened.status).toBe("EXPECTED");
    expect(await trialBalanceDifference()).toBe(0n);
  });
});
