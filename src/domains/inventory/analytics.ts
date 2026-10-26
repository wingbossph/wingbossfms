import type { Tx } from "@/server/db";
import { toDbDate } from "@/lib/dates";
import { getSetting } from "@/domains/admin/settings";

type Reader = Pick<Tx, "stockMovement" | "salesLine" | "salesReport" | "recipe" | "item" | "itemLocationSetting" | "setting" | "stockCount" | "journalLine">;

const ymdOf = (d: Date) => d.toISOString().slice(0, 10);
const q = (d: { toString(): string }) => Number(d.toString());

/**
 * Actual usage per item per count date, from posted counts (COUNT_USAGE).
 * Each count covers the days since the previous count of that item.
 */
export async function actualUsage(db: Reader, locationId: string, from: string, to: string) {
  const moves = await db.stockMovement.findMany({
    where: { locationId, type: "COUNT_USAGE", businessDate: { gte: toDbDate(from), lte: toDbDate(to) } },
    select: { itemId: true, businessDate: true, qty: true, valueCents: true },
  });
  const out = new Map<string, { itemId: string; date: string; qty: number; valueCents: bigint }>();
  for (const m of moves) {
    const k = `${m.itemId}|${ymdOf(m.businessDate)}`;
    const cur = out.get(k) ?? { itemId: m.itemId, date: ymdOf(m.businessDate), qty: 0, valueCents: 0n };
    cur.qty += -q(m.qty); // usage leaves stock (negative movement)
    cur.valueCents += -m.valueCents;
    out.set(k, cur);
  }
  return [...out.values()];
}

/** Count dates per item (any posted count that included the item), to define usage windows. */
async function countDates(db: Reader, locationId: string, before: string, to: string) {
  const counts = await db.stockCount.findMany({
    where: { locationId, status: "POSTED", countDate: { lte: toDbDate(to), gte: toDbDate(before) } },
    include: { lines: { select: { itemId: true } } },
    orderBy: { countDate: "asc" },
  });
  const byItem = new Map<string, string[]>();
  for (const c of counts) for (const l of c.lines) byItem.set(l.itemId, [...(byItem.get(l.itemId) ?? []), ymdOf(c.countDate)]);
  return byItem;
}

/** Pax and quantities sold per day per product, from submitted sales. */
export async function salesByDay(db: Reader, locationId: string, from: string, to: string) {
  const lines = await db.salesLine.findMany({
    where: { report: { locationId, status: "POSTED", businessDate: { gte: toDbDate(from), lte: toDbDate(to) } } },
    select: { productId: true, qty: true, pax: true, report: { select: { businessDate: true } } },
  });
  return lines.map((l) => ({ date: ymdOf(l.report.businessDate), productId: l.productId, qty: q(l.qty), pax: q(l.pax) }));
}

/** Per-pax standards (packages) and per-unit recipes (à la carte), newest effective first. */
async function standards(db: Reader) {
  const recipes = await db.recipe.findMany({
    where: { kind: { in: ["PACKAGE_PER_PAX", "MENU_ITEM"] }, isActive: true },
    include: { lines: true },
    orderBy: { effectiveFrom: "desc" },
  });
  return (productId: string, date: string) => recipes.find((r) => r.productId === productId && ymdOf(r.effectiveFrom) <= date);
}

/** Theoretical usage per item per day: pax × per-pax standard + units × recipe. */
export async function theoreticalUsage(db: Reader, locationId: string, from: string, to: string) {
  const [sales, std] = await Promise.all([salesByDay(db, locationId, from, to), standards(db)]);
  const out = new Map<string, number>(); // itemId|date → qty
  for (const s of sales) {
    const r = std(s.productId, s.date);
    if (!r) continue;
    const factor = r.kind === "PACKAGE_PER_PAX" ? s.pax : s.qty;
    for (const l of r.lines) {
      const k = `${l.itemId}|${s.date}`;
      out.set(k, (out.get(k) ?? 0) + factor * q(l.qty));
    }
  }
  return out;
}

export type VarianceRow = {
  itemId: string;
  item: string;
  unit: string;
  date: string;
  windowDays: number;
  pax: number;
  actualQty: number;
  theoreticalQty: number | null;
  varianceQty: number | null;
  variancePct: number | null;
  actualValueCents: bigint;
  varianceValueCents: bigint | null;
  perPax: number | null;
  flagged: boolean;
};

