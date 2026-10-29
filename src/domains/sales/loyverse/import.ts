import type { Tx } from "@/server/db";
import { writeAudit } from "@/server/audit";
import { UserFacingError } from "@/lib/errors";
import { toDbDate } from "@/lib/dates";
import { getSetting, setSetting } from "@/domains/admin/settings";
import { CONSOLIDATED_PRODUCT, consolidatedProductId, openDraft, refreshTotals, reopenReport, submitReport } from "../service";
import { isDailySummary, isSplitPayment, type ParseResult, type ParsedReceipt } from "./parse";

export const LOYVERSE_DISCOUNT_NOTE = "Loyverse import";
const REFUND_PREFIX = "Loyverse refund #";
/** Payment type given to daily-summary sales (the export has no payment split); mapped once to a channel. */
export const SUMMARY_PAYMENT_TYPE = "Sales summary";

type Mappings = {
  product(itemName: string, variant: string | null): { productId: string; paxPerUnit: number } | null;
  channel(paymentType: string): string | null;
};

const itemLabel = (item: string, variant: string | null) => (variant ? `${item} – ${variant}` : item);
const norm = (s: string) => s.trim().toLowerCase();

/** Explicit mappings first, then exact (case-insensitive) name matches. */
export async function loadMappings(tx: Tx, locationId: string): Promise<Mappings> {
  const [maps, products, channels] = await Promise.all([
    tx.loyverseMapping.findMany({ where: { OR: [{ locationId }, { locationId: null }] } }),
    tx.product.findMany({ where: { isActive: true } }),
    tx.paymentChannel.findMany({ where: { isActive: true, locations: { some: { locationId } } } }),
  ]);
  const productById = new Map(products.map((p) => [p.id, p]));
  const productByName = new Map(products.map((p) => [norm(p.name), p]));
  const channelByName = new Map(channels.map((c) => [norm(c.name), c.id]));
  // Location-specific mappings override global ones.
  maps.sort((a, b) => (a.locationId ? 1 : 0) - (b.locationId ? 1 : 0));
  const itemMap = new Map<string, { productId: string; pax: number | null }>();
  const payMap = new Map<string, string>();
  for (const m of maps) {
    if (m.kind === "ITEM" && m.productId) itemMap.set(norm(m.externalName), { productId: m.productId, pax: m.paxOverride === null ? null : Number(m.paxOverride) });
    if (m.kind === "PAYMENT_TYPE" && m.channelId) payMap.set(norm(m.externalName), m.channelId);
  }
  return {
    product(itemName, variant) {
      const hit = itemMap.get(norm(itemLabel(itemName, variant))) ?? itemMap.get(norm(itemName));
      if (hit) {
        const p = productById.get(hit.productId);
        if (p) return { productId: p.id, paxPerUnit: hit.pax ?? Number(p.paxPerUnit) };
      }
      const p = productByName.get(norm(itemLabel(itemName, variant))) ?? productByName.get(norm(itemName));
      return p ? { productId: p.id, paxPerUnit: Number(p.paxPerUnit) } : null;
    },
    channel(paymentType) {
      return payMap.get(norm(paymentType)) ?? channelByName.get(norm(paymentType)) ?? null;
    },
  };
}

export type ImportPreview = {
  kind: ParseResult["kind"];
  /** Sales summary with one row per day: imported as one consolidated total per day. */
  daily?: boolean;
  dates: string[];
  receiptCount: number;
  newCount: number;
  duplicateCount: number;
  unmappedItems: string[];
  unmappedPaymentTypes: string[];
  splitPaymentReceipts: number;
  grossCents: bigint;
  netCents: bigint;
  storeWarning: string | null;
  errors: string[];
};

