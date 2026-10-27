import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { approveRun, createLoan, createRun, payRun, remitContributions, saveAttendance, saveEmployee, setSheetStatus, voidRun } from "@/domains/payroll/service";
import { datesBetween } from "@/domains/payroll/compute";
import { db, fixtures, glBalance, systemAccount, trialBalanceDifference, tx } from "./helpers";

let f: Awaited<ReturnType<typeof fixtures>>;
const actor = () => ({ id: f.owner.id });
let ana = "";
let ben = "";

beforeAll(async () => {
  f = await fixtures();
  ana = await tx((t) =>
    saveEmployee(t, { firstName: "Ana", lastName: "Payroll-Test", position: "Server", status: "ACTIVE", startDate: "2026-01-05", isMinimumWageEarner: true, homeLocationId: f.matina.id, rateType: "DAILY", rateCents: 60_000n, allowances: [{ name: "Rice", cents: 20_000n, taxable: false }] }, actor()),
  );
  ben = await tx((t) => saveEmployee(t, { firstName: "Ben", lastName: "Payroll-Test", position: "Manager", status: "ACTIVE", startDate: "2026-01-05", isMinimumWageEarner: false, homeLocationId: f.lanang.id, rateType: "MONTHLY", rateCents: 4_000_000n }, actor()));
});
afterAll(() => db.$disconnect());

/** Fills a cut-off: "P" every day except the codes given. */
function grid(start: string, end: string, codes: Record<string, string> = {}) {
  return Object.fromEntries(datesBetween(start, end).map((d) => [d, codes[d] ?? "P"]));
}

async function linesOf(runId: string, employeeId: string) {
  return db.payrollLine.findFirstOrThrow({ where: { runId, employeeId }, include: { items: true } });
}
const sum = (items: { code: string; amountCents: bigint; locationId: string }[], code: string, loc?: string) => items.filter((i) => i.code === code && (!loc || i.locationId === loc)).reduce((a, i) => a + i.amountCents, 0n);

