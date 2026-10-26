"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/server/db";
import { writeAudit, diffFields } from "@/server/audit";
import { handleAction, UserFacingError, type ActionState } from "@/server/action";
import { assertCanAnywhere, requireActor } from "@/server/auth/session";
import { pesoField } from "@/domains/admin/schemas";
import { createMoneyAccount } from "@/domains/cash/money-accounts";
import { setSetting, type SettingKey } from "@/domains/admin/settings";
import { toDbDate } from "@/lib/dates";

const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** "2.5" (%) → 250 basis points. */
const percentBp = z
  .string()
  .trim()
  .regex(/^\d{1,3}(\.\d{1,2})?$/, "A percentage like 2.5")
  .transform((v) => Math.round(Number(v) * 100))
  .refine((bp) => bp <= 10000, "At most 100%");

async function owner() {
  const actor = await requireActor();
  assertCanAnywhere(actor, "settings:manage");
  return actor;
}

// ── Products & prices ───────────────────────────────────────────────────────

const productSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(2).max(80),
  type: z.enum(["PACKAGE", "ALA_CARTE", "ADDON", "BEVERAGE", "TAKEOUT", "OTHER"]),
  paxPerUnit: z.string().trim().regex(/^\d{1,2}(\.\d{1,2})?$/, "e.g. 1 or 0.5"),
  revenueAccountId: z.string().min(1),
  isActive: z.boolean(),
  sortOrder: z.coerce.number().int().min(0).max(9999),
});

export async function saveProductAction(raw: unknown): Promise<ActionState> {
  return handleAction(async () => {
    const actor = await owner();
    const input = productSchema.parse(raw);
    const account = await db.account.findUnique({ where: { id: input.revenueAccountId }, include: { group: true } });
    if (!account || account.group.section !== "REVENUE" || !account.isPostable) throw new UserFacingError("Choose a revenue account.");
    const data = { name: input.name, type: input.type, paxPerUnit: input.paxPerUnit, revenueAccountId: input.revenueAccountId, isActive: input.isActive, sortOrder: input.sortOrder };
    await db.$transaction(async (tx) => {
      if (input.id) {
        const before = await tx.product.findUniqueOrThrow({ where: { id: input.id } });
        await tx.product.update({ where: { id: input.id }, data });
        const d = diffFields(before, data);
        if (d.changed) await writeAudit(tx, { actorId: actor.id, action: "UPDATE", entityType: "Product", entityId: input.id, before: d.before, after: d.after });
      } else {
        const p = await tx.product.create({ data });
        // New products start at ₱0 on every open price list so they show up for entry.
        const lists = await tx.priceList.findMany({ where: { effectiveTo: null } });
        for (const l of lists) await tx.priceListItem.create({ data: { priceListId: l.id, productId: p.id, priceCents: 0n } });
        await writeAudit(tx, { actorId: actor.id, action: "CREATE", entityType: "Product", entityId: p.id, after: data });
      }
    });
    revalidatePath("/admin/menu");
    return { ok: true, message: `${input.name} saved.` };
  });
}

const pricesSchema = z.object({
  priceListId: z.string().min(1),
  prices: z.array(z.object({ productId: z.string().min(1), price: pesoField })),
});

export async function savePricesAction(raw: unknown): Promise<ActionState> {
  return handleAction(async () => {
    const actor = await owner();
    const input = pricesSchema.parse(raw);
    await db.$transaction(async (tx) => {
      const list = await tx.priceList.findUniqueOrThrow({ where: { id: input.priceListId }, include: { items: true } });
      const before = new Map(list.items.map((i) => [i.productId, i.priceCents]));
      const changes: Record<string, { from: string; to: string }> = {};
      for (const p of input.prices) {
        if (p.price < 0n) throw new UserFacingError("Prices can't be negative.");
        const prev = before.get(p.productId);
        if (prev === p.price) continue;
        await tx.priceListItem.upsert({
          where: { priceListId_productId: { priceListId: list.id, productId: p.productId } },
          create: { priceListId: list.id, productId: p.productId, priceCents: p.price },
          update: { priceCents: p.price },
        });
        changes[p.productId] = { from: (prev ?? 0n).toString(), to: p.price.toString() };
      }
      if (Object.keys(changes).length) {
        await writeAudit(tx, { actorId: actor.id, action: "UPDATE", entityType: "PriceList", entityId: list.id, locationId: list.locationId, after: { name: list.name, changes } });
      }
    });
    revalidatePath("/admin/menu");
    return { ok: true, message: "Prices saved." };
  });
}

