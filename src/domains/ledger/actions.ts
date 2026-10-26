"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/server/db";
import { writeAudit, diffFields } from "@/server/audit";
import { handleAction, UserFacingError, type ActionState } from "@/server/action";
import { assertCan, assertCanAnywhere, requireActor, type CurrentUser } from "@/server/auth/session";
import { pesoField } from "@/domains/admin/schemas";
import { setSetting } from "@/domains/admin/settings";
import { manilaDateString, toDbDate } from "@/lib/dates";
import { nextChildCode } from "@/domains/cash/money-accounts";
import { closeChecklist, postManualEntry, postOpeningBalances, recordOwnerEquity, runAllocation, runDepreciation, setPeriodStatus, voidLedgerEntry } from "./service";

const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const actorOf = (u: CurrentUser) => ({ id: u.id, can: (p: string, l: string) => u.access.can(p, l) });

const manualSchema = z.object({
  date: ymd,
  memo: z.string().trim().min(3).max(300),
  lines: z
    .array(z.object({ accountId: z.string().min(1), locationId: z.string().min(1), debit: pesoField, credit: pesoField, memo: z.string().trim().max(200).optional().default("") }))
    .min(2)
    .max(100),
});

export async function postManualEntryAction(raw: unknown): Promise<ActionState & { id?: string }> {
  let id: string | undefined;
  const res = await handleAction(async () => {
    const user = await requireActor();
    assertCanAnywhere(user, "ledger:journal:create");
    const input = manualSchema.parse(raw);
    id = await db.$transaction((tx) => postManualEntry(tx, input, actorOf(user)));
    revalidatePath("/ledger");
    return { ok: true, message: "Journal entry posted." };
  });
  return { ...(res ?? { ok: false }), id };
}

export async function voidEntryAction(raw: unknown): Promise<ActionState> {
  return handleAction(async () => {
    const user = await requireActor();
    const input = z.object({ entryId: z.string().min(1), reason: z.string().trim().min(5, "Give a reason") }).parse(raw);
    const entry = await db.journalEntry.findUniqueOrThrow({ where: { id: input.entryId }, include: { lines: true } });
    for (const l of entry.lines) assertCan(user, "records:void", l.locationId);
    await db.$transaction((tx) => voidLedgerEntry(tx, input.entryId, user.id, input.reason, manilaDateString()));
    revalidatePath("/ledger");
    return { ok: true, message: "Entry voided with a reversing entry." };
  });
}

export async function setPeriodStatusAction(raw: unknown): Promise<ActionState> {
  return handleAction(async () => {
    const user = await requireActor();
    assertCanAnywhere(user, "ledger:period:close");
    const input = z.object({ year: z.number().int().min(2000).max(2100), month: z.number().int().min(1).max(12), status: z.enum(["OPEN", "CLOSED"]), reason: z.string().trim().max(300).default("") }).parse(raw);
    await db.$transaction((tx) => setPeriodStatus(tx, input.year, input.month, input.status, user.id, input.reason));
    revalidatePath("/ledger/periods");
    return { ok: true, message: input.status === "CLOSED" ? "Month closed. Postings into it are now blocked." : "Month reopened." };
  });
}

export async function periodChecklistAction(year: number, month: number) {
  const user = await requireActor();
  assertCanAnywhere(user, "ledger:period:close");
  return db.$transaction((tx) => closeChecklist(tx, year, month));
}

// ── Fixed assets ────────────────────────────────────────────────────────────

const assetSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(2).max(120),
  locationId: z.string().min(1),
  category: z.string().trim().min(2).max(60),
  acquiredOn: ymd,
  cost: pesoField,
  salvage: pesoField,
  usefulLifeMonths: z.coerce.number().int().min(1).max(600),
  assetAccountId: z.string().min(1),
  depExpenseAccountId: z.string().min(1),
  disposedOn: ymd.optional().or(z.literal("")),
});

