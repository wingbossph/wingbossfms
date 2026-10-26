import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { openDraft, saveDraft, submitReport } from "@/domains/sales/service";
import { kpis, moneyIn, presetRange, comparisonRange } from "@/domains/dashboard/metrics";
import { dailySalesDoc, salesByChannelDoc } from "@/domains/reports/sales-reports";
import { breakEvenDoc, budgetVsActualDoc } from "@/domains/reports/expense-reports";
import { db, fixtures, tx, ymd } from "./helpers";

let f: Awaited<ReturnType<typeof fixtures>>;
const day = ymd(200);
const scope = () => ({ ids: [f.matina.id], locations: [{ id: f.matina.id, name: f.matina.name, type: "BRANCH" }], label: "Matina" });

beforeAll(async () => {
  f = await fixtures();
  const r = await tx((t) => openDraft(t, { locationId: f.matina.id, ymd: day, shiftNo: 9, userId: f.owner.id }));
  await tx((t) =>
    saveDraft(
      t,
      {
        reportId: r.id,
        lines: [],
        discounts: [],
        voids: [],
        serviceCharge: 0n,
        payments: [
          { channelId: f.channel("Cash").id, amount: 500_000n, reference: "" },
          { channelId: f.channel("GCash 2").id, amount: 300_000n, reference: "" },
          { channelId: f.channel("GCash 1").id, amount: 100_000n, reference: "" },
          { channelId: f.channel("Maya Card").id, amount: 100_000n, reference: "" },
        ],
        mismatchExplanation: "Dashboard test day",
      },
      f.owner.id,
    ),
  );
  await tx((t) => submitReport(t, r.id, f.owner.id));
});
afterAll(() => db.$disconnect());

describe("dashboard (acceptance #4: money in by channel)", () => {
  it("splits money in by channel, flags personal GCash, and ties to the sales reports", async () => {
    const m = await moneyIn([f.matina.id], { from: day, to: day });
    const b = (name: string) => m.buckets.find((x) => x.name === name)!;
    expect(m.total).toBe(1_000_000n);
    expect(b("Cash drawer").cents).toBe(500_000n);
    expect(b("Personal GCash").cents).toBe(300_000n);
    expect(b("GCash (business)").cents).toBe(100_000n);
    expect(b("Card terminal").cents).toBe(100_000n);
    expect(b("Personal GCash").pct).toBe(30);
    // Default alert threshold is 30%: exactly 30% is not over it.
    expect(m.personalAlert).toBe(false);
    expect(m.pendingSettlements).toBeGreaterThan(0n);

    const doc = await salesByChannelDoc(scope(), day, day);
    expect(doc.rows.at(-1)!.cells.total).toBe(1_000_000n);
  });

  it("KPIs and the daily sales report compute for a payments-only day", async () => {
    const k = await kpis([f.matina.id], { from: day, to: day });
    const daily = await dailySalesDoc(scope(), day, day);
    // No products were sold, so net sales are zero and the payments sit in cash over/short.
    expect(daily.rows.at(-1)!.cells.net).toBe(0n);
    expect(k.pax).toBe(0);
    expect(typeof k.cashAndBanks).toBe("bigint");
  });

  it("date presets and comparison periods", () => {
    expect(presetRange("week", "2026-10-28")).toEqual({ from: "2026-10-26", to: "2026-10-28" });
    expect(presetRange("month", "2026-10-28")).toEqual({ from: "2026-10-01", to: "2026-10-28" });
    expect(comparisonRange({ from: "2026-10-01", to: "2026-10-10" }, "prev")).toEqual({ from: "2026-09-21", to: "2026-09-30" });
    expect(comparisonRange({ from: "2024-02-29", to: "2024-02-29" }, "yoy")).toEqual({ from: "2023-02-28", to: "2023-02-28" });
  });

  it("emails go to the local outbox when no Resend key is set", async () => {
    const { sendEmail, emailHtml } = await import("@/server/email");
    const html = emailHtml("Sales for <today>", [["Net sales", "₱1,000.00"]], { text: "Open", href: "https://example.com" });
    expect(html).toContain("Sales for &lt;today&gt;");
    const res = await sendEmail({ to: ["owner@example.com"], subject: "Test summary", html, attachments: [{ filename: "a.pdf", content: Buffer.from("x") }] });
    expect(res.sent).toBe(false);
    expect(res.file).toMatch(/outbox/);
  });

  it("budget vs actual and break-even build", async () => {
    const acct = await db.account.findFirstOrThrow({ where: { systemKey: "MDR_FEES" } });
    const [y, mo] = day.split("-").map(Number);
    await db.budgetLine.create({ data: { year: y, month: mo, locationId: f.matina.id, accountId: acct.id, amountCents: 50_000n } });
    const doc = await budgetVsActualDoc(scope(), day, day);
    const row = doc.rows.find((r) => String(r.cells.account).includes("MDR"));
    expect(row?.cells.budget).toBe(50_000n);
    const be = await breakEvenDoc(scope(), day, day);
    expect(be.rows).toHaveLength(1);
  });
});
