import "server-only";
import { db } from "@/server/db";
import type { CurrentUser } from "@/server/auth/session";
import { locationsWithAny } from "@/server/auth/session";
import { expenseCategories } from "./queries";

/** Everything the expense form needs for the user's locations. */
export async function expenseFormData(user: CurrentUser) {
  const createIds = locationsWithAny(user, "expenses:create");
  const [categories, items, moneyAccounts, suppliers] = await Promise.all([
    expenseCategories(),
    db.item.findMany({
      where: { isActive: true },
      include: { locationSettings: true },
      orderBy: { name: "asc" },
    }),
    db.moneyAccount.findMany({
      where: { isActive: true, kind: { in: ["CASH_DRAWER", "PETTY_CASH", "BANK", "EWALLET", "OWNER_PERSONAL"] } },
      orderBy: [{ kind: "asc" }, { name: "asc" }],
    }),
    db.supplier.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true, defaultAccountId: true, termsDays: true } }),
  ]);
  // Staff who only enter petty-cash expenses see the location's drawer and petty cash.
  const broad = locationsWithAny(user, "payables:manage", "expenses:approve").length > 0;
  return {
    locations: user.locations.filter((l) => createIds.includes(l.id)).map((l) => ({ id: l.id, name: l.name })),
    categories,
    items: items.map((i) => ({
      id: i.id,
      name: i.name,
      baseUnit: i.baseUnit,
      purchaseUnit: i.purchaseUnit,
      purchaseToBase: i.purchaseToBase.toString(),
      locationIds: i.locationSettings.filter((s) => s.isStocked).map((s) => s.locationId),
    })),
    moneyAccounts: moneyAccounts
      .filter((m) => broad || m.locationId)
      .map((m) => ({ id: m.id, name: m.name, kind: m.kind, locationId: m.locationId })),
    suppliers,
  };
}

export type ExpenseFormData = Awaited<ReturnType<typeof expenseFormData>>;
