import "server-only";
import type { Tx } from "@/server/db";
import { writeAudit } from "@/server/audit";
import { UserFacingError } from "@/lib/errors";
import { allocate, formatPeso } from "@/lib/money";
import { toDbDate } from "@/lib/dates";
import { acct, dr, key, type DraftLine } from "@/domains/ledger/lines";
import { postEntry, reverseEntry } from "@/domains/ledger/post";
import { getSetting } from "@/domains/admin/settings";
import { ITEM_ACCOUNT, computePayslip, cutoffOf, datesBetween, type Allowance, type HolidayType, type PayItem } from "./compute";
import { parseDtrCell, type Schedule } from "./dtr";
import type { Bracket } from "./tables";

type Actor = { id: string };
const ymdOf = (d: Date) => d.toISOString().slice(0, 10);
const dayBefore = (ymd: string) => new Date(Date.parse(`${ymd}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);

// ── Employees ───────────────────────────────────────────────────────────────

export type EmployeeInput = {
  id?: string;
  code?: string;
  firstName: string;
  lastName: string;
  middleName?: string;
  position: string;
  status: "ACTIVE" | "ON_LEAVE" | "RESIGNED" | "TERMINATED";
  startDate: string;
  endDate?: string;
  sssNo?: string;
  philhealthNo?: string;
  pagibigNo?: string;
  tin?: string;
  isMinimumWageEarner: boolean;
  payoutMethod?: string;
  payoutRef?: string;
};

export async function nextEmployeeCode(tx: Pick<Tx, "employee">) {
  const all = await tx.employee.findMany({ select: { code: true } });
  const max = all.reduce((m, e) => Math.max(m, Number(/(\d+)$/.exec(e.code)?.[1] ?? 0)), 0);
  return `EMP-${String(max + 1).padStart(4, "0")}`;
}

export async function saveEmployee(
  tx: Tx,
  input: EmployeeInput & { homeLocationId?: string; rateType?: "DAILY" | "MONTHLY"; rateCents?: bigint; allowances?: Allowance[] },
  actor: Actor,
) {
  const data = {
    firstName: input.firstName,
    lastName: input.lastName,
    middleName: input.middleName || null,
    position: input.position,
    status: input.status,
    startDate: toDbDate(input.startDate),
    endDate: input.endDate ? toDbDate(input.endDate) : null,
    sssNo: input.sssNo || null,
    philhealthNo: input.philhealthNo || null,
    pagibigNo: input.pagibigNo || null,
    tin: input.tin || null,
    isMinimumWageEarner: input.isMinimumWageEarner,
    payoutMethod: input.payoutMethod || null,
    payoutRef: input.payoutRef || null,
  };
  if (input.id) {
    const before = await tx.employee.findUniqueOrThrow({ where: { id: input.id } });
    await tx.employee.update({ where: { id: input.id }, data });
    await writeAudit(tx, { actorId: actor.id, action: "UPDATE", entityType: "Employee", entityId: input.id, before, after: data });
    return input.id;
  }
  if (!input.homeLocationId || !input.rateType || input.rateCents === undefined) throw new UserFacingError("Set the location and pay rate.");
  const emp = await tx.employee.create({
    data: {
      ...data,
      code: input.code || (await nextEmployeeCode(tx)),
      assignments: { create: [{ locationId: input.homeLocationId, effectiveFrom: toDbDate(input.startDate) }] },
      compensations: { create: [{ effectiveFrom: toDbDate(input.startDate), rateType: input.rateType, rateCents: input.rateCents, allowances: allowancesJson(input.allowances ?? []) }] },
    },
  });
  await writeAudit(tx, { actorId: actor.id, action: "CREATE", entityType: "Employee", entityId: emp.id, locationId: input.homeLocationId, after: { ...data, rateType: input.rateType, rateCents: input.rateCents } });
  return emp.id;
}

const allowancesJson = (a: Allowance[]) => a.map((x) => ({ name: x.name, cents: x.cents.toString(), taxable: x.taxable }));
export function allowancesOf(json: unknown): Allowance[] {
  if (!Array.isArray(json)) return [];
  return json.map((x: { name: string; cents: string; taxable?: boolean }) => ({ name: String(x.name), cents: BigInt(x.cents), taxable: !!x.taxable }));
}

/** Moves the employee to another home location from a date. */
export async function addAssignment(tx: Tx, input: { employeeId: string; locationId: string; effectiveFrom: string }, actor: Actor) {
  const current = await tx.employeeAssignment.findMany({ where: { employeeId: input.employeeId }, orderBy: { effectiveFrom: "desc" } });
  if (current[0] && ymdOf(current[0].effectiveFrom) >= input.effectiveFrom) throw new UserFacingError("The new assignment must start after the current one.");
  if (current[0]) await tx.employeeAssignment.update({ where: { id: current[0].id }, data: { effectiveTo: toDbDate(dayBefore(input.effectiveFrom)) } });
  await tx.employeeAssignment.create({ data: { employeeId: input.employeeId, locationId: input.locationId, effectiveFrom: toDbDate(input.effectiveFrom) } });
  await writeAudit(tx, { actorId: actor.id, action: "UPDATE", entityType: "Employee", entityId: input.employeeId, locationId: input.locationId, before: { locationId: current[0]?.locationId }, after: { locationId: input.locationId, effectiveFrom: input.effectiveFrom } });
}

/** A new pay rate from a date (history is kept). */
export async function addCompensation(tx: Tx, input: { employeeId: string; effectiveFrom: string; rateType: "DAILY" | "MONTHLY"; rateCents: bigint; daysPerYear: number; allowances: Allowance[] }, actor: Actor) {
  const prev = await tx.employeeCompensation.findFirst({ where: { employeeId: input.employeeId }, orderBy: { effectiveFrom: "desc" } });
  const same = prev && ymdOf(prev.effectiveFrom) === input.effectiveFrom;
  const data = { rateType: input.rateType, rateCents: input.rateCents, daysPerYear: input.daysPerYear, allowances: allowancesJson(input.allowances) };
  if (same) await tx.employeeCompensation.update({ where: { id: prev.id }, data });
  else await tx.employeeCompensation.create({ data: { employeeId: input.employeeId, effectiveFrom: toDbDate(input.effectiveFrom), ...data } });
  await writeAudit(tx, {
    actorId: actor.id,
    action: "UPDATE",
    entityType: "EmployeeCompensation",
    entityId: input.employeeId,
    before: prev ? { rateType: prev.rateType, rateCents: prev.rateCents, from: ymdOf(prev.effectiveFrom) } : undefined,
    after: { rateType: input.rateType, rateCents: input.rateCents, from: input.effectiveFrom },
  });
}

export function homeOn(assignments: { locationId: string; effectiveFrom: Date; effectiveTo: Date | null }[], ymd: string) {
  const d = toDbDate(ymd);
  return [...assignments].sort((a, b) => b.effectiveFrom.getTime() - a.effectiveFrom.getTime()).find((a) => a.effectiveFrom <= d && (!a.effectiveTo || a.effectiveTo >= d))?.locationId ?? assignments[0]?.locationId;
}

// ── Attendance (DTR) ────────────────────────────────────────────────────────

export async function scheduleOf(tx: Pick<Tx, "setting">, locationId: string): Promise<Schedule> {
  return {
    start: await getSetting(tx, "payroll.shiftStart", locationId),
    end: await getSetting(tx, "payroll.shiftEnd", locationId),
    graceMinutes: await getSetting(tx, "payroll.graceMinutes", locationId),
    otMinimumMinutes: await getSetting(tx, "payroll.otMinimumMinutes", locationId),
  };
}

export async function getOrCreateSheet(tx: Tx, locationId: string, periodStart: string, actor: Actor) {
  const c = cutoffOf(periodStart);
  return tx.attendanceSheet.upsert({
    where: { locationId_periodStart: { locationId, periodStart: toDbDate(c.start) } },
    create: { locationId, periodStart: toDbDate(c.start), periodEnd: toDbDate(c.end), encodedById: actor.id },
    update: {},
  });
}

/** Saves the grid: one code per employee per day. Empty cells clear that day. */
export async function saveAttendance(tx: Tx, input: { locationId: string; periodStart: string; rows: { employeeId: string; cells: Record<string, string> }[] }, actor: Actor) {
  const sheet = await getOrCreateSheet(tx, input.locationId, input.periodStart, actor);
  if (sheet.status !== "DRAFT") throw new UserFacingError("This DTR is approved. Reopen it to make changes.");
  const start = ymdOf(sheet.periodStart);
  const end = ymdOf(sheet.periodEnd);
  const schedule = await scheduleOf(tx, input.locationId);
  const locations = await tx.location.findMany({ select: { id: true, code: true } });
  const byCode = new Map(locations.map((l) => [l.code.toUpperCase(), l.id]));
  const errors: string[] = [];
  const employees = await tx.employee.findMany({ where: { id: { in: input.rows.map((r) => r.employeeId) } } });
  const nameOf = (id: string) => {
    const e = employees.find((x) => x.id === id);
    return e ? `${e.firstName} ${e.lastName}` : "employee";
  };
  const existing = await tx.attendanceEntry.findMany({ where: { employeeId: { in: input.rows.map((r) => r.employeeId) }, date: { gte: sheet.periodStart, lte: sheet.periodEnd } }, include: { sheet: { include: { location: true } } } });
  let saved = 0;
  for (const row of input.rows) {
    for (const [date, raw] of Object.entries(row.cells)) {
      if (date < start || date > end) continue;
      const prior = existing.find((e) => e.employeeId === row.employeeId && ymdOf(e.date) === date);
      if (prior && prior.sheetId !== sheet.id) {
        if (raw.trim()) errors.push(`${nameOf(row.employeeId)} ${date}: already on the ${prior.sheet.location.name} DTR.`);
        continue;
      }
      const parsed = parseDtrCell(raw, schedule);
      if (parsed && "error" in parsed) {
        errors.push(`${nameOf(row.employeeId)} ${date}: ${parsed.error}`);
        continue;
      }
      if (!parsed) {
        if (prior) await tx.attendanceEntry.delete({ where: { id: prior.id } });
        continue;
      }
      const locationId = parsed.locationCode ? byCode.get(parsed.locationCode) : input.locationId;
      if (!locationId) {
        errors.push(`${nameOf(row.employeeId)} ${date}: no location with code ${parsed.locationCode}.`);
        continue;
      }
      const data = {
        sheetId: sheet.id,
        locationId,
        status: parsed.status,
        timeIn: parsed.timeIn,
        timeOut: parsed.timeOut,
        lateMinutes: parsed.lateMinutes,
        undertimeMinutes: parsed.undertimeMinutes,
        otMinutes: parsed.otMinutes,
        nightDiffMinutes: parsed.nightDiffMinutes,
        isRestDayWork: parsed.isRestDayWork,
      };
      if (prior) await tx.attendanceEntry.update({ where: { id: prior.id }, data });
      else await tx.attendanceEntry.create({ data: { ...data, employeeId: row.employeeId, date: toDbDate(date) } });
      saved++;
    }
  }
  if (errors.length) throw new UserFacingError(errors.slice(0, 5).join(" "));
  await writeAudit(tx, { actorId: actor.id, action: "UPDATE", entityType: "AttendanceSheet", entityId: sheet.id, locationId: input.locationId, after: { days: saved, period: `${start}..${end}` } });
  return sheet.id;
}

export async function setSheetStatus(tx: Tx, sheetId: string, status: "APPROVED" | "DRAFT", actor: Actor) {
  const sheet = await tx.attendanceSheet.findUniqueOrThrow({ where: { id: sheetId } });
  if (status === "DRAFT") {
    const posted = await tx.payrollRun.findFirst({ where: { type: "REGULAR", status: "POSTED", periodStart: { lte: sheet.periodEnd }, periodEnd: { gte: sheet.periodStart } } });
    if (posted) throw new UserFacingError("Payroll for this cut-off is already approved. Void that run first.");
  }
  await tx.attendanceSheet.update({ where: { id: sheetId }, data: { status, approvedById: status === "APPROVED" ? actor.id : null } });
  await writeAudit(tx, { actorId: actor.id, action: status === "APPROVED" ? "APPROVE" : "UPDATE", entityType: "AttendanceSheet", entityId: sheetId, locationId: sheet.locationId, before: { status: sheet.status }, after: { status } });
}

// ── Payroll runs ────────────────────────────────────────────────────────────

async function tablesAsOf(tx: Pick<Tx, "contributionTable">, ymd: string) {
  const tables = await tx.contributionTable.findMany({ where: { effectiveFrom: { lte: toDbDate(ymd) } }, include: { brackets: true }, orderBy: { effectiveFrom: "desc" } });
  const pick = (kind: string): Bracket[] => {
    const t = tables.find((x) => x.kind === kind);
    if (!t) throw new UserFacingError(`No ${kind} table effective on ${ymd}. Add one in Payroll → Setup.`);
    return [...t.brackets].sort((a, b) => (a.minCents < b.minCents ? -1 : 1)).map((b) => ({ ...b, meta: undefined }));
  };
  return { sss: pick("SSS"), philhealth: pick("PHILHEALTH"), pagibig: pick("PAGIBIG"), withholding: pick("WITHHOLDING_TAX") };
}

export async function createRun(tx: Tx, input: { type: "REGULAR" | "THIRTEENTH_MONTH"; periodStart: string; periodEnd: string; payDate: string; distributeServiceCharge?: boolean }, actor: Actor) {
  const exists = await tx.payrollRun.findFirst({ where: { type: input.type, periodStart: toDbDate(input.periodStart), periodEnd: toDbDate(input.periodEnd), status: { not: "VOIDED" } } });
  if (exists) throw new UserFacingError("There is already a payroll run for this period.");
  const voided = await tx.payrollRun.findFirst({ where: { type: input.type, periodStart: toDbDate(input.periodStart), periodEnd: toDbDate(input.periodEnd), status: "VOIDED" } });
  // The unique key covers voided runs too: reuse the slot.
  if (voided) await tx.payrollRun.delete({ where: { id: voided.id } });
  const run = await tx.payrollRun.create({ data: { type: input.type, periodStart: toDbDate(input.periodStart), periodEnd: toDbDate(input.periodEnd), payDate: toDbDate(input.payDate), preparedById: actor.id } });
  await computeRun(tx, run.id, { distributeServiceCharge: input.distributeServiceCharge });
  await writeAudit(tx, { actorId: actor.id, action: "CREATE", entityType: "PayrollRun", entityId: run.id, after: input });
  return run.id;
}

/** (Re)computes every payslip of a draft run from attendance, rates and tables. */
export async function computeRun(tx: Tx, runId: string, opts: { distributeServiceCharge?: boolean } = {}) {
  const run = await tx.payrollRun.findUniqueOrThrow({ where: { id: runId } });
  if (run.status !== "DRAFT") throw new UserFacingError("Only draft runs can be recomputed.");
  await tx.payrollLine.deleteMany({ where: { runId } });
  if (run.type === "THIRTEENTH_MONTH") return computeThirteenth(tx, run);
  const start = ymdOf(run.periodStart);
  const end = ymdOf(run.periodEnd);

  const drafts = await tx.attendanceSheet.findMany({ where: { periodStart: { lte: run.periodEnd }, periodEnd: { gte: run.periodStart }, status: "DRAFT", entries: { some: {} } }, include: { location: true } });
  if (drafts.length) throw new UserFacingError(`Approve the DTR first: ${drafts.map((d) => d.location.name).join(", ")}.`);

  const entries = await tx.attendanceEntry.findMany({ where: { date: { gte: run.periodStart, lte: run.periodEnd } } });
  const employees = await tx.employee.findMany({
    where: { OR: [{ id: { in: [...new Set(entries.map((e) => e.employeeId))] } }, { status: "ACTIVE", startDate: { lte: run.periodEnd }, compensations: { some: { rateType: "MONTHLY" } } }] },
    include: { assignments: true, compensations: { where: { effectiveFrom: { lte: run.periodEnd } }, orderBy: { effectiveFrom: "desc" }, take: 1 }, loans: { where: { isActive: true, balanceCents: { gt: 0n }, startDate: { lte: run.periodEnd } }, orderBy: { startDate: "asc" } } },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  });
  const holidays = await tx.holiday.findMany({ where: { date: { gte: run.periodStart, lte: run.periodEnd } } });
  const locations = await tx.location.findMany({ select: { id: true } });
  const holidayMap = new Map<string, HolidayType>();
  for (const h of holidays) {
    const ids = h.locationId ? [h.locationId] : locations.map((l) => l.id);
    for (const l of ids) holidayMap.set(`${ymdOf(h.date)}|${l}`, h.type);
  }
  const tables = await tablesAsOf(tx, end);
  const monthEnd = cutoffOf(end).half === 2 && end === cutoffOf(end).end;
  const monthStart = `${end.slice(0, 7)}-01`;
  const earlier = monthEnd
    ? await tx.payrollLineItem.findMany({
        where: { kind: "EARNING", line: { run: { type: "REGULAR", status: "POSTED", periodStart: { gte: toDbDate(monthStart) }, periodEnd: { lt: run.periodStart } } } },
        include: { line: { select: { employeeId: true } } },
      })
    : [];

  // Service charge collected and not yet distributed, shared by days present at each location.
  const serviceShares = new Map<string, { locationId: string; cents: bigint }[]>();
  if (opts.distributeServiceCharge) {
    const payable = await tx.account.findUniqueOrThrow({ where: { systemKey: "SERVICE_CHARGE_PAYABLE" } });
    const bal = await tx.journalLine.groupBy({ by: ["locationId"], where: { accountId: payable.id, date: { lte: run.periodEnd } }, _sum: { debitCents: true, creditCents: true } });
    for (const b of bal) {
      const pool = (b._sum.creditCents ?? 0n) - (b._sum.debitCents ?? 0n);
      if (pool <= 0n) continue;
      const days = new Map<string, number>();
      for (const e of entries) if (e.locationId === b.locationId && e.status === "PRESENT") days.set(e.employeeId, (days.get(e.employeeId) ?? 0) + 1);
      const ids = [...days.keys()];
      if (!ids.length) continue;
      allocate(pool, ids.map((i) => days.get(i)!)).forEach((cents, i) => serviceShares.set(ids[i], [...(serviceShares.get(ids[i]) ?? []), { locationId: b.locationId, cents }]));
    }
  }

  const missing: string[] = [];
  for (const emp of employees) {
    const comp = emp.compensations[0];
    if (!comp) {
      missing.push(`${emp.firstName} ${emp.lastName}`);
      continue;
    }
    const home = homeOn(emp.assignments, end) ?? homeOn(emp.assignments, start);
    if (!home) {
      missing.push(`${emp.firstName} ${emp.lastName}`);
      continue;
    }
    const days = entries
      .filter((e) => e.employeeId === emp.id)
      .map((e) => ({ date: ymdOf(e.date), locationId: e.locationId, status: e.status, lateMinutes: e.lateMinutes, undertimeMinutes: e.undertimeMinutes, otMinutes: e.otMinutes, nightDiffMinutes: e.nightDiffMinutes, isRestDayWork: e.isRestDayWork }));
    const mine = earlier.filter((i) => i.line.employeeId === emp.id);
    const slip = computePayslip({
      isMinimumWageEarner: emp.isMinimumWageEarner,
      rateType: comp.rateType,
      rateCents: comp.rateCents,
      daysPerYear: comp.daysPerYear,
      allowances: allowancesOf(comp.allowances),
      homeLocationId: home,
      days,
      holidays: holidayMap,
      contributions: monthEnd
        ? {
            monthToDateGrossCents: mine.reduce((a, i) => a + i.amountCents, 0n),
            monthToDateBasicCents: mine.filter((i) => ["BASIC", "LATE_UT", "ABSENCE"].includes(i.code)).reduce((a, i) => a + i.amountCents, 0n),
            sss: tables.sss,
            philhealth: tables.philhealth,
            pagibig: tables.pagibig,
          }
        : null,
      withholding: tables.withholding,
      loans: emp.loans.map((l) => ({ id: l.id, type: l.type, perPayrollCents: l.perPayrollCents, balanceCents: l.balanceCents })),
      serviceCharge: serviceShares.get(emp.id),
    });
    if (slip.grossCents === 0n && slip.items.length === 0) continue;
    await saveLine(tx, runId, emp.id, slip.daysWorked, slip.items, {
      rateType: comp.rateType,
      rateCents: comp.rateCents.toString(),
      dailyRateCents: slip.dailyRateCents.toString(),
      daysPerYear: comp.daysPerYear,
      minimumWageEarner: emp.isMinimumWageEarner,
      contributionsThisCutoff: monthEnd,
      notes: slip.notes,
      attendance: summarizeDays(days),
    });
  }
  if (missing.length) throw new UserFacingError(`Set a pay rate and location for: ${missing.join(", ")}.`);
}

function summarizeDays(days: { status: string; lateMinutes: number; undertimeMinutes: number; otMinutes: number; nightDiffMinutes: number; isRestDayWork: boolean }[]) {
  return {
    present: days.filter((d) => d.status === "PRESENT").length,
    absent: days.filter((d) => d.status === "ABSENT" || d.status === "LEAVE_UNPAID").length,
    paidLeave: days.filter((d) => d.status === "LEAVE_PAID").length,
    restDayWork: days.filter((d) => d.isRestDayWork).length,
    lateMinutes: days.reduce((a, d) => a + d.lateMinutes + d.undertimeMinutes, 0),
    otMinutes: days.reduce((a, d) => a + d.otMinutes, 0),
    nightDiffMinutes: days.reduce((a, d) => a + d.nightDiffMinutes, 0),
  };
}

async function saveLine(tx: Tx, runId: string, employeeId: string, daysWorked: number, items: PayItem[], snapshot: object) {
  const gross = items.filter((i) => i.kind === "EARNING").reduce((a, i) => a + i.amountCents, 0n);
  const deductions = items.filter((i) => i.kind === "DEDUCTION").reduce((a, i) => a + i.amountCents, 0n);
  const employer = items.filter((i) => i.kind === "EMPLOYER_SHARE").reduce((a, i) => a + i.amountCents, 0n);
  await tx.payrollLine.create({
    data: {
      runId,
      employeeId,
      daysWorked: String(daysWorked),
      grossCents: gross,
      deductionsCents: deductions,
      netCents: gross - deductions,
      employerCostCents: gross + employer,
      snapshot,
      items: { create: items.map((i) => ({ kind: i.kind, code: i.code, description: i.description, amountCents: i.amountCents, locationId: i.locationId, loanId: i.loanId ?? null })) },
    },
  });
}

/** 13th month = basic pay earned in the year ÷ 12, less any 13th month already released this year. */
async function computeThirteenth(tx: Tx, run: { id: string; periodStart: Date; periodEnd: Date }) {
  const basic = await tx.payrollLineItem.findMany({
    where: { code: { in: ["BASIC", "LATE_UT", "ABSENCE"] }, line: { run: { type: "REGULAR", status: "POSTED", periodEnd: { gte: run.periodStart, lte: run.periodEnd } } } },
    include: { line: { select: { employeeId: true } } },
  });
  const paid = await tx.payrollLineItem.findMany({
    where: { code: "THIRTEENTH", line: { run: { type: "THIRTEENTH_MONTH", status: "POSTED", periodStart: run.periodStart } } },
    include: { line: { select: { employeeId: true } } },
  });
  const byEmp = new Map<string, Map<string, bigint>>();
  for (const i of basic) {
    const m = byEmp.get(i.line.employeeId) ?? new Map<string, bigint>();
    m.set(i.locationId, (m.get(i.locationId) ?? 0n) + i.amountCents);
    byEmp.set(i.line.employeeId, m);
  }
  for (const [employeeId, locs] of byEmp) {
    const total = [...locs.values()].reduce((a, b) => a + b, 0n);
    const already = paid.filter((p) => p.line.employeeId === employeeId).reduce((a, p) => a + p.amountCents, 0n);
    const due = (total + 6n) / 12n - already;
    if (due <= 0n) continue;
    const ids = [...locs.keys()].filter((l) => locs.get(l)! > 0n);
    const items: PayItem[] = allocate(due, ids.map((l) => Number(locs.get(l)!))).map((amount, i) => ({ kind: "EARNING", code: "THIRTEENTH", description: "13th month pay", amountCents: amount, locationId: ids[i] }));
    await saveLine(tx, run.id, employeeId, 0, items, { basicEarnedCents: total.toString(), alreadyPaidCents: already.toString(), note: "13th month pay up to ₱90,000 a year is tax-exempt." });
  }
}

/** Journal lines for a run, netted per account and location. */
export function runEntryLines(lines: { items: { kind: string; code: string; amountCents: bigint; locationId: string; loan?: { type: string } | null }[] }[], accrued13th: Map<string, bigint>): DraftLine[] {
  const net = new Map<string, bigint>(); // `${key}|${loc}` → debit (+) / credit (−)
  const post = (k: string, loc: string, debit: bigint) => net.set(`${k}|${loc}`, (net.get(`${k}|${loc}`) ?? 0n) + debit);
  const thirteenth = new Map<string, bigint>();
  for (const line of lines) {
    for (const i of line.items) {
      const L = i.locationId;
      if (i.kind === "EARNING") {
        if (i.code === "THIRTEENTH") thirteenth.set(L, (thirteenth.get(L) ?? 0n) + i.amountCents);
        else post(ITEM_ACCOUNT[i.code] ?? "PAY_BASIC", L, i.amountCents);
        post("SALARIES_PAYABLE", L, -i.amountCents);
      } else if (i.kind === "DEDUCTION") {
        const k = i.code === "LOAN" ? (i.loan?.type === "SSS_LOAN" ? "SSS_PAYABLE" : i.loan?.type === "PAGIBIG_LOAN" ? "HDMF_PAYABLE" : "EMPLOYEE_ADVANCES") : ITEM_ACCOUNT[i.code];
        post(k, L, -i.amountCents);
        post("SALARIES_PAYABLE", L, i.amountCents);
      } else {
        post(i.code === "ACCRUAL_13TH" ? "PAY_13TH_MONTH" : "PAY_GOV_ER", L, i.amountCents);
        post(ITEM_ACCOUNT[i.code], L, -i.amountCents);
      }
    }
  }
  // Releasing 13th month uses up what was accrued; anything beyond is this month's expense.
  for (const [L, amount] of thirteenth) {
    const avail = accrued13th.get(L) ?? 0n;
    const fromAccrual = avail > 0n ? (amount < avail ? amount : avail) : 0n;
    post("ACCRUED_13TH_MONTH", L, fromAccrual);
    post("PAY_13TH_MONTH", L, amount - fromAccrual);
  }
  const out: DraftLine[] = [];
  for (const [k, v] of net) {
    const [systemKey, L] = k.split("|");
    out.push(...dr(key(systemKey), L, v));
  }
  return out;
}

export async function approveRun(tx: Tx, runId: string, actor: Actor) {
  const run = await tx.payrollRun.findUniqueOrThrow({ where: { id: runId }, include: { lines: { include: { items: { include: { loan: true } } } } } });
  if (run.status !== "DRAFT") throw new UserFacingError("Only draft runs can be approved.");
  if (!run.lines.length) throw new UserFacingError("This run has no payslips.");
  const accrued = new Map<string, bigint>();
  if (run.type === "THIRTEENTH_MONTH") {
    const acc = await tx.account.findUniqueOrThrow({ where: { systemKey: "ACCRUED_13TH_MONTH" } });
    const bal = await tx.journalLine.groupBy({ by: ["locationId"], where: { accountId: acc.id }, _sum: { debitCents: true, creditCents: true } });
    for (const b of bal) accrued.set(b.locationId, (b._sum.creditCents ?? 0n) - (b._sum.debitCents ?? 0n));
  }
  const lines = runEntryLines(run.lines, accrued);
  const label = run.type === "THIRTEENTH_MONTH" ? `13th month ${ymdOf(run.periodStart).slice(0, 4)}` : `Payroll ${ymdOf(run.periodStart)} to ${ymdOf(run.periodEnd)}`;
  const entryId = await postEntry(tx, { date: ymdOf(run.periodEnd), source: "PAYROLL", sourceId: run.id, memo: label, postedById: actor.id, lines });
  // Loan balances go down by what was deducted.
  for (const item of run.lines.flatMap((l) => l.items).filter((i) => i.loanId)) {
    const loan = await tx.employeeLoan.findUniqueOrThrow({ where: { id: item.loanId! } });
    const balance = loan.balanceCents - item.amountCents;
    await tx.employeeLoan.update({ where: { id: loan.id }, data: { balanceCents: balance, isActive: balance > 0n } });
  }
  await tx.payrollRun.update({ where: { id: run.id }, data: { status: "POSTED", approvedById: actor.id, journalEntryId: entryId } });
  const total = run.lines.reduce((a, l) => a + l.netCents, 0n);
  await writeAudit(tx, { actorId: actor.id, action: "APPROVE", entityType: "PayrollRun", entityId: run.id, before: { status: "DRAFT" }, after: { status: "POSTED", netCents: total, payslips: run.lines.length } });
}

/** Pays out net pay from a money account (cash, bank or GCash). */
export async function payRun(tx: Tx, runId: string, input: { moneyAccountId: string; date: string }, actor: Actor) {
  const run = await tx.payrollRun.findUniqueOrThrow({ where: { id: runId }, include: { lines: { include: { items: true } } } });
  if (run.status !== "POSTED") throw new UserFacingError("Approve the run before paying it.");
  if (run.paidAt) throw new UserFacingError("This run is already marked paid.");
  const ma = await tx.moneyAccount.findUniqueOrThrow({ where: { id: input.moneyAccountId } });
  const byLoc = new Map<string, bigint>();
  for (const l of run.lines)
    for (const i of l.items) {
      const sign = i.kind === "EARNING" ? 1n : i.kind === "DEDUCTION" ? -1n : 0n;
      byLoc.set(i.locationId, (byLoc.get(i.locationId) ?? 0n) + sign * i.amountCents);
    }
  const lines: DraftLine[] = [];
  for (const [L, net] of byLoc) lines.push(...dr(key("SALARIES_PAYABLE"), L, net), ...dr(acct(ma.glAccountId), L, -net));
  const entryId = await postEntry(tx, { date: input.date, source: "PAYROLL", sourceId: `${run.id}:pay`, memo: `Payroll paid via ${ma.name}`, postedById: actor.id, lines });
  await tx.payrollRun.update({ where: { id: run.id }, data: { paidAt: new Date(`${input.date}T12:00:00+08:00`), paidFromMoneyAccountId: ma.id, paymentJournalEntryId: entryId } });
  await writeAudit(tx, { actorId: actor.id, action: "POST", entityType: "PayrollRun", entityId: run.id, after: { paidFrom: ma.name, date: input.date, netCents: [...byLoc.values()].reduce((a, b) => a + b, 0n) } });
}

export async function voidRun(tx: Tx, runId: string, actor: Actor, todayYmd: string, reason: string) {
  const run = await tx.payrollRun.findUniqueOrThrow({ where: { id: runId }, include: { lines: { include: { items: true } } } });
  if (run.status === "DRAFT") {
    await tx.payrollRun.delete({ where: { id: run.id } });
    await writeAudit(tx, { actorId: actor.id, action: "DELETE", entityType: "PayrollRun", entityId: run.id, reason, before: { status: "DRAFT" } });
    return;
  }
  if (run.status !== "POSTED") throw new UserFacingError("This run is already voided.");
  if (run.type === "REGULAR") {
    const later = await tx.payrollRun.findFirst({ where: { type: "THIRTEENTH_MONTH", status: "POSTED", periodStart: { lte: run.periodEnd }, periodEnd: { gte: run.periodEnd } } });
    if (later) throw new UserFacingError("A 13th month run already used this payroll. Void that first.");
  }
  if (run.paymentJournalEntryId) await reverseEntry(tx, run.paymentJournalEntryId, { postedById: actor.id, todayYmd, memo: `Void payroll payment: ${reason}` });
  if (run.journalEntryId) await reverseEntry(tx, run.journalEntryId, { postedById: actor.id, todayYmd, memo: `Void payroll: ${reason}` });
  for (const item of run.lines.flatMap((l) => l.items).filter((i) => i.loanId)) {
    const loan = await tx.employeeLoan.findUniqueOrThrow({ where: { id: item.loanId! } });
    await tx.employeeLoan.update({ where: { id: loan.id }, data: { balanceCents: loan.balanceCents + item.amountCents, isActive: true } });
  }
  await tx.payrollRun.update({ where: { id: run.id }, data: { status: "VOIDED" } });
  await writeAudit(tx, { actorId: actor.id, action: "VOID", entityType: "PayrollRun", entityId: run.id, reason, before: { status: "POSTED" }, after: { status: "VOIDED" } });
}

// ── Loans & remittances ─────────────────────────────────────────────────────

export async function createLoan(tx: Tx, input: { employeeId: string; type: "CASH_ADVANCE" | "COMPANY_LOAN" | "SSS_LOAN" | "PAGIBIG_LOAN"; principalCents: bigint; perPayrollCents: bigint; startDate: string; moneyAccountId?: string; locationId: string }, actor: Actor) {
  if (input.principalCents <= 0n || input.perPayrollCents <= 0n) throw new UserFacingError("Amounts must be more than zero.");
  const loan = await tx.employeeLoan.create({ data: { employeeId: input.employeeId, type: input.type, principalCents: input.principalCents, perPayrollCents: input.perPayrollCents, balanceCents: input.principalCents, startDate: toDbDate(input.startDate) } });
  // Cash advances and company loans are paid out now; SSS/Pag-IBIG loans are only collected for remittance.
  if (input.type === "CASH_ADVANCE" || input.type === "COMPANY_LOAN") {
    if (!input.moneyAccountId) throw new UserFacingError("Choose where the money was paid from.");
    const ma = await tx.moneyAccount.findUniqueOrThrow({ where: { id: input.moneyAccountId } });
    const emp = await tx.employee.findUniqueOrThrow({ where: { id: input.employeeId } });
    await postEntry(tx, {
      date: input.startDate,
      source: "PAYROLL",
      sourceId: `loan:${loan.id}`,
      memo: `${input.type === "CASH_ADVANCE" ? "Cash advance" : "Loan"} to ${emp.firstName} ${emp.lastName}`,
      postedById: actor.id,
      lines: [...dr(key("EMPLOYEE_ADVANCES"), input.locationId, input.principalCents, { employeeId: emp.id }), ...dr(acct(ma.glAccountId), input.locationId, -input.principalCents)],
    });
  }
  await writeAudit(tx, { actorId: actor.id, action: "CREATE", entityType: "EmployeeLoan", entityId: loan.id, locationId: input.locationId, after: { type: input.type, principalCents: input.principalCents, perPayrollCents: input.perPayrollCents } });
  return loan.id;
}

const REMIT_KEY = { SSS: "SSS_PAYABLE", PHILHEALTH: "PHIC_PAYABLE", PAGIBIG: "HDMF_PAYABLE", WITHHOLDING_TAX: "WTAX_COMP_PAYABLE" } as const;

/** Pays a government remittance, clearing the payable at each location in proportion to what it owes. */
export async function remitContributions(tx: Tx, input: { kind: keyof typeof REMIT_KEY; month: string; amountCents: bigint; moneyAccountId: string; date: string; reference: string }, actor: Actor) {
  if (input.amountCents <= 0n) throw new UserFacingError("Amount must be more than zero.");
  const account = await tx.account.findUniqueOrThrow({ where: { systemKey: REMIT_KEY[input.kind] } });
  const bal = await tx.journalLine.groupBy({ by: ["locationId"], where: { accountId: account.id }, _sum: { debitCents: true, creditCents: true } });
  const owed = bal.map((b) => ({ locationId: b.locationId, cents: (b._sum.creditCents ?? 0n) - (b._sum.debitCents ?? 0n) })).filter((b) => b.cents > 0n);
  const total = owed.reduce((a, b) => a + b.cents, 0n);
  if (total === 0n) throw new UserFacingError(`Nothing is owed to ${input.kind === "WITHHOLDING_TAX" ? "BIR" : input.kind}.`);
  if (input.amountCents > total) throw new UserFacingError(`That's more than is owed (${formatPeso(total)}).`);
  const ma = await tx.moneyAccount.findUniqueOrThrow({ where: { id: input.moneyAccountId } });
  const parts = allocate(input.amountCents, owed.map((o) => Number(o.cents)));
  const lines: DraftLine[] = owed.flatMap((o, i) => [...dr(acct(account.id), o.locationId, parts[i]), ...dr(acct(ma.glAccountId), o.locationId, -parts[i])]);
  const entryId = await postEntry(tx, { date: input.date, source: "PAYROLL", memo: `${input.kind === "WITHHOLDING_TAX" ? "BIR 1601-C" : input.kind} remittance for ${input.month}${input.reference ? ` (${input.reference})` : ""}`, postedById: actor.id, lines });
  await writeAudit(tx, { actorId: actor.id, action: "POST", entityType: "Remittance", entityId: entryId, after: input });
  return entryId;
}

export { datesBetween };
