import { describe, expect, it } from "vitest";
import { agingBucket, agingSummary, canApproveWith, nextRun, requiredApproval } from "@/domains/expenses/rules";

const rules = [{ minAmountCents: 500000n, requiredPermission: "expenses:approve:high", isActive: true, locationId: null }];

describe("expense rules", () => {
  it("routes ₱5,000 and up to the high approval", () => {
    expect(requiredApproval(499999n, "L", rules)).toBe("expenses:approve");
    expect(requiredApproval(500000n, "L", rules)).toBe("expenses:approve:high");
    expect(requiredApproval(900000n, "L", [{ ...rules[0], isActive: false }])).toBe("expenses:approve");
  });

  it("lets high approvers approve small expenses too", () => {
    expect(canApproveWith("expenses:approve", (p) => p === "expenses:approve:high")).toBe(true);
    expect(canApproveWith("expenses:approve:high", (p) => p === "expenses:approve")).toBe(false);
  });

  it("ages bills into buckets", () => {
    expect(agingBucket("2026-10-26", "2026-10-26")).toBe("current");
    expect(agingBucket("2026-10-01", "2026-10-26")).toBe("d1_30");
    expect(agingBucket("2026-09-01", "2026-10-26")).toBe("d31_60");
    expect(agingBucket("2026-07-01", "2026-10-26")).toBe("d60_plus");
    expect(agingSummary([{ dueYmd: "2026-10-01", balanceCents: 100n }, { dueYmd: "2026-11-01", balanceCents: 50n }], "2026-10-26")).toEqual({
      current: 50n,
      d1_30: 100n,
      d31_60: 0n,
      d60_plus: 0n,
    });
  });

  it("schedules recurring runs, safe at month end", () => {
    expect(nextRun("2026-01-31", "MONTHLY", 31)).toBe("2026-02-28");
    expect(nextRun("2026-02-28", "MONTHLY", 31)).toBe("2026-03-31");
    expect(nextRun("2026-10-05", "SEMI_MONTHLY", null)).toBe("2026-10-15");
    expect(nextRun("2026-10-15", "SEMI_MONTHLY", null)).toBe("2026-10-31");
    expect(nextRun("2026-10-31", "SEMI_MONTHLY", null)).toBe("2026-11-15");
    expect(nextRun("2026-10-26", "WEEKLY", null)).toBe("2026-11-02");
    expect(nextRun("2026-03-15", "QUARTERLY", 15)).toBe("2026-06-15");
    expect(nextRun("2026-02-28", "YEARLY", 28)).toBe("2027-02-28");
  });
});
