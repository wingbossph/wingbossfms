import type { Tx } from "@/server/db";
import { writeAudit } from "@/server/audit";
import { UserFacingError } from "@/lib/errors";
import { toDbDate } from "@/lib/dates";
import { acct, cr, dr, key, type DraftLine } from "@/domains/ledger/lines";
import { postEntry, reverseEntry } from "@/domains/ledger/post";
import { moveStock, toBaseQty4 } from "@/domains/inventory/stock";
import { toQty4 } from "@/domains/inventory/wac";
import { canApproveWith, nextRun, requiredApproval } from "./rules";
import type { ExpenseInput } from "./schemas";

const ymdOf = (d: Date) => d.toISOString().slice(0, 10);

type Actor = { id: string; can: (permission: string, locationId: string) => boolean };

async function resolveSupplier(tx: Tx, input: ExpenseInput, actorId: string) {
  if (input.supplierId) return input.supplierId;
  if (!input.newSupplierName) return null;
  const existing = await tx.supplier.findFirst({ where: { name: { equals: input.newSupplierName, mode: "insensitive" } } });
  if (existing) return existing.id;
  const s = await tx.supplier.create({ data: { name: input.newSupplierName } });
  await writeAudit(tx, { actorId, action: "CREATE", entityType: "Supplier", entityId: s.id, after: { name: s.name } });
  return s.id;
}

async function validateRefs(tx: Tx, input: ExpenseInput) {
  if (input.terms === "PAID_NOW") {
    const ma = await tx.moneyAccount.findUnique({ where: { id: input.paidFromMoneyAccountId } });
    if (!ma || !ma.isActive) throw new UserFacingError("Choose where the money came from.");
    if (ma.locationId && ma.locationId !== input.locationId) throw new UserFacingError(`${ma.name} belongs to another location.`);
    if (["CARD_CLEARING", "PLATFORM_RECEIVABLE", "UNDEPOSITED_CASH"].includes(ma.kind)) throw new UserFacingError(`Expenses can't be paid from ${ma.name}.`);
  }
  const accountIds = input.lines.flatMap((l) => (l.accountId ? [l.accountId] : []));
  const accounts = await tx.account.findMany({ where: { id: { in: accountIds } }, include: { group: true, moneyAccount: true } });
  const blocked = new Set(["ACCOUNTS_PAYABLE", "RETAINED_EARNINGS", "OPENING_BALANCE_EQUITY"]);
  for (const a of accounts) {
    if (!a.isPostable || !a.isActive) throw new UserFacingError(`${a.name} is a category heading. Pick a subcategory.`);
    if (a.moneyAccount || a.isIntercompany || (a.systemKey && blocked.has(a.systemKey)) || a.group.section === "REVENUE") {
      throw new UserFacingError(`${a.name} can't be used as an expense category.`);
    }
  }
  if (accounts.length !== new Set(accountIds).size) throw new UserFacingError("Unknown category.");
}

