import type { Tx } from "@/server/db";

// Settings with code defaults. Stored values (Setting table) override them;
// a location-specific value overrides the global one.

export const SETTING_DEFAULTS = {
  "business.name": "Wingboss",
  "inventory.varianceToleranceBp": 500,
  "transfer.markupEnabled": false,
  "transfer.markupBp": 0,
  /** Who absorbs short-received transfer quantities: SENDER or RECEIVER. */
  "transfer.shortageChargedTo": "SENDER" as "SENDER" | "RECEIVER",
  "allocation.enabled": false,
  /** Block sales submit when payments ≠ net sales (else require an explanation). */
  "sales.requirePaymentsMatch": false,
  /** Service charge goes to staff (liability) instead of revenue. */
  "sales.serviceChargeToStaff": false,
  "sales.shiftsPerDay": 1,
  "loyverse.defaultDiscountCode": "PROMO",
  /** Loyverse store name as it appears in CSV exports (per location). */
  "loyverse.storeName": "" as string,
  "expenses.ownerApprovalThresholdCents": "500000",
  "alerts.personalGcashShareBp": 3000,
  "alerts.cashShortThresholdCents": "20000",
  "reports.emailRecipients": "" as string,
  /** Payroll: the regular shift (for times typed in the DTR grid). */
  "payroll.shiftStart": "10:00" as string,
  "payroll.shiftEnd": "19:00" as string,
  "payroll.graceMinutes": 0,
  "payroll.otMinimumMinutes": 30,
  /** Pay day for the 1–15 cut-off (this month) and the 16–end cut-off (next month). */
  "payroll.firstPayDay": 20,
  "payroll.secondPayDay": 5,
  /** Auto-match: how many days apart a statement line and a book entry may be. */
  "bank.matchWindowDays": 3,
  /** Channel payouts auto-match when within this share of gross (real MDR vs the configured rate). */
  "bank.settlementToleranceBp": 100,
} as const;

export type SettingKey = keyof typeof SETTING_DEFAULTS;
type SettingValue<K extends SettingKey> = (typeof SETTING_DEFAULTS)[K] extends boolean
  ? boolean
  : (typeof SETTING_DEFAULTS)[K] extends number
    ? number
    : string;

type Reader = Pick<Tx, "setting">;

export async function getSetting<K extends SettingKey>(
  db: Reader,
  key: K,
  locationId?: string | null,
): Promise<SettingValue<K>> {
  const rows = await db.setting.findMany({
    where: { key, OR: [{ locationId: null }, ...(locationId ? [{ locationId }] : [])] },
  });
  const specific = rows.find((r) => r.locationId === locationId && locationId);
  const global = rows.find((r) => r.locationId === null);
  const value = (specific ?? global)?.value;
  return (value === undefined ? SETTING_DEFAULTS[key] : value) as SettingValue<K>;
}

export async function setSetting(db: Reader, key: SettingKey, value: unknown, locationId: string | null, actorId: string) {
  const existing = await db.setting.findFirst({ where: { key, locationId } });
  if (existing) {
    await db.setting.update({ where: { id: existing.id }, data: { value: value as object, updatedById: actorId } });
  } else {
    await db.setting.create({ data: { key, locationId, value: value as object, updatedById: actorId } });
  }
}