const newListSchema = z.object({
  name: z.string().trim().min(2).max(80),
  locationId: z.string().nullable(),
  effectiveFrom: ymd,
  copyFromId: z.string().optional(),
});

/** A new price version from a date. The previous open list for the same scope ends the day before. */
export async function newPriceListAction(raw: unknown): Promise<ActionState> {
  return handleAction(async () => {
    const actor = await owner();
    const input = newListSchema.parse(raw);
    const from = toDbDate(input.effectiveFrom);
    await db.$transaction(async (tx) => {
      const open = await tx.priceList.findMany({ where: { locationId: input.locationId, effectiveTo: null } });
      for (const l of open) {
        if (l.effectiveFrom >= from) throw new UserFacingError(`"${l.name}" already starts on or after that date.`);
        await tx.priceList.update({ where: { id: l.id }, data: { effectiveTo: new Date(from.getTime() - 86_400_000) } });
      }
      const source = input.copyFromId
        ? await tx.priceList.findUnique({ where: { id: input.copyFromId }, include: { items: true } })
        : null;
      const products = await tx.product.findMany({ select: { id: true } });
      const sourcePrices = new Map(source?.items.map((i) => [i.productId, i.priceCents]) ?? []);
      const list = await tx.priceList.create({
        data: {
          name: input.name,
          locationId: input.locationId,
          effectiveFrom: from,
          items: { create: products.map((p) => ({ productId: p.id, priceCents: sourcePrices.get(p.id) ?? 0n })) },
        },
      });
      await writeAudit(tx, { actorId: actor.id, action: "CREATE", entityType: "PriceList", entityId: list.id, locationId: input.locationId, after: input });
    });
    revalidatePath("/admin/menu");
    return { ok: true, message: "Price list created." };
  });
}

// ── Payment channels & money accounts ───────────────────────────────────────

const channelSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(2).max(60),
  kind: z.enum(["CASH", "CARD", "QR", "EWALLET", "BANK_TRANSFER", "DELIVERY_PLATFORM", "OTHER"]),
  moneyAccountId: z.string().nullable(),
  isDeferred: z.boolean(),
  feeRate: percentBp,
  feeFixed: pesoField,
  withholdingRate: percentBp,
  settlementDelayDays: z.coerce.number().int().min(0).max(60),
  settlesToMoneyAccountId: z.string().nullable(),
  isActive: z.boolean(),
  sortOrder: z.coerce.number().int().min(0).max(999),
  locationIds: z.array(z.string()),
});

export async function saveChannelAction(raw: unknown): Promise<ActionState> {
  return handleAction(async () => {
    const actor = await owner();
    const input = channelSchema.parse(raw);
    if (input.kind !== "CASH" && !input.moneyAccountId) throw new UserFacingError("Choose the money account this channel's money lands in.");
    if (input.isDeferred && !input.settlesToMoneyAccountId) throw new UserFacingError("Choose the bank account settlements are paid into.");
    const data = {
      name: input.name,
      kind: input.kind,
      moneyAccountId: input.kind === "CASH" ? null : input.moneyAccountId,
      isDeferred: input.isDeferred,
      feeRateBp: input.feeRate,
      feeFixedCents: input.feeFixed,
      withholdingRateBp: input.withholdingRate,
      settlementDelayDays: input.settlementDelayDays,
      settlesToMoneyAccountId: input.isDeferred ? input.settlesToMoneyAccountId : null,
      isActive: input.isActive,
      sortOrder: input.sortOrder,
    };
    await db.$transaction(async (tx) => {
      let id = input.id;
      if (id) {
        const before = await tx.paymentChannel.findUniqueOrThrow({ where: { id } });
        await tx.paymentChannel.update({ where: { id }, data });
        const d = diffFields(before, data);
        if (d.changed) await writeAudit(tx, { actorId: actor.id, action: "UPDATE", entityType: "PaymentChannel", entityId: id, before: d.before, after: d.after });
      } else {
        const ch = await tx.paymentChannel.create({ data });
        id = ch.id;
        await writeAudit(tx, { actorId: actor.id, action: "CREATE", entityType: "PaymentChannel", entityId: id, after: data });
      }
      await tx.paymentChannelLocation.deleteMany({ where: { channelId: id } });
      if (input.locationIds.length) await tx.paymentChannelLocation.createMany({ data: input.locationIds.map((locationId) => ({ channelId: id!, locationId })) });
    });
    revalidatePath("/admin/payments");
    return { ok: true, message: `${input.name} saved.` };
  });
}

const moneyAccountSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(2).max(80),
  kind: z.enum(["CASH_DRAWER", "UNDEPOSITED_CASH", "PETTY_CASH", "BANK", "EWALLET", "CARD_CLEARING", "PLATFORM_RECEIVABLE", "OWNER_PERSONAL"]),
  locationId: z.string().nullable(),
  isPersonal: z.boolean(),
  institution: z.string().trim().max(60).optional().default(""),
  accountRef: z.string().trim().max(40).optional().default(""),
  isActive: z.boolean(),
});

export async function saveMoneyAccountAction(raw: unknown): Promise<ActionState> {
  return handleAction(async () => {
    const actor = await owner();
    const input = moneyAccountSchema.parse(raw);
    await db.$transaction(async (tx) => {
      if (input.id) {
        const before = await tx.moneyAccount.findUniqueOrThrow({ where: { id: input.id } });
        // Kind and location are fixed once created (they define the ledger account).
        const data = { name: input.name, isPersonal: input.isPersonal, institution: input.institution || null, accountRef: input.accountRef || null, isActive: input.isActive };
        await tx.moneyAccount.update({ where: { id: input.id }, data });
        await tx.account.update({ where: { id: before.glAccountId }, data: { name: input.name } });
        const d = diffFields(before, data);
        if (d.changed) await writeAudit(tx, { actorId: actor.id, action: "UPDATE", entityType: "MoneyAccount", entityId: input.id, locationId: before.locationId, before: d.before, after: d.after });
      } else {
        const ma = await createMoneyAccount(tx, {
          name: input.name,
          kind: input.kind,
          locationId: input.locationId,
          isPersonal: input.isPersonal,
          institution: input.institution || null,
          accountRef: input.accountRef || null,
        });
        await writeAudit(tx, { actorId: actor.id, action: "CREATE", entityType: "MoneyAccount", entityId: ma.id, locationId: input.locationId, after: input });
      }
    });
    revalidatePath("/admin/payments");
    return { ok: true, message: `${input.name} saved.` };
  });
}

// ── Discount types ──────────────────────────────────────────────────────────

const discountSchema = z.object({
  id: z.string().optional(),
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9_]{2,16}$/),
  name: z.string().trim().min(2).max(60),
  rate: z.union([percentBp, z.literal("").transform(() => null)]),
  requiresIdentity: z.boolean(),
  contraAccountId: z.string().min(1),
  isActive: z.boolean(),
});

export async function saveDiscountTypeAction(raw: unknown): Promise<ActionState> {
  return handleAction(async () => {
    const actor = await owner();
    const input = discountSchema.parse(raw);
    const account = await db.account.findUnique({ where: { id: input.contraAccountId }, include: { group: true } });
    if (!account || account.group.section !== "CONTRA_REVENUE") throw new UserFacingError("Choose a discounts (contra-revenue) account.");
    const data = { code: input.code, name: input.name, defaultRateBp: input.rate, requiresIdentity: input.requiresIdentity, contraAccountId: input.contraAccountId, isActive: input.isActive };
    await db.$transaction(async (tx) => {
      if (input.id) {
        const before = await tx.discountType.findUniqueOrThrow({ where: { id: input.id } });
        await tx.discountType.update({ where: { id: input.id }, data });
        const d = diffFields(before, data);
        if (d.changed) await writeAudit(tx, { actorId: actor.id, action: "UPDATE", entityType: "DiscountType", entityId: input.id, before: d.before, after: d.after });
      } else {
        const dt = await tx.discountType.create({ data });
        await writeAudit(tx, { actorId: actor.id, action: "CREATE", entityType: "DiscountType", entityId: dt.id, after: data });
      }
    });
    revalidatePath("/admin/payments");
    return { ok: true, message: `${input.name} saved.` };
  });
}

// ── Loyverse mappings & per-location settings ───────────────────────────────

const mappingSchema = z.object({
  kind: z.enum(["ITEM", "PAYMENT_TYPE"]),
  locationId: z.string().nullable(),
  externalName: z.string().trim().min(1).max(160),
  targetId: z.string().min(1),
  paxOverride: z.string().trim().regex(/^\d{1,2}(\.\d{1,2})?$/).optional().or(z.literal("")),
});

