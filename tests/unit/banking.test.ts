import { describe, expect, it } from "vitest";
import { guessConfig, parseStatement, parseStatementAmount, parseStatementDate, dedupeHashes } from "@/domains/banking/formats";
import { autoMatch, matchSettlements } from "@/domains/banking/match";

describe("statement parsing", () => {
  it("reads dates in common bank formats", () => {
    expect(parseStatementDate("10/26/2026", "MDY")).toBe("2026-10-26");
    expect(parseStatementDate("26/10/2026", "DMY")).toBe("2026-10-26");
    expect(parseStatementDate("2026-10-26 14:03:11", "MDY")).toBe("2026-10-26");
    expect(parseStatementDate("Oct 26, 2026", "MDY")).toBe("2026-10-26");
    expect(parseStatementDate("26 Sept 2026", "MDY")).toBe("2026-09-26");
    expect(parseStatementDate("02/30/2026", "MDY")).toBeNull();
    expect(parseStatementDate("Total", "MDY")).toBeNull();
  });

  it("reads amounts with symbols, brackets and DR/CR", () => {
    expect(parseStatementAmount("₱1,234.56")).toBe(123456n);
    expect(parseStatementAmount("PHP 50")).toBe(5000n);
    expect(parseStatementAmount("(12.30)")).toBe(-1230n);
    expect(parseStatementAmount("12.30 DR")).toBe(-1230n);
    expect(parseStatementAmount("")).toBeNull();
    expect(parseStatementAmount("abc")).toBe("invalid");
  });

  it("parses debit/credit columns, skips footers, and orders oldest first", () => {
    const table = [
      ["Date", "Particulars", "Withdrawals", "Deposits", "Balance"],
      ["10/03/2026", "Deposit", "", "5,000.00", "15,000.00"],
      ["10/02/2026", "ATM", "1,000.00", "", "10,000.00"],
      ["", "Total", "1,000.00", "5,000.00", ""],
    ];
    const config = guessConfig(table[0]);
    expect(config.columns).toMatchObject({ date: "Date", description: "Particulars", debit: "Withdrawals", credit: "Deposits", balance: "Balance" });
    const { lines, errors } = parseStatement(table, config);
    expect(errors).toEqual([]);
    expect(lines.map((l) => [l.txnDate, l.amountCents])).toEqual([
      ["2026-10-02", -100000n],
      ["2026-10-03", 500000n],
    ]);
  });

  it("fingerprints identical same-day lines separately", () => {
    const l = { lineNo: 1, txnDate: "2026-10-01", description: "Fee", reference: null, amountCents: -1000n, balanceCents: null };
    const [a, b] = dedupeHashes("acc", [l, { ...l, lineNo: 2 }]);
    expect(a).not.toBe(b);
    expect(dedupeHashes("acc", [l])[0]).toBe(a);
  });
});

describe("auto-match", () => {
  const s = (id: string, date: string, amountCents: bigint, description = "", reference: string | null = null) => ({ id, date, amountCents, description, reference });
  const b = (id: string, date: string, amountCents: bigint, text = "") => ({ id, date, amountCents, text });

  it("pairs equal amounts within the window, preferring the closer date and shared reference", () => {
    const out = autoMatch([s("s1", "2026-10-05", 1000n, "DEP", "DS7101")], [b("b1", "2026-10-02", 1000n), b("b2", "2026-10-04", 1000n, "slip DS7101"), b("b3", "2026-10-01", 1000n)]);
    expect(out).toEqual([{ statementLineIds: ["s1"], journalLineIds: ["b2"], score: 95 }]);
  });

  it("ignores amounts outside the date window", () => {
    expect(autoMatch([s("s1", "2026-10-10", 1000n)], [b("b1", "2026-10-01", 1000n)])).toEqual([]);
  });

  it("merges several statement lines into one book line and vice versa", () => {
    const out = autoMatch(
      [s("s1", "2026-10-05", 100n), s("s2", "2026-10-05", 250n), s("s3", "2026-10-07", 500n)],
      [b("b1", "2026-10-05", 350n), b("b2", "2026-10-06", 200n), b("b3", "2026-10-06", 300n)],
    );
    expect(out).toContainEqual({ statementLineIds: ["s1", "s2"], journalLineIds: ["b1"], score: 70 });
    expect(out).toContainEqual({ statementLineIds: ["s3"], journalLineIds: ["b2", "b3"], score: 60 });
  });

  it("matches a payout covering both card channels expected that day, within tolerance", () => {
    const c = (id: string, channelId: string, gross: bigint, net: bigint) => ({ id, channelId, institution: "Maya", expectedOn: "2026-10-06", businessDate: "2026-10-05", grossCents: gross, expectedNetCents: net });
    const out = matchSettlements([s("s1", "2026-10-06", 1_465_000n, "PAYMAYA SETTLEMENT")], [c("a", "card", 1_000_000n, 975_000n), c("b", "qr", 500_000n, 492_500n)]);
    expect(out).toHaveLength(1);
    expect(out[0].settlementIds.sort()).toEqual(["a", "b"]);
    expect(out[0].differenceCents).toBe(-2_500n);
    expect(matchSettlements([s("s1", "2026-10-06", 1_300_000n)], [c("a", "card", 1_000_000n, 975_000n), c("b", "qr", 500_000n, 492_500n)])).toEqual([]);
  });
});
