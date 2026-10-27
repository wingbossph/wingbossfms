// Pure helpers for building journal lines. No database access.

/** A line before account references are resolved. `account` is a systemKey or an account id. */
export type DraftLine = {
  account: AccountRef;
  locationId: string;
  debitCents: bigint;
  creditCents: bigint;
  counterpartyLocationId?: string | null;
  memo?: string | null;
  supplierId?: string | null;
  employeeId?: string | null;
};

export type AccountRef = { key: string } | { id: string };

type LineOpts = Pick<DraftLine, "counterpartyLocationId" | "memo" | "supplierId" | "employeeId">;

/** Debit line. A negative amount becomes a credit; zero produces no line. */
export function dr(account: AccountRef, locationId: string, amount: bigint, opts: LineOpts = {}): DraftLine[] {
  if (amount === 0n) return [];
  return amount > 0n
    ? [{ account, locationId, debitCents: amount, creditCents: 0n, ...opts }]
    : [{ account, locationId, debitCents: 0n, creditCents: -amount, ...opts }];
}

/** Credit line. A negative amount becomes a debit; zero produces no line. */
export function cr(account: AccountRef, locationId: string, amount: bigint, opts: LineOpts = {}): DraftLine[] {
  return dr(account, locationId, -amount, opts);
}

export const key = (k: string): AccountRef => ({ key: k });
export const acct = (id: string): AccountRef => ({ id });

export function totals(lines: readonly DraftLine[]) {
  let debit = 0n;
  let credit = 0n;
  for (const l of lines) {
    debit += l.debitCents;
    credit += l.creditCents;
  }
  return { debit, credit, difference: debit - credit };
}

export class UnbalancedEntryError extends Error {
  constructor(
    public difference: bigint,
    public locationId?: string,
  ) {
    super(`Journal entry is not balanced${locationId ? " for one location" : ""} (difference ${difference} centavos)`);
    this.name = "UnbalancedEntryError";
  }
}

/** Throws unless the lines are valid: positive one-sided amounts, at least two lines, balanced. */
export function assertBalanced(lines: readonly DraftLine[]) {
  if (lines.length < 2) throw new Error("A journal entry needs at least two lines");
  for (const l of lines) {
    if (l.debitCents < 0n || l.creditCents < 0n) throw new Error("Negative amount on a journal line");
    if ((l.debitCents === 0n) === (l.creditCents === 0n)) throw new Error("Each line must be either a debit or a credit");
  }
  const { difference } = totals(lines);
  if (difference !== 0n) throw new UnbalancedEntryError(difference);
}

/**
 * Each location's lines must balance on their own, so every location has a
 * complete, balancing set of books. Movements between locations go through
 * the inter-location receivable/payable accounts.
 */
export function assertBalancedPerLocation(lines: readonly DraftLine[]) {
  const byLocation = new Map<string, bigint>();
  for (const l of lines) byLocation.set(l.locationId, (byLocation.get(l.locationId) ?? 0n) + l.debitCents - l.creditCents);
  for (const [locationId, diff] of byLocation) {
    if (diff !== 0n) throw new UnbalancedEntryError(diff, locationId);
  }
}

/** Reversal lines: debits become credits and vice versa. */
export function reverseLines<T extends { debitCents: bigint; creditCents: bigint }>(lines: readonly T[]): T[] {
  return lines.map((l) => ({ ...l, debitCents: l.creditCents, creditCents: l.debitCents }));
}

/**
 * Merges lines with the same account, location, side and counterparty, so
 * an entry with many sales lines stays readable.
 */
export function consolidate(lines: readonly DraftLine[]): DraftLine[] {
  const map = new Map<string, DraftLine>();
  for (const l of lines) {
    const ref = "key" in l.account ? `k:${l.account.key}` : `i:${l.account.id}`;
    const side = l.debitCents > 0n ? "D" : "C";
    const k = [ref, l.locationId, side, l.counterpartyLocationId ?? "", l.supplierId ?? "", l.employeeId ?? "", l.memo ?? ""].join("|");
    const prev = map.get(k);
    if (prev) {
      prev.debitCents += l.debitCents;
      prev.creditCents += l.creditCents;
    } else {
      map.set(k, { ...l });
    }
  }
  return [...map.values()];
}
