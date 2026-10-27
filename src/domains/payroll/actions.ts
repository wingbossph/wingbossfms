"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/server/db";
import { handleAction, UserFacingError, type ActionState } from "@/server/action";
import { assertCan, assertCanAnywhere, requireActor, type CurrentUser } from "@/server/auth/session";
import { linkAttachments } from "@/server/attachments";
import { writeAudit } from "@/server/audit";
import { pesoField } from "@/domains/admin/schemas";
import { manilaDateString, toDbDate } from "@/lib/dates";
import { addAssignment, addCompensation, approveRun, computeRun, createLoan, createRun, payRun, remitContributions, saveAttendance, saveEmployee, setSheetStatus, voidRun } from "./service";

const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const id = z.string().min(1);
const opt = z.string().trim().max(60).optional().default("");

/** Every location a run touches must be in the user's scope for the permission. */
async function assertRunScope(user: CurrentUser, runId: string, permission: string) {
  const locs = await db.payrollLineItem.findMany({ where: { line: { runId } }, distinct: ["locationId"], select: { locationId: true } });
  if (!locs.length) assertCanAnywhere(user, permission);
  for (const l of locs) assertCan(user, permission, l.locationId);
}

async function homeOf(employeeId: string) {
  const a = await db.employeeAssignment.findFirst({ where: { employeeId }, orderBy: { effectiveFrom: "desc" } });
  if (!a) throw new UserFacingError("This employee has no location.");
  return a.locationId;
}

// ── Employees ───────────────────────────────────────────────────────────────

const allowanceSchema = z.array(z.object({ name: z.string().trim().min(1).max(40), amount: pesoField, taxable: z.boolean().default(false) })).max(10).default([]);

const employeeSchema = z.object({
  id: z.string().optional(),
  code: opt,
  firstName: z.string().trim().min(1).max(60),
  lastName: z.string().trim().min(1).max(60),
  middleName: opt,
  position: z.string().trim().min(1).max(60),
  status: z.enum(["ACTIVE", "ON_LEAVE", "RESIGNED", "TERMINATED"]),
  startDate: ymd,
  endDate: ymd.optional().or(z.literal("")),
  sssNo: opt,
  philhealthNo: opt,
  pagibigNo: opt,
  tin: opt,
  isMinimumWageEarner: z.boolean(),
  payoutMethod: opt,
  payoutRef: opt,
  homeLocationId: z.string().optional(),
  rateType: z.enum(["DAILY", "MONTHLY"]).optional(),
  rate: pesoField.optional(),
  allowances: allowanceSchema,
});

export async function saveEmployeeAction(raw: unknown): Promise<ActionState & { id?: string }> {
  let savedId: string | undefined;
  const res = await handleAction(async () => {
    const user = await requireActor();
    const input = employeeSchema.parse(raw);
    const loc = input.id ? await homeOf(input.id) : input.homeLocationId;
    if (!loc) throw new UserFacingError("Choose a location.");
    assertCan(user, "employees:manage", loc);
    if (!input.id && (!input.rate || input.rate <= 0n)) throw new UserFacingError("Enter the pay rate.");
    savedId = await db.$transaction((tx) =>
      saveEmployee(tx, { ...input, endDate: input.endDate || undefined, rateCents: input.rate, allowances: input.allowances.map((a) => ({ name: a.name, cents: a.amount, taxable: a.taxable })) }, { id: user.id }),
    );
    revalidatePath("/payroll/employees");
    return { ok: true, message: `${input.firstName} ${input.lastName} saved.` };
  });
  return { ...res, ok: !!res?.ok, id: savedId };
}

export async function addAssignmentAction(raw: unknown): Promise<ActionState> {
  return handleAction(async () => {
    const user = await requireActor();
    const input = z.object({ employeeId: id, locationId: id, effectiveFrom: ymd }).parse(raw);
    assertCan(user, "employees:manage", await homeOf(input.employeeId));
    assertCan(user, "employees:manage", input.locationId);
    await db.$transaction((tx) => addAssignment(tx, input, { id: user.id }));
    revalidatePath(`/payroll/employees/${input.employeeId}`);
    return { ok: true, message: "Location updated." };
  });
}