export async function saveAssetAction(raw: unknown): Promise<ActionState> {
  return handleAction(async () => {
    const user = await requireActor();
    const input = assetSchema.parse(raw);
    assertCan(user, "ledger:journal:create", input.locationId);
    if (input.salvage > input.cost) throw new UserFacingError("Salvage value can't exceed cost.");
    const accum = await db.account.findUniqueOrThrow({ where: { systemKey: "ACCUM_DEPRECIATION" } });
    const data = {
      name: input.name,
      locationId: input.locationId,
      category: input.category,
      acquiredOn: toDbDate(input.acquiredOn),
      costCents: input.cost,
      salvageCents: input.salvage,
      usefulLifeMonths: input.usefulLifeMonths,
      assetAccountId: input.assetAccountId,
      accumDepAccountId: accum.id,
      depExpenseAccountId: input.depExpenseAccountId,
      disposedOn: input.disposedOn ? toDbDate(input.disposedOn) : null,
      isActive: !input.disposedOn,
    };
    await db.$transaction(async (tx) => {
      if (input.id) {
        const before = await tx.fixedAsset.findUniqueOrThrow({ where: { id: input.id }, include: { depreciations: true } });
        if (before.depreciations.length && (before.costCents !== input.cost || before.usefulLifeMonths !== input.usefulLifeMonths)) {
          throw new UserFacingError("Cost and life can't change after depreciation has started. Dispose of it and add a new asset.");
        }
        await tx.fixedAsset.update({ where: { id: input.id }, data });
        const d = diffFields(before, data);
        if (d.changed) await writeAudit(tx, { actorId: user.id, action: "UPDATE", entityType: "FixedAsset", entityId: input.id, locationId: input.locationId, before: d.before, after: d.after });
      } else {
        const a = await tx.fixedAsset.create({ data });
        await writeAudit(tx, { actorId: user.id, action: "CREATE", entityType: "FixedAsset", entityId: a.id, locationId: input.locationId, after: data });
      }
    });
    revalidatePath("/ledger/assets");
    return { ok: true, message: `${input.name} saved.` };
  });
}

export async function runDepreciationAction(month: string): Promise<ActionState> {
  return handleAction(async () => {
    const user = await requireActor();
    assertCanAnywhere(user, "ledger:journal:create");
    if (!/^\d{4}-\d{2}$/.test(month)) throw new UserFacingError("Choose a month.");
    const res = await db.$transaction((tx) => runDepreciation(tx, `${month}-01`, user.id));
    revalidatePath("/ledger/assets");
    return { ok: true, message: res.posted ? `Depreciation posted for ${res.posted} asset(s).` : "Nothing to post for that month (already done or nothing due)." };
  });
}

// ── Owner equity & opening balances ─────────────────────────────────────────

const equitySchema = z.object({
  type: z.enum(["CAPITAL_CONTRIBUTION", "DRAWING"]),
  date: ymd,
  locationId: z.string().min(1),
  moneyAccountId: z.string().min(1),
  amount: pesoField,
  memo: z.string().trim().max(200).optional().default(""),
});

export async function ownerEquityAction(raw: unknown): Promise<ActionState> {
  return handleAction(async () => {
    const user = await requireActor();
    if (!user.isOwner) throw new UserFacingError("Only the Owner records capital and drawings.");
    const input = equitySchema.parse(raw);
    await db.$transaction((tx) => recordOwnerEquity(tx, { ...input, amountCents: input.amount }, user.id));
    revalidatePath("/ledger/equity");
    return { ok: true, message: input.type === "DRAWING" ? "Drawing recorded." : "Capital contribution recorded." };
  });
}

const openingSchema = z.object({
  date: ymd,
  lines: z.array(z.object({ accountId: z.string().min(1), locationId: z.string().min(1), amount: pesoField })).min(1).max(200),
});

export async function openingBalancesAction(raw: unknown): Promise<ActionState> {
  return handleAction(async () => {
    const user = await requireActor();
    assertCanAnywhere(user, "ledger:journal:create");
    const input = openingSchema.parse(raw);
    await db.$transaction((tx) => postOpeningBalances(tx, { date: input.date, lines: input.lines.map((l) => ({ ...l, amountCents: l.amount })) }, actorOf(user)));
    revalidatePath("/ledger");
    return { ok: true, message: "Opening balances posted." };
  });
}

// ── Chart of accounts ───────────────────────────────────────────────────────

const accountSchema = z.object({
  id: z.string().optional(),
  parentId: z.string().optional().default(""),
  groupId: z.string().min(1),
  name: z.string().trim().min(2).max(100),
  isActive: z.boolean().default(true),
  description: z.string().trim().max(300).optional().default(""),
});

