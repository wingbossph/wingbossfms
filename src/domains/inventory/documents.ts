import type { Tx } from "@/server/db";
import { writeAudit } from "@/server/audit";
import { UserFacingError } from "@/lib/errors";
import { toDbDate } from "@/lib/dates";
import { acct, cr, dr, key, type DraftLine } from "@/domains/ledger/lines";
import { postEntry } from "@/domains/ledger/post";
import { getBalance, moveStock } from "./stock";
import { fromMicro, fromQty4, toMicro, toQty4, valueAt } from "./wac";

// Stock documents: physical counts, waste/staff meals/adjustments, opening stock.

type Actor = { id: string };

/** Items to count at a location for a count type, in storage-area order. Daily ⊂ weekly ⊂ monthly. */
export async function countSheet(tx: Tx, locationId: string, type: "DAILY" | "WEEKLY" | "MONTHLY" | "FULL") {
  const settings = await tx.itemLocationSetting.findMany({
    where: { locationId, isStocked: true, item: { isActive: true } },
    include: { item: { include: { category: true } } },
  });
  const include = (freq: string) =>
    type === "FULL" || type === "MONTHLY" ? true : type === "WEEKLY" ? freq === "DAILY" || freq === "WEEKLY" : freq === "DAILY";
  return settings
    .filter((s) => include(s.countFrequency ?? s.item.countFrequency))
    .sort((a, b) => (a.storageArea ?? "").localeCompare(b.storageArea ?? "") || a.countSortOrder - b.countSortOrder || a.item.name.localeCompare(b.item.name))
    .map((s) => ({ itemId: s.itemId, name: s.item.name, unit: s.item.baseUnit, storageArea: s.storageArea ?? "Other", category: s.item.category.name }));
}

export type CountLineInput = { itemId: string; counted: string };

/** Saves (or replaces) a draft count's lines. */
export async function saveCount(tx: Tx, input: { locationId: string; date: string; type: "DAILY" | "WEEKLY" | "MONTHLY" | "FULL"; lines: CountLineInput[]; notes: string }, actor: Actor) {
  const existing = await tx.stockCount.findUnique({ where: { locationId_countDate_type: { locationId: input.locationId, countDate: toDbDate(input.date), type: input.type } } });
  if (existing && existing.status !== "DRAFT") throw new UserFacingError("This count is already posted. Request a correction instead.");
  const count =
    existing ??
    (await tx.stockCount.create({ data: { locationId: input.locationId, countDate: toDbDate(input.date), type: input.type, countedById: actor.id, notes: input.notes || null } }));
  await tx.stockCountLine.deleteMany({ where: { countId: count.id } });
  for (const l of input.lines) {
    if (l.counted === "") continue;
    await tx.stockCountLine.create({
      data: { countId: count.id, itemId: l.itemId, systemQty: "0", countedQty: fromQty4(toQty4(l.counted)), usageQty: "0", unitCost: "0", usageCents: 0n },
    });
  }
  await tx.stockCount.update({ where: { id: count.id }, data: { notes: input.notes || null, countedById: actor.id } });
  return count.id;
}

/**
 * Posts a count: usage = book quantity − counted quantity, valued at the
 * weighted average and moved from inventory to each item's cost account.
 * (Book quantity = beginning + received + transfers in − out − waste.)
 */
export async function postCount(tx: Tx, countId: string, actor: Actor) {
  const count = await tx.stockCount.findUniqueOrThrow({ where: { id: countId }, include: { lines: { include: { item: true } }, location: true } });
  if (count.status !== "DRAFT") throw new UserFacingError("Already posted.");
  if (count.lines.length === 0) throw new UserFacingError("Enter at least one counted quantity.");
  const date = count.countDate.toISOString().slice(0, 10);
  const lines: DraftLine[] = [];
  const L = count.locationId;
  for (const line of count.lines) {
    const book = await getBalance(tx, line.itemId, L);
    const counted = toQty4(line.countedQty.toString());
    const usage4 = book.qty4 - counted;
    let value = 0n;
    if (usage4 !== 0n) {
      const res = await moveStock(tx, {
        itemId: line.itemId,
        locationId: L,
        date,
        type: "COUNT_USAGE",
        out: usage4 > 0n,
        qty4: usage4 > 0n ? usage4 : -usage4,
        sourceType: "StockCount",
        sourceId: count.id,
        createdById: actor.id,
      });
      value = usage4 > 0n ? res.valueCents : -res.valueCents;
      lines.push(...dr(acct(line.item.consumptionAccountId), L, value), ...cr(acct(line.item.inventoryAccountId), L, value));
    }
    await tx.stockCountLine.update({
      where: { id: line.id },
      data: { systemQty: fromQty4(book.qty4), usageQty: fromQty4(usage4), unitCost: fromMicro(book.avgMicro), usageCents: value },
    });
  }
  let entryId: string | null = null;
  if (lines.length >= 2) {
    entryId = await postEntry(tx, { date, source: "STOCK_COUNT", sourceId: count.id, memo: `Stock count ${count.location.code} ${date} (${count.type.toLowerCase()})`, postedById: actor.id, lines });
  }
  await tx.stockCount.update({ where: { id: count.id }, data: { status: "POSTED", submittedAt: new Date(), postedAt: new Date(), journalEntryId: entryId } });
  await writeAudit(tx, { actorId: actor.id, action: "POST", entityType: "StockCount", entityId: count.id, locationId: L, after: { date, type: count.type, lines: count.lines.length } });
}

