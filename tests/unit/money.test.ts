import { describe, expect, it } from "vitest";
import { allocate, applyRateBp, formatPeso, parsePeso, sumCents } from "@/lib/money";

describe("money", () => {
  it("formats centavos as pesos", () => {
    expect(formatPeso(0n)).toBe("₱0.00");
    expect(formatPeso(123456n)).toBe("₱1,234.56");
    expect(formatPeso(-5000n)).toBe("-₱50.00");
    expect(formatPeso(123456789012n)).toBe("₱1,234,567,890.12");
    expect(formatPeso(5n, { symbol: false })).toBe("0.05");
  });

  it("parses user input to centavos", () => {
    expect(parsePeso("1,234.5")).toBe(123450n);
    expect(parsePeso("₱ 50")).toBe(5000n);
    expect(parsePeso("-12.30")).toBe(-1230n);
    expect(parsePeso("0.05")).toBe(5n);
    expect(parsePeso("12.345")).toBeNull();
    expect(parsePeso("abc")).toBeNull();
    expect(parsePeso("")).toBeNull();
  });

  it("applies basis-point rates with half-up rounding", () => {
    expect(applyRateBp(10000n, 2000)).toBe(2000n); // 20% of ₱100
    expect(applyRateBp(333n, 250)).toBe(8n); // 2.5% of ₱3.33 = 8.325c → 8c
    expect(applyRateBp(-333n, 1500)).toBe(-50n); // -49.95 → -50
  });

  it("allocates without losing a centavo", () => {
    const parts = allocate(10000n, [1, 1, 1]);
    expect(parts).toEqual([3334n, 3333n, 3333n]);
    expect(sumCents(parts)).toBe(10000n);
    expect(sumCents(allocate(-10001n, [0.5, 0.3, 0.2]))).toBe(-10001n);
    expect(allocate(100n, [0, 1])).toEqual([0n, 100n]);
  });
});
