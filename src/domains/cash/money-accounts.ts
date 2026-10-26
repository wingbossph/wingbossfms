import type { MoneyAccountKind } from "@/generated/prisma/enums";
import type { Tx } from "@/server/db";
import { MONEY_ACCOUNT_PARENT } from "@/domains/ledger/coa-template";

/** Next free sub-account code under a header: "1040" → "1040-01", "1040-02", … */
export function nextChildCode(parentCode: string, existingCodes: readonly string[]): string {
  const prefix = `${parentCode}-`;
  const used = existingCodes
    .filter((c) => c.startsWith(prefix))
    .map((c) => Number.parseInt(c.slice(prefix.length), 10))
    .filter((n) => Number.isFinite(n));
  const next = (used.length ? Math.max(...used) : 0) + 1;
  return `${prefix}${String(next).padStart(2, "0")}`;
}

export type NewMoneyAccount = {
  name: string;
  kind: MoneyAccountKind;
  locationId: string | null;
  isPersonal?: boolean;
  institution?: string | null;
  accountRef?: string | null;
};

/**
 * Creates a money account together with its own GL sub-account, so the
 * account's book balance is simply its GL balance.
 */
export async function createMoneyAccount(tx: Tx, input: NewMoneyAccount) {
  const parentKey = MONEY_ACCOUNT_PARENT[input.kind];
  const parent = await tx.account.findUniqueOrThrow({ where: { systemKey: parentKey } });
  const siblings = await tx.account.findMany({
    where: { parentId: parent.id },
    select: { code: true },
  });
  const glAccount = await tx.account.create({
    data: {
      code: nextChildCode(parent.code, siblings.map((s) => s.code)),
      name: input.name,
      type: parent.type,
      groupId: parent.groupId,
      parentId: parent.id,
      isPostable: true,
    },
  });
  return tx.moneyAccount.create({
    data: {
      name: input.name,
      kind: input.kind,
      locationId: input.locationId,
      glAccountId: glAccount.id,
      isPersonal: input.isPersonal ?? false,
      institution: input.institution ?? null,
      accountRef: input.accountRef ?? null,
    },
  });
}
