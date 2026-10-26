// Payslip computation for one employee and one cut-off. Pure: every input
// (rates, attendance, holidays, government tables, loans) is passed in, so
// the same function drives the run, the preview and the unit tests.
//
// PH premium rules (Labor Code, DOLE handbook) on the day's rate:
//   ordinary day 100% · rest day 130%
//   special non-working day 130% (150% on a rest day) · not worked: no pay
//   regular holiday 200% (260% on a rest day) · not worked: 100%
//   overtime +25% of the hourly rate on ordinary days, +30% of the day's
//   premium hourly rate on rest days/holidays · night shift +10%

import { allocate } from "@/lib/money";
import type { Bracket } from "./tables";
import type { DayStatus } from "./dtr";

export type HolidayType = "REGULAR" | "SPECIAL_NON_WORKING" | "SPECIAL_WORKING";
export type PayItemKind = "EARNING" | "DEDUCTION" | "EMPLOYER_SHARE";
export type PayItem = { kind: PayItemKind; code: string; description: string; amountCents: bigint; locationId: string; loanId?: string };

export type Allowance = { name: string; cents: bigint; taxable: boolean };

export type PayslipInput = {
  isMinimumWageEarner: boolean;
  rateType: "DAILY" | "MONTHLY";
  rateCents: bigint;
  daysPerYear: number;
  allowances: Allowance[];
  homeLocationId: string;
  days: {
    date: string;
    locationId: string;
    status: DayStatus;
    lateMinutes: number;
    undertimeMinutes: number;
    otMinutes: number;
    nightDiffMinutes: number;
    isRestDayWork: boolean;
  }[];
  /** Holiday type by "date|locationId" (national holidays are listed for every location). */
  holidays: Map<string, HolidayType>;
  /**
   * Contributions are deducted once a month, on the cut-off that ends the
   * month. `monthToDate` is what the employee earned in earlier posted
   * cut-offs of the same month (gross and basic).
   */
  contributions: null | {
    monthToDateGrossCents: bigint;
    monthToDateBasicCents: bigint;
    sss: Bracket[];
    philhealth: Bracket[];
    pagibig: Bracket[];
  };
  withholding: Bracket[];
  loans: { id: string; type: string; perPayrollCents: bigint; balanceCents: bigint }[];
  /** Service charge share per location for this cut-off (already computed). */
  serviceCharge?: { locationId: string; cents: bigint }[];
};

export type Payslip = {
  items: PayItem[];
  daysWorked: number;
  grossCents: bigint;
  basicCents: bigint;
  deductionsCents: bigint;
  netCents: bigint;
  employerCostCents: bigint;
  dailyRateCents: bigint;
  notes: string[];
};

const BP = 10_000n;
const div = (a: bigint, b: bigint) => {
  // Round half away from zero.
  const q = (a * 2n + (a >= 0n ? b : -b)) / (2n * b);
  return q;
};

export function dailyRate(rateType: "DAILY" | "MONTHLY", rateCents: bigint, daysPerYear: number) {
  return rateType === "DAILY" ? rateCents : div(rateCents * 12n, BigInt(daysPerYear));
}

/** Multiplier in basis points for work on a day (10000 = 100%). */
export function dayMultiplierBp(holiday: HolidayType | undefined, restDay: boolean): number {
  if (holiday === "REGULAR") return restDay ? 26_000 : 20_000;
  if (holiday === "SPECIAL_NON_WORKING") return restDay ? 15_000 : 13_000;
  return restDay ? 13_000 : 10_000;
}

/** Applies a government bracket table to a base amount. */
export function bracketAmount(brackets: readonly Bracket[], baseCents: bigint) {
  const b = brackets.find((x) => baseCents >= x.minCents && (x.maxCents === null || baseCents <= x.maxCents));
  if (!b) return { ee: 0n, er: 0n, ec: 0n };
  const over = baseCents - (b.excessOverCents ?? 0n);
  const rate = (bp: number | undefined) => (bp ? div(over * BigInt(bp), BP) : 0n);
  return { ee: (b.eeFixedCents ?? 0n) + rate(b.eeRateBp), er: (b.erFixedCents ?? 0n) + rate(b.erRateBp), ec: b.ecFixedCents ?? 0n };
}