/** Creates or updates a draft/submitted expense. Returns its id. Amount changes are audited. */
export async function saveExpense(tx: Tx, input: ExpenseInput, actor: Actor) {
  await validateRefs(tx, input);
  const supplierId = await resolveSupplier(tx, input, actor.id);
  const items = await tx.item.findMany({ where: { id: { in: input.lines.flatMap((l) => (l.itemId ? [l.itemId] : [])) } } });
  const itemById = new Map(items.map((i) => [i.id, i]));
  const lines = input.lines.map((l) => {
    const item = l.itemId ? itemById.get(l.itemId) : undefined;
    if (l.itemId && !item) throw new UserFacingError("Unknown inventory item.");
    return {
      accountId: item ? item.inventoryAccountId : l.accountId,
      itemId: item?.id ?? null,
      qty: item ? l.qty || null : null,
      // The unit label tells the stock receipt whether qty is in purchase units (box) or base units (kg).
      unit: item ? (l.unit === "PURCHASE" && item.purchaseUnit ? item.purchaseUnit : item.baseUnit) : null,
      description: l.description || item?.name || null,
      amountCents: l.amount,
    };
  });
  const total = lines.reduce((a, l) => a + l.amountCents, 0n);
  let dueDate = input.dueDate ? toDbDate(input.dueDate) : null;
  if (input.terms === "ON_ACCOUNT" && !dueDate && supplierId) {
    const s = await tx.supplier.findUnique({ where: { id: supplierId } });
    dueDate = new Date(toDbDate(input.date).getTime() + (s?.termsDays ?? 0) * 86_400_000);
  }
  const header = {
    locationId: input.locationId,
    date: toDbDate(input.date),
    supplierId,
    terms: input.terms,
    paidFromMoneyAccountId: input.terms === "PAID_NOW" ? input.paidFromMoneyAccountId : null,
    dueDate: input.terms === "ON_ACCOUNT" ? dueDate : null,
    receiptNo: input.receiptNo || null,
    isVatInvoice: input.isVatInvoice,
    vatCents: input.vat ?? 0n,
    totalCents: total,
    notes: input.notes || null,
  };

  if (input.id) {
    const before = await tx.expense.findUniqueOrThrow({ where: { id: input.id }, include: { lines: true } });
    if (before.status === "POSTED" || before.status === "VOIDED") throw new UserFacingError("Posted expenses can't be edited. Void and re-enter instead.");
    if (before.locationId !== input.locationId) throw new UserFacingError("An expense can't be moved to another location.");
    if (before.status === "SUBMITTED" && !canApproveWith(before.requiredApproval ?? "expenses:approve", (p) => actor.can(p, before.locationId))) {
      throw new UserFacingError("This expense is waiting for approval and can only be changed by an approver.");
    }
    if (before.status === "DRAFT" && before.submittedById !== actor.id && !actor.can("expenses:approve", before.locationId)) {
      throw new UserFacingError("Only the person who entered this draft can change it.");
    }
    await tx.expenseLine.deleteMany({ where: { expenseId: before.id } });
    await tx.expense.update({ where: { id: before.id }, data: { ...header, lines: { create: lines } } });
    await writeAudit(tx, {
      actorId: actor.id,
      action: "UPDATE",
      entityType: "Expense",
      entityId: before.id,
      locationId: before.locationId,
      before: { totalCents: before.totalCents, lines: before.lines.map((l) => ({ accountId: l.accountId, amountCents: l.amountCents, description: l.description })) },
      after: { totalCents: total, lines: lines.map((l) => ({ accountId: l.accountId, amountCents: l.amountCents, description: l.description })) },
    });
    return { id: before.id };
  }
  const created = await tx.expense.create({ data: { ...header, status: "DRAFT", submittedById: actor.id, lines: { create: lines } } });
  await writeAudit(tx, { actorId: actor.id, action: "CREATE", entityType: "Expense", entityId: created.id, locationId: input.locationId, after: { ...header, lines } });
  return { id: created.id };
}

/** Submits for approval; posts immediately if the submitter may approve this amount. */
export async function submitExpense(tx: Tx, expenseId: string, actor: Actor) {
  const e = await tx.expense.findUniqueOrThrow({ where: { id: expenseId } });
  if (e.status !== "DRAFT" && e.status !== "REJECTED") throw new UserFacingError("Only drafts can be submitted.");
  const rules = await tx.approvalRule.findMany({ where: { module: "expenses" } });
  const required = requiredApproval(e.totalCents, e.locationId, rules);
  await tx.expense.update({ where: { id: e.id }, data: { status: "SUBMITTED", requiredApproval: required, submittedAt: new Date() } });
  await writeAudit(tx, { actorId: actor.id, action: "SUBMIT", entityType: "Expense", entityId: e.id, locationId: e.locationId, after: { totalCents: e.totalCents, requiredApproval: required } });
  if (canApproveWith(required, (p) => actor.can(p, e.locationId))) {
    await approveExpense(tx, e.id, actor);
    return "POSTED" as const;
  }
  return "SUBMITTED" as const;
}

