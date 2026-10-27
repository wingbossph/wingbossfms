import { describe, expect, it } from "vitest";
import { depreciationForMonth } from "@/domains/ledger/depreciation";

const asset = { costCents: 1_200_000n, salvageCents: 0n, usefulLifeMonths: 36, acquiredOn: "2026-01-20", disposedOn: null };

describe("straight-line depreciation", () => {
  it("starts the month after acquisition", () => {
    expect(depreciationForMonth(asset, "2026-01-31", 0n)).toBe(0n);
    expect(depreciationForMonth(asset, "2026-02-28", 0n)).toBe(33333n);
  });

  it("the last month takes the remainder so the total is exact", () => {
    let total = 0n;
    for (let i = 0; i < 40; i++) {
      const d = new Date(Date.UTC(2026, 1 + i, 1)).toISOString().slice(0, 10);
      total += depreciationForMonth(asset, d, total);
    }
    expect(total).toBe(1_200_000n);
  });

  it("respects salvage value and stops after disposal", () => {
    const a = { ...asset, salvageCents: 200_000n, disposedOn: "2026-05-10" };
    expect(depreciationForMonth(a, "2026-03-31", 0n)).toBe(27778n);
    expect(depreciationForMonth(a, "2026-06-30", 0n)).toBe(0n);
  });
});
