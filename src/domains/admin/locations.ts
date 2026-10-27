import type { LocationType, MoneyAccountKind } from "@/generated/prisma/enums";
import type { Tx } from "@/server/db";
import { writeAudit } from "@/server/audit";
import { createMoneyAccount } from "@/domains/cash/money-accounts";
import { DEFAULT_LOCATION_MONEY_ACCOUNTS, type NewLocationInput } from "./schemas";
import { toDbDate } from "@/lib/dates";

/** Money accounts a new location gets by default, by type. */
export function defaultMoneyAccountsFor(type: LocationType): MoneyAccountKind[] {
  switch (type) {
    case "BRANCH":
      return [...DEFAULT_LOCATION_MONEY_ACCOUNTS];
    case "COMMISSARY":
      return ["PETTY_CASH"];
    case "OFFICE":
      return [];
  }
}

const MONEY_ACCOUNT_LABEL: Partial<Record<MoneyAccountKind, string>> = {
  CASH_DRAWER: "Cash drawer",
  UNDEPOSITED_CASH: "Undeposited cash",
  PETTY_CASH: "Petty cash",
};

/**
 * "Add a branch" in one step: the location, its money accounts (each with a
 * GL sub-account), the payment channels it accepts, and its staff. Reports
 * pick it up automatically because they read the Location table.
 */
export async function createLocation(tx: Tx, input: NewLocationInput, actorId: string | null) {
  const location = await tx.location.create({
    data: {
      code: input.code,
      name: input.name,
      type: input.type,
      address: input.address || null,
      openedOn: input.openedOn ? toDbDate(input.openedOn) : null,
      drawerFloatCents: input.drawerFloat,
      sortOrder: input.sortOrder,
    },
  });

  for (const kind of input.moneyAccounts) {
    await createMoneyAccount(tx, {
      name: `${MONEY_ACCOUNT_LABEL[kind] ?? kind} – ${input.name}`,
      kind,
      locationId: location.id,
    });
  }

  if (input.channelIds.length) {
    await tx.paymentChannelLocation.createMany({
      data: input.channelIds.map((channelId) => ({ channelId, locationId: location.id })),
      skipDuplicates: true,
    });
  }

  for (const s of input.staff) {
    await tx.roleAssignment.upsert({
      where: { userId_roleId_locationId: { userId: s.userId, roleId: s.roleId, locationId: location.id } },
      create: { userId: s.userId, roleId: s.roleId, locationId: location.id },
      update: {},
    });
  }

  await writeAudit(tx, {
    actorId,
    action: "CREATE",
    entityType: "Location",
    entityId: location.id,
    locationId: location.id,
    after: { ...location, moneyAccounts: input.moneyAccounts, channelIds: input.channelIds, staff: input.staff },
  });

  return location;
}
