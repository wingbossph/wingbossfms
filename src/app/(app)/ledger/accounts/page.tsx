import { PageHeader } from "@/components/shell/page-header";
import { requirePagePermission, scopeLocations } from "@/server/auth/session";
import { db } from "@/server/db";
import { formatPeso } from "@/lib/money";
import { manilaDateString, toDbDate } from "@/lib/dates";
import { AccountsTree } from "./accounts-tree";

export const metadata = { title: "Chart of accounts" };

const SECTION_LABEL: Record<string, string> = {
  CURRENT_ASSET: "Current assets",
  NONCURRENT_ASSET: "Non-current assets",
  CURRENT_LIABILITY: "Current liabilities",
  NONCURRENT_LIABILITY: "Non-current liabilities",
  EQUITY: "Equity",
  REVENUE: "Revenue",
  CONTRA_REVENUE: "Discounts and commissions",
  COGS: "Cost of goods sold",
  LABOR: "Labor",
  OPERATING_EXPENSE: "Operating expenses",
  OTHER_INCOME_EXPENSE: "Other income and expense",
  INCOME_TAX: "Income tax",
};

export default async function AccountsPage() {
  const user = await requirePagePermission("ledger:view");
  const ids = scopeLocations(user, "ledger:view", "all");
  const [groups, sums] = await Promise.all([
    db.accountGroup.findMany({ include: { accounts: { orderBy: { code: "asc" } } }, orderBy: { sortOrder: "asc" } }),
    db.journalLine.groupBy({ by: ["accountId"], where: { locationId: { in: ids }, date: { lte: toDbDate(manilaDateString()) } }, _sum: { debitCents: true, creditCents: true } }),
  ]);
  const bal = new Map(sums.map((s) => [s.accountId, (s._sum.debitCents ?? 0n) - (s._sum.creditCents ?? 0n)]));
  return (
    <>
      <PageHeader title="Chart of accounts" description="One chart for every location; each journal line carries its location. Balances are to date across the locations you can see." />
      <AccountsTree
        canManage={user.access.canAnywhere("ledger:accounts:manage")}
        groups={groups.map((g) => ({
          id: g.id,
          name: g.name,
          section: SECTION_LABEL[g.section] ?? g.section,
          accounts: g.accounts.map((a) => ({
            id: a.id,
            code: a.code,
            name: a.name,
            parentId: a.parentId,
            isPostable: a.isPostable,
            isActive: a.isActive,
            isSystem: !!a.systemKey,
            description: a.description ?? "",
            balance: a.isPostable ? formatPeso(bal.get(a.id) ?? 0n) : "",
          })),
        }))}
      />
    </>
  );
}
