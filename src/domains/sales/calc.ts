// Pure sales arithmetic, shared by the entry screen (live totals) and the
// server (authoritative totals on submit).

import { applyRateBp } from "@/lib/money";

/** "1.5" → 150 hundredths. Quantities allow up to 2 decimals. */
export function qtyHundredths(qty: string | number): bigint {
  const s = typeof qty === "number" ? qty.toFixed(2) : qty.trim();
  const m = /^(\d+)(?:\.(\d{1,2}))?$/.exec(s);
  if (!m) throw new Error(`Invalid quantity: ${qty}`);
  return BigInt(m[1]) * 100n + BigInt((m[2] ?? "").padEnd(2, "0") || "0");
}

/** qty × unit price, rounded to the centavo. */
export function lineGross(qty: string | number, unitPriceCents: bigint): bigint {
  return (qtyHundredths(qty) * unitPriceCents + 50n) / 100n;
}

/** Pax for a line: qty × pax per unit, in hundredths. */
export function linePaxHundredths(qty: string | number, paxPerUnit: string | number): bigint {
  return (qtyHundredths(qty) * qtyHundredths(paxPerUnit)) / 100n;
}

export type SalesInput = {
  /** Manual lines: lineGross(qty, price). Imported lines: the receipt totals. */
  lines: { grossCents: bigint; paxHundredths: bigint }[];
  discounts: { amountCents: bigint }[];
  refunds: { amountCents: bigint }[];
  serviceChargeCents: bigint;
  payments: { amountCents: bigint }[];
};

export type SalesTotals = {
  grossCents: bigint;
  discountCents: bigint;
  refundCents: bigint;
  serviceChargeCents: bigint;
  netCents: bigint;
  paymentsCents: bigint;
  /** payments − net: positive = more collected than sold. */
  differenceCents: bigint;
  /** Pax (head count), 2 decimals as hundredths. */
  paxHundredths: bigint;
};

export function computeSalesTotals(input: SalesInput): SalesTotals {
  let gross = 0n;
  let pax = 0n;
  for (const l of input.lines) {
    gross += l.grossCents;
    pax += l.paxHundredths;
  }
  const discount = input.discounts.reduce((a, d) => a + d.amountCents, 0n);
  const refund = input.refunds.reduce((a, r) => a + r.amountCents, 0n);
  const net = gross - discount - refund + input.serviceChargeCents;
  const payments = input.payments.reduce((a, p) => a + p.amountCents, 0n);
  return {
    grossCents: gross,
    discountCents: discount,
    refundCents: refund,
    serviceChargeCents: input.serviceChargeCents,
    netCents: net,
    paymentsCents: payments,
    differenceCents: payments - net,
    paxHundredths: pax,
  };
}

/** SC/PWD: 20% of the share of the bill consumed by the senior/PWD (non-VAT business: no VAT exemption). */
export function scPwdDiscount(billShareCents: bigint, rateBp = 2000): bigint {
  return applyRateBp(billShareCents, rateBp);
}

/** Expected payout for a deferred channel (card/QR/delivery). */
export function expectedSettlement(grossCents: bigint, ch: { feeRateBp: number; feeFixedCents: bigint; withholdingRateBp: number }) {
  const fee = applyRateBp(grossCents, ch.feeRateBp) + (grossCents > 0n ? ch.feeFixedCents : 0n);
  const wht = applyRateBp(grossCents, ch.withholdingRateBp);
  return { feeCents: fee, whtCents: wht, netCents: grossCents - fee - wht };
}

/** Shift close: what should be in the drawer, and the over/short. */
export function cashCount(input: {
  openingFloatCents: bigint;
  cashSalesCents: bigint;
  cashExpensesCents: bigint;
  otherCashInCents?: bigint;
  otherCashOutCents?: bigint;
  countedCents: bigint;
}) {
  const expected =
    input.openingFloatCents +
    input.cashSalesCents -
    input.cashExpensesCents +
    (input.otherCashInCents ?? 0n) -
    (input.otherCashOutCents ?? 0n);
  return { expectedCents: expected, overShortCents: input.countedCents - expected };
}

export const DENOMINATIONS = [100000n, 50000n, 20000n, 10000n, 5000n, 2000n] as const;

/** Counted cash from bills by denomination plus loose coins (in centavos). */
export function countDenominations(counts: Record<string, number>, coinsCents: bigint): bigint {
  let total = coinsCents;
  for (const d of DENOMINATIONS) {
    const n = counts[String(d / 100n)] ?? 0;
    if (!Number.isInteger(n) || n < 0) throw new Error("Bill counts must be whole numbers");
    total += d * BigInt(n);
  }
  return total;
}
