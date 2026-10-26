"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/server/db";
import { writeAudit, diffFields } from "@/server/audit";
import { handleAction, UserFacingError, type ActionState } from "@/server/action";
import { assertCan, assertCanAnywhere, requireActor, type CurrentUser } from "@/server/auth/session";
import { linkAttachments } from "@/server/attachments";
import { pesoField } from "@/domains/admin/schemas";
import { manilaDateString, toDbDate } from "@/lib/dates";
import { approveExpense, payBill, rejectExpense, saveExpense, submitExpense, voidExpense } from "./service";
import { decisionSchema, expenseSchema, paymentSchema, recurringSchema, supplierSchema } from "./schemas";

const actorOf = (u: CurrentUser) => ({ id: u.id, can: (p: string, l: string) => u.access.can(p, l) });

export async function saveExpenseAction(raw: unknown): Promise<ActionState & { id?: string }> {
  let id: string | undefined;
  const res = await handleAction(async () => {
    const user = await requireActor();
    const input = expenseSchema.parse(raw);
    assertCan(user, "expenses:create", input.locationId);
    if (input.date > manilaDateString()) throw new UserFacingError("The date can't be in the future.");
    const status = await db.$transaction(async (tx) => {
      const saved = await saveExpense(tx, input, actorOf(user));
      id = saved.id;
      await linkAttachments(tx, input.attachmentIds, { actorId: user.id, entityType: "Expense", entityId: saved.id, locationId: input.locationId });
      return input.submit ? submitExpense(tx, saved.id, actorOf(user)) : "DRAFT";
    });
    revalidatePath("/expenses");
    return {
      ok: true,
      message: status === "POSTED" ? "Expense recorded." : status === "SUBMITTED" ? "Submitted for approval." : "Draft saved.",
    };
  });
  return { ...(res ?? { ok: false }), id };
}

async function forExpense(expenseId: string) {
  const user = await requireActor();
  const e = await db.expense.findUnique({ where: { id: expenseId } });
  if (!e) throw new UserFacingError("Expense not found.");
  if (!user.access.locationIds.includes(e.locationId)) throw new UserFacingError("Expense not found.");
  return { user, e };
}

export async function submitExpenseAction(expenseId: string): Promise<ActionState> {
  return handleAction(async () => {
    const { user, e } = await forExpense(expenseId);
    assertCan(user, "expenses:create", e.locationId);
    const status = await db.$transaction((tx) => submitExpense(tx, expenseId, actorOf(user)));
    revalidatePath(`/expenses/${expenseId}`);
    return { ok: true, message: status === "POSTED" ? "Expense recorded." : "Submitted for approval." };
  });
}

export async function approveExpenseAction(expenseId: string): Promise<ActionState> {
  return handleAction(async () => {
    const { user } = await forExpense(expenseId);
    await db.$transaction((tx) => approveExpense(tx, expenseId, actorOf(user)));
    revalidatePath("/expenses");
    return { ok: true, message: "Approved and posted." };
  });
}

export async function rejectExpenseAction(raw: unknown): Promise<ActionState> {
  return handleAction(async () => {
    const input = decisionSchema.parse(raw);
    const { user } = await forExpense(input.expenseId);
    await db.$transaction((tx) => rejectExpense(tx, input.expenseId, actorOf(user), input.note));
    revalidatePath("/expenses");
    return { ok: true, message: "Rejected. The submitter can fix and resubmit it." };
  });
}

export async function payBillAction(raw: unknown): Promise<ActionState> {
  return handleAction(async () => {
    const input = paymentSchema.parse(raw);
    const { user, e } = await forExpense(input.expenseId);
    assertCan(user, "payables:manage", e.locationId);
    await db.$transaction((tx) =>
      payBill(tx, { expenseId: input.expenseId, date: input.date, moneyAccountId: input.moneyAccountId, amountCents: input.amount, reference: input.reference }, user.id),
    );
    revalidatePath("/expenses");
    return { ok: true, message: "Payment recorded." };
  });
}

export async function voidExpenseAction(raw: unknown): Promise<ActionState> {
  return handleAction(async () => {
    const input = decisionSchema.parse(raw);
    const { user, e } = await forExpense(input.expenseId);
    assertCan(user, "records:void", e.locationId);
    if (input.note.length < 5) throw new UserFacingError("Give a reason for voiding.");
    await db.$transaction((tx) => voidExpense(tx, input.expenseId, user.id, input.note, manilaDateString()));
    revalidatePath("/expenses");
    return { ok: true, message: "Expense voided and its postings reversed." };
  });
}

