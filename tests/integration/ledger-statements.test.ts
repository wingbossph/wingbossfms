import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { bsFigures, buildCashFlow, combine, loadBalances, loadChart, pnlFigures, profitOf } from "@/domains/reports/financials";
import { postManualEntry, postOpeningBalances, recordOwnerEquity, runAllocation, runDepreciation, setPeriodStatus, voidLedgerEntry } from "@/domains/ledger/service";
import { setSetting } from "@/domains/admin/settings";
import { openDraft, saveDraft, submitReport } from "@/domains/sales/service";
import { loadAccess } from "@/server/auth/access";
import { dayBefore } from "@/domains/reports/params";
import { db, fixtures, setPrice, systemAccount, trialBalanceDifference, tx, ymd } from "./helpers";

let f: Awaited<ReturnType<typeof fixtures>>;
const ownerActor = async () => {
  const { access } = await loadAccess(db, f.owner.id);
  return { id: f.owner.id, can: (p: string, l: string) => access.can(p, l) };
};
const today = ymd(0);
const yearStart = `${today.slice(0, 4)}-01-01`;

beforeAll(async () => {
  f = await fixtures();
  await setPrice("Unlimited Wings", 49900n);
  // A Matina day so both branches have sales.
  const r = await tx((t) => openDraft(t, { locationId: f.matina.id, ymd: ymd(4), shiftNo: 1, userId: f.owner.id }));
  await tx((t) =>
    saveDraft(
      t,
      { reportId: r.id, lines: [{ productId: f.product("Unlimited Wings").id, qty: "20" }], discounts: [], voids: [], serviceCharge: 0n, payments: [{ channelId: f.channel("Cash").id, amount: 998000n, reference: "" }], mismatchExplanation: "" },
      f.owner.id,
    ),
  );
  await tx((t) => submitReport(t, r.id, f.owner.id));
});
afterAll(() => db.$disconnect());

async function allBalances(from: string | undefined, to: string) {
  const ids = (await db.location.findMany()).map((l) => l.id);
  return loadBalances(db, { from, to, locationIds: ids });
}

describe("financial statements", () => {
  it("consolidated profit equals the sum of the locations", async () => {
    const chart = await loadChart(db);
    const bal = await allBalances(yearStart, today);
    const perLocation = [...bal.entries()].map(([key, balances]) => pnlFigures(chart, { key, label: key, balances, consolidated: false }).netProfit);
    const consolidated = pnlFigures(chart, { key: "c", label: "c", balances: combine([...bal.values()]), consolidated: true });
    expect(consolidated.netProfit).toBe(perLocation.reduce((a, b) => a + b, 0n));
    expect(consolidated.netSales).toBeGreaterThan(0n);
  });

  it("every location's balance sheet balances, and so does the consolidated one", async () => {
    const chart = await loadChart(db);
    const bal = await allBalances(undefined, today);
    const ytd = await allBalances(yearStart, today);
    for (const [loc, balances] of bal) {
      const fig = bsFigures(chart, { key: loc, label: loc, balances, ytdProfit: profitOf(chart, ytd.get(loc) ?? new Map()), consolidated: false });
      expect(fig.assets, `location ${loc}`).toBe(fig.liabilitiesAndEquity);
    }
    const all = bsFigures(chart, { key: "c", label: "c", balances: combine([...bal.values()]), ytdProfit: profitOf(chart, combine([...ytd.values()])), consolidated: true });
    expect(all.assets).toBe(all.liabilitiesAndEquity);
  });

  it("the cash flow statement ties to the change in cash", async () => {
    const chart = await loadChart(db);
    const from = ymd(20);
    const doc = buildCashFlow(chart, combine([...(await allBalances(undefined, dayBefore(from))).values()]), combine([...(await allBalances(undefined, today)).values()]), combine([...(await allBalances(from, today)).values()]), { title: "", subtitle: "" });
    expect(doc.notes?.[0]).toMatch(/Ties/);
  });
});

