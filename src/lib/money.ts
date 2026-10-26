// Money is always integer centavos (bigint). Never use floats for amounts.

const pesoFormatter = new Intl.NumberFormat("en-PH", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** 123456n → "₱1,234.56"; -5000n → "-₱50.00" */
export function formatPeso(cents: bigint, opts: { symbol?: boolean } = {}): string {
  const symbol = opts.symbol ?? true;
  const negative = cents < 0n;
  const abs = negative ? -cents : cents;
  const whole = abs / 100n;
  const frac = abs % 100n;
  // Format the whole part with grouping without converting the full amount to a float.
  const wholeStr = pesoFormatter.format(Number(whole)).replace(/\.00$/, "");
  const body = `${wholeStr}.${frac.toString().padStart(2, "0")}`;
  return `${negative ? "-" : ""}${symbol ? "₱" : ""}${body}`;
}

/**
 * Parses user input ("1,234.5", "₱ 50", "-12.30") into centavos.
 * Returns null for anything that isn't a valid amount with at most 2 decimals.
 */
export function parsePeso(input: string): bigint | null {
  const cleaned = input.replace(/[₱,\s]/g, "");
  const match = /^(-)?(\d+)(?:\.(\d{0,2}))?$/.exec(cleaned);
  if (!match) return null;
  const [, sign, whole, frac = ""] = match;
  const cents = BigInt(whole) * 100n + BigInt(frac.padEnd(2, "0") || "0");
  return sign ? -cents : cents;
}

/** Rate in basis points (2000 = 20%) applied to an amount, rounded half away from zero. */
export function applyRateBp(cents: bigint, rateBp: number): bigint {
  const product = cents * BigInt(rateBp);
  const half = product < 0n ? -5000n : 5000n;
  return (product + half) / 10000n;
}

/**
 * Splits an amount by weights so the parts always add back to the total
 * (largest-remainder method). Used for allocations and payroll location splits.
 */
export function allocate(total: bigint, weights: readonly number[]): bigint[] {
  if (weights.length === 0) return [];
  const scaled = weights.map((w) => BigInt(Math.round(w * 1_000_000)));
  const sum = scaled.reduce((a, b) => a + b, 0n);
  if (sum === 0n) throw new Error("allocate: weights sum to zero");
  const parts = scaled.map((w) => (total * w) / sum);
  let remainder = total - parts.reduce((a, b) => a + b, 0n);
  const order = scaled
    .map((w, i) => ({ i, rem: (total * w) % sum }))
    .sort((a, b) => (a.rem === b.rem ? 0 : a.rem > b.rem ? -1 : 1));
  const step = remainder < 0n ? -1n : 1n;
  for (let k = 0; remainder !== 0n; k = (k + 1) % order.length) {
    parts[order[k].i] += step;
    remainder -= step;
  }
  return parts;
}

export function sumCents(values: readonly bigint[]): bigint {
  return values.reduce((a, b) => a + b, 0n);
}
