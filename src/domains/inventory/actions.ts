"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/server/db";
import { writeAudit, diffFields } from "@/server/audit";
import { handleAction, UserFacingError, type ActionState } from "@/server/action";
import { assertCan, assertCanAnywhere, requireActor } from "@/server/auth/session";
import { linkAttachments } from "@/server/attachments";
import { pesoField } from "@/domains/admin/schemas";
import { manilaDateString, toDbDate } from "@/lib/dates";
import { postAdjustment, postCount, saveCount } from "./documents";
import { cancelTransfer, dispatchTransfer, receiveTransfer, recordProduction, saveTransfer, settleInterco } from "./commissary";

const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const qty = z.string().trim().regex(/^\d+(\.\d{1,4})?$/, "Quantity like 2 or 1.25");
const notFuture = (d: string) => {
  if (d > manilaDateString()) throw new UserFacingError("The date can't be in the future.");
};

// ── Items ───────────────────────────────────────────────────────────────────

const itemSchema = z.object({
  id: z.string().optional(),
  sku: z.string().trim().max(40).optional().default(""),
  name: z.string().trim().min(2).max(100),
  categoryId: z.string().min(1),
  costClass: z.enum(["COGS", "OPERATING_SUPPLY", "FIXED_ASSET"]),
  baseUnit: z.string().trim().min(1).max(12),
  purchaseUnit: z.string().trim().max(12).optional().default(""),
  purchaseToBase: z.string().trim().regex(/^\d+(\.\d{1,6})?$/).default("1"),
  countFrequency: z.enum(["DAILY", "WEEKLY", "MONTHLY"]),
  isProduced: z.boolean(),
  inventoryAccountId: z.string().min(1),
  consumptionAccountId: z.string().min(1),
  preferredSupplierId: z.string().optional().default(""),
  isActive: z.boolean(),
  locations: z.array(
    z.object({
      locationId: z.string().min(1),
      isStocked: z.boolean(),
      parLevel: z.string().optional().default(""),
      reorderPoint: z.string().optional().default(""),
      storageArea: z.string().trim().max(40).optional().default(""),
      varianceTolerancePct: z.string().optional().default(""),
    }),
  ),
});

export async function saveItemAction(raw: unknown): Promise<ActionState> {
  return handleAction(async () => {
    const user = await requireActor();
    assertCanAnywhere(user, "inventory:items:manage");
    const input = itemSchema.parse(raw);
    const data = {
      sku: input.sku || null,
      name: input.name,
      categoryId: input.categoryId,
      costClass: input.costClass,
      baseUnit: input.baseUnit,
      purchaseUnit: input.purchaseUnit || null,
      purchaseToBase: input.purchaseToBase,
      countFrequency: input.countFrequency,
      isProduced: input.isProduced,
      inventoryAccountId: input.inventoryAccountId,
      consumptionAccountId: input.consumptionAccountId,
      preferredSupplierId: input.preferredSupplierId || null,
      isActive: input.isActive,
    };
    await db.$transaction(async (tx) => {
      let id = input.id;
      if (id) {
        const before = await tx.item.findUniqueOrThrow({ where: { id } });
        await tx.item.update({ where: { id }, data });
        const d = diffFields(before, data);
        if (d.changed) await writeAudit(tx, { actorId: user.id, action: "UPDATE", entityType: "Item", entityId: id, before: d.before, after: d.after });
      } else {
        id = (await tx.item.create({ data })).id;
        await writeAudit(tx, { actorId: user.id, action: "CREATE", entityType: "Item", entityId: id, after: data });
      }
      for (const l of input.locations) {
        const settings = {
          isStocked: l.isStocked,
          parLevel: l.parLevel || null,
          reorderPoint: l.reorderPoint || null,
          storageArea: l.storageArea || null,
          varianceToleranceBp: l.varianceTolerancePct ? Math.round(Number(l.varianceTolerancePct) * 100) : null,
        };
        await tx.itemLocationSetting.upsert({
          where: { itemId_locationId: { itemId: id, locationId: l.locationId } },
          create: { itemId: id, locationId: l.locationId, ...settings },
          update: settings,
        });
      }
    });
    revalidatePath("/inventory/items");
    return { ok: true, message: `${input.name} saved.` };
  });
}

// ── Counts & adjustments ────────────────────────────────────────────────────

const countSchema = z.object({
  locationId: z.string().min(1),
  date: ymd,
  type: z.enum(["DAILY", "WEEKLY", "MONTHLY", "FULL"]),
  lines: z.array(z.object({ itemId: z.string().min(1), counted: z.union([qty, z.literal("")]) })).max(500),
  notes: z.string().trim().max(300).optional().default(""),
  post: z.boolean().default(false),
});