/** Keeps only this location's store when the export covers several stores. */
async function filterStore(tx: Tx, locationId: string, parsed: ParseResult) {
  const storeName = (await getSetting(tx, "loyverse.storeName", locationId)).trim();
  if (parsed.stores.length === 0) return { receipts: parsed.receipts, storeWarning: null as string | null, learnStore: null as string | null };
  if (storeName) {
    const receipts = parsed.receipts.filter((r) => !r.store || norm(r.store) === norm(storeName));
    const skipped = parsed.receipts.length - receipts.length;
    return {
      receipts,
      storeWarning: skipped ? `${skipped} receipts from other stores (${parsed.stores.filter((s) => norm(s) !== norm(storeName)).join(", ")}) are skipped.` : null,
      learnStore: null,
    };
  }
  // A file whose store is already linked to another location must not be imported here.
  const linked = await tx.setting.findMany({ where: { key: "loyverse.storeName", locationId: { not: locationId } } });
  for (const s of parsed.stores) {
    const owner = linked.find((l) => typeof l.value === "string" && norm(l.value) === norm(s));
    if (owner) {
      const loc = await tx.location.findUnique({ where: { id: owner.locationId! } });
      throw new UserFacingError(`This export is for store "${s}", which belongs to ${loc?.name ?? "another location"}. Choose that location instead.`);
    }
  }
  if (parsed.stores.length > 1) {
    throw new UserFacingError(
      `This export has several stores (${parsed.stores.join(", ")}). Set this location's Loyverse store name in Admin → Payments → Loyverse, or export one store at a time.`,
    );
  }
  return { receipts: parsed.receipts, storeWarning: null, learnStore: parsed.stores[0] };
}

export async function previewImport(tx: Tx, locationId: string, parsed: ParseResult, summaryDate?: string): Promise<ImportPreview> {
  const maps = await loadMappings(tx, locationId);
  const unmappedItems = new Set<string>();
  const unmappedPay = new Set<string>();
  let split = 0;

  if (isDailySummary(parsed)) {
    const rows = parsed.summary;
    const dates = rows.map((r) => r.date!).sort();
    const reports = await tx.salesReport.findMany({ where: { locationId, shiftNo: 1, businessDate: { in: dates.map(toDbDate) } }, select: { status: true } });
    return {
      kind: parsed.kind,
      daily: true,
      dates,
      receiptCount: 0,
      newCount: rows.length - reports.length,
      duplicateCount: reports.length,
      unmappedItems: [],
      unmappedPaymentTypes: maps.channel(SUMMARY_PAYMENT_TYPE) ? [] : [SUMMARY_PAYMENT_TYPE],
      splitPaymentReceipts: 0,
      grossCents: rows.reduce((a, s) => a + s.grossCents, 0n),
      netCents: rows.reduce((a, s) => a + s.netCents, 0n),
      storeWarning: null,
      errors: parsed.errors,
    };
  }

  if (parsed.summary.length) {
    if (!summaryDate) throw new UserFacingError("Summary exports have no dates per row: choose the business date they cover.");
    for (const s of parsed.summary) {
      if (parsed.kind === "SALES_BY_ITEM" && !maps.product(s.name, null)) unmappedItems.add(s.name);
      if (parsed.kind === "SALES_BY_PAYMENT_TYPE" && !maps.channel(s.name)) unmappedPay.add(s.name);
    }
    return {
      kind: parsed.kind,
      dates: [summaryDate],
      receiptCount: 0,
      newCount: parsed.kind === "SALES_SUMMARY" ? 0 : 1,
      duplicateCount: 0,
      unmappedItems: [...unmappedItems],
      unmappedPaymentTypes: [...unmappedPay],
      splitPaymentReceipts: 0,
      grossCents: parsed.summary.reduce((a, s) => a + s.grossCents, 0n),
      netCents: parsed.summary.reduce((a, s) => a + s.netCents, 0n),
      storeWarning: null,
      errors: parsed.errors,
    };
  }

  const { receipts, storeWarning } = await filterStore(tx, locationId, parsed);
  const existing = await tx.loyverseReceipt.findMany({
    where: { locationId, receiptNumber: { in: receipts.map((r) => r.receiptNumber) } },
    select: { receiptNumber: true },
  });
  const existingSet = new Set(existing.map((e) => e.receiptNumber));
  for (const r of receipts) {
    for (const l of r.lines) if (!maps.product(l.itemName, l.variantName)) unmappedItems.add(itemLabel(l.itemName, l.variantName));
    if (r.paymentType) {
      if (isSplitPayment(r.paymentType) && !maps.channel(r.paymentType)) split++;
      else if (!maps.channel(r.paymentType)) unmappedPay.add(r.paymentType);
    }
  }
  return {
    kind: parsed.kind,
    dates: [...new Set(receipts.map((r) => r.businessDate))].sort(),
    receiptCount: receipts.length,
    newCount: receipts.filter((r) => !existingSet.has(r.receiptNumber)).length,
    duplicateCount: receipts.filter((r) => existingSet.has(r.receiptNumber)).length,
    unmappedItems: [...unmappedItems].sort(),
    unmappedPaymentTypes: [...unmappedPay].sort(),
    splitPaymentReceipts: split,
    grossCents: receipts.reduce((a, r) => a + (r.isRefund ? -r.grossCents : r.grossCents), 0n),
    netCents: receipts.reduce((a, r) => a + (r.isRefund ? -r.netCents : r.netCents), 0n),
    storeWarning,
    errors: parsed.errors,
  };
}

