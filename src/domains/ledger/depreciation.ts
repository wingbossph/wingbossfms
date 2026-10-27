// Straight-line depreciation, monthly. Pure.
// Convention: depreciation starts the month after the asset is acquired, and
// the last month takes whatever is left so the total equals cost − salvage.

export type AssetLite = {
  costCents: bigint;
  salvageCents: bigint;
  usefulLifeMonths: number;
  acquiredOn: string; // YYYY-MM-DD
  disposedOn: string | null;
};

const monthIndex = (ymd: string) => Number(ymd.slice(0, 4)) * 12 + Number(ymd.slice(5, 7)) - 1;

/** Depreciation for the month containing `monthYmd`, given what was already booked. */
export function depreciationForMonth(asset: AssetLite, monthYmd: string, alreadyCents: bigint): bigint {
  const base = asset.costCents - asset.salvageCents;
  if (base <= 0n || asset.usefulLifeMonths <= 0) return 0n;
  const m = monthIndex(monthYmd);
  const first = monthIndex(asset.acquiredOn) + 1;
  if (m < first) return 0n;
  if (asset.disposedOn && m > monthIndex(asset.disposedOn)) return 0n;
  const remaining = base - alreadyCents;
  if (remaining <= 0n) return 0n;
  const monthly = (base + BigInt(asset.usefulLifeMonths) / 2n) / BigInt(asset.usefulLifeMonths);
  const isLast = m >= first + asset.usefulLifeMonths - 1;
  return isLast || monthly > remaining ? remaining : monthly;
}
