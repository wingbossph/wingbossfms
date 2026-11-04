import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/server/db";
import { toDbDate } from "@/lib/dates";
import { EXPENSE_CATEGORY_CODES, EXPENSE_HEADINGS } from "@/domains/ledger/expense-categories";

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

/**
 * The owner's expense categories, grouped under their headings, in display
 * order (src/domains/ledger/expense-categories.ts). Accounts the system posts
 * to by itself (payroll detail, waste, bank charges, …) aren't offered.
 */
export async function expenseCategories() {
  const accounts = await db.account.findMany({
    where: { code: { in: EXPENSE_CATEGORY_CODES }, isActive: true, isPostable: true },
    include: { group: true },
  });
  const byCode = new Map(accounts.map((a) => [a.code, a]));
  return EXPENSE_HEADINGS.map((h) => {
    const list = h.accounts.flatMap((c) => {
      const a = byCode.get(c.code);
      return a ? [{ id: a.id, name: a.name, code: a.code }] : [];
    });
    const groupAccount = list.length ? byCode.get(list[0].code) : undefined;
    return { group: groupAccount?.group.name ?? h.name, groupId: groupAccount?.groupId ?? h.group, accounts: list };
  }).filter((g) => g.accounts.length > 0);
}
