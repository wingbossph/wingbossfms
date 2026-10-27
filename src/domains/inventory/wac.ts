// Weighted-average cost math. Pure and exact:
// - quantities are bigint ten-thousandths of the base unit (Decimal(18,4))
// - values are bigint centavos
// - unit costs are bigint micro-centavos per base unit (Decimal(18,6) of centavos)

export const QTY_SCALE = 10_000n;
export const COST_SCALE = 1_000_000n;

export type Balance = { qty4: bigint; valueCents: bigint; avgMicro: bigint };

/** "12.5" → 125000n (ten-thousandths). */
export function toQty4(qty: string | number): bigint {
  const s = typeof qty === "number" ? qty.toFixed(4) : qty.trim();
  const m = /^(-)?(\d+)(?:\.(\d{1,4}))?\d*$/.exec(s);
  if (!m) throw new Error(`Invalid quantity: ${qty}`);
  const v = BigInt(m[2]) * QTY_SCALE + BigInt((m[3] ?? "").padEnd(4, "0") || "0");
  return m[1] ? -v : v;
}

/** 125000n → "12.5" */
export function fromQty4(q: bigint): string {
  const neg = q < 0n;
  const a = neg ? -q : q;
  const frac = (a % QTY_SCALE).toString().padStart(4, "0").replace(/0+$/, "");
  return `${neg ? "-" : ""}${a / QTY_SCALE}${frac ? `.${frac}` : ""}`;
}

/** Decimal(18,6) centavo string ("24050.5") → micro-centavos. */
export function toMicro(cost: string | number): bigint {
  const s = typeof cost === "number" ? cost.toFixed(6) : cost.trim();
  const m = /^(-)?(\d+)(?:\.(\d{1,6}))?\d*$/.exec(s);
  if (!m) throw new Error(`Invalid cost: ${cost}`);
  const v = BigInt(m[2]) * COST_SCALE + BigInt((m[3] ?? "").padEnd(6, "0") || "0");
  return m[1] ? -v : v;
}

export function fromMicro(micro: bigint): string {
  const neg = micro < 0n;
  const a = neg ? -micro : micro;
  return `${neg ? "-" : ""}${a / COST_SCALE}.${(a % COST_SCALE).toString().padStart(6, "0")}`;
}

function divRound(n: bigint, d: bigint): bigint {
  if (d === 0n) return 0n;
  const neg = n < 0n !== d < 0n;
  const an = n < 0n ? -n : n;
  const ad = d < 0n ? -d : d;
  const q = (an + ad / 2n) / ad;
  return neg ? -q : q;
}

/** Value of qty at a unit cost, rounded to the centavo. */
export function valueAt(qty4: bigint, avgMicro: bigint): bigint {
  return divRound(qty4 * avgMicro, QTY_SCALE * COST_SCALE);
}

/** Unit cost (micro-centavos per base unit) of a value spread over a quantity. */
export function unitCostOf(valueCents: bigint, qty4: bigint): bigint {
  return qty4 === 0n ? 0n : divRound(valueCents * QTY_SCALE * COST_SCALE, qty4);
}

/**
 * Stock in at a total value (purchase, transfer in, production output).
 * The value always adds exactly, so stock value never drifts from the ledger.
 */
export function receive(b: Balance, qty4: bigint, valueCents: bigint): Balance {
  if (qty4 <= 0n) throw new Error("Receipt quantity must be positive");
  const qty = b.qty4 + qty4;
  const value = b.valueCents + valueCents;
  // With stock still at or below zero, keep the receipt's own cost as the average.
  const avg = qty > 0n ? unitCostOf(value, qty) : unitCostOf(valueCents, qty4);
  return { qty4: qty, valueCents: value, avgMicro: avg };
}

/** Stock out at the current average. Taking everything takes the whole value (no residue). */
export function issue(b: Balance, qty4: bigint): { balance: Balance; valueCents: bigint } {
  if (qty4 <= 0n) throw new Error("Issue quantity must be positive");
  const value = qty4 === b.qty4 ? b.valueCents : valueAt(qty4, b.avgMicro);
  return { balance: { qty4: b.qty4 - qty4, valueCents: b.valueCents - value, avgMicro: b.avgMicro }, valueCents: value };
}