/** Actual vs theoretical usage per item per count, flagged beyond tolerance. */
export async function varianceReport(db: Reader, locationId: string, from: string, to: string): Promise<VarianceRow[]> {
  const lookback = ymdOf(new Date(Date.parse(`${from}T00:00:00Z`) - 31 * 86_400_000));
  const [actual, theo, sales, items, settings, dates, globalTol] = await Promise.all([
    actualUsage(db, locationId, from, to),
    theoreticalUsage(db, locationId, lookback, to),
    salesByDay(db, locationId, lookback, to),
    db.item.findMany({ select: { id: true, name: true, baseUnit: true } }),
    db.itemLocationSetting.findMany({ where: { locationId } }),
    countDates(db, locationId, lookback, to),
    getSetting(db, "inventory.varianceToleranceBp", locationId),
  ]);
  const itemById = new Map(items.map((i) => [i.id, i]));
  const tol = new Map(settings.map((s) => [s.itemId, s.varianceToleranceBp ?? globalTol]));
  const paxByDate = new Map<string, number>();
  for (const s of sales) paxByDate.set(s.date, (paxByDate.get(s.date) ?? 0) + s.pax);

  return actual
    .map((a) => {
      // Window: the day after the previous count of this item, up to this count.
      const prior = (dates.get(a.itemId) ?? []).filter((d) => d < a.date).at(-1);
      const start = prior ? ymdOf(new Date(Date.parse(`${prior}T00:00:00Z`) + 86_400_000)) : a.date;
      let theoretical = 0;
      let pax = 0;
      let days = 0;
      for (let d = start; d <= a.date; d = ymdOf(new Date(Date.parse(`${d}T00:00:00Z`) + 86_400_000))) {
        theoretical += theo.get(`${a.itemId}|${d}`) ?? 0;
        pax += paxByDate.get(d) ?? 0;
        days++;
      }
      const hasStd = theoretical > 0;
      const varianceQty = hasStd ? a.qty - theoretical : null;
      const variancePct = hasStd ? ((a.qty - theoretical) / theoretical) * 100 : null;
      const unitValue = a.qty !== 0 ? Number(a.valueCents) / a.qty : 0;
      const tolerancePct = (tol.get(a.itemId) ?? globalTol) / 100;
      const item = itemById.get(a.itemId);
      return {
        itemId: a.itemId,
        item: item?.name ?? "",
        unit: item?.baseUnit ?? "",
        date: a.date,
        windowDays: days,
        pax,
        actualQty: round(a.qty, 4),
        theoreticalQty: hasStd ? round(theoretical, 4) : null,
        varianceQty: varianceQty === null ? null : round(varianceQty, 4),
        variancePct: variancePct === null ? null : round(variancePct, 1),
        actualValueCents: a.valueCents,
        varianceValueCents: varianceQty === null ? null : BigInt(Math.round(varianceQty * unitValue)),
        perPax: pax > 0 ? round(a.qty / pax, 4) : null,
        flagged: variancePct !== null && Math.abs(variancePct) > tolerancePct,
      };
    })
    .sort((x, y) => (x.date === y.date ? x.item.localeCompare(y.item) : y.date.localeCompare(x.date)));
}

const round = (n: number, dp: number) => Math.round(n * 10 ** dp) / 10 ** dp;

export type PerPaxKpis = {
  pax: number;
  wingsKg: number;
  wingsKgPerPax: number | null;
  wingsCostPerPaxCents: bigint | null;
  sauceCostPerPaxCents: bigint | null;
  foodCostPerPaxCents: bigint | null;
  netSalesPerPaxCents: bigint | null;
  standardKgPerPax: number | null;
  weekdayKgPerPax: number | null;
  weekendKgPerPax: number | null;
};