// ── Suppliers ───────────────────────────────────────────────────────────────

export async function saveSupplierAction(raw: unknown): Promise<ActionState> {
  return handleAction(async () => {
    const user = await requireActor();
    assertCanAnywhere(user, "suppliers:manage");
    const input = supplierSchema.parse(raw);
    const data = {
      name: input.name,
      tin: input.tin || null,
      contactName: input.contactName || null,
      phone: input.phone || null,
      email: input.email || null,
      termsDays: input.termsDays,
      defaultAccountId: input.defaultAccountId || null,
      isActive: input.isActive,
    };
    await db.$transaction(async (tx) => {
      if (input.id) {
        const before = await tx.supplier.findUniqueOrThrow({ where: { id: input.id } });
        await tx.supplier.update({ where: { id: input.id }, data });
        const d = diffFields(before, data);
        if (d.changed) await writeAudit(tx, { actorId: user.id, action: "UPDATE", entityType: "Supplier", entityId: input.id, before: d.before, after: d.after });
      } else {
        const s = await tx.supplier.create({ data });
        await writeAudit(tx, { actorId: user.id, action: "CREATE", entityType: "Supplier", entityId: s.id, after: data });
      }
    });
    revalidatePath("/expenses/suppliers");
    return { ok: true, message: `${input.name} saved.` };
  });
}

// ── Recurring expenses ──────────────────────────────────────────────────────

export async function saveRecurringAction(raw: unknown): Promise<ActionState> {
  return handleAction(async () => {
    const user = await requireActor();
    const input = recurringSchema.parse(raw);
    assertCan(user, "payables:manage", input.locationId);
    if (input.terms === "PAID_NOW" && !input.moneyAccountId) throw new UserFacingError("Choose where it's paid from.");
    const data = {
      name: input.name,
      locationId: input.locationId,
      supplierId: input.supplierId || null,
      accountId: input.accountId,
      amountCents: input.amount,
      terms: input.terms,
      moneyAccountId: input.terms === "PAID_NOW" ? input.moneyAccountId : null,
      frequency: input.frequency,
      dayOfMonth: input.dayOfMonth ?? null,
      nextRunOn: toDbDate(input.nextRunOn),
      endOn: input.endOn ? toDbDate(input.endOn) : null,
      isActive: input.isActive,
    };
    await db.$transaction(async (tx) => {
      if (input.id) {
        const before = await tx.recurringExpense.findUniqueOrThrow({ where: { id: input.id } });
        await tx.recurringExpense.update({ where: { id: input.id }, data });
        const d = diffFields(before, data);
        if (d.changed) await writeAudit(tx, { actorId: user.id, action: "UPDATE", entityType: "RecurringExpense", entityId: input.id, locationId: input.locationId, before: d.before, after: d.after });
      } else {
        const r = await tx.recurringExpense.create({ data });
        await writeAudit(tx, { actorId: user.id, action: "CREATE", entityType: "RecurringExpense", entityId: r.id, locationId: input.locationId, after: data });
      }
    });
    revalidatePath("/expenses/recurring");
    return { ok: true, message: `${input.name} saved. Drafts are created automatically each period.` };
  });
}

// ── Petty cash ──────────────────────────────────────────────────────────────

const fundSchema = z.object({ moneyAccountId: z.string().min(1), imprest: pesoField, custodianUserId: z.string().optional().default("") });

export async function savePettyFundAction(raw: unknown): Promise<ActionState> {
  return handleAction(async () => {
    const user = await requireActor();
    const input = fundSchema.parse(raw);
    const ma = await db.moneyAccount.findUniqueOrThrow({ where: { id: input.moneyAccountId } });
    if (ma.kind !== "PETTY_CASH" || !ma.locationId) throw new UserFacingError("Choose a petty cash account.");
    assertCan(user, "payables:manage", ma.locationId);
    await db.$transaction(async (tx) => {
      await tx.pettyCashFund.upsert({
        where: { moneyAccountId: ma.id },
        create: { moneyAccountId: ma.id, locationId: ma.locationId!, imprestCents: input.imprest, custodianUserId: input.custodianUserId || null },
        update: { imprestCents: input.imprest, custodianUserId: input.custodianUserId || null },
      });
      await writeAudit(tx, { actorId: user.id, action: "UPDATE", entityType: "PettyCashFund", entityId: ma.id, locationId: ma.locationId, after: { imprestCents: input.imprest } });
    });
    revalidatePath("/expenses/petty-cash");
    return { ok: true, message: "Petty cash fund saved." };
  });
}