/** Saves new receipts (enriching ones imported earlier with missing detail) and rebuilds affected drafts. */
export async function commitImport(
  tx: Tx,
  args: { locationId: string; parsed: ParseResult; fileName: string; summaryDate?: string; actorId: string; source?: "LOYVERSE_CSV" | "LOYVERSE_API" },
) {
  const { locationId, parsed, actorId } = args;
  const preview = await previewImport(tx, locationId, parsed, args.summaryDate);
  if (preview.unmappedItems.length || preview.unmappedPaymentTypes.length) {
    throw new UserFacingError("Map every Loyverse item and payment type before importing.");
  }
  if (isDailySummary(parsed)) return commitDailySummary(tx, { locationId, parsed, fileName: args.fileName, actorId });
  if (parsed.kind === "SALES_SUMMARY") throw new UserFacingError("A Sales summary export without dates is only used as a check. Export it by day, or import Receipts by item instead.");

  const imp = await tx.loyverseImport.create({
    data: {
      locationId,
      kind: args.source === "LOYVERSE_API" ? "API" : parsed.kind,
      fileName: args.fileName,
      importedById: actorId,
      rowCount: parsed.receipts.length || parsed.summary.length,
      errors: parsed.errors.length ? parsed.errors : undefined,
    },
  });

  let receipts: ParsedReceipt[];
  if (parsed.summary.length) {
    const date = args.summaryDate!;
    const real = await tx.loyverseReceipt.count({ where: { locationId, businessDate: toDbDate(date), NOT: { receiptNumber: { startsWith: "DAY-" } } } });
    if (real) throw new UserFacingError(`Receipts for ${date} were already imported. Summary exports would double count them.`);
    const number = `DAY-${date}-${parsed.kind === "SALES_BY_ITEM" ? "ITEMS" : "PAYMENTS"}`;
    await tx.loyverseReceipt.deleteMany({ where: { locationId, receiptNumber: number } });
    const at = new Date(`${date}T12:00:00+08:00`);
    receipts = [
      {
        receiptNumber: number,
        receiptAt: at,
        businessDate: date,
        isRefund: false,
        grossCents: parsed.kind === "SALES_BY_ITEM" ? preview.grossCents : 0n,
        discountCents: parsed.kind === "SALES_BY_ITEM" ? parsed.summary.reduce((a, s) => a + (s.discountCents ?? 0n), 0n) : 0n,
        netCents: parsed.kind === "SALES_BY_ITEM" ? preview.netCents : 0n,
        paymentType: "",
        store: null,
        cashierName: null,
        posDevice: null,
        lines:
          parsed.kind === "SALES_BY_ITEM"
            ? parsed.summary.map((s) => ({ itemName: s.name, variantName: null, qty: s.qty ?? "0", grossCents: s.grossCents, discountCents: s.discountCents ?? 0n }))
            : [],
      },
    ];
    if (parsed.kind === "SALES_BY_PAYMENT_TYPE") {
      await saveReceipt(tx, locationId, imp.id, receipts[0], parsed.summary.map((s) => ({ name: s.name, amountCents: (s.netCents - (s.refundCents ?? 0n)).toString() })));
      receipts = [];
    }
  } else {
    const filtered = await filterStore(tx, locationId, parsed);
    receipts = filtered.receipts;
    if (filtered.learnStore) await setSetting(tx, "loyverse.storeName", filtered.learnStore, locationId, actorId);
  }

  let created = 0;
  let enriched = 0;
  for (const r of receipts) {
    const existing = await tx.loyverseReceipt.findUnique({
      where: { locationId_receiptNumber: { locationId, receiptNumber: r.receiptNumber } },
      include: { _count: { select: { lines: true } } },
    });
    if (!existing) {
      await saveReceipt(tx, locationId, imp.id, r);
      created++;
      continue;
    }
    // Same receipt seen before: add detail the earlier export didn't have.
    const patch: { paymentType?: string } = {};
    if (!existing.paymentType && r.paymentType) patch.paymentType = r.paymentType;
    if (Object.keys(patch).length) await tx.loyverseReceipt.update({ where: { id: existing.id }, data: patch });
    if (existing._count.lines === 0 && r.lines.length) {
      await tx.loyverseReceiptLine.createMany({ data: r.lines.map((l) => ({ receiptId: existing.id, ...l })) });
    }
    if (Object.keys(patch).length || (existing._count.lines === 0 && r.lines.length)) enriched++;
  }

  await tx.loyverseImport.update({ where: { id: imp.id }, data: { newCount: created, duplicateCount: receipts.length - created } });

  const dates = parsed.summary.length ? [args.summaryDate!] : preview.dates;
  const rebuilt: { date: string; reportId: string; skipped?: string }[] = [];
  for (const d of dates) rebuilt.push(await rebuildFromLoyverse(tx, locationId, d, actorId));

  await writeAudit(tx, {
    actorId,
    action: "IMPORT",
    entityType: "LoyverseImport",
    entityId: imp.id,
    locationId,
    after: { kind: parsed.kind, file: args.fileName, created, enriched, duplicates: receipts.length - created - enriched, dates },
  });
  return { importId: imp.id, created, enriched, duplicates: receipts.length - created - enriched, rebuilt };
}