/** Saves a Loyverse name → product/channel mapping. Admins with import rights may map. */
export async function saveLoyverseMappingAction(raw: unknown): Promise<ActionState> {
  return handleAction(async () => {
    const actor = await requireActor();
    const input = mappingSchema.parse(raw);
    if (input.locationId) {
      if (!actor.access.can("sales:import", input.locationId)) throw new UserFacingError("You can't import sales for that location.");
    } else {
      assertCanAnywhere(actor, "settings:manage");
    }
    await db.$transaction(async (tx) => {
      const existing = await tx.loyverseMapping.findFirst({ where: { kind: input.kind, locationId: input.locationId, externalName: input.externalName } });
      const data = {
        productId: input.kind === "ITEM" ? input.targetId : null,
        channelId: input.kind === "PAYMENT_TYPE" ? input.targetId : null,
        paxOverride: input.kind === "ITEM" && input.paxOverride ? input.paxOverride : null,
      };
      const row = existing
        ? await tx.loyverseMapping.update({ where: { id: existing.id }, data })
        : await tx.loyverseMapping.create({ data: { kind: input.kind, locationId: input.locationId, externalName: input.externalName, ...data } });
      await writeAudit(tx, { actorId: actor.id, action: existing ? "UPDATE" : "CREATE", entityType: "LoyverseMapping", entityId: row.id, locationId: input.locationId, after: input });
    });
    return { ok: true };
  });
}

export async function deleteLoyverseMappingAction(id: string): Promise<ActionState> {
  return handleAction(async () => {
    const actor = await owner();
    await db.$transaction(async (tx) => {
      const m = await tx.loyverseMapping.delete({ where: { id } });
      await writeAudit(tx, { actorId: actor.id, action: "DELETE", entityType: "LoyverseMapping", entityId: id, locationId: m.locationId, before: m });
    });
    revalidatePath("/admin/payments");
    return { ok: true, message: "Mapping removed." };
  });
}

const EDITABLE_SETTINGS = {
  "loyverse.storeName": z.string().trim().max(80),
  "loyverse.defaultDiscountCode": z.string().trim().max(16),
  "sales.requirePaymentsMatch": z.boolean(),
  "sales.serviceChargeToStaff": z.boolean(),
  "sales.shiftsPerDay": z.number().int().min(1).max(4),
  "inventory.varianceToleranceBp": z.number().int().min(0).max(10000),
  "transfer.markupEnabled": z.boolean(),
  "transfer.markupBp": z.number().int().min(0).max(10000),
  "transfer.shortageChargedTo": z.enum(["SENDER", "RECEIVER"]),
  "allocation.enabled": z.boolean(),
  "expenses.ownerApprovalThresholdCents": z.string().regex(/^\d+$/),
  "alerts.personalGcashShareBp": z.number().int().min(0).max(10000),
  "alerts.cashShortThresholdCents": z.string().regex(/^\d+$/),
  "reports.emailRecipients": z.string().trim().max(500),
  "reports.dailySalesEmail": z.boolean(),
  "reports.monthlyPnlEmail": z.boolean(),
  "payroll.shiftStart": z.string().regex(/^\d{2}:\d{2}$/),
  "payroll.shiftEnd": z.string().regex(/^\d{2}:\d{2}$/),
  "payroll.graceMinutes": z.number().int().min(0).max(60),
  "payroll.otMinimumMinutes": z.number().int().min(0).max(240),
  "payroll.firstPayDay": z.number().int().min(16).max(31),
  "payroll.secondPayDay": z.number().int().min(1).max(15),
  "bank.matchWindowDays": z.number().int().min(0).max(10),
  "bank.settlementToleranceBp": z.number().int().min(0).max(1000),
} satisfies Partial<Record<SettingKey, z.ZodType>>;

const settingSchema = z.object({
  key: z.enum(Object.keys(EDITABLE_SETTINGS) as [keyof typeof EDITABLE_SETTINGS, ...(keyof typeof EDITABLE_SETTINGS)[]]),
  locationId: z.string().nullable(),
  value: z.unknown(),
});

export async function saveSettingAction(raw: unknown): Promise<ActionState> {
  return handleAction(async () => {
    const actor = await owner();
    const input = settingSchema.parse(raw);
    const value = EDITABLE_SETTINGS[input.key].parse(input.value);
    await db.$transaction(async (tx) => {
      await setSetting(tx, input.key, value, input.locationId, actor.id);
      await writeAudit(tx, { actorId: actor.id, action: "UPDATE", entityType: "Setting", entityId: input.key, locationId: input.locationId, after: { [input.key]: value } });
      if (input.key === "expenses.ownerApprovalThresholdCents") {
        await tx.approvalRule.updateMany({ where: { module: "expenses", requiredPermission: "expenses:approve:high" }, data: { minAmountCents: BigInt(value as string) } });
      }
    });
    revalidatePath("/", "layout");
    return { ok: true, message: "Setting saved." };
  });
}