export async function saveAccountAction(raw: unknown): Promise<ActionState> {
  return handleAction(async () => {
    const user = await requireActor();
    assertCanAnywhere(user, "ledger:accounts:manage");
    const input = accountSchema.parse(raw);
    await db.$transaction(async (tx) => {
      if (input.id) {
        const before = await tx.account.findUniqueOrThrow({ where: { id: input.id }, include: { moneyAccount: true } });
        if (!input.isActive && before.systemKey) throw new UserFacingError("System accounts can't be deactivated.");
        if (before.moneyAccount) throw new UserFacingError("Rename money accounts in Admin → Payments.");
        const data = { name: input.name, isActive: input.isActive, description: input.description || null };
        await tx.account.update({ where: { id: input.id }, data });
        const d = diffFields(before, data);
        if (d.changed) await writeAudit(tx, { actorId: user.id, action: "UPDATE", entityType: "Account", entityId: input.id, before: d.before, after: d.after });
      } else {
        const group = await tx.accountGroup.findUniqueOrThrow({ where: { id: input.groupId } });
        const parent = input.parentId ? await tx.account.findUniqueOrThrow({ where: { id: input.parentId } }) : null;
        const siblingCodes = (await tx.account.findMany({ where: parent ? { parentId: parent.id } : { groupId: group.id }, select: { code: true } })).map((a) => a.code);
        const groupCodes = (await tx.account.findMany({ where: { groupId: group.id }, select: { code: true } })).map((a) => a.code);
        const code = parent
          ? nextChildCode(parent.code, siblingCodes)
          : String(Math.max(...groupCodes.map((c) => Number.parseInt(c, 10)).filter(Number.isFinite)) + 1);
        const sample = await tx.account.findFirst({ where: { groupId: group.id, isPostable: true } });
        const a = await tx.account.create({
          data: { code, name: input.name, type: sample?.type ?? "EXPENSE", groupId: group.id, parentId: parent?.id ?? null, description: input.description || null },
        });
        await writeAudit(tx, { actorId: user.id, action: "CREATE", entityType: "Account", entityId: a.id, after: { code, name: input.name, group: group.name } });
      }
    });
    revalidatePath("/ledger/accounts");
    return { ok: true, message: "Account saved." };
  });
}

// ── Allocations ─────────────────────────────────────────────────────────────

const ruleSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(2).max(80),
  method: z.enum(["FIXED_SHARES", "TRANSFER_VALUE"]),
  sourceLocationId: z.string().min(1),
  accountId: z.string().optional().default(""),
  isActive: z.boolean(),
  shares: z.array(z.object({ locationId: z.string().min(1), percent: z.coerce.number().min(0).max(100) })).default([]),
});

export async function saveAllocationRuleAction(raw: unknown): Promise<ActionState> {
  return handleAction(async () => {
    const user = await requireActor();
    assertCanAnywhere(user, "settings:manage");
    const input = ruleSchema.parse(raw);
    const shares = input.shares.filter((s) => s.percent > 0).map((s) => ({ locationId: s.locationId, shareBp: Math.round(s.percent * 100) }));
    if (input.method === "FIXED_SHARES" && shares.reduce((a, s) => a + s.shareBp, 0) !== 10000) throw new UserFacingError("Shares must add up to 100%.");
    if (shares.some((s) => s.locationId === input.sourceLocationId)) throw new UserFacingError("The source location can't receive its own costs.");
    await db.$transaction(async (tx) => {
      const data = { name: input.name, method: input.method, sourceLocationId: input.sourceLocationId, accountId: input.accountId || null, isActive: input.isActive };
      const rule = input.id ? await tx.allocationRule.update({ where: { id: input.id }, data }) : await tx.allocationRule.create({ data });
      await tx.allocationShare.deleteMany({ where: { ruleId: rule.id } });
      if (input.method === "FIXED_SHARES") await tx.allocationShare.createMany({ data: shares.map((s) => ({ ...s, ruleId: rule.id })) });
      await writeAudit(tx, { actorId: user.id, action: input.id ? "UPDATE" : "CREATE", entityType: "AllocationRule", entityId: rule.id, after: { ...data, shares } });
    });
    revalidatePath("/ledger/allocations");
    return { ok: true, message: "Allocation rule saved." };
  });
}

export async function setAllocationEnabledAction(enabled: boolean): Promise<ActionState> {
  return handleAction(async () => {
    const user = await requireActor();
    assertCanAnywhere(user, "settings:manage");
    await db.$transaction(async (tx) => {
      await setSetting(tx, "allocation.enabled", enabled, null, user.id);
      await writeAudit(tx, { actorId: user.id, action: "UPDATE", entityType: "Setting", entityId: "allocation.enabled", after: { enabled } });
    });
    revalidatePath("/ledger/allocations");
    return { ok: true, message: enabled ? "Allocations turned on." : "Allocations turned off." };
  });
}

export async function runAllocationAction(raw: unknown): Promise<ActionState> {
  return handleAction(async () => {
    const user = await requireActor();
    assertCanAnywhere(user, "settings:manage");
    const input = z.object({ ruleId: z.string().min(1), month: z.string().regex(/^\d{4}-\d{2}$/) }).parse(raw);
    const res = await db.$transaction((tx) => runAllocation(tx, input.ruleId, `${input.month}-01`, user.id, manilaDateString()));
    revalidatePath("/ledger/allocations");
    return { ok: true, message: res.posted ? "Allocation posted." : "Nothing to allocate for that month." };
  });
}
