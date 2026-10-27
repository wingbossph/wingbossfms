import type { MovementType } from "@/generated/prisma/enums";
import type { Tx } from "@/server/db";
import { toDbDate } from "@/lib/dates";
import { fromMicro, fromQty4, issue, receive, toMicro, toQty4, unitCostOf, valueAt, type Balance } from "./wac";

// Stock sub-ledger: every movement updates the running weighted-average
// balance in the same transaction. Callers post the matching journal entry.

const IN_TYPES: MovementType[] = ["OPENING", "PURCHASE", "TRANSFER_IN", "PRODUCTION_OUTPUT"];

export async function getBalance(tx: Tx, itemId: string, locationId: string): Promise<Balance> {
  const row = await tx.stockBalance.findUnique({ where: { itemId_locationId: { itemId, locationId } } });
  if (!row) {
    const item = await tx.item.findUniqueOrThrow({ where: { id: itemId } });
    return { qty4: 0n, valueCents: 0n, avgMicro: toMicro(item.lastUnitCost.toString()) };
  }
  return { qty4: toQty4(row.qty.toString()), valueCents: row.valueCents, avgMicro: toMicro(row.avgUnitCost.toString()) };
}

async function saveBalance(tx: Tx, itemId: string, locationId: string, b: Balance) {
  const data = { qty: fromQty4(b.qty4), valueCents: b.valueCents, avgUnitCost: fromMicro(b.avgMicro) };
  await tx.stockBalance.upsert({ where: { itemId_locationId: { itemId, locationId } }, create: { itemId, locationId, ...data }, update: data });
}

export type MovementInput = {
  itemId: string;
  locationId: string;
  date: string;
  type: MovementType;
  /** Base units, positive. Direction comes from the type (or `out` for adjustments). */
  qty4: bigint;
  /** Required for stock coming in: the total value received. */
  valueCents?: bigint;
  /** For ADJUSTMENT/COUNT_USAGE: true = stock going out. */
  out?: boolean;
  sourceType: string;
  sourceId: string;
  reason?: string | null;
  createdById: string;
};

/** Records a movement and returns its value in centavos (positive). */
export async function moveStock(tx: Tx, m: MovementInput): Promise<{ valueCents: bigint; unitMicro: bigint }> {
  if (m.qty4 === 0n) return { valueCents: 0n, unitMicro: 0n };
  if (m.qty4 < 0n) throw new Error("Movement quantity must be positive; use `out` for direction");
  const before = await getBalance(tx, m.itemId, m.locationId);
  const incoming = IN_TYPES.includes(m.type) || (["ADJUSTMENT", "COUNT_USAGE"].includes(m.type) && !m.out);

  let after: Balance;
  let value: bigint;
  if (incoming) {
    // Count gains and adjustments in come back at the current average.
    value = m.valueCents ?? valueAt(m.qty4, before.avgMicro);
    after = receive(before, m.qty4, value);
    if (m.type === "PURCHASE" || m.type === "PRODUCTION_OUTPUT") {
      await tx.item.update({ where: { id: m.itemId }, data: { lastUnitCost: fromMicro(unitCostOf(value, m.qty4)) } });
    }
  } else {
    const res = issue(before, m.qty4);
    after = res.balance;
    value = res.valueCents;
  }
  await saveBalance(tx, m.itemId, m.locationId, after);
  const unitMicro = unitCostOf(value, m.qty4);
  await tx.stockMovement.create({
    data: {
      itemId: m.itemId,
      locationId: m.locationId,
      businessDate: toDbDate(m.date),
      type: m.type,
      qty: fromQty4(incoming ? m.qty4 : -m.qty4),
      unitCost: fromMicro(unitMicro),
      valueCents: incoming ? value : -value,
      sourceType: m.sourceType,
      sourceId: m.sourceId,
      reason: m.reason ?? null,
      createdById: m.createdById,
    },
  });
  return { valueCents: value, unitMicro };
}

/** Converts a quantity in the item's purchase unit to base units. */
export function toBaseQty4(qty4: bigint, unit: "BASE" | "PURCHASE", purchaseToBase: string): bigint {
  if (unit === "BASE") return qty4;
  return (qty4 * toQty4(purchaseToBase)) / 10_000n;
}
