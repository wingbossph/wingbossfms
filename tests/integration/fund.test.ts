import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { saveFund } from "@/domains/sales/fund";
import { db, fixtures, tx } from "./helpers";

let f: Awaited<ReturnType<typeof fixtures>>;
beforeAll(async () => {
  f = await fixtures();
});
afterAll(() => db.$disconnect());

describe("sales fund", () => {
  it("stores a fund from non-consecutive days, replaces it on save and removes it when empty", async () => {
    const where = { locationId_businessDate: { locationId: f.matina.id, businessDate: new Date("2026-08-20") } };
    await tx((t) =>
      saveFund(t, { locationId: f.matina.id, date: "2026-08-20", parts: [{ from: "2026-08-15", to: "2026-08-15", amountCents: 200000n }, { from: "2026-08-17", to: "2026-08-18", amountCents: 150000n }] }, f.owner.id),
    );
    const fund = await db.salesFund.findUniqueOrThrow({ where, include: { sources: true } });
    expect(fund.sources.reduce((a, s) => a + s.amountCents, 0n)).toBe(350000n);
    await tx((t) => saveFund(t, { locationId: f.matina.id, date: "2026-08-20", parts: [{ from: "2026-08-19", to: "2026-08-19", amountCents: 100000n }] }, f.owner.id));
    expect((await db.salesFund.findUniqueOrThrow({ where, include: { sources: true } })).sources).toHaveLength(1);
    await expect(tx((t) => saveFund(t, { locationId: f.matina.id, date: "2026-08-20", parts: [{ from: "2026-08-21", to: "2026-08-21", amountCents: 1n }] }, f.owner.id))).rejects.toThrow(/this day or earlier/);
    await tx((t) => saveFund(t, { locationId: f.matina.id, date: "2026-08-20", parts: [] }, f.owner.id));
    expect(await db.salesFund.findUnique({ where })).toBeNull();
  });
});