/** The unlimited-wings numbers for a location and period. */
export async function perPaxKpis(db: Reader, locationId: string, from: string, to: string): Promise<PerPaxKpis> {
  const [usage, sales, items, theo, reports, cogs] = await Promise.all([
    actualUsage(db, locationId, from, to),
    salesByDay(db, locationId, from, to),
    db.item.findMany({ include: { category: true } }),
    theoreticalUsage(db, locationId, from, to),
    db.salesReport.aggregate({ where: { locationId, status: "POSTED", businessDate: { gte: toDbDate(from), lte: toDbDate(to) } }, _sum: { netCents: true } }),
    db.journalLine.aggregate({ where: { locationId, date: { gte: toDbDate(from), lte: toDbDate(to) }, account: { group: { section: "COGS" }, isIntercompany: false } }, _sum: { debitCents: true, creditCents: true } }),
  ]);
  const wingIds = new Set(items.filter((i) => i.sku === "PRO-WING").map((i) => i.id));
  const sauceIds = new Set(items.filter((i) => i.category.name === "Sauce").map((i) => i.id));
  const pax = sales.reduce((a, s) => a + s.pax, 0);
  const wings = usage.filter((u) => wingIds.has(u.itemId));
  const wingsKg = wings.reduce((a, u) => a + u.qty, 0);
  const wingsCost = wings.reduce((a, u) => a + u.valueCents, 0n);
  const sauceCost = usage.filter((u) => sauceIds.has(u.itemId)).reduce((a, u) => a + u.valueCents, 0n);
  const foodCost = (cogs._sum.debitCents ?? 0n) - (cogs._sum.creditCents ?? 0n);
  const perPax = (c: bigint) => (pax > 0 ? BigInt(Math.round(Number(c) / pax)) : null);
  // Restaurant weekend: Friday to Sunday.
  const isWeekend = (d: string) => [0, 5, 6].includes(new Date(`${d}T00:00:00Z`).getUTCDay());
  const split = (weekend: boolean) => {
    const days = new Set(wings.filter((w) => isWeekend(w.date) === weekend).map((w) => w.date));
    const kg = wings.filter((w) => days.has(w.date)).reduce((a, w) => a + w.qty, 0);
    const p = sales.filter((s) => days.has(s.date)).reduce((a, s) => a + s.pax, 0);
    return p > 0 ? round(kg / p, 3) : null;
  };
  // Standard for the actual package mix sold: theoretical wings ÷ pax.
  let theoreticalWings = 0;
  for (const [k, v] of theo) if (wingIds.has(k.split("|")[0])) theoreticalWings += v;
  return {
    pax,
    wingsKg: round(wingsKg, 3),
    wingsKgPerPax: pax > 0 && wings.length ? round(wingsKg / pax, 3) : null,
    wingsCostPerPaxCents: wings.length ? perPax(wingsCost) : null,
    sauceCostPerPaxCents: perPax(sauceCost),
    foodCostPerPaxCents: perPax(foodCost),
    netSalesPerPaxCents: perPax(reports._sum.netCents ?? 0n),
    standardKgPerPax: pax > 0 && theoreticalWings > 0 ? round(theoreticalWings / pax, 3) : null,
    weekdayKgPerPax: split(false),
    weekendKgPerPax: split(true),
  };
}

/** Suggested kg of wings per pax from the last 28 days of daily counts (needs 14+ counted days). */
export async function suggestWingsStandard(db: Reader, locationIds: string[], today: string) {
  const from = ymdOf(new Date(Date.parse(`${today}T00:00:00Z`) - 28 * 86_400_000));
  let kg = 0;
  let pax = 0;
  let days = 0;
  for (const loc of locationIds) {
    const k = await perPaxKpis(db, loc, from, today);
    const counted = new Set((await actualUsage(db, loc, from, today)).filter((u) => u.qty !== 0).map((u) => u.date));
    if (k.wingsKg > 0) {
      kg += k.wingsKg;
      pax += k.pax;
      days = Math.max(days, counted.size);
    }
  }
  return { days, suggestion: days >= 14 && pax > 0 ? round(kg / pax, 3) : null, kg, pax };
}

/** Items at or below their reorder point (or par when no reorder point is set). */
export async function lowStock(db: Pick<Tx, "itemLocationSetting" | "stockBalance">, locationIds: string[]) {
  const [settings, balances] = await Promise.all([
    db.itemLocationSetting.findMany({ where: { locationId: { in: locationIds }, isStocked: true, OR: [{ reorderPoint: { not: null } }, { parLevel: { not: null } }] }, include: { item: true, location: true } }),
    db.stockBalance.findMany({ where: { locationId: { in: locationIds } } }),
  ]);
  const bal = new Map(balances.map((b) => [`${b.itemId}|${b.locationId}`, Number(b.qty)]));
  return settings
    .map((s) => ({ item: s.item.name, unit: s.item.baseUnit, location: s.location.name, qty: bal.get(`${s.itemId}|${s.locationId}`) ?? 0, reorderAt: Number(s.reorderPoint ?? s.parLevel), par: s.parLevel ? Number(s.parLevel) : null }))
    .filter((r) => r.qty <= r.reorderAt);
}