/**
 * Sales summary exported by day: one consolidated total per day. Each day's
 * report (shift 1) is created or updated and submitted, so re-importing a
 * newer export keeps the figures current. Days with real Loyverse receipts,
 * or already closed with a cash count, are left alone.
 */
async function commitDailySummary(tx: Tx, args: { locationId: string; parsed: ParseResult; fileName: string; actorId: string }) {
  const { locationId, parsed, actorId } = args;
  const imp = await tx.loyverseImport.create({
    data: { locationId, kind: "SALES_SUMMARY", fileName: args.fileName, importedById: actorId, rowCount: parsed.summary.length, errors: parsed.errors.length ? parsed.errors : undefined },
  });
  await consolidatedProductId(tx);
  const today = new Date().toISOString().slice(0, 10);
  const rebuilt: { date: string; reportId: string; skipped?: string }[] = [];
  let created = 0;
  let updated = 0;
  let unchanged = 0;
  for (const row of [...parsed.summary].sort((a, b) => a.date!.localeCompare(b.date!))) {
    const date = row.date!;
    const refund = row.refundCents ?? 0n;
    const discount = row.discountCents ?? 0n;
    if (row.grossCents === 0n && refund === 0n && discount === 0n) {
      rebuilt.push({ date, reportId: "", skipped: "no sales" });
      continue;
    }
    const real = await tx.loyverseReceipt.count({ where: { locationId, businessDate: toDbDate(date), NOT: { receiptNumber: { startsWith: "DAY-" } } } });
    const existing = await tx.salesReport.findUnique({ where: { locationId_businessDate_shiftNo: { locationId, businessDate: toDbDate(date), shiftNo: 1 } }, include: { cashCount: true } });
    if (real) {
      rebuilt.push({ date, reportId: existing?.id ?? "", skipped: "has Loyverse receipts imported" });
      continue;
    }
    if (existing?.status === "POSTED") {
      if (existing.grossCents === row.grossCents && existing.netCents === row.netCents) {
        unchanged++;
        rebuilt.push({ date, reportId: existing.id, skipped: "unchanged" });
        continue;
      }
      if (existing.cashCount) {
        rebuilt.push({ date, reportId: existing.id, skipped: "shift already closed with a cash count; reopen it to update" });
        continue;
      }
      await reopenReport(tx, existing.id, actorId, `Updated from Loyverse sales summary (${args.fileName})`, today);
    }

    const at = new Date(`${date}T12:00:00+08:00`);
    await tx.loyverseReceipt.deleteMany({ where: { locationId, receiptNumber: { in: [`DAY-${date}-SUMMARY`, `DAY-${date}-SUMMARY-REFUNDS`] } } });
    const base = { receiptAt: at, businessDate: date, paymentType: SUMMARY_PAYMENT_TYPE, store: null, cashierName: null, posDevice: null };
    await saveReceipt(tx, locationId, imp.id, {
      ...base,
      receiptNumber: `DAY-${date}-SUMMARY`,
      isRefund: false,
      grossCents: row.grossCents,
      discountCents: discount,
      netCents: row.grossCents - discount,
      lines: [{ itemName: CONSOLIDATED_PRODUCT, variantName: null, qty: "1", grossCents: row.grossCents, discountCents: discount }],
    });
    if (refund > 0n) {
      await saveReceipt(tx, locationId, imp.id, { ...base, receiptNumber: `DAY-${date}-SUMMARY-REFUNDS`, isRefund: true, grossCents: refund, discountCents: 0n, netCents: refund, lines: [] });
    }
    const r = await rebuildFromLoyverse(tx, locationId, date, actorId);
    if (!r.skipped) {
      const report = await tx.salesReport.findUniqueOrThrow({ where: { id: r.reportId }, include: { _count: { select: { lines: true } } } });
      if (report._count.lines > 0) await submitReport(tx, r.reportId, actorId);
      if (existing) updated++;
      else created++;
    }
    rebuilt.push(r);
  }
  await tx.loyverseImport.update({ where: { id: imp.id }, data: { newCount: created, duplicateCount: unchanged } });
  await writeAudit(tx, {
    actorId,
    action: "IMPORT",
    entityType: "LoyverseImport",
    entityId: imp.id,
    locationId,
    after: { kind: "SALES_SUMMARY_DAILY", file: args.fileName, created, updated, unchanged, dates: rebuilt.map((r) => r.date) },
  });
  return { importId: imp.id, created, enriched: updated, duplicates: unchanged, rebuilt, daily: true as const };
}

