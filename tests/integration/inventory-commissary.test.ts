import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { postAdjustment, postCount, saveCount } from "@/domains/inventory/documents";
import { dispatchTransfer, receiveTransfer, recordProduction, saveTransfer } from "@/domains/inventory/commissary";
import { getBalance } from "@/domains/inventory/stock";
import { perPaxKpis, varianceReport } from "@/domains/inventory/analytics";
import { openDraft, saveDraft, submitReport } from "@/domains/sales/service";
import { db, fixtures, glBalance, setPrice, systemAccount, trialBalanceDifference, tx, ymd } from "./helpers";

let f: Awaited<ReturnType<typeof fixtures>>;
const item = (sku: string) => db.item.findFirstOrThrow({ where: { sku } });
const actor = () => ({ id: f.owner.id });

beforeAll(async () => {
  f = await fixtures();
});
afterAll(() => db.$disconnect());

describe("zero-cost transfers", () => {
  it("dispatches and receives an item with no recorded cost without posting", async () => {
    const tub = await item("PKG-CUP");
    const id = await tx((t) => saveTransfer(t, { fromLocationId: f.commissary.id, toLocationId: f.matina.id, notes: "", lines: [{ itemId: tub.id, qty: "5" }] }, actor()));
    await tx((t) => dispatchTransfer(t, id, ymd(9), actor()));
    const line = await db.transferLine.findFirstOrThrow({ where: { transferId: id } });
    await tx((t) => receiveTransfer(t, id, ymd(9), [{ lineId: line.id, qty: "4", reason: "One cup missing" }], actor()));
    const t = await db.transfer.findUniqueOrThrow({ where: { id } });
    expect(t.status).toBe("RECEIVED_WITH_DISCREPANCY");
    expect(t.dispatchJournalEntryId).toBeNull();
    expect(t.receiveJournalEntryId).toBeNull();
    expect((await tx((x) => getBalance(x, tub.id, f.matina.id))).qty4).toBeGreaterThanOrEqual(40000n);
  });
});

describe("commissary → branch (acceptance #2)", () => {
  let transferId = "";

  it("opening stock, a sauce batch from a recipe, and a dispatch to Lanang", async () => {
    const butter = await item("ING-BUTTER");
    const garlic = await item("ING-GARLIC");
    const parm = await item("ING-PARM");
    const sauce = await item("SAU-02"); // Garlic Parmesan
    await tx((t) =>
      postAdjustment(
        t,
        {
          locationId: f.commissary.id,
          date: ymd(12),
          type: "OPENING",
          reason: "Go-live stock",
          lines: [
            { itemId: butter.id, qty: "10", direction: "IN", unitCost: "400" },
            { itemId: garlic.id, qty: "5", direction: "IN", unitCost: "150" },
            { itemId: parm.id, qty: "3", direction: "IN", unitCost: "900" },
          ],
        },
        actor(),
      ),
    );
    const recipe = await db.recipe.create({
      data: {
        name: "Garlic Parmesan sauce (10 L)",
        kind: "PRODUCTION",
        outputItemId: sauce.id,
        outputQty: "10",
        effectiveFrom: new Date(`${ymd(30)}T00:00:00Z`),
        lines: { create: [{ itemId: butter.id, qty: "2" }, { itemId: garlic.id, qty: "1" }, { itemId: parm.id, qty: "1" }] },
      },
    });
    await tx((t) => recordProduction(t, { locationId: f.commissary.id, recipeId: recipe.id, date: ymd(11), outputQty: "10" }, actor()));
    // 2 kg × ₱400 + 1 kg × ₱150 + 1 kg × ₱900 = ₱1,850 for 10 L
    const bal = await tx((t) => getBalance(t, sauce.id, f.commissary.id));
    expect(bal.valueCents).toBe(185000n);
    expect(bal.qty4).toBe(100000n);

    transferId = await tx((t) => saveTransfer(t, { fromLocationId: f.commissary.id, toLocationId: f.lanang.id, notes: "", lines: [{ itemId: sauce.id, qty: "4" }] }, actor()));
    await tx((t) => dispatchTransfer(t, transferId, ymd(10), actor()));
    const receivable = await systemAccount("INTERCO_RECEIVABLE");
    const inTransit = await db.journalLine.aggregate({ where: { accountId: receivable.id, locationId: f.commissary.id, counterpartyLocationId: f.lanang.id }, _sum: { debitCents: true, creditCents: true } });
    expect((inTransit._sum.debitCents ?? 0n) - (inTransit._sum.creditCents ?? 0n)).toBe(74000n); // in transit at cost
  });

  it("Lanang receives with a shortage; it confirms what arrived", async () => {
    const t = await db.transfer.findUniqueOrThrow({ where: { id: transferId }, include: { lines: true } });
    await expect(tx((x) => receiveTransfer(x, transferId, ymd(10), [{ lineId: t.lines[0].id, qty: "3.5" }], actor()))).rejects.toThrow(/Explain/);
    await tx((x) => receiveTransfer(x, transferId, ymd(10), [{ lineId: t.lines[0].id, qty: "3.5", reason: "One tub leaked" }], actor()));
    const sauce = await item("SAU-02");
    const lanang = await tx((x) => getBalance(x, sauce.id, f.lanang.id));
    expect(lanang.qty4).toBe(35000n);
    expect(lanang.valueCents).toBe(64750n);
    const receivable = await systemAccount("INTERCO_RECEIVABLE");
    const payable = await systemAccount("INTERCO_PAYABLE");
    // Receivable (commissary) and payable (Lanang) agree after the sender absorbs the shortage.
    const between = async (accountId: string, locationId: string, counterpartyLocationId: string) => {
      const a = await db.journalLine.aggregate({ where: { accountId, locationId, counterpartyLocationId }, _sum: { debitCents: true, creditCents: true } });
      return (a._sum.debitCents ?? 0n) - (a._sum.creditCents ?? 0n);
    };
    expect(await between(receivable.id, f.commissary.id, f.lanang.id)).toBe(64750n);
    expect(await between(payable.id, f.lanang.id, f.commissary.id)).toBe(-64750n);
    const loss = await systemAccount("COGS_TRANSFER_LOSS");
    expect(await glBalance(loss.id, f.commissary.id)).toBe(9250n);
    const updated = await db.transfer.findUniqueOrThrow({ where: { id: transferId } });
    expect(updated.status).toBe("RECEIVED_WITH_DISCREPANCY");

    // The commissary statement shows what Lanang received and owes.
    const { commissaryStatement } = await import("@/domains/reports/inventory-reports");
    const doc = await commissaryStatement({ ids: [f.commissary.id, f.lanang.id], locations: [f.commissary, f.lanang], label: "test" }, ymd(30), ymd(0));
    const row = doc.rows.find((r) => r.cells.branch === f.lanang.name)!;
    expect(row).toBeTruthy();
    expect(Object.values(row.cells)).toContain(64750n);
  });

  it("Lanang's count turns the sauce it used into its own COGS", async () => {
    const sauce = await item("SAU-02");
    const cogs = await systemAccount("COGS_SAUCES");
    const before = await glBalance(cogs.id, f.lanang.id);
    const countId = await tx((t) => saveCount(t, { locationId: f.lanang.id, date: ymd(9), type: "WEEKLY", lines: [{ itemId: sauce.id, counted: "1" }], notes: "" }, actor()));
    await tx((t) => postCount(t, countId, actor()));
    // Used 2.5 L of 3.5 L at ₱185/L.
    expect((await glBalance(cogs.id, f.lanang.id)) - before).toBe(46250n);
    expect(await trialBalanceDifference()).toBe(0n);
  });
});