export async function saveCountAction(raw: unknown): Promise<ActionState & { id?: string }> {
  let id: string | undefined;
  const res = await handleAction(async () => {
    const user = await requireActor();
    const input = countSchema.parse(raw);
    assertCan(user, "inventory:count", input.locationId);
    notFuture(input.date);
    await db.$transaction(async (tx) => {
      id = await saveCount(tx, input, { id: user.id });
      if (input.post) await postCount(tx, id, { id: user.id });
    });
    revalidatePath("/inventory");
    return { ok: true, message: input.post ? "Count posted. Usage was recorded." : "Count saved as a draft." };
  });
  return { ...(res ?? { ok: false }), id };
}

const adjustmentSchema = z.object({
  locationId: z.string().min(1),
  date: ymd,
  type: z.enum(["WASTE", "STAFF_MEAL", "ADJUSTMENT", "OPENING"]),
  reason: z.string().trim().min(3, "Give a reason").max(300),
  lines: z.array(z.object({ itemId: z.string().min(1), qty, direction: z.enum(["OUT", "IN"]).default("OUT"), unitCost: z.string().optional(), reason: z.string().optional() })).min(1).max(100),
  attachmentIds: z.array(z.string()).max(5).default([]),
});

export async function postAdjustmentAction(raw: unknown): Promise<ActionState> {
  return handleAction(async () => {
    const user = await requireActor();
    const input = adjustmentSchema.parse(raw);
    assertCan(user, input.type === "OPENING" ? "inventory:items:manage" : "inventory:adjust", input.locationId);
    notFuture(input.date);
    await db.$transaction(async (tx) => {
      const id = await postAdjustment(tx, input, { id: user.id });
      await linkAttachments(tx, input.attachmentIds, { actorId: user.id, entityType: "StockAdjustment", entityId: id, locationId: input.locationId });
    });
    revalidatePath("/inventory");
    return { ok: true, message: { WASTE: "Waste recorded.", STAFF_MEAL: "Staff meal recorded.", ADJUSTMENT: "Adjustment recorded.", OPENING: "Opening stock recorded." }[input.type] };
  });
}

// ── Recipes & standards ─────────────────────────────────────────────────────

const recipeSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(2).max(100),
  kind: z.enum(["PRODUCTION", "MENU_ITEM", "PACKAGE_PER_PAX"]),
  productId: z.string().optional().default(""),
  outputItemId: z.string().optional().default(""),
  outputQty: z.union([qty, z.literal("")]).default(""),
  overheadPerUnit: pesoField,
  effectiveFrom: ymd,
  lines: z.array(z.object({ itemId: z.string().min(1), qty: z.string().trim().regex(/^\d+(\.\d{1,4})?$/) })).max(60),
});

export async function saveRecipeAction(raw: unknown): Promise<ActionState> {
  return handleAction(async () => {
    const user = await requireActor();
    assertCanAnywhere(user, "inventory:items:manage");
    const input = recipeSchema.parse(raw);
    if (input.kind === "PRODUCTION" && (!input.outputItemId || !input.outputQty)) throw new UserFacingError("Choose what the recipe makes and how much one batch yields.");
    if (input.kind !== "PRODUCTION" && !input.productId) throw new UserFacingError("Choose the menu item.");
    const data = {
      name: input.name,
      kind: input.kind,
      productId: input.kind === "PRODUCTION" ? null : input.productId,
      outputItemId: input.kind === "PRODUCTION" ? input.outputItemId : null,
      outputQty: input.kind === "PRODUCTION" ? input.outputQty : null,
      overheadPerUnitCents: input.kind === "PRODUCTION" ? input.overheadPerUnit : 0n,
      effectiveFrom: toDbDate(input.effectiveFrom),
    };
    const lines = input.lines.filter((l) => Number(l.qty) >= 0);
    await db.$transaction(async (tx) => {
      if (input.id) {
        const before = await tx.recipe.findUniqueOrThrow({ where: { id: input.id }, include: { lines: true } });
        await tx.recipeLine.deleteMany({ where: { recipeId: input.id } });
        await tx.recipe.update({ where: { id: input.id }, data: { ...data, lines: { create: lines } } });
        await writeAudit(tx, {
          actorId: user.id,
          action: "UPDATE",
          entityType: "Recipe",
          entityId: input.id,
          before: { lines: before.lines.map((l) => ({ itemId: l.itemId, qty: l.qty.toString() })) },
          after: { lines },
        });
      } else {
        const r = await tx.recipe.create({ data: { ...data, lines: { create: lines } } });
        await writeAudit(tx, { actorId: user.id, action: "CREATE", entityType: "Recipe", entityId: r.id, after: { ...data, lines } });
      }
    });
    revalidatePath("/inventory/recipes");
    return { ok: true, message: `${input.name} saved.` };
  });
}

