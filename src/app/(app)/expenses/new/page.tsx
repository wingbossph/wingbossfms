import { PageHeader } from "@/components/shell/page-header";
import { requirePagePermission } from "@/server/auth/session";
import { expenseFormData } from "@/domains/expenses/form-data";
import { manilaDateString } from "@/lib/dates";
import { ExpenseForm } from "../expense-form";

export const metadata = { title: "New expense" };

export default async function NewExpensePage() {
  const user = await requirePagePermission("expenses:create");
  const data = await expenseFormData(user);
  return (
    <>
      <PageHeader title="New expense" />
      <ExpenseForm data={data} today={manilaDateString()} />
    </>
  );
}
