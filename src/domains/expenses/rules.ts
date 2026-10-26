// Pure expense rules: approval level, AP aging, recurring schedule.

export type ApprovalRuleLite = { minAmountCents: bigint; requiredPermission: string; isActive: boolean; locationId: string | null };

/** The permission needed to approve an expense of this amount at this location. */
export function requiredApproval(totalCents: bigint, locationId: string, rules: readonly ApprovalRuleLite[]): string {
  const applicable = rules
    .filter((r) => r.isActive && (r.locationId === null || r.locationId === locationId) && totalCents >= r.minAmountCents)
    .sort((a, b) => (a.minAmountCents === b.minAmountCents ? 0 : a.minAmountCents > b.minAmountCents ? -1 : 1));
  return applicable[0]?.requiredPermission ?? "expenses:approve";
}

/** Whoever holds the higher approval may also approve smaller expenses. */
export function canApproveWith(required: string, has: (permission: string) => boolean): boolean {
  if (required === "expenses:approve") return has("expenses:approve") || has("expenses:approve:high");
  return has(required);
}

export type AgingBucket = "current" | "d1_30" | "d31_60" | "d60_plus";

export function agingBucket(dueYmd: string, asOfYmd: string): AgingBucket {
  const days = Math.floor((Date.parse(asOfYmd) - Date.parse(dueYmd)) / 86_400_000);
  if (days <= 0) return "current";
  if (days <= 30) return "d1_30";
  if (days <= 60) return "d31_60";
  return "d60_plus";
}

export function agingSummary(bills: readonly { dueYmd: string; balanceCents: bigint }[], asOfYmd: string) {
  const out: Record<AgingBucket, bigint> = { current: 0n, d1_30: 0n, d31_60: 0n, d60_plus: 0n };
  for (const b of bills) if (b.balanceCents > 0n) out[agingBucket(b.dueYmd, asOfYmd)] += b.balanceCents;
  return out;
}

export type Frequency = "WEEKLY" | "SEMI_MONTHLY" | "MONTHLY" | "QUARTERLY" | "YEARLY";

/** Next run date after `ymd` for a schedule (month-end safe: the 31st becomes the last day). */
export function nextRun(ymd: string, frequency: Frequency, dayOfMonth: number | null): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const make = (yy: number, mm: number, dd: number) => {
    const last = new Date(Date.UTC(yy, mm, 0)).getUTCDate();
    return new Date(Date.UTC(yy, mm - 1, Math.min(dd, last))).toISOString().slice(0, 10);
  };
  const day = dayOfMonth ?? d;
  switch (frequency) {
    case "WEEKLY":
      return new Date(Date.UTC(y, m - 1, d + 7)).toISOString().slice(0, 10);
    case "SEMI_MONTHLY":
      // 1st–15th and 16th–end: the 15th and the month end.
      return d < 15 ? make(y, m, 15) : d < new Date(Date.UTC(y, m, 0)).getUTCDate() ? make(y, m, 31) : make(y, m + 1, 15);
    case "MONTHLY":
      return make(y, m + 1, day);
    case "QUARTERLY":
      return make(y, m + 3, day);
    case "YEARLY":
      return make(y + 1, m, day);
  }
}