describe("wings variance (acceptance #6)", () => {
  it("flags a day where wings per pax ran 15% over standard", async () => {
    await setPrice("Unlimited Wings", 49900n);
    const wings = await item("PRO-WING");
    const product = f.product("Unlimited Wings");
    // Standard 0.45 kg per pax.
    const std = await db.recipe.findFirstOrThrow({ where: { kind: "PACKAGE_PER_PAX", productId: product.id } });
    await db.recipeLine.updateMany({ where: { recipeId: std.id, itemId: wings.id }, data: { qty: "0.45" } });

    const d0 = ymd(8);
    const d1 = ymd(7);
    const d2 = ymd(6);
    await tx((t) => postAdjustment(t, { locationId: f.matina.id, date: d0, type: "OPENING", reason: "Opening wings", lines: [{ itemId: wings.id, qty: "200", direction: "IN", unitCost: "260" }] }, actor()));
    const c0 = await tx((t) => saveCount(t, { locationId: f.matina.id, date: d0, type: "DAILY", lines: [{ itemId: wings.id, counted: "200" }], notes: "" }, actor()));
    await tx((t) => postCount(t, c0, actor()));

    for (const [date, used] of [
      [d1, "45"], // 100 pax × 0.45 = 45 kg: on standard
      [d2, "51.75"], // 15% over
    ] as const) {
      const r = await tx((t) => openDraft(t, { locationId: f.matina.id, ymd: date, shiftNo: 1, userId: f.owner.id }));
      await tx((t) =>
        saveDraft(t, { reportId: r.id, lines: [{ productId: product.id, qty: "100" }], discounts: [], voids: [], serviceCharge: 0n, payments: [{ channelId: f.channel("Cash").id, amount: 4990000n, reference: "" }], mismatchExplanation: "" }, f.owner.id),
      );
      await tx((t) => submitReport(t, r.id, f.owner.id));
      const bal = await tx((t) => getBalance(t, wings.id, f.matina.id));
      const remaining = (Number(bal.qty4) / 10000 - Number(used)).toFixed(4);
      const c = await tx((t) => saveCount(t, { locationId: f.matina.id, date, type: "DAILY", lines: [{ itemId: wings.id, counted: remaining }], notes: "" }, actor()));
      await tx((t) => postCount(t, c, actor()));
    }

    const rows = (await varianceReport(db, f.matina.id, d1, d2)).filter((r) => r.itemId === wings.id);
    const day1 = rows.find((r) => r.date === d1)!;
    const day2 = rows.find((r) => r.date === d2)!;
    expect(day1.variancePct).toBe(0);
    expect(day1.flagged).toBe(false);
    expect(day2.variancePct).toBe(15);
    expect(day2.flagged).toBe(true);
    expect(day2.perPax).toBe(0.5175);

    const kpis = await perPaxKpis(db, f.matina.id, d1, d2);
    expect(kpis.pax).toBe(200);
    expect(kpis.wingsKgPerPax).toBeCloseTo(0.484, 3);
    expect(kpis.standardKgPerPax).toBe(0.45);
  });
});
