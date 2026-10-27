import { describe, expect, it } from "vitest";
import { fromMicro, fromQty4, issue, receive, toMicro, toQty4, unitCostOf, valueAt } from "@/domains/inventory/wac";

const empty = { qty4: 0n, valueCents: 0n, avgMicro: 0n };

describe("weighted-average cost", () => {
  it("converts quantities and costs exactly", () => {
    expect(toQty4("12.5")).toBe(125000n);
    expect(fromQty4(125000n)).toBe("12.5");
    expect(fromQty4(-5n)).toBe("-0.0005");
    expect(toMicro("24050.5")).toBe(24050500000n);
    expect(fromMicro(24050500000n)).toBe("24050.500000");
  });

  it("averages receipts and issues at the average", () => {
    // 10 kg at ₱240/kg, then 10 kg at ₱260/kg → ₱250/kg average.
    let b = receive(empty, toQty4("10"), 240000n);
    b = receive(b, toQty4("10"), 260000n);
    expect(b.valueCents).toBe(500000n);
    expect(b.avgMicro).toBe(toMicro("25000"));
    const out = issue(b, toQty4("4.5"));
    expect(out.valueCents).toBe(112500n);
    expect(out.balance.valueCents).toBe(387500n);
  });

  it("issuing everything leaves no residue", () => {
    const b = receive(empty, toQty4("3"), 100000n); // ₱333.33… each
    const out = issue(b, toQty4("3"));
    expect(out.valueCents).toBe(100000n);
    expect(out.balance).toMatchObject({ qty4: 0n, valueCents: 0n });
  });

  it("keeps value exact when stock was negative", () => {
    let b = receive(empty, toQty4("2"), 50000n);
    b = issue(b, toQty4("3")).balance; // −1 kg, value −₱250
    expect(b.qty4).toBe(-10000n);
    const value = b.valueCents;
    b = receive(b, toQty4("5"), 130000n);
    expect(b.valueCents).toBe(value + 130000n);
    expect(b.qty4).toBe(40000n);
  });

  it("rounds values to the centavo", () => {
    expect(valueAt(toQty4("0.333"), toMicro("100"))).toBe(33n);
    expect(unitCostOf(100n, toQty4("3"))).toBe(33333333n);
  });
});
