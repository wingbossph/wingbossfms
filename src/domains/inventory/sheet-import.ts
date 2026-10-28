import type { Tx } from "@/server/db";
import { writeAudit } from "@/server/audit";
import { toDbDate } from "@/lib/dates";
import type { CostClass } from "@/generated/prisma/enums";
import { postAdjustment, postCount, saveCount, type AdjustmentLineInput } from "./documents";
import { getBalance } from "./stock";
import { fromQty4 } from "./wac";
import type { SheetDay, SheetItem } from "./sheet-parse";

// Loads a month of the branch's inventory sheet: creates missing items, then
// day by day posts deliveries (IN), transfers out (TRANSFER) and the end-of-day
// count (END), from which the system works out usage, as the sheet's OUT does.
// Quantities only: the sheet has no costs, so items keep their current unit
// cost (₱0 until purchases with prices are recorded).

type Actor = { id: string };

/** Sheet names that are the same thing as an existing catalogue item. */
const ALIASES: Record<string, string> = {
  wings: "PRO-WING",
  rice: "DRY-RICE",
  oil: "DRY-OIL",
  flour: "DRY-FLOUR",
  fries: "DRY-FRIES",
  gas: "FUEL-LPG",
  "bottled water": "BEV-WATER",
  "take-out box": "PKG-BOX",
  dishwashing: "CLN-DISH",
  "trash bag": "CLN-TRASH",
  tissue: "DIN-TISSUE",
  gloves: "DIN-GLOVES",
};

type Kind = { category: string; costClass: CostClass; unit: string; inv: string; use: string; daily: boolean };

const BEVERAGE = /coke|sprite|royal|water|iced tea|lemonade|cucumber/i;
const PACKAGING = /box|platter|container|plastic|wax|microwave/i;

export function classify(name: string, section: string): Kind {
  const n = name.toLowerCase();
  if (section === "ITEMS") {
    if (/wing|chicken/.test(n)) return { category: "Raw protein", costClass: "COGS", unit: "kg", inv: "INV_PROTEIN", use: "COGS_WINGS", daily: true };
    if (/gas/.test(n)) return { category: "Fuel", costClass: "COGS", unit: "pc", inv: "INV_SUPPLIES", use: "COGS_LPG", daily: true };
    if (/lettuce/.test(n)) return { category: "Vegetables", costClass: "COGS", unit: "kg", inv: "INV_DRY", use: "COGS_VEGETABLES", daily: true };
    if (/oil|magnesol/.test(n)) return { category: "Dry goods", costClass: "COGS", unit: n === "oil" ? "L" : "kg", inv: "INV_DRY", use: "COGS_OIL", daily: true };
    if (/bun|wrap|slice/.test(n)) return { category: "Dry goods", costClass: "COGS", unit: "pc", inv: "INV_DRY", use: "COGS_RICE", daily: true };
    return { category: "Dry goods", costClass: "COGS", unit: "kg", inv: "INV_DRY", use: "COGS_RICE", daily: true };
  }
  if (section === "SAUCES") {
    if (BEVERAGE.test(n)) return { category: "Beverage", costClass: "COGS", unit: /sachet|lemonade|cucumber/.test(n) ? "pack" : "pc", inv: "INV_BEVERAGES", use: "COGS_BEVERAGES", daily: true };
    return { category: "Sauce", costClass: "COGS", unit: "kg", inv: "INV_SAUCES", use: "COGS_SAUCES", daily: true };
  }
  if (section === "KITCHEN ITEMS") return { category: "Kitchen items", costClass: "COGS", unit: "pack", inv: "INV_DRY", use: "COGS_SAUCES", daily: false };
  if (section === "DINING SUPPLIES") return { category: "Dining supplies", costClass: "OPERATING_SUPPLY", unit: "pc", inv: "INV_SUPPLIES", use: "SUP_TISSUE", daily: false };
  if (section === "KITCHEN SUPPLIES") {
    if (PACKAGING.test(n)) return { category: "Packaging", costClass: "COGS", unit: "pc", inv: "INV_PACKAGING", use: "COGS_PACKAGING", daily: false };
    return { category: "Cleaning", costClass: "OPERATING_SUPPLY", unit: "pc", inv: "INV_SUPPLIES", use: "SUP_CLEANING", daily: false };
  }
  return { category: "Utensils", costClass: "OPERATING_SUPPLY", unit: "pc", inv: "INV_SUPPLIES", use: "SUP_CLEANING", daily: false };
}

const skuOf = (name: string) =>
  `INV-${name
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40)}`;

