import "server-only";
import { db } from "@/server/db";
import type { CurrentUser } from "@/server/auth/session";

/** Money accounts that get statements (bank, e-wallets, card clearing, Grab), limited to what the user may see. */
export async function statementAccountsFor(user: CurrentUser, permission = "banking:view") {
  const allowed = user.access.locationsWith(permission);
  if (!allowed.length) return [];
  const accounts = await db.moneyAccount.findMany({
    where: { isActive: true, kind: { in: ["BANK", "EWALLET", "CARD_CLEARING", "PLATFORM_RECEIVABLE"] }, OR: [{ locationId: null }, { locationId: { in: allowed } }] },
    include: { location: true },
    orderBy: [{ kind: "asc" }, { name: "asc" }],
  });
  return accounts;
}

export function canUseAccount(user: CurrentUser, ma: { locationId: string | null }, permission: string) {
  return ma.locationId ? user.access.can(permission, ma.locationId) : user.access.canAnywhere(permission);
}
