import Link from "next/link";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shell/page-header";
import { ListFilters } from "@/components/data-table/list-filters";
import { locationsWithAny, requirePagePermission, scopeLocationsAny } from "@/server/auth/session";
import { db } from "@/server/db";
import { expenseWhere, type ExpenseFilters } from "@/domains/expenses/queries";
import { formatBusinessDate, manilaDateString } from "@/lib/dates";
import { formatPeso } from "@/lib/money";
import { ExpensesTable, type ExpenseRow } from "./expenses-table";
import { EXPENSE_STATUS_LABEL as STATUS_LABEL } from "@/domains/expenses/labels";

export const metadata = { title: "Expenses" };

export default async function ExpensesPage({ searchParams }: { searchParams: Promise<ExpenseFilters> }) {
  const user = await requirePagePermission("expenses:view", "expenses:create");
  const f = await searchParams;
  const filters = { ...f, from: f.from ?? manilaDateString(new Date(Date.now() - 30 * 86_400_000)), to: f.to ?? manilaDateString() };
  const viewIds = locationsWithAny(user, "expenses:view", "expenses:create");
  // Staff who can only enter expenses see their own entries.
  const onlyOwn = locationsWithAny(user, "expenses:view").length === 0;
  const locationIds = scopeLocationsAny(user, ["expenses:view", "expenses:create"], f.location);

  const [expenses, groups, attachments] = await Promise.all([
    db.expense.findMany({
      where: { ...expenseWhere(locationIds, filters), ...(onlyOwn ? { submittedById: user.id } : {}) },
      include: { location: true, supplier: true, lines: { include: { account: true } } },
      orderBy: [{ date: "desc" }, { number: "desc" }],
      take: 1000,
    }),
    db.accountGroup.findMany({ where: { section: { in: ["COGS", "LABOR", "OPERATING_EXPENSE", "OTHER_INCOME_EXPENSE", "NONCURRENT_ASSET", "CURRENT_ASSET"] } }, orderBy: { sortOrder: "asc" } }),
    db.attachment.groupBy({ by: ["entityId"], where: { entityType: "Expense" }, _count: true }),
  ]);
  const withPhoto = new Set(attachments.map((a) => a.entityId));

  const rows: ExpenseRow[] = expenses.map((e) => ({
    id: e.id,
    number: e.number,
    date: formatBusinessDate(e.date),
    ymd: e.date.toISOString().slice(0, 10),
    location: e.location.name,
    supplier: e.supplier?.name ?? "",
    category: e.lines.length === 1 ? e.lines[0].account.name : `${e.lines[0]?.account.name ?? ""} +${e.lines.length - 1}`,
    amount: formatPeso(e.totalCents),
    amountCents: Number(e.totalCents),
    terms: e.terms === "PAID_NOW" ? "Paid" : e.paidCents >= e.totalCents ? "Bill · paid" : `Bill · ${formatPeso(e.totalCents - e.paidCents)} due`,
    status: STATUS_LABEL[e.status],
    receipt: withPhoto.has(e.id) ? "Photo" : e.receiptNo ? `OR ${e.receiptNo}` : "",
  }));
  const posted = expenses.filter((e) => e.status === "POSTED");
  const total = posted.reduce((a, e) => a + e.totalCents, 0n);

  return (
    <>
      <PageHeader
        title="Expenses"
        description={onlyOwn ? "Expenses you entered." : "Every peso spent, by location and category."}
        actions={
          locationsWithAny(user, "expenses:create").length > 0 && (
            <Button asChild className="h-11">
              <Link href="/expenses/new">
                <Plus className="size-4" /> New expense
              </Link>
            </Button>
          )
        }
      />
      <ListFilters
        dateRange
        locations={user.locations.filter((l) => viewIds.includes(l.id)).map((l) => ({ value: l.id, label: l.name }))}
        categories={groups.map((g) => ({ value: g.id, label: g.name }))}
        extra={[{ param: "status", label: "Status", options: Object.entries(STATUS_LABEL).filter(([k]) => k !== "APPROVED").map(([value, label]) => ({ value, label })) }]}
      />
      <p className="mb-2 text-sm text-muted-foreground">
        Posted in range: <b className="text-foreground">{formatPeso(total)}</b> · {posted.length} expenses
      </p>
      <ExpensesTable data={rows} />
    </>
  );
}