describe("payroll", () => {
  let run1 = "";
  let run2 = "";

  it("first cut-off: DTR grid → run → GL split by where people worked", async () => {
    // Ana works at Matina, two days at Lanang (@LAN), one rest day, and 2h OT once.
    await tx((t) =>
      saveAttendance(t, { locationId: f.matina.id, periodStart: "2026-08-01", rows: [{ employeeId: ana, cells: grid("2026-08-01", "2026-08-15", { "2026-08-03": "R", "2026-08-10": "R", "2026-08-05": "P @LAN", "2026-08-06": "P @LAN OT2" }) }] }, actor()),
    );
    // Ben is monthly at Lanang: one absence.
    await tx((t) => saveAttendance(t, { locationId: f.lanang.id, periodStart: "2026-08-01", rows: [{ employeeId: ben, cells: grid("2026-08-01", "2026-08-15", { "2026-08-04": "A" }) }] }, actor()));
    await expect(tx((t) => createRun(t, { type: "REGULAR", periodStart: "2026-08-01", periodEnd: "2026-08-15", payDate: "2026-08-20" }, actor()))).rejects.toThrow(/Approve the DTR/);
    for (const s of await db.attendanceSheet.findMany({ where: { periodStart: new Date("2026-08-01T00:00:00Z") } })) await tx((t) => setSheetStatus(t, s.id, "APPROVED", actor()));

    run1 = await tx((t) => createRun(t, { type: "REGULAR", periodStart: "2026-08-01", periodEnd: "2026-08-15", payDate: "2026-08-20" }, actor()));
    const a = await linesOf(run1, ana);
    expect(Number(a.daysWorked)).toBe(13);
    expect(sum(a.items, "BASIC", f.matina.id)).toBe(11n * 60_000n);
    expect(sum(a.items, "BASIC", f.lanang.id)).toBe(2n * 60_000n);
    expect(sum(a.items, "OT", f.lanang.id)).toBe(18_750n);
    // No contributions on the first cut-off; minimum wage earner pays no tax.
    expect(sum(a.items, "SSS_EE")).toBe(0n);
    expect(a.netCents).toBe(a.grossCents);

    const b = await linesOf(run1, ben);
    expect(sum(b.items, "BASIC")).toBe(2_000_000n);
    expect(sum(b.items, "ABSENCE")).toBeLessThan(0n);
    expect(sum(b.items, "WTAX")).toBeGreaterThan(0n);

    const lanBefore = await glBalance((await systemAccount("PAY_BASIC")).id, f.lanang.id);
    await tx((t) => approveRun(t, run1, actor()));
    const lanAfter = await glBalance((await systemAccount("PAY_BASIC")).id, f.lanang.id);
    // Lanang carries Ana's two days plus Ben's basic less his absence.
    expect(lanAfter - lanBefore).toBe(2n * 60_000n + sum(b.items, "BASIC") + sum(b.items, "ABSENCE"));
    const run = await db.payrollRun.findUniqueOrThrow({ where: { id: run1 } });
    expect(run.status).toBe("POSTED");
    const entryLines = await db.journalLine.findMany({ where: { entryId: run.journalEntryId! } });
    for (const loc of new Set(entryLines.map((l) => l.locationId))) {
      const mine = entryLines.filter((l) => l.locationId === loc);
      expect(mine.reduce((x, l) => x + l.debitCents - l.creditCents, 0n)).toBe(0n);
    }
    expect(await trialBalanceDifference()).toBe(0n);
  });

  it("second cut-off: holidays, monthly contributions, a cash advance, payment", async () => {
    await tx((t) => createLoan(t, { employeeId: ana, type: "CASH_ADVANCE", principalCents: 150_000n, perPayrollCents: 100_000n, startDate: "2026-08-17", moneyAccountId: f.locMoney(f.matina.id, "PETTY_CASH").id, locationId: f.matina.id }, actor()));
    // Aug 21 special non-working (worked), Aug 31 regular holiday (not worked).
    await tx((t) => saveAttendance(t, { locationId: f.matina.id, periodStart: "2026-08-16", rows: [{ employeeId: ana, cells: grid("2026-08-16", "2026-08-31", { "2026-08-17": "R", "2026-08-24": "R", "2026-08-31": "H" }) }] }, actor()));
    await tx((t) => saveAttendance(t, { locationId: f.lanang.id, periodStart: "2026-08-16", rows: [{ employeeId: ben, cells: grid("2026-08-16", "2026-08-31") }] }, actor()));
    for (const s of await db.attendanceSheet.findMany({ where: { periodStart: new Date("2026-08-16T00:00:00Z") } })) await tx((t) => setSheetStatus(t, s.id, "APPROVED", actor()));
    run2 = await tx((t) => createRun(t, { type: "REGULAR", periodStart: "2026-08-16", periodEnd: "2026-08-31", payDate: "2026-09-05" }, actor()));

    const a = await linesOf(run2, ana);
    expect(sum(a.items, "HOLIDAY")).toBe(18_000n); // +30% on Aug 21
    expect(sum(a.items, "BASIC")).toBe(14n * 60_000n); // 13 days worked + Aug 31 paid holiday
    expect(sum(a.items, "SSS_EE")).toBeGreaterThan(0n);
    expect(sum(a.items, "PHIC_EE")).toBeGreaterThan(0n);
    expect(sum(a.items, "HDMF_EE")).toBe(20_000n);
    expect(sum(a.items, "LOAN")).toBe(100_000n);

    await tx((t) => approveRun(t, run2, actor()));
    const loan = await db.employeeLoan.findFirstOrThrow({ where: { employeeId: ana } });
    expect(loan.balanceCents).toBe(50_000n);

    const payable = await systemAccount("SALARIES_PAYABLE");
    const before = await glBalance(payable.id);
    await tx((t) => payRun(t, run2, { moneyAccountId: f.money("BPI Bank").id, date: "2026-09-05" }, actor()));
    const after = await glBalance(payable.id);
    const net = (await db.payrollLine.findMany({ where: { runId: run2 } })).reduce((x, l) => x + l.netCents, 0n);
    expect(after - before).toBe(net);

    // Remit SSS for August: clears what the run booked.
    const sss = await systemAccount("SSS_PAYABLE");
    const owed = -(await glBalance(sss.id));
    await tx((t) => remitContributions(t, { kind: "SSS", month: "2026-08", amountCents: owed, moneyAccountId: f.money("BPI Bank").id, date: "2026-09-10", reference: "SBR123" }, actor()));
    expect(await glBalance(sss.id)).toBe(0n);
    expect(await trialBalanceDifference()).toBe(0n);
  });

  it("13th month releases what was accrued", async () => {
    const accrued = await systemAccount("ACCRUED_13TH_MONTH");
    const accruedBefore = -(await glBalance(accrued.id));
    expect(accruedBefore).toBeGreaterThan(0n);
    const id = await tx((t) => createRun(t, { type: "THIRTEENTH_MONTH", periodStart: "2026-01-01", periodEnd: "2026-12-31", payDate: "2026-12-15" }, actor()));
    const lines = await db.payrollLine.findMany({ where: { runId: id }, include: { items: true } });
    const basicA = (await db.payrollLineItem.findMany({ where: { code: { in: ["BASIC", "LATE_UT", "ABSENCE"] }, line: { employeeId: ana, run: { status: "POSTED" } } } })).reduce((x, i) => x + i.amountCents, 0n);
    expect(lines.find((l) => l.employeeId === ana)!.grossCents).toBe((basicA + 6n) / 12n);
    await tx((t) => approveRun(t, id, actor()));
    // Only our two employees accrued in this database slice → accrual is used up (within rounding).
    const left = -(await glBalance(accrued.id));
    expect(left).toBeLessThan(accruedBefore);
    expect(await trialBalanceDifference()).toBe(0n);
  });

  it("voiding a paid run reverses pay and payment and restores the loan", async () => {
    await expect(tx((t) => voidRun(t, run2, actor(), "2026-10-26", "wrong DTR"))).rejects.toThrow(/13th month/);
    const thirteenth = await db.payrollRun.findFirstOrThrow({ where: { type: "THIRTEENTH_MONTH", status: "POSTED" } });
    await tx((t) => voidRun(t, thirteenth.id, actor(), "2026-10-26", "redo"));
    await tx((t) => voidRun(t, run2, actor(), "2026-10-26", "wrong DTR"));
    expect((await db.payrollRun.findUniqueOrThrow({ where: { id: run2 } })).status).toBe("VOIDED");
    expect((await db.employeeLoan.findFirstOrThrow({ where: { employeeId: ana } })).balanceCents).toBe(150_000n);
    expect(await trialBalanceDifference()).toBe(0n);
    // The cut-off can be run again.
    const again = await tx((t) => createRun(t, { type: "REGULAR", periodStart: "2026-08-16", periodEnd: "2026-08-31", payDate: "2026-09-05" }, actor()));
    expect(again).toBeTruthy();
  });
});
