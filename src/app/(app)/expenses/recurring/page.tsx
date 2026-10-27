import { PageHeader } from "@/components/shell/page-header";
import { locationsWithAny, requirePagePermission } from "@/server/auth/session";
import { db } from "@/server/db";
import { expenseCategories } from "@/domains/expenses/queries";
import { formatBusinessDate, manilaDateString } from "@/lib/dates";
import { formatPeso } from "@/lib/money";
import { RecurringEditor } from "./recurring-editor";

export const metadata = { title: "Recurring expenses" };

export default async function RecurringPage() {
  const user = await requirePagePermission("payables:manage");
  const ids = locationsWithAny(user, "payables:manage");
  const [templates, categories, suppliers, moneyAccounts] = await Promise.all([
    db.recurringExpense.findMany({ where: { locationId: { in: ids } }, include: { location: true, account: true, supplier: true }, orderBy: { nextRunOn: "asc" } }),
    expenseCategories(),
    db.supplier.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.moneyAccount.findMany({ where: { isActive: true, kind: { in: ["BANK", "EWALLET", "PETTY_CASH", "OWNER_PERSONAL"] } }, select: { id: true, name: true, locationId: true } }),
  ]);
  return (
    <>
      <PageHeader title="Recurring expenses" description="Rent, internet, subscriptions, loan amortization. A draft is created automatically each period for review and approval." />
      <RecurringEditor
        today={manilaDateString()}
        locations={user.locations.filter((l) => ids.includes(l.id)).map((l) => ({ id: l.id, name: l.name }))}
        categories={categories}
        suppliers={suppliers}
        moneyAccounts={moneyAccounts}
        templates={templates.map((t) => ({
          id: t.id,
          name: t.name,
          locationId: t.locationId,
          locationName: t.location.name,
          supplierId: t.supplierId ?? "",
          supplierName: t.supplier?.name ?? "",
          accountId: t.accountId,
          accountName: t.account.name,
          amount: formatPeso(t.amountCents, { symbol: false }),
          terms: t.terms,
          moneyAccountId: t.moneyAccountId ?? "",
          frequency: t.frequency,
          dayOfMonth: t.dayOfMonth ?? undefined,
          nextRunOn: t.nextRunOn.toISOString().slice(0, 10),
          nextRunLabel: formatBusinessDate(t.nextRunOn),
          endOn: t.endOn?.toISOString().slice(0, 10) ?? "",
          isActive: t.isActive,
        }))}
      />
    </>
  );
}
