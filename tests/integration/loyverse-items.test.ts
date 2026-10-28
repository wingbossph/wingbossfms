import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { importLoyverseItems } from "@/domains/sales/loyverse/items";
import { priceMap } from "@/domains/sales/service";
import { db, fixtures, tx } from "./helpers";

const csv = readFileSync(new URL("../fixtures/loyverse-items-export.csv", import.meta.url), "utf8");

let f: Awaited<ReturnType<typeof fixtures>>;
beforeAll(async () => {
  f = await fixtures();
});
afterAll(() => db.$disconnect());

describe("Loyverse items import", () => {
  it("adds menu items with category, type and default + branch prices, and re-imports by SKU", async () => {
    const first = await tx((t) => importLoyverseItems(t, csv, f.owner.id));
    expect(first.created).toBeGreaterThan(190);
    expect(first.stores).toEqual(["WINGBOSS MATINA"]);

    const vip = await db.product.findFirstOrThrow({ where: { sku: "10000" } });
    expect(vip).toMatchObject({ name: "1 UNLI VIP", category: "1 UNLIMITED AND MAINS", type: "PACKAGE" });
    expect(Number(vip.paxPerUnit)).toBe(1);
    const coke = await db.product.findFirstOrThrow({ where: { sku: "10024" } });
    expect(coke).toMatchObject({ category: "5 BEVERAGES", type: "BEVERAGE" });
    expect((await db.product.findFirstOrThrow({ where: { sku: "10040" } })).type).toBe("TAKEOUT");
    expect(await db.product.count({ where: { name: "COCOA" } })).toBe(1);

    // Matina sells 1.5L Coke at ₱150 (default ₱128); Lanang uses the default.
    const matina = await tx((t) => priceMap(t, f.matina.id, "2026-10-28"));
    const lanang = await tx((t) => priceMap(t, f.lanang.id, "2026-10-28"));
    expect(matina.get(coke.id)).toBe(15000n);
    expect(lanang.get(coke.id)).toBe(12800n);

    const again = await tx((t) => importLoyverseItems(t, csv, f.owner.id));
    expect(again.created).toBe(0);
    expect(again.updated).toBe(first.created + first.updated);
  });
});