export function computePayslip(input: PayslipInput): Payslip {
  const daily = dailyRate(input.rateType, input.rateCents, input.daysPerYear);
  const perMinute = (minutes: number, bp: number) => div(daily * BigInt(minutes) * BigInt(bp), 480n * BP);
  const earn = new Map<string, PayItem>();
  const notes: string[] = [];
  const add = (code: string, description: string, locationId: string, cents: bigint) => {
    if (cents === 0n) return;
    const k = `${code}|${locationId}`;
    const cur = earn.get(k);
    if (cur) cur.amountCents += cents;
    else earn.set(k, { kind: "EARNING", code, description, amountCents: cents, locationId });
  };

  // Days counted for the location split and "days worked".
  const presence = new Map<string, number>();
  let daysWorked = 0;
  for (const d of input.days) {
    const hol = input.holidays.get(`${d.date}|${d.locationId}`);
    const holiday = hol === "SPECIAL_WORKING" ? undefined : hol;
    const L = d.locationId;
    if (d.status === "PRESENT") {
      daysWorked++;
      presence.set(L, (presence.get(L) ?? 0) + 1);
      const m = dayMultiplierBp(holiday, d.isRestDayWork);
      if (input.rateType === "DAILY") {
        add("BASIC", "Basic pay", L, daily);
        const premium = div(daily * BigInt(m - 10_000), BP);
        if (premium) add(holiday ? "HOLIDAY" : "RESTDAY", holiday ? "Holiday premium" : "Rest day premium", L, premium);
      } else {
        // Monthly pay already covers the ordinary day (and paid holidays); rest-day work is extra in full.
        const covered = d.isRestDayWork ? 0 : 10_000;
        const premium = div(daily * BigInt(m - covered), BP);
        if (premium) add(holiday ? "HOLIDAY" : "RESTDAY", holiday ? "Holiday premium" : "Rest day pay", L, premium);
      }
      const lost = d.lateMinutes + d.undertimeMinutes;
      if (lost) add("LATE_UT", "Late / undertime", L, -perMinute(lost, m));
      if (d.otMinutes) {
        const otBp = holiday || d.isRestDayWork ? Math.round((m * 13_000) / 10_000) : 12_500;
        add("OT", "Overtime", L, perMinute(d.otMinutes, otBp));
      }
      if (d.nightDiffMinutes) add("ND", "Night differential", L, perMinute(d.nightDiffMinutes, Math.round(m / 10)));
    } else if (d.status === "LEAVE_PAID") {
      presence.set(L, (presence.get(L) ?? 0) + 1);
      if (input.rateType === "DAILY") add("BASIC", "Basic pay", L, daily);
    } else if (d.status === "HOLIDAY_OFF") {
      if (input.rateType === "DAILY" && holiday === "REGULAR") add("BASIC", "Regular holiday (not worked)", L, daily);
    } else if ((d.status === "ABSENT" || d.status === "LEAVE_UNPAID") && input.rateType === "MONTHLY") {
      add("ABSENCE", "Absences", L, -daily);
    }
  }

  // Location weights: days present (incl. paid leave); fall back to the home location.
  const locs = presence.size ? [...presence.keys()] : [input.homeLocationId];
  const weights = presence.size ? locs.map((l) => presence.get(l)!) : [1];
  const split = (cents: bigint) => allocate(cents, weights).map((amount, i) => ({ locationId: locs[i], amount }));

  if (input.rateType === "MONTHLY") {
    for (const s of split(div(input.rateCents, 2n))) add("BASIC", "Basic pay (semi-monthly)", s.locationId, s.amount);
  }
  if (daysWorked > 0 || input.rateType === "MONTHLY") {
    for (const a of input.allowances) for (const s of split(a.cents)) add(a.taxable ? "ALLOWANCE_TX" : "ALLOWANCE", a.name, s.locationId, s.amount);
  }
  for (const sc of input.serviceCharge ?? []) add("SERVICE_CHARGE", "Service charge share", sc.locationId, sc.cents);

  const earnings = [...earn.values()].filter((i) => i.amountCents !== 0n);
  const gross = earnings.reduce((a, i) => a + i.amountCents, 0n);
  const basic = earnings.filter((i) => ["BASIC", "LATE_UT", "ABSENCE"].includes(i.code)).reduce((a, i) => a + i.amountCents, 0n);
  const nonTaxable = earnings.filter((i) => i.code === "ALLOWANCE").reduce((a, i) => a + i.amountCents, 0n);

  // Employee-level deductions and employer shares, then split by where the gross was earned.
  const empLevel: { kind: PayItemKind; code: string; description: string; cents: bigint; loanId?: string }[] = [];
  let eeContrib = 0n;
  if (input.contributions) {
    const c = input.contributions;
    const monthGross = c.monthToDateGrossCents + gross;
    const monthBasic = c.monthToDateBasicCents + basic;
    const sss = bracketAmount(c.sss, monthGross);
    const phic = bracketAmount(c.philhealth, monthBasic);
    const hdmf = bracketAmount(c.pagibig, monthGross);
    empLevel.push(
      { kind: "DEDUCTION", code: "SSS_EE", description: "SSS", cents: sss.ee },
      { kind: "DEDUCTION", code: "PHIC_EE", description: "PhilHealth", cents: phic.ee },
      { kind: "DEDUCTION", code: "HDMF_EE", description: "Pag-IBIG", cents: hdmf.ee },
      { kind: "EMPLOYER_SHARE", code: "SSS_ER", description: "SSS employer share", cents: sss.er },
      { kind: "EMPLOYER_SHARE", code: "SSS_EC", description: "SSS EC", cents: sss.ec },
      { kind: "EMPLOYER_SHARE", code: "PHIC_ER", description: "PhilHealth employer share", cents: phic.er },
      { kind: "EMPLOYER_SHARE", code: "HDMF_ER", description: "Pag-IBIG employer share", cents: hdmf.er },
    );
    eeContrib = sss.ee + phic.ee + hdmf.ee;
  }
  let tax = 0n;
  if (input.isMinimumWageEarner) {
    notes.push("Minimum wage earner: exempt from withholding tax.");
  } else {
    const taxable = gross - nonTaxable - eeContrib;
    tax = taxable > 0n ? bracketAmount(input.withholding, taxable).ee : 0n;
    empLevel.push({ kind: "DEDUCTION", code: "WTAX", description: "Withholding tax", cents: tax });
  }
  // Loans last, never pushing net pay below zero.
  let available = gross - eeContrib - tax;
  for (const loan of input.loans) {
    const want = loan.perPayrollCents < loan.balanceCents ? loan.perPayrollCents : loan.balanceCents;
    const take = want < available ? want : available > 0n ? available : 0n;
    if (take < want) notes.push(`${LOAN_LABEL[loan.type] ?? "Loan"}: only ${take} of ${want} centavos deducted (net pay can't go below zero).`);
    if (take > 0n) empLevel.push({ kind: "DEDUCTION", code: "LOAN", description: LOAN_LABEL[loan.type] ?? "Loan", cents: take, loanId: loan.id });
    available -= take;
  }
  // 13th month accrues on basic pay actually earned.
  if (basic > 0n) empLevel.push({ kind: "EMPLOYER_SHARE", code: "ACCRUAL_13TH", description: "13th month accrual", cents: div(basic, 12n) });

  // Split employee-level amounts in proportion to gross per location (so each location's entry balances).
  const grossByLoc = new Map<string, bigint>();
  for (const e of earnings) grossByLoc.set(e.locationId, (grossByLoc.get(e.locationId) ?? 0n) + e.amountCents);
  const posLocs = [...grossByLoc.entries()].filter(([, v]) => v > 0n);
  const sLocs = posLocs.length ? posLocs.map(([l]) => l) : [input.homeLocationId];
  const sWeights = posLocs.length ? posLocs.map(([, v]) => Number(v)) : [1];
  const items: PayItem[] = [...earnings];
  for (const e of empLevel) {
    if (e.cents === 0n) continue;
    allocate(e.cents, sWeights).forEach((amount, i) => {
      if (amount !== 0n) items.push({ kind: e.kind, code: e.code, description: e.description, amountCents: amount, locationId: sLocs[i], ...(e.loanId ? { loanId: e.loanId } : {}) });
    });
  }
  const deductions = items.filter((i) => i.kind === "DEDUCTION").reduce((a, i) => a + i.amountCents, 0n);
  const employer = items.filter((i) => i.kind === "EMPLOYER_SHARE").reduce((a, i) => a + i.amountCents, 0n);
  return { items, daysWorked, grossCents: gross, basicCents: basic, deductionsCents: deductions, netCents: gross - deductions, employerCostCents: gross + employer, dailyRateCents: daily, notes };
}

