import { describe, expect, it } from "vitest";
import { bracketAmount, computePayslip, cutoffOf, dayMultiplierBp, defaultPayDate, type PayslipInput } from "@/domains/payroll/compute";
import { formatDtrCell, fromTimes, parseDtrCell, type DtrDay } from "@/domains/payroll/dtr";
import { DEFAULT_TABLES } from "@/domains/payroll/tables";

const table = (kind: string) => DEFAULT_TABLES.find((t) => t.kind === kind)!.brackets;
const schedule = { start: "10:00", end: "19:00", graceMinutes: 0, otMinimumMinutes: 30 };
const MAT = "mat";
const LAN = "lan";

function day(date: string, status: PayslipInput["days"][number]["status"] = "PRESENT", extra: Partial<PayslipInput["days"][number]> = {}) {
  return { date, locationId: MAT, status, lateMinutes: 0, undertimeMinutes: 0, otMinutes: 0, nightDiffMinutes: 0, isRestDayWork: false, ...extra };
}
const base = (over: Partial<PayslipInput>): PayslipInput => ({
  isMinimumWageEarner: true,
  rateType: "DAILY",
  rateCents: 60_000n,
  daysPerYear: 313,
  allowances: [],
  homeLocationId: MAT,
  days: [],
  holidays: new Map(),
  contributions: null,
  withholding: table("WITHHOLDING_TAX"),
  loans: [],
  ...over,
});
const sumCode = (p: ReturnType<typeof computePayslip>, code: string, loc?: string) => p.items.filter((i) => i.code === code && (!loc || i.locationId === loc)).reduce((a, i) => a + i.amountCents, 0n);

describe("DTR codes", () => {
  it("parses statuses and modifiers", () => {
    expect(parseDtrCell("p lt15 ot2", schedule)).toMatchObject({ status: "PRESENT", lateMinutes: 15, otMinutes: 120 });
    expect(parseDtrCell("RW OT1.5 @LAN", schedule)).toMatchObject({ status: "PRESENT", isRestDayWork: true, otMinutes: 90, locationCode: "LAN" });
    expect(parseDtrCell("LU", schedule)).toMatchObject({ status: "LEAVE_UNPAID" });
    expect(parseDtrCell("", schedule)).toBeNull();
    expect(parseDtrCell("X", schedule)).toHaveProperty("error");
    expect(parseDtrCell("A OT2", schedule)).toHaveProperty("error");
  });

  it("computes late, undertime, OT blocks and night differential from times", () => {
    expect(fromTimes("10:20", "19:00", schedule)).toEqual({ lateMinutes: 20, undertimeMinutes: 0, otMinutes: 0, nightDiffMinutes: 0 });
    expect(fromTimes("10:00", "18:30", schedule)).toMatchObject({ undertimeMinutes: 30 });
    // 19:00 → 23:20 = 260 min over: 8 blocks of 30 = 240 min OT; 22:00–23:00 night diff.
    expect(fromTimes("10:00", "23:20", schedule)).toEqual({ lateMinutes: 0, undertimeMinutes: 0, otMinutes: 240, nightDiffMinutes: 60 });
    expect(fromTimes("10:00", "19:20", schedule).otMinutes).toBe(0);
    expect(fromTimes("16:00", "01:00", { ...schedule, start: "16:00", end: "01:00" })).toMatchObject({ nightDiffMinutes: 180 });
  });

  it("round-trips the grid code", () => {
    const d = parseDtrCell("P LT15 OT2 @LAN", schedule) as DtrDay;
    expect(formatDtrCell(d, "MAT")).toBe("P LT15 OT2 @LAN");
    expect(formatDtrCell(parseDtrCell("10:05-19:00", schedule) as DtrDay)).toBe("10:05-19:00");
  });
});

describe("government tables", () => {
  it("SSS by monthly salary credit", () => {
    expect(bracketAmount(table("SSS"), 1_400_000n)).toEqual({ ee: 70_000n, er: 140_000n, ec: 1_000n });
    expect(bracketAmount(table("SSS"), 300_000n)).toEqual({ ee: 25_000n, er: 50_000n, ec: 1_000n });
    expect(bracketAmount(table("SSS"), 5_000_000n)).toEqual({ ee: 175_000n, er: 350_000n, ec: 3_000n });
  });
  it("PhilHealth 5% between the floor and ceiling, Pag-IBIG capped", () => {
    expect(bracketAmount(table("PHILHEALTH"), 800_000n)).toMatchObject({ ee: 25_000n, er: 25_000n });
    expect(bracketAmount(table("PHILHEALTH"), 2_000_000n)).toMatchObject({ ee: 50_000n, er: 50_000n });
    expect(bracketAmount(table("PAGIBIG"), 1_500_000n)).toMatchObject({ ee: 20_000n, er: 20_000n });
    expect(bracketAmount(table("PAGIBIG"), 100_000n)).toMatchObject({ ee: 1_000n, er: 2_000n });
  });
  it("TRAIN semi-monthly withholding", () => {
    expect(bracketAmount(table("WITHHOLDING_TAX"), 1_000_000n).ee).toBe(0n);
    expect(bracketAmount(table("WITHHOLDING_TAX"), 2_000_000n).ee).toBe(93_750n + 66_660n);
  });
});

