import { describe, expect, it } from "vitest";
import { ACCOUNTS, ACCOUNT_GROUPS, MONEY_ACCOUNT_PARENT, accountTypeForGroup } from "@/domains/ledger/coa-template";
import { nextChildCode } from "@/domains/cash/money-accounts";
import { toCsv } from "@/lib/csv";
import { formatBusinessDate, manilaDateString, manilaDayStart, toDbDate } from "@/lib/dates";
import { DEFAULT_ROLES, OWNER_ONLY } from "@/server/auth/permissions";

describe("chart of accounts template", () => {
  it("has unique codes and system keys", () => {
    const codes = ACCOUNTS.map((a) => a.code);
    expect(new Set(codes).size).toBe(codes.length);
    const keys = ACCOUNTS.flatMap((a) => (a.systemKey ? [a.systemKey] : []));
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("references only existing groups and earlier parents", () => {
    const groups = new Set(ACCOUNT_GROUPS.map((g) => g.code));
    const seen = new Set<string>();
    for (const a of ACCOUNTS) {
      expect(groups.has(a.group), a.code).toBe(true);
      if (a.parent) expect(seen.has(a.parent), `${a.code} parent ${a.parent}`).toBe(true);
      seen.add(a.code);
    }
  });

  it("has a header account for every money account kind", () => {
    const headerKeys = new Set(ACCOUNTS.filter((a) => a.header).map((a) => a.systemKey));
    for (const key of Object.values(MONEY_ACCOUNT_PARENT)) expect(headerKeys.has(key)).toBe(true);
  });

  it("types accounts from their statement section", () => {
    expect(accountTypeForGroup("CASH")).toBe("ASSET");
    expect(accountTypeForGroup("CURRENT_LIABILITIES")).toBe("LIABILITY");
    expect(accountTypeForGroup("CONTRA_REVENUE")).toBe("REVENUE");
    expect(accountTypeForGroup("COGS")).toBe("EXPENSE");
  });

  it("marks inter-location accounts for elimination", () => {
    const interco = ACCOUNTS.filter((a) => a.isIntercompany).map((a) => a.systemKey);
    expect(interco).toEqual(expect.arrayContaining(["INTERCO_RECEIVABLE", "INTERCO_PAYABLE"]));
  });
});

describe("default roles", () => {
  it("never give owner-only permissions to non-owner roles", () => {
    for (const role of DEFAULT_ROLES.filter((r) => r.key !== "owner")) {
      for (const p of role.permissions) expect(OWNER_ONLY.has(p), `${role.key}: ${p}`).toBe(false);
    }
  });

  it("keep cashiers away from profit, payroll and other branches' reports", () => {
    const cashier = DEFAULT_ROLES.find((r) => r.key === "cashier")!;
    expect(cashier.permissions.some((p) => p.startsWith("reports:") || p.startsWith("payroll:") || p === "dashboard:view")).toBe(false);
  });
});

describe("helpers", () => {
  it("numbers money-account sub-accounts under their header", () => {
    expect(nextChildCode("1040", [])).toBe("1040-01");
    expect(nextChildCode("1040", ["1040-01", "1040-03", "1050-07"])).toBe("1040-04");
  });

  it("writes safe CSV", () => {
    expect(toCsv([["a", 'say "hi"', "x,y"], [1, null, "-12.30"]])).toBe('a,"say ""hi""","x,y"\r\n1,,-12.30');
    expect(toCsv([["=SUM(A1)", "@cmd", "+1"]])).toBe("'=SUM(A1),'@cmd,'+1");
  });

  it("handles Manila business dates", () => {
    // 11:30 PM UTC Oct 25 is already Oct 26 in Manila.
    expect(manilaDateString(new Date("2026-10-25T23:30:00Z"))).toBe("2026-10-26");
    expect(manilaDayStart("2026-10-26").toISOString()).toBe("2026-10-25T16:00:00.000Z");
    expect(formatBusinessDate(toDbDate("2026-01-05"))).toBe("Jan 05, 2026");
  });
});