export const LOAN_LABEL: Record<string, string> = { CASH_ADVANCE: "Cash advance", COMPANY_LOAN: "Company loan", SSS_LOAN: "SSS loan", PAGIBIG_LOAN: "Pag-IBIG loan" };

/** GL account (system key) for each pay item code. */
export const ITEM_ACCOUNT: Record<string, string> = {
  BASIC: "PAY_BASIC",
  LATE_UT: "PAY_BASIC",
  ABSENCE: "PAY_BASIC",
  LEAVE: "PAY_BASIC",
  OT: "PAY_OVERTIME",
  ND: "PAY_OVERTIME",
  HOLIDAY: "PAY_HOLIDAY",
  RESTDAY: "PAY_HOLIDAY",
  ALLOWANCE: "PAY_ALLOWANCES",
  ALLOWANCE_TX: "PAY_ALLOWANCES",
  SERVICE_CHARGE: "SERVICE_CHARGE_PAYABLE",
  THIRTEENTH: "ACCRUED_13TH_MONTH",
  SSS_EE: "SSS_PAYABLE",
  PHIC_EE: "PHIC_PAYABLE",
  HDMF_EE: "HDMF_PAYABLE",
  WTAX: "WTAX_COMP_PAYABLE",
  SSS_ER: "SSS_PAYABLE",
  SSS_EC: "SSS_PAYABLE",
  PHIC_ER: "PHIC_PAYABLE",
  HDMF_ER: "HDMF_PAYABLE",
  ACCRUAL_13TH: "ACCRUED_13TH_MONTH",
};

