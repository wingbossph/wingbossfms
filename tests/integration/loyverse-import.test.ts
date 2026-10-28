import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { commitImport, previewImport, SUMMARY_PAYMENT_TYPE } from "@/domains/sales/loyverse/import";
import { openDraft, saveDraft, submitReport } from "@/domains/sales/service";
import { parseLoyverseCsv, type ParseResult } from "@/domains/sales/loyverse/parse";
import { db, fixtures, tx } from "./helpers";

const parse = (name: string) => {
  const r = parseLoyverseCsv(readFileSync(new URL(`../fixtures/${name}`, import.meta.url), "utf8"));
  if ("error" in r) throw new Error(r.error);
  return r as ParseResult;
};

let f: Awaited<ReturnType<typeof fixtures>>;
beforeAll(async () => {
  f = await fixtures();
});
afterAll(() => db.$disconnect());

describe("Loyverse import", () => {
  it("asks for mappings of unknown items and payment types", async () => {
    const preview = await tx((t) => previewImport(t, f.lanang.id, parse("loyverse-receipts-by-item.csv")));
    expect(preview.newCount).toBe(4);
    expect(preview.unmappedItems).toEqual(["UW Barkada – Set of 4"]);
    await expect(tx((t) => commitImport(t, { locationId: f.lanang.id, parsed: parse("loyverse-receipts-by-item.csv"), fileName: "a.csv", actorId: f.owner.id }))).rejects.toThrow(/Map every/);
  });

  it("imports receipts, builds the day's draft, and is safe to re-import", async () => {
    await db.loyverseMapping.create({
      data: { kind: "ITEM", locationId: f.lanang.id, externalName: "UW Barkada – Set of 4", productId: f.product("Unlimited Wings").id, paxOverride: "4" },
    });
    await db.loyverseMapping.create({ data: { kind: "PAYMENT_TYPE", locationId: null, externalName: "GCash", channelId: f.channel("GCash 1").id } });

    const first = await tx((t) => commitImport(t, { locationId: f.lanang.id, parsed: parse("loyverse-receipts-by-item.csv"), fileName: "items.csv", actorId: f.owner.id }));
    expect(first.created).toBe(4);
    const day = await db.salesReport.findFirstOrThrow({
      where: { locationId: f.lanang.id, businessDate: new Date("2026-10-20") },
      include: { lines: true, discounts: true, voids: true, payments: true },
    });
    expect(day.grossCents).toBe(99800n + 19800n + 179600n);
    expect(Number(day.pax)).toBe(6); // 2 + 4 (barkada set of 4)
    expect(day.discountCents).toBe(17960n);
    expect(day.refundCents).toBe(9900n);
    expect(day.payments).toHaveLength(0); // the by-item export has no payment types

    // The Receipts export adds payment types to the same receipts without duplicating them.
    const second = await tx((t) => commitImport(t, { locationId: f.lanang.id, parsed: parse("loyverse-receipts.csv"), fileName: "receipts.csv", actorId: f.owner.id }));
    expect(second.created).toBe(0);
    expect(second.enriched).toBe(4);
    const after = await db.salesReport.findUniqueOrThrow({ where: { id: day.id }, include: { payments: { include: { channel: true } } } });
    const byName = Object.fromEntries(after.payments.map((p) => [p.channel.name, p.amountCents]));
    expect(byName).toEqual({ Cash: 119600n - 9900n, "GCash 1": 161640n });
    expect(after.paymentsCents).toBe(after.netCents);

    const again = await tx((t) => commitImport(t, { locationId: f.lanang.id, parsed: parse("loyverse-receipts-by-item.csv"), fileName: "items.csv", actorId: f.owner.id }));
    expect(again.created).toBe(0);
    expect(await db.loyverseReceipt.count({ where: { locationId: f.lanang.id } })).toBe(4);
    const unchanged = await db.salesReport.findUniqueOrThrow({ where: { id: day.id } });
    expect(unchanged.netCents).toBe(after.netCents);
  });

  it("learns the store name and skips other stores' receipts", async () => {
    const setting = await db.setting.findFirst({ where: { key: "loyverse.storeName", locationId: f.lanang.id } });
    expect(setting?.value).toBe("Wingboss Lanang");
    // Lanang's file can't be imported into Matina by mistake.
    await expect(tx((t) => previewImport(t, f.matina.id, parse("loyverse-receipts.csv")))).rejects.toThrow(/belongs to Wingboss Lanang/);
  });

  it("imports a daily Sales summary as one submitted total per day, and updates days on re-import", async () => {
    const parsed = parse("loyverse-sales-summary-daily.csv");
    const preview = await tx((t) => previewImport(t, f.matina.id, parsed));
    expect(preview.daily).toBe(true);
    expect(preview.dates).toEqual(["2026-09-01", "2026-09-02", "2026-09-03"]);
    expect(preview.unmappedPaymentTypes).toEqual([SUMMARY_PAYMENT_TYPE]);
    await db.loyverseMapping.create({ data: { kind: "PAYMENT_TYPE", locationId: f.matina.id, externalName: SUMMARY_PAYMENT_TYPE, channelId: f.channel("Cash").id } });

    const first = await tx((t) => commitImport(t, { locationId: f.matina.id, parsed, fileName: "summary.csv", actorId: f.owner.id }));
    expect(first.created).toBe(3);
    const day = await db.salesReport.findFirstOrThrow({ where: { locationId: f.matina.id, businessDate: new Date("2026-09-01") } });
    expect(day.status).toBe("POSTED");
    expect(day.grossCents).toBe(2601400n);
    expect(day.discountCents).toBe(6980n);
    expect(day.refundCents).toBe(69800n);
    expect(day.netCents).toBe(2524620n);
    expect(day.paymentsCents).toBe(day.netCents);

    // Same file again: nothing changes. A newer export with a changed day updates and re-posts it.
    const again = await tx((t) => commitImport(t, { locationId: f.matina.id, parsed, fileName: "summary.csv", actorId: f.owner.id }));
    expect(again.duplicates).toBe(3);
    const changed = parseLoyverseCsv(readFileSync(new URL("../fixtures/loyverse-sales-summary-daily.csv", import.meta.url), "utf8").replace("13677.00,0.00,0.00,13677.00", "15000.00,0.00,0.00,15000.00"));
    if ("error" in changed) throw new Error(changed.error);
    const third = await tx((t) => commitImport(t, { locationId: f.matina.id, parsed: changed, fileName: "summary2.csv", actorId: f.owner.id }));
    expect(third.enriched).toBe(1);
    const updated = await db.salesReport.findFirstOrThrow({ where: { locationId: f.matina.id, businessDate: new Date("2026-09-03") } });
    expect(updated.status).toBe("POSTED");
    expect(updated.netCents).toBe(1500000n);
    const lines = await db.journalLine.aggregate({ where: { locationId: f.matina.id, date: new Date("2026-09-03"), account: { systemKey: "REV_UNLIMITED" } }, _sum: { creditCents: true, debitCents: true } });
    expect((lines._sum.creditCents ?? 0n) - (lines._sum.debitCents ?? 0n)).toBe(1500000n);
  });

  it("accepts sales entered as one consolidated total instead of items", async () => {
    const report = await tx((t) => openDraft(t, { locationId: f.matina.id, ymd: "2026-09-10", shiftNo: 1, userId: f.owner.id }));
    await tx((t) =>
      saveDraft(
        t,
        { reportId: report.id, lines: [], consolidated: { gross: 1000000n, pax: "25" }, discounts: [], voids: [], serviceCharge: 0n, payments: [{ channelId: f.channel("Cash").id, amount: 1000000n, reference: "" }], mismatchExplanation: "" },
        f.owner.id,
      ),
    );
    await tx((t) => submitReport(t, report.id, f.owner.id));
    const r = await db.salesReport.findUniqueOrThrow({ where: { id: report.id }, include: { lines: { include: { product: true } } } });
    expect(r.status).toBe("POSTED");
    expect(r.netCents).toBe(1000000n);
    expect(Number(r.pax)).toBe(25);
    expect(r.lines.map((l) => l.product.name)).toEqual(["Consolidated sales"]);
  });
});
