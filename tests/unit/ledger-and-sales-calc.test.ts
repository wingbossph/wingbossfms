import { describe, expect, it } from "vitest";
import { assertBalanced, consolidate, cr, dr, key, reverseLines, totals } from "@/domains/ledger/lines";
import { periodBounds } from "@/domains/ledger/post";
import { cashCount, computeSalesTotals, countDenominations, expectedSettlement, lineGross, linePaxHundredths, scPwdDiscount } from "@/domains/sales/calc";
import { salesEntryLines } from "@/domains/sales/service";

describe("journal line helpers", () => {
  it("flips negative amounts and drops zero lines", () => {
    expect(dr(key("A"), "L", -500n)).toEqual([{ account: { key: "A" }, locationId: "L", debitCents: 0n, creditCents: 500n }]);
    expect(cr(key("A"), "L", 0n)).toEqual([]);
  });

  it("validates balance and shape", () => {
    expect(() => assertBalanced([...dr(key("A"), "L", 100n), ...cr(key("B"), "L", 100n)])).not.toThrow();
    expect(() => assertBalanced([...dr(key("A"), "L", 100n), ...cr(key("B"), "L", 99n)])).toThrow(/not balanced/);
    expect(() => assertBalanced([...dr(key("A"), "L", 100n)])).toThrow(/two lines/);
  });

  it("merges same-account lines and reverses", () => {
    const lines = consolidate([...dr(key("A"), "L", 100n), ...dr(key("A"), "L", 50n), ...cr(key("B"), "L", 150n)]);
    expect(lines).toHaveLength(2);
    expect(totals(lines)).toEqual({ debit: 150n, credit: 150n, difference: 0n });
    const rev = reverseLines(lines);
    expect(rev[0].creditCents).toBe(150n);
  });

  it("computes month bounds", () => {
    const b = periodBounds("2026-02-14");
    expect(b.startsOn.toISOString().slice(0, 10)).toBe("2026-02-01");
    expect(b.endsOn.toISOString().slice(0, 10)).toBe("2026-02-28");
  });
});

describe("sales arithmetic", () => {
  it("prices lines and counts pax", () => {
    expect(lineGross("3", 49900n)).toBe(149700n);
    expect(lineGross("1.5", 9999n)).toBe(14999n); // 149.985 → 149.99
    expect(linePaxHundredths("2", "4")).toBe(800n);
  });

  it("computes net sales and the payment difference", () => {
    const t = computeSalesTotals({
      lines: [{ grossCents: 100000n, paxHundredths: 200n }],
      discounts: [{ amountCents: 10000n }],
      refunds: [{ amountCents: 5000n }],
      serviceChargeCents: 2000n,
      payments: [{ amountCents: 80000n }],
    });
    expect(t.netCents).toBe(87000n);
    expect(t.differenceCents).toBe(-7000n);
  });

  it("SC/PWD is 20% of their share, settlements deduct fee and withholding", () => {
    expect(scPwdDiscount(49900n)).toBe(9980n);
    expect(expectedSettlement(100000n, { feeRateBp: 250, feeFixedCents: 0n, withholdingRateBp: 50 })).toEqual({ feeCents: 2500n, whtCents: 500n, netCents: 97000n });
  });

  it("counts the drawer by denomination", () => {
    expect(countDenominations({ "1000": 2, "500": 1, "20": 3 }, 1550n)).toBe(257550n);
    expect(cashCount({ openingFloatCents: 200000n, cashSalesCents: 500000n, cashExpensesCents: 30000n, countedCents: 669000n })).toEqual({
      expectedCents: 670000n,
      overShortCents: -1000n,
    });
  });

  it("builds a balanced sales entry, with any difference booked as over/short", () => {
    const lines = salesEntryLines({
      locationId: "L",
      revenueByAccount: new Map([["rev", 100000n]]),
      discounts: [{ contraAccountId: "disc", amountCents: 10000n }],
      refundCents: 0n,
      serviceChargeCents: 0n,
      serviceChargeToStaff: false,
      payments: [{ glAccountId: "cash", amountCents: 89000n }],
      differenceCents: -1000n,
    });
    expect(() => assertBalanced(lines)).not.toThrow();
    expect(lines.find((l) => "key" in l.account && l.account.key === "CASH_OVER_SHORT")?.debitCents).toBe(1000n);
  });
});

describe("per-location balance", () => {
  it("rejects an entry that moves value between locations without inter-location accounts", async () => {
    const { assertBalancedPerLocation } = await import("@/domains/ledger/lines");
    expect(() => assertBalancedPerLocation([...dr(key("A"), "MAT", 100n), ...cr(key("B"), "LAN", 100n)])).toThrow(/one location/);
    expect(() =>
      assertBalancedPerLocation([...dr(key("INTERCO_RECEIVABLE"), "COM", 100n), ...cr(key("INV"), "COM", 100n), ...dr(key("INV"), "LAN", 100n), ...cr(key("INTERCO_PAYABLE"), "LAN", 100n)]),
    ).not.toThrow();
  });
});
