import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/server/db";
import { toDbDate } from "@/lib/dates";

export type ExpenseFilters = { from?: string; to?: string; location?: string; category?: string; status?: string; supplier?: string };

const YMD = /^\d{4}-\d{2}-\d{2}$/;

export function expenseWhere(locationIds: string[], f: ExpenseFilters): Prisma.ExpenseWhereInput {
  return {
    locationId: { in: locationIds },
    ...(f.from && YMD.test(f.from) ? { date: { gte: toDbDate(f.from), ...(f.to && YMD.test(f.to) ? { lte: toDbDate(f.to) } : {}) } } : f.to && YMD.test(f.to) ? { date: { lte: toDbDate(f.to) } } : {}),
    ...(f.category ? { lines: { some: { account: { groupId: f.category } } } } : {}),
    ...(f.status && ["DRAFT", "SUBMITTED", "POSTED", "REJECTED", "VOIDED"].includes(f.status) ? { status: f.status as "DRAFT" } : {}),
    ...(f.supplier ? { supplierId: f.supplier } : {}),
  };
}

/** Accounts a user may book an expense to, grouped for a select. */
export async function expenseCategories() {
  const groups = await db.accountGroup.findMany({
    where: { section: { in: ["COGS", "LABOR", "OPERATING_EXPENSE", "OTHER_INCOME_EXPENSE", "INCOME_TAX", "NONCURRENT_ASSET", "CURRENT_ASSET"] } },
    include: {
      accounts: {
        where: { isPostable: true, isActive: true, isIntercompany: false, moneyAccount: null, NOT: { systemKey: { in: ["ACCUM_DEPRECIATION", "INTERCO_RECEIVABLE", "EMPLOYEE_ADVANCES", "CREDITABLE_WHT"] } } },
        orderBy: { code: "asc" },
      },
    },
    orderBy: { sortOrder: "asc" },
  });
  // Assets: only prepaid, deposits and equipment purchases (inventory is bought via items).
  return groups
    .map((g) => ({
      group: g.name,
      groupId: g.id,
      accounts: g.accounts
        .filter((a) => !["CASH", "RECEIVABLES", "INVENTORY"].includes(g.code))
        .map((a) => ({ id: a.id, name: `${a.name}`, code: a.code })),
    }))
    .filter((g) => g.accounts.length > 0);
}