// ── Production & transfers ──────────────────────────────────────────────────

const productionSchema = z.object({
  locationId: z.string().min(1),
  recipeId: z.string().min(1),
  date: ymd,
  outputQty: qty,
  inputs: z.array(z.object({ itemId: z.string().min(1), qty })).default([]),
  lotCode: z.string().trim().max(40).optional().default(""),
  expiresOn: ymd.optional().or(z.literal("")),
});

export async function recordProductionAction(raw: unknown): Promise<ActionState> {
  return handleAction(async () => {
    const user = await requireActor();
    const input = productionSchema.parse(raw);
    assertCan(user, "production:create", input.locationId);
    notFuture(input.date);
    await db.$transaction((tx) => recordProduction(tx, { ...input, expiresOn: input.expiresOn || undefined }, { id: user.id }));
    revalidatePath("/commissary/production");
    return { ok: true, message: "Batch recorded." };
  });
}

const transferSchema = z.object({
  id: z.string().optional(),
  fromLocationId: z.string().min(1),
  toLocationId: z.string().min(1),
  notes: z.string().trim().max(300).optional().default(""),
  lines: z.array(z.object({ itemId: z.string().min(1), qty: z.union([qty, z.literal("")]) })).max(100),
  date: ymd,
  dispatch: z.boolean().default(true),
});

/** Save a transfer and (by default) dispatch it immediately — the one-minute mobile flow. */
export async function saveTransferAction(raw: unknown): Promise<ActionState & { id?: string }> {
  let id: string | undefined;
  const res = await handleAction(async () => {
    const user = await requireActor();
    const input = transferSchema.parse(raw);
    assertCan(user, "transfers:create", input.fromLocationId);
    notFuture(input.date);
    await db.$transaction(async (tx) => {
      id = await saveTransfer(tx, { ...input, lines: input.lines.filter((l) => l.qty) }, { id: user.id });
      if (input.dispatch) await dispatchTransfer(tx, id, input.date, { id: user.id });
    });
    revalidatePath("/commissary");
    return { ok: true, message: input.dispatch ? "Dispatched. The branch confirms when it arrives." : "Saved as draft." };
  });
  return { ...(res ?? { ok: false }), id };
}

export async function dispatchTransferAction(raw: unknown): Promise<ActionState> {
  return handleAction(async () => {
    const user = await requireActor();
    const input = z.object({ transferId: z.string().min(1), date: ymd }).parse(raw);
    const t = await db.transfer.findUniqueOrThrow({ where: { id: input.transferId } });
    assertCan(user, "transfers:create", t.fromLocationId);
    await db.$transaction((tx) => dispatchTransfer(tx, t.id, input.date, { id: user.id }));
    revalidatePath("/commissary");
    return { ok: true, message: "Dispatched." };
  });
}

export async function receiveTransferAction(raw: unknown): Promise<ActionState> {
  return handleAction(async () => {
    const user = await requireActor();
    const input = z
      .object({ transferId: z.string().min(1), date: ymd, lines: z.array(z.object({ lineId: z.string().min(1), qty, reason: z.string().trim().max(200).optional() })) })
      .parse(raw);
    const t = await db.transfer.findUniqueOrThrow({ where: { id: input.transferId } });
    assertCan(user, "transfers:receive", t.toLocationId);
    notFuture(input.date);
    await db.$transaction((tx) => receiveTransfer(tx, t.id, input.date, input.lines, { id: user.id }));
    revalidatePath("/commissary");
    return { ok: true, message: "Received. Stock added to your inventory." };
  });
}

export async function cancelTransferAction(transferId: string): Promise<ActionState> {
  return handleAction(async () => {
    const user = await requireActor();
    const t = await db.transfer.findUniqueOrThrow({ where: { id: transferId } });
    assertCan(user, "transfers:create", t.fromLocationId);
    await db.$transaction((tx) => cancelTransfer(tx, transferId, { id: user.id }));
    revalidatePath("/commissary");
    return { ok: true, message: "Transfer cancelled." };
  });
}

const presetSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(2).max(60),
  fromLocationId: z.string().min(1),
  toLocationId: z.string().optional().default(""),
  lines: z.array(z.object({ itemId: z.string().min(1), qty })).min(1).max(60),
});