export async function addCompensationAction(raw: unknown): Promise<ActionState> {
  return handleAction(async () => {
    const user = await requireActor();
    const input = z.object({ employeeId: id, effectiveFrom: ymd, rateType: z.enum(["DAILY", "MONTHLY"]), rate: pesoField, daysPerYear: z.coerce.number().int().min(250).max(366).default(313), allowances: allowanceSchema }).parse(raw);
    assertCan(user, "employees:manage", await homeOf(input.employeeId));
    if (input.rate <= 0n) throw new UserFacingError("Enter the pay rate.");
    await db.$transaction((tx) => addCompensation(tx, { ...input, rateCents: input.rate, allowances: input.allowances.map((a) => ({ name: a.name, cents: a.amount, taxable: a.taxable })) }, { id: user.id }));
    revalidatePath(`/payroll/employees/${input.employeeId}`);
    return { ok: true, message: "Pay rate saved." };
  });
}

// ── Attendance ──────────────────────────────────────────────────────────────

export async function saveAttendanceAction(raw: unknown): Promise<ActionState> {
  return handleAction(async () => {
    const user = await requireActor();
    const input = z
      .object({ locationId: id, periodStart: ymd, rows: z.array(z.object({ employeeId: id, cells: z.record(z.string(), z.string().max(40)) })).max(200), attachmentIds: z.array(z.string()).max(10).default([]) })
      .parse(raw);
    assertCan(user, "payroll:attendance", input.locationId);
    await db.$transaction(async (tx) => {
      const sheetId = await saveAttendance(tx, input, { id: user.id });
      await linkAttachments(tx, input.attachmentIds, { actorId: user.id, entityType: "AttendanceSheet", entityId: sheetId, locationId: input.locationId });
    });
    revalidatePath("/payroll/attendance");
    return { ok: true, message: "DTR saved." };
  });
}

export async function setSheetStatusAction(raw: unknown): Promise<ActionState> {
  return handleAction(async () => {
    const user = await requireActor();
    const input = z.object({ sheetId: id, status: z.enum(["APPROVED", "DRAFT"]) }).parse(raw);
    const sheet = await db.attendanceSheet.findUniqueOrThrow({ where: { id: input.sheetId } });
    assertCan(user, "payroll:run", sheet.locationId);
    await db.$transaction((tx) => setSheetStatus(tx, input.sheetId, input.status, { id: user.id }));
    revalidatePath("/payroll/attendance");
    return { ok: true, message: input.status === "APPROVED" ? "DTR approved." : "DTR reopened." };
  });
}

// ── Runs ────────────────────────────────────────────────────────────────────

export async function createRunAction(raw: unknown): Promise<ActionState & { id?: string }> {
  let runId: string | undefined;
  const res = await handleAction(async () => {
    const user = await requireActor();
    const input = z.object({ type: z.enum(["REGULAR", "THIRTEENTH_MONTH"]), periodStart: ymd, periodEnd: ymd, payDate: ymd, distributeServiceCharge: z.boolean().default(false) }).parse(raw);
    assertCanAnywhere(user, "payroll:run");
    if (input.periodEnd < input.periodStart) throw new UserFacingError("The period ends before it starts.");
    runId = await db.$transaction(async (tx) => {
      const rid = await createRun(tx, input, { id: user.id });
      const locs = await tx.payrollLineItem.findMany({ where: { line: { runId: rid } }, distinct: ["locationId"], select: { locationId: true } });
      for (const l of locs) assertCan(user, "payroll:run", l.locationId);
      return rid;
    }, { timeout: 60_000 });
    revalidatePath("/payroll");
    return { ok: true, message: "Payroll computed. Review it, then approve." };
  });
  return { ...res, ok: !!res?.ok, id: runId };
}

