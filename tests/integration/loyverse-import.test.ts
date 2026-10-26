import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { commitImport, previewImport } from "@/domains/sales/loyverse/import";
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
});