export type AdjustmentLineInput = { itemId: string; qty: string; direction: "OUT" | "IN"; unitCost?: string; reason?: string };

/** Waste, staff meals, adjustments (+/−) and opening stock. Posted immediately. */
export async function postAdjustment(
  tx: Tx,
  input: { locationId: string; date: string; type: "WASTE" | "STAFF_MEAL" | "ADJUSTMENT" | "OPENING"; reason: string; lines: AdjustmentLineInput[] },
  actor: Actor,
) {
  if (input.reason.trim().length < 3) throw new UserFacingError("Give a reason.");
  if (!input.lines.length) throw new UserFacingError("Add at least one item.");
  const items = await tx.item.findMany({ where: { id: { in: input.lines.map((l) => l.itemId) } } });
  const byId = new Map(items.map((i) => [i.id, i]));
  const doc = await tx.stockAdjustment.create({
    data: {
      locationId: input.locationId,
      date: toDbDate(input.date),
      type: input.type,
      reason: input.reason,
      status: "POSTED",
      createdById: actor.id,
      lines: {
        create: input.lines.map((l) => ({
          itemId: l.itemId,
          qty: fromQty4(input.type === "OPENING" || l.direction === "IN" ? toQty4(l.qty) : -toQty4(l.qty)),
          unitCost: l.unitCost ? fromMicro(toMicro(l.unitCost) * 100n) : null,
          reason: l.reason || null,
        })),
      },
    },
  });
  const L = input.locationId;
  const lines: DraftLine[] = [];
  for (const l of input.lines) {
    const item = byId.get(l.itemId);
    if (!item) throw new UserFacingError("Unknown item.");
    const qty4 = toQty4(l.qty);
    if (qty4 <= 0n) throw new UserFacingError("Quantities must be more than zero.");
    if (input.type === "OPENING") {
      // Opening stock: quantity × unit cost (pesos per base unit).
      if (!l.unitCost) throw new UserFacingError(`Enter the unit cost of ${item.name}.`);
      const value = valueAt(qty4, toMicro(l.unitCost) * 100n);
      await moveStock(tx, { itemId: item.id, locationId: L, date: input.date, type: "OPENING", qty4, valueCents: value, sourceType: "StockAdjustment", sourceId: doc.id, createdById: actor.id });
      lines.push(...dr(acct(item.inventoryAccountId), L, value), ...cr(key("OPENING_BALANCE_EQUITY"), L, value));
      continue;
    }
    const out = input.type !== "ADJUSTMENT" || l.direction === "OUT";
    const res = await moveStock(tx, {
      itemId: item.id,
      locationId: L,
      date: input.date,
      type: input.type === "ADJUSTMENT" ? "ADJUSTMENT" : input.type,
      out,
      qty4,
      sourceType: "StockAdjustment",
      sourceId: doc.id,
      reason: l.reason || input.reason,
      createdById: actor.id,
    });
    const costAccount = input.type === "WASTE" ? key("COGS_WASTE") : input.type === "STAFF_MEAL" ? key("PAY_STAFF_MEALS") : acct(item.consumptionAccountId);
    const v = out ? res.valueCents : -res.valueCents;
    lines.push(...dr(costAccount, L, v), ...cr(acct(item.inventoryAccountId), L, v));
  }
  if (lines.length >= 2) {
    const entryId = await postEntry(tx, {
      date: input.date,
      source: "STOCK_ADJUSTMENT",
      sourceId: doc.id,
      memo: `${{ WASTE: "Waste", STAFF_MEAL: "Staff meal", ADJUSTMENT: "Stock adjustment", OPENING: "Opening stock" }[input.type]}: ${input.reason}`,
      postedById: actor.id,
      lines,
    });
    await tx.stockAdjustment.update({ where: { id: doc.id }, data: { journalEntryId: entryId } });
  }
  await writeAudit(tx, { actorId: actor.id, action: "POST", entityType: "StockAdjustment", entityId: doc.id, locationId: L, after: input });
  return doc.id;
}
