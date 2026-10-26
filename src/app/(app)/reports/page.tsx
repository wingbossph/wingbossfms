import { ComingSoon } from "@/components/shell/coming-soon";
import { requirePagePermission } from "@/server/auth/session";

export const metadata = { title: "Reports" };

export default async function Page() {
  await requirePagePermission("reports:sales:view", "reports:pnl:view", "reports:inventory:view");
  return (
    <ComingSoon title="Reports" phase={8}>
      P&amp;L, balance sheet, cash flow, sales, expense, inventory and payroll reports with PDF/Excel export.
    </ComingSoon>
  );
}
