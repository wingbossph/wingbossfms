import { PageHeader } from "@/components/shell/page-header";
import { locationsWithAny, requirePagePermission } from "@/server/auth/session";
import { db } from "@/server/db";
import { canApproveWith } from "@/domains/expenses/rules";
import { EXPENSE_STATUS_LABEL } from "@/domains/expenses/labels";
import { formatBusinessDate } from "@/lib/dates";
import { formatPeso } from "@/lib/money";
import { ExpensesTable } from "../expenses-table";

export const metadata = { title: "Expense approvals" };

export default async function ApprovalsPage() {
  const user = await requirePagePermission("expenses:approve", "expenses:approve:high");
  const ids = locationsWithAny(user, "expenses:approve", "expenses:approve:high");
  const pending = await db.expense.findMany({
    where: { status: "SUBMITTED", locationId: { in: ids } },
    include: { location: true, supplier: true, lines: { include: { account: true } } },
    orderBy: [{ date: "asc" }],
  });
  const mine = pending.filter((e) => canApproveWith(e.requiredApproval ?? "expenses:approve", (p) => user.access.can(p, e.locationId)));
  return (
    <>
      <PageHeader title="Approvals" description={`${mine.length} expense${mine.length === 1 ? "" : "s"} waiting for you${pending.length > mine.length ? ` (${pending.length - mine.length} more need the Owner)` : ""}.`} />
      <ExpensesTable
        emptyMessage="Nothing to approve."
        data={mine.map((e) => ({
          id: e.id,
          number: e.number,
          date: formatBusinessDate(e.date),
          ymd: e.date.toISOString().slice(0, 10),
          location: e.location.name,
          supplier: e.supplier?.name ?? "",
          category: e.lines.length === 1 ? e.lines[0].account.name : `${e.lines[0]?.account.name ?? ""} +${e.lines.length - 1}`,
          amount: formatPeso(e.totalCents),
          amountCents: Number(e.totalCents),
          terms: e.terms === "PAID_NOW" ? "Paid" : "Bill",
          status: EXPENSE_STATUS_LABEL[e.status],
          receipt: e.receiptNo ? `OR ${e.receiptNo}` : "",
        }))}
      />
    </>
  );
}
