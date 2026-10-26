import { ComingSoon } from "@/components/shell/coming-soon";
import { requirePagePermission } from "@/server/auth/session";

export const metadata = { title: "Expenses" };

export default async function Page() {
  await requirePagePermission("expenses:view", "expenses:create");
  return (
    <ComingSoon title="Expenses" phase={3}>
      Expense entry with receipt photos, approvals, recurring expenses, petty cash and payables.
    </ComingSoon>
  );
}