/** Finds or creates each sheet item and stocks it at the location. Returns sheet name → item id. */
export async function prepareSheetItems(tx: Tx, locationId: string, items: Pick<SheetItem, "name" | "section">[]) {
  const all = await tx.item.findMany({ select: { id: true, sku: true, name: true } });
  const bySku = new Map(all.filter((i) => i.sku).map((i) => [i.sku!, i.id]));
  const byName = new Map(all.map((i) => [i.name.toLowerCase(), i.id]));
  const accounts = new Map<string, string>();
  const account = async (key: string) => {
    if (!accounts.has(key)) accounts.set(key, (await tx.account.findFirstOrThrow({ where: { systemKey: key }, select: { id: true } })).id);
    return accounts.get(key)!;
  };
  const out: Record<string, string> = {};
  let created = 0;
  for (const [i, it] of items.entries()) {
    const kind = classify(it.name, it.section);
    const lower = it.name.toLowerCase();
    let id = (ALIASES[lower] && bySku.get(ALIASES[lower])) || bySku.get(skuOf(it.name)) || byName.get(lower);
    if (!id) {
      const category = await tx.itemCategory.upsert({ where: { name: kind.category }, create: { name: kind.category, defaultCostClass: kind.costClass }, update: {} });
      const item = await tx.item.create({
        data: {
          sku: skuOf(it.name),
          name: it.name,
          categoryId: category.id,
          costClass: kind.costClass,
          baseUnit: kind.unit,
          countFrequency: kind.daily ? "DAILY" : "WEEKLY",
          inventoryAccountId: await account(kind.inv),
          consumptionAccountId: await account(kind.use),
        },
      });
      id = item.id;
      created++;
    }
    await tx.itemLocationSetting.upsert({
      where: { itemId_locationId: { itemId: id, locationId } },
      create: { itemId: id, locationId, storageArea: it.section === "ITEMS" ? "Main" : it.section.charAt(0) + it.section.slice(1).toLowerCase(), countSortOrder: i },
      update: { isStocked: true, countSortOrder: i },
    });
    out[it.name] = id;
  }
  return { itemIds: out, created };
}

export type SheetDayLine = SheetDay & { itemId: string };

const SHEET = "inventory sheet";

/** Posts one day of the sheet. Skips a day already counted (so re-importing is safe). */
export async function applySheetDay(tx: Tx, args: { locationId: string; date: string; lines: SheetDayLine[]; fileName: string }, actor: Actor) {
  const { locationId: L, date } = args;
  const existing = await tx.stockCount.findUnique({ where: { locationId_countDate_type: { locationId: L, countDate: toDbDate(date), type: "DAILY" } } });
  if (existing?.status === "POSTED") return { date, skipped: true };

  // Start of day: items new here get opening stock; for the rest, a START that
  // differs from the system's balance (a correction on the sheet) is adjusted,
  // so the day's usage matches the sheet's OUT.
  const moved = new Set(
    (await tx.stockMovement.findMany({ where: { locationId: L, itemId: { in: args.lines.map((l) => l.itemId) } }, distinct: ["itemId"], select: { itemId: true } })).map((m) => m.itemId),
  );
  const items = await tx.item.findMany({ where: { id: { in: args.lines.map((l) => l.itemId) } }, select: { id: true, lastUnitCost: true } });
  const cost = new Map(items.map((i) => [i.id, i.lastUnitCost.toString()]));
  const opening = args.lines.filter((l) => !moved.has(l.itemId) && (l.start ?? 0) > 0);
  if (opening.length) {
    await postAdjustment(tx, { locationId: L, date, type: "OPENING", reason: `Opening stock (${SHEET})`, lines: opening.map((l) => ({ itemId: l.itemId, qty: String(l.start), direction: "IN", unitCost: cost.get(l.itemId) ?? "0" })) }, actor);
  }
  const corrections: AdjustmentLineInput[] = [];
  for (const l of args.lines) {
    if (l.start === null || !moved.has(l.itemId)) continue;
    const book = Number(fromQty4((await getBalance(tx, l.itemId, L)).qty4));
    const diff = Math.round((l.start - book) * 10000) / 10000;
    if (diff !== 0) corrections.push({ itemId: l.itemId, qty: String(Math.abs(diff)), direction: diff > 0 ? "IN" : "OUT" });
  }
  if (corrections.length) await postAdjustment(tx, { locationId: L, date, type: "ADJUSTMENT", reason: `Start-of-day correction (${SHEET})`, lines: corrections }, actor);

  const adj = (pick: (l: SheetDayLine) => number | null, positiveIs: "IN" | "OUT"): AdjustmentLineInput[] =>
    args.lines.flatMap((l) => {
      const v = pick(l);
      if (!v) return [];
      const dir = v > 0 ? positiveIs : positiveIs === "IN" ? "OUT" : "IN";
      return [{ itemId: l.itemId, qty: String(Math.abs(v)), direction: dir }];
    });
  const deliveries = adj((l) => l.in, "IN");
  if (deliveries.length) await postAdjustment(tx, { locationId: L, date, type: "ADJUSTMENT", reason: `Deliveries (${SHEET})`, lines: deliveries }, actor);
  const transfers = adj((l) => l.transfer, "OUT");
  if (transfers.length) await postAdjustment(tx, { locationId: L, date, type: "ADJUSTMENT", reason: `Transferred out (${SHEET})`, lines: transfers }, actor);

  const counted = args.lines.filter((l) => l.end !== null);
  if (counted.length) {
    const countId = await saveCount(tx, { locationId: L, date, type: "DAILY", notes: `From ${args.fileName}`, lines: counted.map((l) => ({ itemId: l.itemId, counted: String(Math.max(0, l.end!)) })) }, actor);
    await postCount(tx, countId, actor);
  }
  await writeAudit(tx, { actorId: actor.id, action: "IMPORT", entityType: "StockCount", entityId: `${L}:${date}`, locationId: L, after: { file: args.fileName, date, items: args.lines.length, deliveries: deliveries.length, transfers: transfers.length, counted: counted.length } });
  return { date, skipped: false };
}