async function saveReceipt(tx: Tx, locationId: string, importId: string, r: ParsedReceipt, payments?: { name: string; amountCents: string }[]) {
  await tx.loyverseReceipt.create({
    data: {
      locationId,
      importId,
      receiptNumber: r.receiptNumber,
      receiptAt: r.receiptAt,
      businessDate: toDbDate(r.businessDate),
      isRefund: r.isRefund,
      grossCents: r.grossCents,
      discountCents: r.discountCents,
      netCents: r.netCents,
      paymentType: r.paymentType,
      payments: payments ?? r.payments ?? undefined,
      cashierName: r.cashierName,
      posDevice: r.posDevice,
      lines: { create: r.lines },
    },
  });
}

/**
 * Rebuilds the Loyverse part of a day's draft (shift 1) from all receipts of
 * that day: item lines, the discount total, refunds and payments per channel.
 * Manual lines the cashier added are kept.
 */
export async function rebuildFromLoyverse(tx: Tx, locationId: string, ymd: string, actorId: string) {
  const report = await openDraft(tx, { locationId, ymd, shiftNo: 1, userId: actorId });
  if (report.status !== "DRAFT") return { date: ymd, reportId: report.id, skipped: "Report already submitted; receipts saved for the Loyverse check." };

  const maps = await loadMappings(tx, locationId);
  const receipts = await tx.loyverseReceipt.findMany({ where: { locationId, businessDate: toDbDate(ymd) }, include: { lines: true } });

  const byProduct = new Map<string, { qty: number; gross: bigint; pax: number }>();
  const payments = new Map<string, bigint>();
  let discount = 0n;
  const refunds: { amount: bigint; number: string }[] = [];
  for (const r of receipts) {
    if (r.isRefund) {
      refunds.push({ amount: r.netCents, number: r.receiptNumber });
    } else {
      discount += r.discountCents;
      for (const l of r.lines) {
        const m = maps.product(l.itemName, l.variantName);
        if (!m) throw new UserFacingError(`Loyverse item "${l.itemName}" isn't mapped to a menu item.`);
        const cur = byProduct.get(m.productId) ?? { qty: 0, gross: 0n, pax: 0 };
        cur.qty += Number(l.qty);
        cur.gross += l.grossCents;
        cur.pax += Number(l.qty) * m.paxPerUnit;
        byProduct.set(m.productId, cur);
      }
    }
    const sign = r.isRefund ? -1n : 1n;
    const split = r.payments as { name: string; amountCents: string }[] | null;
    if (split?.length) {
      for (const p of split) {
        const ch = maps.channel(p.name);
        if (ch) payments.set(ch, (payments.get(ch) ?? 0n) + sign * BigInt(p.amountCents));
      }
    } else if (r.paymentType) {
      const ch = maps.channel(r.paymentType);
      if (ch) payments.set(ch, (payments.get(ch) ?? 0n) + sign * r.netCents);
    }
  }

  await tx.salesLine.deleteMany({ where: { reportId: report.id, source: { in: ["LOYVERSE_CSV", "LOYVERSE_API"] } } });
  for (const [productId, v] of byProduct) {
    await tx.salesLine.create({
      data: {
        reportId: report.id,
        productId,
        qty: v.qty.toFixed(2),
        pax: v.pax.toFixed(2),
        unitPriceCents: v.qty ? v.gross / BigInt(Math.max(1, Math.round(v.qty))) : 0n,
        grossCents: v.gross,
        source: "LOYVERSE_CSV",
      },
    });
  }

  await tx.salesDiscount.deleteMany({ where: { reportId: report.id, notes: LOYVERSE_DISCOUNT_NOTE } });
  if (discount > 0n) {
    const code = await getSetting(tx, "loyverse.defaultDiscountCode", locationId);
    const dt = (await tx.discountType.findUnique({ where: { code } })) ?? (await tx.discountType.findFirst({ where: { isActive: true, requiresIdentity: false }, orderBy: { name: "asc" } }));
    if (dt) await tx.salesDiscount.create({ data: { reportId: report.id, discountTypeId: dt.id, amountCents: discount, notes: LOYVERSE_DISCOUNT_NOTE } });
  }
  await tx.salesVoid.deleteMany({ where: { reportId: report.id, reason: { startsWith: REFUND_PREFIX } } });
  if (refunds.length) {
    await tx.salesVoid.createMany({
      data: refunds.map((r) => ({ reportId: report.id, amountCents: r.amount, isRefund: true, reason: `${REFUND_PREFIX}${r.number}`, receiptNo: r.number })),
    });
  }
  for (const [channelId, amount] of payments) {
    await tx.salesPayment.upsert({
      where: { reportId_channelId: { reportId: report.id, channelId } },
      create: { reportId: report.id, channelId, amountCents: amount },
      update: { amountCents: amount },
    });
  }
  const manual = await tx.salesLine.count({ where: { reportId: report.id, source: "MANUAL" } });
  await tx.salesReport.update({ where: { id: report.id }, data: { source: manual ? "MIXED" : "LOYVERSE_CSV" } });
  await tx.loyverseReceipt.updateMany({ where: { id: { in: receipts.map((r) => r.id) } }, data: { reportId: report.id } });
  await refreshTotals(tx, report.id);
  return { date: ymd, reportId: report.id };
}

/** Loyverse net for a report's day vs the report (the shift-close check). */
export async function loyverseCheck(tx: Tx, reportId: string) {
  const r = await tx.salesReport.findUniqueOrThrow({ where: { id: reportId } });
  const agg = await tx.loyverseReceipt.groupBy({
    by: ["isRefund"],
    where: { locationId: r.locationId, businessDate: r.businessDate, NOT: { receiptNumber: { startsWith: "DAY-" } } },
    _sum: { netCents: true },
    _count: true,
  });
  if (agg.length === 0) return null;
  const sales = agg.find((a) => !a.isRefund)?._sum.netCents ?? 0n;
  const refunds = agg.find((a) => a.isRefund)?._sum.netCents ?? 0n;
  const receipts = agg.reduce((a, g) => a + g._count, 0);
  return { loyverseNetCents: sales - refunds, reportNetCents: r.netCents, differenceCents: r.netCents - (sales - refunds), receipts };
}
