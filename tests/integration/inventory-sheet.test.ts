import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { applySheetDay, prepareSheetItems } from "@/domains/inventory/sheet-import";
import { db, fixtures, tx } from "./helpers";

let f: Awaited<ReturnType<typeof fixtures>>;
beforeAll(async () => {
  f = await fixtures();
});
afterAll(() => db.$disconnect());

const day = (start: number | null, inn: number | null, out: number | null, transfer: number | null, end: number | null) => ({ start, in: inn, out, transfer, end });

describe("Inventory sheet import", () => {
  it("creates items, posts opening, deliveries, transfers and daily counts, and skips days already counted", async () => {
    const { itemIds, created } = await tx((t) =>
      prepareSheetItems(t, f.matina.id, [
        { name: "WINGS", section: "ITEMS" },
        { name: "Zesty Honey", section: "SAUCES" },
        { name: "Coke Can", section: "SAUCES" },
      ]),
    );
    expect(created).toBe(2); // WINGS is the existing raw wings item
    const wings = await db.item.findUniqueOrThrow({ where: { id: itemIds.WINGS } });
    expect(wings.sku).toBe("PRO-WING");
    const coke = await db.item.findUniqueOrThrow({ where: { id: itemIds["Coke Can"] }, include: { category: true } });
    expect(coke.category.name).toBe("Beverage");

    const lines = (d: ReturnType<typeof day>[]) => [itemIds.WINGS, itemIds["Zesty Honey"], itemIds["Coke Can"]].map((itemId, i) => ({ itemId, ...d[i] }));
    // Day 1: wings 24.75 + 80 in − 40.4 used = 64.35; day 2: 20 in, 20 sent to another branch, 10 used.
    await tx((t) => applySheetDay(t, { locationId: f.matina.id, date: "2026-08-01", fileName: "t.xlsx", lines: lines([day(24.75, 80, 40.4, null, 64.35), day(6.2, null, 1.3, null, 4.9), day(10, null, 5, null, 5)]) }, f.owner));
    await tx((t) => applySheetDay(t, { locationId: f.matina.id, date: "2026-08-02", fileName: "t.xlsx", lines: lines([day(64.35, 20, 10, 20, 54.35), day(4.9, null, 0.6, null, 4.3), day(5, 24, 1, null, 28)]) }, f.owner));

    const bal = await db.stockBalance.findUniqueOrThrow({ where: { itemId_locationId: { itemId: itemIds.WINGS, locationId: f.matina.id } } });
    expect(Number(bal.qty)).toBe(54.35);
    const usage = await db.stockCountLine.findMany({ where: { itemId: itemIds.WINGS, count: { locationId: f.matina.id, countDate: { in: [new Date("2026-08-01"), new Date("2026-08-02")] } } }, orderBy: { count: { countDate: "asc" } } });
    expect(usage.map((u) => Number(u.usageQty))).toEqual([40.4, 10]);

    const again = await tx((t) => applySheetDay(t, { locationId: f.matina.id, date: "2026-08-02", fileName: "t.xlsx", lines: lines([day(64.35, 20, 10, 20, 54.35), day(4.9, null, 0.6, null, 4.3), day(5, 24, 1, null, 28)]) }, f.owner));
    expect(again.skipped).toBe(true);
    expect(Number((await db.stockBalance.findUniqueOrThrow({ where: { itemId_locationId: { itemId: itemIds.WINGS, locationId: f.matina.id } } })).qty)).toBe(54.35);
  });
});
