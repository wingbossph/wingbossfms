import { SectionTabs } from "@/components/shell/section-tabs";
import { locationsWithAny, requireUser } from "@/server/auth/session";
import { db } from "@/server/db";

export default async function ExpensesLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const approveIds = locationsWithAny(user, "expenses:approve", "expenses:approve:high");
  const payIds = locationsWithAny(user, "payables:manage");
  const pending = approveIds.length ? await db.expense.count({ where: { status: "SUBMITTED", locationId: { in: approveIds } } }) : 0;
  const tabs = [
    { href: "/expenses", label: "Expenses" },
    ...(approveIds.length ? [{ href: "/expenses/approvals", label: "Approvals", count: pending }] : []),
    ...(payIds.length ? [{ href: "/expenses/payables", label: "Bills to pay" }, { href: "/expenses/recurring", label: "Recurring" }, { href: "/expenses/petty-cash", label: "Petty cash" }] : []),
    ...(user.access.canAnywhere("suppliers:manage") ? [{ href: "/expenses/suppliers", label: "Suppliers" }] : []),
  ];
  return (
    <>
      {tabs.length > 1 && <SectionTabs tabs={tabs} />}
      {children}
    </>
  );
}