describe("ledger operations", () => {
  it("manual entries must balance per location; the owner can void them", async () => {
    const actor = await ownerActor();
    const bank = await systemAccount("BANK_CHARGES");
    const capital = await systemAccount("OWNER_CAPITAL");
    await expect(
      tx((t) =>
        postManualEntry(t, { date: today, memo: "cross-location", lines: [{ accountId: bank.id, locationId: f.matina.id, debit: 100n, credit: 0n, memo: "" }, { accountId: capital.id, locationId: f.lanang.id, debit: 0n, credit: 100n, memo: "" }] }, actor),
      ),
    ).rejects.toThrow(/one location/);
    const id = await tx((t) =>
      postManualEntry(t, { date: today, memo: "Bank fee accrual", lines: [{ accountId: bank.id, locationId: f.matina.id, debit: 5000n, credit: 0n, memo: "" }, { accountId: capital.id, locationId: f.matina.id, debit: 0n, credit: 5000n, memo: "" }] }, actor),
    );
    await tx((t) => voidLedgerEntry(t, id, f.owner.id, "Posted by mistake", today));
    const e = await db.journalEntry.findUniqueOrThrow({ where: { id }, include: { reversedBy: true } });
    expect(e.status).toBe("VOIDED");
    expect(e.reversedBy).not.toBeNull();
  });

  it("opening balances post against opening balance equity", async () => {
    const actor = await ownerActor();
    const bpi = f.money("BPI Bank");
    const ap = await systemAccount("ACCOUNTS_PAYABLE");
    await tx((t) => postOpeningBalances(t, { date: ymd(60), lines: [{ accountId: bpi.glAccountId, locationId: f.office.id, amountCents: 50_000_000n }, { accountId: ap.id, locationId: f.office.id, amountCents: 2_000_000n }] }, actor));
    const obe = await systemAccount("OPENING_BALANCE_EQUITY");
    const agg = await db.journalLine.aggregate({ where: { accountId: obe.id }, _sum: { creditCents: true, debitCents: true } });
    expect((agg._sum.creditCents ?? 0n) - (agg._sum.debitCents ?? 0n)).toBe(48_000_000n);
  });

  it("owner drawings and capital post to equity", async () => {
    await tx((t) => recordOwnerEquity(t, { type: "DRAWING", date: ymd(1), locationId: f.office.id, moneyAccountId: f.money("BPI Bank").id, amountCents: 1_000_000n, memo: "Personal" }, f.owner.id));
    const drawings = await systemAccount("OWNER_DRAWINGS");
    const agg = await db.journalLine.aggregate({ where: { accountId: drawings.id }, _sum: { debitCents: true } });
    expect(agg._sum.debitCents).toBe(1_000_000n);
  });

  it("depreciation runs once per month", async () => {
    const accum = await systemAccount("ACCUM_DEPRECIATION");
    const kitchen = await db.account.findUniqueOrThrow({ where: { code: "1510" } });
    const dep = await systemAccount("DEP_EQUIPMENT");
    await db.fixedAsset.create({
      data: { name: "Fryer", locationId: f.lanang.id, category: "Kitchen", acquiredOn: new Date(`${ymd(90)}T00:00:00Z`), costCents: 6_000_000n, usefulLifeMonths: 60, assetAccountId: kitchen.id, accumDepAccountId: accum.id, depExpenseAccountId: dep.id },
    });
    const first = await tx((t) => runDepreciation(t, today, f.owner.id));
    expect(first.totalCents).toBe(100_000n);
    const again = await tx((t) => runDepreciation(t, today, f.owner.id));
    expect(again.posted).toBe(0);
  });

  it("allocations move cost between locations without changing consolidated profit", async () => {
    const chart = await loadChart(db);
    // Allocations are dated at month end.
    const monthEnd = new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)), 0)).toISOString().slice(0, 10);
    const before = await allBalances(yearStart, monthEnd);
    const consolidatedBefore = pnlFigures(chart, { key: "c", label: "c", balances: combine([...before.values()]), consolidated: true }).netProfit;

    await tx((t) => setSetting(t, "allocation.enabled", true, null, f.owner.id));
    // Some head office cost this month to allocate.
    const actor = await ownerActor();
    const accounting = await db.account.findUniqueOrThrow({ where: { code: "6610" } });
    const cash = f.money("BPI Bank");
    await tx((t) =>
      postManualEntry(t, { date: today, memo: "Bookkeeper fee", lines: [{ accountId: accounting.id, locationId: f.office.id, debit: 1_000_000n, credit: 0n, memo: "" }, { accountId: cash.glAccountId, locationId: f.office.id, debit: 0n, credit: 1_000_000n, memo: "" }] }, actor),
    );
    const rule = await db.allocationRule.create({
      data: { name: "Head office 60/40", isActive: true, sourceLocationId: f.office.id, accountId: accounting.id, shares: { create: [{ locationId: f.matina.id, shareBp: 6000 }, { locationId: f.lanang.id, shareBp: 4000 }] } },
    });
    await tx((t) => runAllocation(t, rule.id, today, f.owner.id, today));
    await tx((t) => runAllocation(t, rule.id, today, f.owner.id, today)); // re-run replaces, not doubles

    const after = await allBalances(yearStart, monthEnd);
    const lanangAccounting = after.get(f.lanang.id)?.get(accounting.id) ?? 0n;
    expect(lanangAccounting).toBe(400_000n);
    expect(after.get(f.office.id)?.get(accounting.id) ?? 0n).toBe(0n);
    const consolidatedAfter = pnlFigures(chart, { key: "c", label: "c", balances: combine([...after.values()]), consolidated: true }).netProfit;
    expect(consolidatedAfter).toBe(consolidatedBefore - 1_000_000n);
    expect(await trialBalanceDifference()).toBe(0n);
  });

  it("a closed month blocks postings until reopened", async () => {
    const actor = await ownerActor();
    const bank = await systemAccount("BANK_CHARGES");
    const capital = await systemAccount("OWNER_CAPITAL");
    const d = ymd(400);
    const [y, m] = d.split("-").map(Number);
    await tx((t) => setPeriodStatus(t, y, m, "CLOSED", f.owner.id, ""));
    const post = () => tx((t) => postManualEntry(t, { date: d, memo: "late", lines: [{ accountId: bank.id, locationId: f.matina.id, debit: 100n, credit: 0n, memo: "" }, { accountId: capital.id, locationId: f.matina.id, debit: 0n, credit: 100n, memo: "" }] }, actor));
    await expect(post()).rejects.toThrow(/closed/);
    await tx((t) => setPeriodStatus(t, y, m, "OPEN", f.owner.id, "Late supplier invoice"));
    await expect(post()).resolves.toBeTruthy();
    const log = await db.auditLog.findFirst({ where: { action: "REOPEN_PERIOD" } });
    expect(log?.reason).toBe("Late supplier invoice");
  });
});
