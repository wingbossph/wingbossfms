import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { detectKind, isSplitPayment, parseLoyverseCsv } from "@/domains/sales/loyverse/parse";
import { parseLocalDateTime } from "@/lib/csv-parse";

const fixture = (name: string) => readFileSync(new URL(`../fixtures/${name}`, import.meta.url), "utf8");

describe("Loyverse CSV parsing", () => {
  it("detects export kinds from headers", () => {
    expect(detectKind(["Date", "Receipt number", "Item", "Quantity", "Gross sales"])).toBe("RECEIPTS_BY_ITEM");
    expect(detectKind(["Date", "Receipt number", "Payment type", "Net sales"])).toBe("RECEIPTS");
    expect(detectKind(["Payment type", "Payment transactions", "Payment amount", "Refund amount", "Net amount"])).toBe("SALES_BY_PAYMENT_TYPE");
    expect(detectKind(["Item", "SKU", "Items sold", "Gross sales", "Net sales"])).toBe("SALES_BY_ITEM");
    expect(detectKind(["Date", "Gross sales", "Refunds", "Discounts", "Net sales"])).toBe("SALES_SUMMARY");
    expect(detectKind(["foo", "bar"])).toBeNull();
  });

  it("groups item rows into receipts with Manila business dates", () => {
    const r = parseLoyverseCsv(fixture("loyverse-receipts-by-item.csv"));
    if ("error" in r) throw new Error(r.error);
    expect(r.kind).toBe("RECEIPTS_BY_ITEM");
    expect(r.errors).toEqual([]);
    expect(r.receipts).toHaveLength(4);
    const first = r.receipts.find((x) => x.receiptNumber === "1-1001")!;
    expect(first.lines).toHaveLength(2);
    expect(first.grossCents).toBe(119600n);
    expect(first.businessDate).toBe("2026-10-20");
    const barkada = r.receipts.find((x) => x.receiptNumber === "1-1002")!;
    expect(barkada.discountCents).toBe(17960n);
    expect(barkada.lines[0]).toMatchObject({ itemName: "UW Barkada", variantName: "Set of 4", qty: "1" });
    const refund = r.receipts.find((x) => x.receiptNumber === "1-1003")!;
    expect(refund.isRefund).toBe(true);
    expect(refund.netCents).toBe(9900n);
    // 12:10 AM on Oct 21 belongs to Oct 21.
    expect(r.receipts.find((x) => x.receiptNumber === "1-1004")!.businessDate).toBe("2026-10-21");
    expect(r.stores).toEqual(["Wingboss Lanang"]);
  });

  it("reads payment types from the Receipts export", () => {
    const r = parseLoyverseCsv(fixture("loyverse-receipts.csv"));
    if ("error" in r) throw new Error(r.error);
    expect(r.kind).toBe("RECEIPTS");
    expect(r.receipts.map((x) => x.paymentType)).toEqual(["Cash", "GCash", "Cash", "Maya Card"]);
    expect(r.receipts[0].lines).toEqual([]);
  });

  it("reports unreadable rows instead of failing", () => {
    const r = parseLoyverseCsv("Date,Receipt number,Net sales\nnot a date,9,10.00\n10/20/2026 1:00 PM,10,abc\n");
    if ("error" in r) throw new Error(r.error);
    expect(r.receipts).toHaveLength(0);
    expect(r.errors).toHaveLength(2);
  });

  it("parses common date formats as Manila time", () => {
    expect(parseLocalDateTime("2026-10-26 19:45")?.toISOString()).toBe("2026-10-26T11:45:00.000Z");
    expect(parseLocalDateTime("10/26/26 7:45 PM")?.toISOString()).toBe("2026-10-26T11:45:00.000Z");
    expect(parseLocalDateTime("26/10/2026 19:45", "DMY")?.toISOString()).toBe("2026-10-26T11:45:00.000Z");
    expect(parseLocalDateTime("12/01/2026 12:05 AM")?.toISOString()).toBe("2026-11-30T16:05:00.000Z");
    expect(parseLocalDateTime("13/45/2026")).toBeNull();
  });

  it("flags split payments", () => {
    expect(isSplitPayment("Cash, GCash")).toBe(true);
    expect(isSplitPayment("Maya Card")).toBe(false);
  });
});