/** Approves and posts: expense/inventory debits, credit to the money account or payables. */
export async function approveExpense(tx: Tx, expenseId: string, actor: Actor) {
  const e = await tx.expense.findUniqueOrThrow({ where: { id: expenseId }, include: { lines: { include: { item: true } }, location: true, supplier: true } });
  if (e.status !== "SUBMITTED") throw new UserFacingError("Only submitted expenses can be approved.");
  if (!canApproveWith(e.requiredApproval ?? "expenses:approve", (p) => actor.can(p, e.locationId))) {
    throw new UserFacingError(e.requiredApproval === "expenses:approve:high" ? "This amount needs the Owner's approval." : "You can't approve expenses here.");
  }
  const date = ymdOf(e.date);
  const L = e.locationId;

  // Paid from the cash drawer after the shift was closed would break the count.
  let salesReportId: string | null = null;
  if (e.terms === "PAID_NOW" && e.paidFromMoneyAccountId) {
    const ma = await tx.moneyAccount.findUniqueOrThrow({ where: { id: e.paidFromMoneyAccountId } });
    if (ma.kind === "CASH_DRAWER") {
      const reports = await tx.salesReport.findMany({ where: { locationId: L, businessDate: e.date }, include: { cashCount: true }, orderBy: { shiftNo: "asc" } });
      const open = reports.find((r) => !r.cashCount);
      if (reports.length && !open) throw new UserFacingError("That day's shift is already closed. Pay this from petty cash instead.");
      salesReportId = open?.id ?? null;
    }
  }

  const lines: DraftLine[] = [];
  for (const l of e.lines) {
    lines.push(...dr(acct(l.accountId), L, l.amountCents, { supplierId: e.supplierId, memo: l.description }));
    if (l.item && l.qty) {
      const unitKind = l.unit && l.item.purchaseUnit && l.unit === l.item.purchaseUnit && l.unit !== l.item.baseUnit ? "PURCHASE" : "BASE";
      await moveStock(tx, {
        itemId: l.item.id,
        locationId: L,
        date,
        type: "PURCHASE",
        qty4: toBaseQty4(toQty4(l.qty.toString()), unitKind, l.item.purchaseToBase.toString()),
        valueCents: l.amountCents,
        sourceType: "Expense",
        sourceId: e.id,
        createdById: actor.id,
      });
    }
  }
  let creditAccount;
  if (e.terms === "PAID_NOW") {
    const ma = await tx.moneyAccount.findUniqueOrThrow({ where: { id: e.paidFromMoneyAccountId! } });
    creditAccount = acct(ma.glAccountId);
  } else {
    creditAccount = key("ACCOUNTS_PAYABLE");
  }
  lines.push(...cr(creditAccount, L, e.totalCents, { supplierId: e.supplierId }));

  const entryId = await postEntry(tx, {
    date,
    source: "EXPENSE",
    sourceId: e.id,
    memo: `Expense #${e.number} ${e.location.code}${e.supplier ? ` · ${e.supplier.name}` : ""}${e.receiptNo ? ` · OR ${e.receiptNo}` : ""}`,
    postedById: actor.id,
    lines,
  });
  if (e.terms === "PAID_NOW") {
    await tx.expensePayment.create({
      data: { expenseId: e.id, date: e.date, moneyAccountId: e.paidFromMoneyAccountId!, amountCents: e.totalCents, journalEntryId: entryId, createdById: actor.id },
    });
  }
  await tx.expense.update({
    where: { id: e.id },
    data: { status: "POSTED", approvedById: actor.id, approvedAt: new Date(), journalEntryId: entryId, paidCents: e.terms === "PAID_NOW" ? e.totalCents : 0n, salesReportId },
  });
  await writeAudit(tx, { actorId: actor.id, action: "APPROVE", entityType: "Expense", entityId: e.id, locationId: L, after: { totalCents: e.totalCents } });
}

export async function rejectExpense(tx: Tx, expenseId: string, actor: Actor, note: string) {
  const e = await tx.expense.findUniqueOrThrow({ where: { id: expenseId } });
  if (e.status !== "SUBMITTED") throw new UserFacingError("Only submitted expenses can be rejected.");
  if (!canApproveWith(e.requiredApproval ?? "expenses:approve", (p) => actor.can(p, e.locationId))) throw new UserFacingError("You can't approve or reject this expense.");
  if (note.length < 3) throw new UserFacingError("Say why it's rejected.");
  await tx.expense.update({ where: { id: e.id }, data: { status: "REJECTED", notes: [e.notes, `Rejected: ${note}`].filter(Boolean).join("\n") } });
  await writeAudit(tx, { actorId: actor.id, action: "REJECT", entityType: "Expense", entityId: e.id, locationId: e.locationId, reason: note });
}

/** Pays (part of) a supplier bill. */
export async function payBill(tx: Tx, input: { expenseId: string; date: string; moneyAccountId: string; amountCents: bigint; reference: string }, actorId: string) {
  const e = await tx.expense.findUniqueOrThrow({ where: { id: input.expenseId }, include: { location: true, supplier: true } });
  if (e.status !== "POSTED" || e.terms !== "ON_ACCOUNT") throw new UserFacingError("Only posted supplier bills can be paid here.");
  const balance = e.totalCents - e.paidCents;
  if (input.amountCents <= 0n || input.amountCents > balance) throw new UserFacingError(`Pay between ₱0.01 and the balance due.`);
  const ma = await tx.moneyAccount.findUniqueOrThrow({ where: { id: input.moneyAccountId } });
  if (ma.locationId && ma.locationId !== e.locationId) throw new UserFacingError(`${ma.name} belongs to another location.`);
  const payment = await tx.expensePayment.create({
    data: { expenseId: e.id, date: toDbDate(input.date), moneyAccountId: ma.id, amountCents: input.amountCents, reference: input.reference || null, createdById: actorId },
  });
  const entryId = await postEntry(tx, {
    date: input.date,
    source: "EXPENSE_PAYMENT",
    sourceId: payment.id,
    memo: `Payment of bill #${e.number}${e.supplier ? ` · ${e.supplier.name}` : ""}${input.reference ? ` (${input.reference})` : ""}`,
    postedById: actorId,
    lines: [...dr(key("ACCOUNTS_PAYABLE"), e.locationId, input.amountCents, { supplierId: e.supplierId }), ...cr(acct(ma.glAccountId), e.locationId, input.amountCents)],
  });
  await tx.expensePayment.update({ where: { id: payment.id }, data: { journalEntryId: entryId } });
  await tx.expense.update({ where: { id: e.id }, data: { paidCents: e.paidCents + input.amountCents } });
  await writeAudit(tx, { actorId, action: "POST", entityType: "ExpensePayment", entityId: payment.id, locationId: e.locationId, after: { expenseId: e.id, amountCents: input.amountCents, from: ma.name } });
}

