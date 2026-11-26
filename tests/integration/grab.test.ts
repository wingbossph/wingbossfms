import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addGrabRemittance, grabSummary, setGrabDailySale } from "@/domains/sales/grab";
import { kpis } from "@/domains/dashboard/metrics";
import { db, fixtures, tx } from "./helpers";

let f: Awaited<ReturnType<typeof fixtures>>;
beforeAll(async () => {
  f = await fixtures();
});
afterAll(() => db.$disconnect());

describe("Grab sales and remittances", () => {
  it("tracks gross per day and remittances with what Grab deducted, outside the sales totals", async () => {
    const before = await kpis([f.lanang.id], { from: "2026-08-01", to: "2026-08-31" });
    await tx((t) => setGrabDailySale(t, { locationId: f.lanang.id, date: "2026-08-03", grossCents: 500000n }, f.owner.id));
    await tx((t) => setGrabDailySale(t, { locationId: f.lanang.id, date: "2026-08-04", grossCents: 300000n }, f.owner.id));
    // Saving again replaces the day's figure.
    await tx((t) => setGrabDailySale(t, { locationId: f.lanang.id, date: "2026-08-04", grossCents: 350000n }, f.owner.id));
    await tx((t) => addGrabRemittance(t, { locationId: f.lanang.id, remittedOn: "2026-08-10", periodFrom: "2026-08-03", periodTo: "2026-08-04", amountCents: 595000n, reference: "GRAB-1", notes: "" }, f.owner.id));

    const s = await grabSummary(db, [f.lanang.id], "2026-08-01", "2026-08-31");
    expect(s.grossCents).toBe(850000n);
    expect(s.days).toBe(2);
    expect(s.remittedCents).toBe(595000n);
    expect(s.remittances[0]).toMatchObject({ periodFrom: "2026-08-03", periodTo: "2026-08-04", coveredGrossCents: 850000n, deductedCents: 255000n });

    // Net sales are unchanged.
    expect((await kpis([f.lanang.id], { from: "2026-08-01", to: "2026-08-31" })).netSales).toBe(before.netSales);

    // Zero clears the day.
    await tx((t) => setGrabDailySale(t, { locationId: f.lanang.id, date: "2026-08-03", grossCents: 0n }, f.owner.id));
    expect((await grabSummary(db, [f.lanang.id], "2026-08-01", "2026-08-31")).grossCents).toBe(350000n);
  });
});