export async function recomputeRunAction(runId: string): Promise<ActionState> {
  return handleAction(async () => {
    const user = await requireActor();
    await assertRunScope(user, runId, "payroll:run");
    await db.$transaction((tx) => computeRun(tx, runId), { timeout: 60_000 });
    revalidatePath(`/payroll/runs/${runId}`);
    return { ok: true, message: "Recomputed from the latest DTRs and rates." };
  });
}

export async function approveRunAction(runId: string): Promise<ActionState> {
  return handleAction(async () => {
    const user = await requireActor();
    await assertRunScope(user, runId, "payroll:approve");
    await db.$transaction((tx) => approveRun(tx, runId, { id: user.id }), { timeout: 60_000 });
    revalidatePath(`/payroll/runs/${runId}`);
    return { ok: true, message: "Payroll approved and posted." };
  });
}

export async function payRunAction(raw: unknown): Promise<ActionState> {
  return handleAction(async () => {
    const user = await requireActor();
    const input = z.object({ runId: id, moneyAccountId: id, date: ymd }).parse(raw);
    await assertRunScope(user, input.runId, "payroll:approve");
    if (input.date > manilaDateString()) throw new UserFacingError("The date can't be in the future.");
    await db.$transaction((tx) => payRun(tx, input.runId, input, { id: user.id }));
    revalidatePath(`/payroll/runs/${input.runId}`);
    return { ok: true, message: "Marked as paid." };
  });
}

export async function voidRunAction(raw: unknown): Promise<ActionState> {
  return handleAction(async () => {
    const user = await requireActor();
    const input = z.object({ runId: id, reason: z.string().trim().min(3).max(200) }).parse(raw);
    const run = await db.payrollRun.findUniqueOrThrow({ where: { id: input.runId } });
    await assertRunScope(user, input.runId, run.status === "DRAFT" ? "payroll:run" : "records:void");
    await db.$transaction((tx) => voidRun(tx, input.runId, { id: user.id }, manilaDateString(), input.reason));
    revalidatePath("/payroll");
    return { ok: true, message: run.status === "DRAFT" ? "Draft deleted." : "Payroll voided." };
  });
}

// ── Loans, remittances, setup ───────────────────────────────────────────────

export async function createLoanAction(raw: unknown): Promise<ActionState> {
  return handleAction(async () => {
    const user = await requireActor();
    const input = z.object({ employeeId: id, type: z.enum(["CASH_ADVANCE", "COMPANY_LOAN", "SSS_LOAN", "PAGIBIG_LOAN"]), principal: pesoField, perPayroll: pesoField, startDate: ymd, moneyAccountId: z.string().optional() }).parse(raw);
    const loc = await homeOf(input.employeeId);
    assertCan(user, "payroll:run", loc);
    await db.$transaction((tx) => createLoan(tx, { ...input, principalCents: input.principal, perPayrollCents: input.perPayroll, locationId: loc }, { id: user.id }));
    revalidatePath("/payroll/loans");
    return { ok: true, message: "Saved. It will be deducted from the next payrolls." };
  });
}

export async function stopLoanAction(loanId: string): Promise<ActionState> {
  return handleAction(async () => {
    const user = await requireActor();
    const loan = await db.employeeLoan.findUniqueOrThrow({ where: { id: loanId } });
    assertCan(user, "payroll:run", await homeOf(loan.employeeId));
    await db.employeeLoan.update({ where: { id: loanId }, data: { isActive: !loan.isActive } });
    revalidatePath("/payroll/loans");
    return { ok: true, message: loan.isActive ? "Deductions paused." : "Deductions resumed." };
  });
}