/** Owner-only: reverses the expense, its payments and any stock it brought in. */
export async function voidExpense(tx: Tx, expenseId: string, actorId: string, reason: string, todayYmd: string) {
  const e = await tx.expense.findUniqueOrThrow({ where: { id: expenseId }, include: { payments: true, lines: { include: { item: true } } } });
  if (e.status === "VOIDED") throw new UserFacingError("Already voided.");
  if (e.status === "POSTED") {
    for (const p of e.payments) {
      if (p.journalEntryId && p.journalEntryId !== e.journalEntryId) await reverseEntry(tx, p.journalEntryId, { postedById: actorId, todayYmd, memo: `Void payment: ${reason}` });
    }
    if (e.journalEntryId) await reverseEntry(tx, e.journalEntryId, { postedById: actorId, todayYmd, memo: `Void expense #${e.number}: ${reason}` });
    for (const l of e.lines) {
      if (!l.item || !l.qty) continue;
      const movement = await tx.stockMovement.findFirst({ where: { sourceType: "Expense", sourceId: e.id, itemId: l.item.id, type: "PURCHASE" } });
      if (movement) {
        await moveStock(tx, {
          itemId: l.item.id,
          locationId: e.locationId,
          date: todayYmd,
          type: "ADJUSTMENT",
          out: true,
          qty4: toQty4(movement.qty.toString()),
          sourceType: "ExpenseVoid",
          sourceId: e.id,
          reason: `Void expense #${e.number}`,
          createdById: actorId,
        });
      }
    }
  }
  await tx.expense.update({ where: { id: e.id }, data: { status: "VOIDED" } });
  await writeAudit(tx, { actorId, action: "VOID", entityType: "Expense", entityId: e.id, locationId: e.locationId, reason, before: { status: e.status, totalCents: e.totalCents } });
}

/** Creates the period's draft expenses for every recurring template due on or before today. */
export async function runRecurring(tx: Tx, todayYmd: string, systemUserId: string) {
  const due = await tx.recurringExpense.findMany({ where: { isActive: true, nextRunOn: { lte: toDbDate(todayYmd) } } });
  let created = 0;
  for (const r of due) {
    let next = ymdOf(r.nextRunOn);
    // Catch up on missed runs (e.g. the job didn't run for a while), one draft per period.
    while (next <= todayYmd && (!r.endOn || next <= ymdOf(r.endOn))) {
      const exp = await tx.expense.create({
        data: {
          locationId: r.locationId,
          date: toDbDate(next),
          supplierId: r.supplierId,
          terms: r.terms,
          paidFromMoneyAccountId: r.terms === "PAID_NOW" ? r.moneyAccountId : null,
          dueDate: r.terms === "ON_ACCOUNT" ? toDbDate(next) : null,
          totalCents: r.amountCents,
          notes: `Recurring: ${r.name}`,
          status: "DRAFT",
          submittedById: systemUserId,
          recurringId: r.id,
          lines: { create: [{ accountId: r.accountId, amountCents: r.amountCents, description: r.name }] },
        },
      });
      await writeAudit(tx, { actorId: null, action: "CREATE", entityType: "Expense", entityId: exp.id, locationId: r.locationId, after: { recurring: r.name, date: next, amountCents: r.amountCents } });
      created++;
      next = nextRun(next, r.frequency, r.dayOfMonth);
    }
    await tx.recurringExpense.update({
      where: { id: r.id },
      data: { nextRunOn: toDbDate(next), isActive: !r.endOn || next <= ymdOf(r.endOn) },
    });
  }
  return created;
}