export async function savePresetAction(raw: unknown): Promise<ActionState> {
  return handleAction(async () => {
    const user = await requireActor();
    const input = presetSchema.parse(raw);
    assertCan(user, "transfers:create", input.fromLocationId);
    await db.$transaction(async (tx) => {
      const data = { name: input.name, fromLocationId: input.fromLocationId, toLocationId: input.toLocationId || null };
      const preset = input.id ? await tx.transferPreset.update({ where: { id: input.id }, data }) : await tx.transferPreset.create({ data });
      await tx.transferPresetLine.deleteMany({ where: { presetId: preset.id } });
      await tx.transferPresetLine.createMany({ data: input.lines.map((l) => ({ presetId: preset.id, itemId: l.itemId, defaultQty: l.qty })) });
      await writeAudit(tx, { actorId: user.id, action: input.id ? "UPDATE" : "CREATE", entityType: "TransferPreset", entityId: preset.id, locationId: input.fromLocationId, after: input });
    });
    revalidatePath("/commissary");
    return { ok: true, message: `Pick list "${input.name}" saved.` };
  });
}

const settleSchema = z.object({ date: ymd, payerLocationId: z.string().min(1), payeeLocationId: z.string().min(1), amount: pesoField, moneyAccountId: z.string().min(1), notes: z.string().trim().max(200).optional().default("") });

export async function settleIntercoAction(raw: unknown): Promise<ActionState> {
  return handleAction(async () => {
    const user = await requireActor();
    const input = settleSchema.parse(raw);
    assertCan(user, "payables:manage", input.payerLocationId);
    assertCan(user, "payables:manage", input.payeeLocationId);
    await db.$transaction((tx) => settleInterco(tx, { ...input, amountCents: input.amount }, { id: user.id }));
    revalidatePath("/commissary/statement");
    return { ok: true, message: "Settlement recorded." };
  });
}

// ── Inventory sheet import (monthly workbook, one tab per month) ───────────

const sheetFileSchema = z.object({ base64: z.string().min(1).max(16_000_000), tab: z.string().max(100).optional().default("") });

/** Reads the workbook: the tab names, and the chosen tab's items and days. */
export async function readInventorySheetAction(raw: unknown) {
  const actor = await requireActor();
  assertCanAnywhere(actor, "inventory:items:manage");
  const input = sheetFileSchema.parse(raw);
  try {
    const { readWorkbookTabs, parseInventoryTab } = await import("./sheet-parse");
    const wb = await readWorkbookTabs(Buffer.from(input.base64, "base64"));
    const tabs = wb.worksheets.map((w) => w.name);
    const ws = input.tab ? wb.getWorksheet(input.tab) : undefined;
    return { ok: true as const, tabs, sheet: ws ? parseInventoryTab(ws) : null };
  } catch (e) {
    return { ok: false as const, message: e instanceof UserFacingError ? e.message : "Couldn't read this workbook.", tabs: [] as string[], sheet: null };
  }
}

const prepareSchema = z.object({ locationId: z.string().min(1), items: z.array(z.object({ name: z.string().min(1).max(120), section: z.string().max(60) })).max(1000) });

export async function prepareInventorySheetAction(raw: unknown): Promise<ActionState & { itemIds?: Record<string, string>; created?: number }> {
  let extra: { itemIds?: Record<string, string>; created?: number } = {};
  const res = await handleAction(async () => {
    const actor = await requireActor();
    const input = prepareSchema.parse(raw);
    assertCan(actor, "inventory:items:manage", input.locationId);
    const { prepareSheetItems } = await import("./sheet-import");
    extra = await db.$transaction((tx) => prepareSheetItems(tx, input.locationId, input.items), { timeout: 120_000 });
    return { ok: true, message: `${extra.created} new item(s).` };
  });
  return { ...(res ?? { ok: false }), ...extra };
}

const n = z.number().nullable();
const sheetDaySchema = z.object({
  locationId: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  fileName: z.string().max(200),
  lines: z.array(z.object({ itemId: z.string().min(1), start: n, in: n, out: n, transfer: n, end: n })).max(1000),
});

export async function applyInventorySheetDayAction(raw: unknown): Promise<ActionState & { skipped?: boolean }> {
  let skipped = false;
  const res = await handleAction(async () => {
    const actor = await requireActor();
    const input = sheetDaySchema.parse(raw);
    assertCan(actor, "inventory:count", input.locationId);
    assertCan(actor, "inventory:adjust", input.locationId);
    if (input.date > manilaDateString()) throw new UserFacingError(`${input.date} is in the future.`);
    const { applySheetDay } = await import("./sheet-import");
    const r = await db.$transaction((tx) => applySheetDay(tx, input, actor), { timeout: 120_000 });
    skipped = r.skipped;
    return { ok: true, message: r.skipped ? `${input.date} already counted: skipped.` : `${input.date} imported.` };
  });
  if (!skipped) revalidatePath("/inventory");
  return { ...(res ?? { ok: false }), skipped };
}