/** Semi-monthly cut-offs: 1–15 and 16–end of month. */
export function cutoffOf(ymd: string) {
  const [y, m, d] = ymd.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const mm = String(m).padStart(2, "0");
  return d <= 15 ? { start: `${y}-${mm}-01`, end: `${y}-${mm}-15`, half: 1 as const } : { start: `${y}-${mm}-16`, end: `${y}-${mm}-${String(last).padStart(2, "0")}`, half: 2 as const };
}

export function previousCutoff(ymd: string) {
  const c = cutoffOf(ymd);
  const prev = new Date(Date.parse(`${c.start}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
  return cutoffOf(prev);
}

/** Default pay date: the 20th for the 1–15 cut-off, the 5th of next month for the 16–end cut-off. */
export function defaultPayDate(c: { end: string; half: 1 | 2 }, firstPayDay: number, secondPayDay: number) {
  const [y, m] = c.end.split("-").map(Number);
  if (c.half === 1) return `${y}-${String(m).padStart(2, "0")}-${String(firstPayDay).padStart(2, "0")}`;
  const next = new Date(Date.UTC(y, m, secondPayDay));
  return next.toISOString().slice(0, 10);
}

export function datesBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let t = Date.parse(`${from}T00:00:00Z`); t <= Date.parse(`${to}T00:00:00Z`); t += 86_400_000) out.push(new Date(t).toISOString().slice(0, 10));
  return out;
}