describe("payslip", () => {
  it("pays holidays, OT and late correctly for a daily-paid minimum wage earner", () => {
    const holidays = new Map([
      ["2026-11-30|mat", "REGULAR" as const],
      ["2026-11-01|mat", "SPECIAL_NON_WORKING" as const],
    ]);
    const p = computePayslip(
      base({
        holidays,
        days: [
          day("2026-11-16", "PRESENT", { otMinutes: 120 }),
          day("2026-11-17", "PRESENT", { lateMinutes: 15 }),
          day("2026-11-18", "REST_DAY"),
          day("2026-11-19", "PRESENT", { isRestDayWork: true }),
          day("2026-11-20", "ABSENT"),
          day("2026-11-30", "PRESENT"),
        ],
      }),
    );
    // Basic: 4 days × ₱600; holiday +100%; rest day +30%; OT 2h × ₱75 × 125%; late 15 min × ₱1.25.
    expect(sumCode(p, "BASIC")).toBe(240_000n);
    expect(sumCode(p, "HOLIDAY")).toBe(60_000n);
    expect(sumCode(p, "RESTDAY")).toBe(18_000n);
    expect(sumCode(p, "OT")).toBe(18_750n);
    expect(sumCode(p, "LATE_UT")).toBe(-1_875n);
    expect(p.grossCents).toBe(240_000n + 60_000n + 18_000n + 18_750n - 1_875n);
    expect(sumCode(p, "WTAX")).toBe(0n);
    expect(p.daysWorked).toBe(4);
    expect(p.netCents).toBe(p.grossCents);
  });

  it("pays a regular holiday not worked, but not a special day", () => {
    const holidays = new Map([
      ["2026-11-30|mat", "REGULAR" as const],
      ["2026-11-01|mat", "SPECIAL_NON_WORKING" as const],
    ]);
    const p = computePayslip(base({ holidays, days: [day("2026-11-30", "HOLIDAY_OFF"), day("2026-11-01", "HOLIDAY_OFF")] }));
    expect(sumCode(p, "BASIC")).toBe(60_000n);
    expect(dayMultiplierBp("SPECIAL_NON_WORKING", true)).toBe(15_000);
    expect(dayMultiplierBp("REGULAR", true)).toBe(26_000);
  });

  it("splits labor cost by where the employee worked", () => {
    const p = computePayslip(base({ days: [day("2026-11-02"), day("2026-11-03"), day("2026-11-04", "PRESENT", { locationId: LAN })], allowances: [{ name: "Rice", cents: 30_000n, taxable: false }] }));
    expect(sumCode(p, "BASIC", MAT)).toBe(120_000n);
    expect(sumCode(p, "BASIC", LAN)).toBe(60_000n);
    expect(sumCode(p, "ALLOWANCE", MAT)).toBe(20_000n);
    expect(sumCode(p, "ALLOWANCE", LAN)).toBe(10_000n);
    // Each location's earnings − deductions add up to that location's net.
    const net = (loc: string) => p.items.filter((i) => i.locationId === loc).reduce((a, i) => a + (i.kind === "EARNING" ? i.amountCents : i.kind === "DEDUCTION" ? -i.amountCents : 0n), 0n);
    expect(net(MAT) + net(LAN)).toBe(p.netCents);
  });

  it("deducts monthly contributions and tax on the second cut-off, then loans without going below zero", () => {
    const p = computePayslip(
      base({
        isMinimumWageEarner: false,
        rateType: "MONTHLY",
        rateCents: 4_000_000n,
        days: [day("2026-11-16"), day("2026-11-17", "ABSENT")],
        contributions: { monthToDateGrossCents: 2_000_000n, monthToDateBasicCents: 2_000_000n, sss: table("SSS"), philhealth: table("PHILHEALTH"), pagibig: table("PAGIBIG") },
        loans: [{ id: "l1", type: "CASH_ADVANCE", perPayrollCents: 100_000_000n, balanceCents: 100_000_000n }],
      }),
    );
    const daily = (4_000_000n * 12n * 2n + 313n) / (2n * 313n);
    expect(p.dailyRateCents).toBe(daily);
    expect(sumCode(p, "BASIC")).toBe(2_000_000n);
    expect(sumCode(p, "ABSENCE")).toBe(-daily);
    expect(sumCode(p, "SSS_EE")).toBe(175_000n);
    expect(sumCode(p, "PHIC_EE")).toBeGreaterThan(0n);
    expect(sumCode(p, "HDMF_EE")).toBe(20_000n);
    expect(sumCode(p, "WTAX")).toBeGreaterThan(0n);
    expect(p.netCents).toBe(0n);
    expect(p.notes.some((n) => n.includes("Cash advance"))).toBe(true);
    expect(sumCode(p, "ACCRUAL_13TH")).toBe((2_000_000n - daily + 6n) / 12n);
  });
});

describe("cut-offs", () => {
  it("splits the month at the 15th and sets pay dates", () => {
    expect(cutoffOf("2026-02-20")).toEqual({ start: "2026-02-16", end: "2026-02-28", half: 2 });
    expect(defaultPayDate(cutoffOf("2026-02-03"), 20, 5)).toBe("2026-02-20");
    expect(defaultPayDate(cutoffOf("2026-12-20"), 20, 5)).toBe("2027-01-05");
  });
});