export async function remitAction(raw: unknown): Promise<ActionState> {
  return handleAction(async () => {
    const user = await requireActor();
    const input = z.object({ kind: z.enum(["SSS", "PHILHEALTH", "PAGIBIG", "WITHHOLDING_TAX"]), month: z.string().regex(/^\d{4}-\d{2}$/), amount: pesoField, moneyAccountId: id, date: ymd, reference: opt }).parse(raw);
    assertCanAnywhere(user, "payroll:approve");
    await db.$transaction((tx) => remitContributions(tx, { ...input, amountCents: input.amount }, { id: user.id }));
    revalidatePath("/payroll/remittances");
    return { ok: true, message: "Remittance recorded." };
  });
}

export async function saveHolidayAction(raw: unknown): Promise<ActionState> {
  return handleAction(async () => {
    const user = await requireActor();
    assertCanAnywhere(user, "payroll:run");
    const input = z.object({ date: ymd, name: z.string().trim().min(2).max(80), type: z.enum(["REGULAR", "SPECIAL_NON_WORKING", "SPECIAL_WORKING"]), locationId: z.string().optional().default("") }).parse(raw);
    if (input.locationId) assertCan(user, "payroll:run", input.locationId);
    const existing = await db.holiday.findFirst({ where: { date: toDbDate(input.date), locationId: input.locationId || null } });
    if (existing) await db.holiday.update({ where: { id: existing.id }, data: { name: input.name, type: input.type } });
    else await db.holiday.create({ data: { date: toDbDate(input.date), name: input.name, type: input.type, locationId: input.locationId || null } });
    revalidatePath("/payroll/setup");
    return { ok: true, message: "Holiday saved." };
  });
}

export async function deleteHolidayAction(holidayId: string): Promise<ActionState> {
  return handleAction(async () => {
    const user = await requireActor();
    assertCanAnywhere(user, "payroll:run");
    await db.holiday.delete({ where: { id: holidayId } });
    revalidatePath("/payroll/setup");
    return { ok: true, message: "Holiday removed." };
  });
}

const bracketRow = z.object({ min: pesoField, max: z.string().trim(), excessOver: pesoField, eeFixed: pesoField, eeRateBp: z.coerce.number().int().min(0).max(10000), erFixed: pesoField, erRateBp: z.coerce.number().int().min(0).max(10000), ecFixed: pesoField });

/** Saves a new version of a government table from a date (old versions stay for past payrolls). */
export async function saveTableAction(raw: unknown): Promise<ActionState> {
  return handleAction(async () => {
    const user = await requireActor();
    if (!user.isOwner) throw new UserFacingError("Only the Owner can change government tables.");
    const input = z.object({ kind: z.enum(["SSS", "PHILHEALTH", "PAGIBIG", "WITHHOLDING_TAX"]), name: z.string().trim().min(3).max(80), effectiveFrom: ymd, basis: z.enum(["MONTHLY", "SEMI_MONTHLY"]), brackets: z.array(bracketRow).min(1).max(120) }).parse(raw);
    await db.$transaction(async (tx) => {
      const t = await tx.contributionTable.create({
        data: {
          kind: input.kind,
          name: input.name,
          effectiveFrom: toDbDate(input.effectiveFrom),
          basis: input.basis,
          brackets: {
            create: input.brackets.map((b) => ({
              minCents: b.min,
              maxCents: b.max ? pesoField.parse(b.max) : null,
              excessOverCents: b.excessOver,
              eeFixedCents: b.eeFixed,
              eeRateBp: b.eeRateBp,
              erFixedCents: b.erFixed,
              erRateBp: b.erRateBp,
              ecFixedCents: b.ecFixed,
            })),
          },
        },
      });
      await writeAudit(tx, { actorId: user.id, action: "CREATE", entityType: "ContributionTable", entityId: t.id, after: { kind: input.kind, name: input.name, effectiveFrom: input.effectiveFrom, brackets: input.brackets.length } });
    });
    revalidatePath("/payroll/setup");
    return { ok: true, message: "Table saved. Payrolls from that date use it." };
  });
}
