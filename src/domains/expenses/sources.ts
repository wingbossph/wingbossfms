import type { MoneyAccountKind } from "@/generated/prisma/enums";
import type { Tx } from "@/server/db";
import { UserFacingError } from "@/lib/errors";
import { createMoneyAccount } from "@/domains/cash/money-accounts";

// Where an expense entered on the sales screen was paid from. Only the cash
// drawer comes out of the day's sales money (it tallies with the cash count);
// the rest are recorded as expenses without touching the day's net.

export type ExpenseSourceKey = "DRAWER" | "PETTY" | "GCASH_GLOBE" | "GCASH_TNT" | "BPI_CHECKING" | "BPI_SAVINGS" | "EASTWEST" | "OTHERS";

type Shared = { name: string; kind: MoneyAccountKind; isPersonal?: boolean; institution?: string };

export const EXPENSE_SOURCES: { key: ExpenseSourceKey; label: string; shared?: Shared }[] = [
  { key: "DRAWER", label: "Cash Drawer" },
  { key: "PETTY", label: "Petty Cash" },
  { key: "GCASH_GLOBE", label: "Personal GCash Globe", shared: { name: "Personal GCash Globe", kind: "EWALLET", isPersonal: true, institution: "GCash" } },
  { key: "GCASH_TNT", label: "Personal GCash TNT", shared: { name: "Personal GCash TNT", kind: "EWALLET", isPersonal: true, institution: "GCash" } },
  { key: "BPI_CHECKING", label: "BPI Checking", shared: { name: "BPI Checking", kind: "BANK", institution: "BPI" } },
  { key: "BPI_SAVINGS", label: "BPI Savings", shared: { name: "BPI Savings", kind: "BANK", institution: "BPI" } },
  { key: "EASTWEST", label: "Eastwest", shared: { name: "Eastwest", kind: "BANK", institution: "Eastwest" } },
  { key: "OTHERS", label: "Others", shared: { name: "Others", kind: "OWNER_PERSONAL" } },
];

export const EXPENSE_SOURCE_KEYS = EXPENSE_SOURCES.map((s) => s.key) as [ExpenseSourceKey, ...ExpenseSourceKey[]];

/** Creates the shared money accounts behind the sources that don't exist yet. Safe to run repeatedly. */
export async function ensureExpenseSources(tx: Tx) {
  let created = 0;
  for (const s of EXPENSE_SOURCES) {
    if (!s.shared) continue;
    const found = await tx.moneyAccount.findFirst({ where: { name: s.shared.name, locationId: null } });
    if (found) continue;
    await createMoneyAccount(tx, { name: s.shared.name, kind: s.shared.kind, locationId: null, isPersonal: s.shared.isPersonal, institution: s.shared.institution });
    created++;
  }
  return created;
}

/** The money account a source means at a location (drawer and petty cash are per branch). */
export async function resolveExpenseSource(tx: Tx, key: ExpenseSourceKey, locationId: string): Promise<string> {
  const source = EXPENSE_SOURCES.find((s) => s.key === key);
  if (!source) throw new UserFacingError("Choose where it was paid from.");
  if (key === "DRAWER" || key === "PETTY") {
    const kind = key === "DRAWER" ? "CASH_DRAWER" : "PETTY_CASH";
    const acct = await tx.moneyAccount.findFirst({ where: { locationId, kind, isActive: true } });
    if (acct) return acct.id;
    if (key === "DRAWER") throw new UserFacingError("This location has no cash drawer.");
    const loc = await tx.location.findUniqueOrThrow({ where: { id: locationId } });
    return (await createMoneyAccount(tx, { name: `Petty cash – ${loc.name}`, kind: "PETTY_CASH", locationId })).id;
  }
  await ensureExpenseSources(tx);
  return (await tx.moneyAccount.findFirstOrThrow({ where: { name: source.shared!.name, locationId: null } })).id;
}
