import { describe, expect, it } from "vitest";
import { apiToParse, type ApiReceipt } from "@/domains/sales/loyverse/api";

const sale: ApiReceipt = {
  receipt_number: "1-1001",
  receipt_type: "SALE",
  receipt_date: "2026-10-25T14:30:00.000Z", // 22:30 Manila
  created_at: "2026-10-25T14:30:05.000Z",
  employee_id: "e1",
  total_money: 950,
  total_discount: 50,
  line_items: [{ item_name: "Unlimited Wings", quantity: 2, gross_total_money: 1000, total_money: 950, total_discount: 50 }],
  payments: [
    { name: "Cash", money_amount: 500 },
    { name: "GCash 1", money_amount: 450 },
  ],
};

describe("Loyverse API → import", () => {
  it("maps receipts, split payments and Manila business dates; skips cancelled ones", () => {
    const p = apiToParse([sale, { ...sale, receipt_number: "1-1002", cancelled_at: "2026-10-25T15:00:00Z" }, { ...sale, receipt_number: "1-1003", receipt_type: "REFUND", receipt_date: "2026-10-25T16:30:00Z", payments: [{ name: "Cash", money_amount: 950 }] }], new Map([["e1", "Mika"]]));
    expect(p.kind).toBe("RECEIPTS_BY_ITEM");
    expect(p.receipts).toHaveLength(2);
    const [r, refund] = p.receipts;
    expect(r.businessDate).toBe("2026-10-25");
    expect(r.grossCents).toBe(100_000n);
    expect(r.discountCents).toBe(5_000n);
    expect(r.netCents).toBe(95_000n);
    expect(r.cashierName).toBe("Mika");
    expect(r.paymentType).toBe("Cash, GCash 1");
    expect(r.payments).toEqual([
      { name: "Cash", amountCents: "50000" },
      { name: "GCash 1", amountCents: "45000" },
    ]);
    expect(r.lines[0]).toMatchObject({ itemName: "Unlimited Wings", qty: "2", grossCents: 100_000n });
    // 00:30 Manila the next day.
    expect(refund.businessDate).toBe("2026-10-26");
    expect(refund.isRefund).toBe(true);
    expect(refund.payments).toBeUndefined();
  });
});
