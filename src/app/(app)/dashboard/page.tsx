import { ComingSoon } from "@/components/shell/coming-soon";
import { requirePagePermission } from "@/server/auth/session";

export const metadata = { title: "Dashboard" };

export default async function Page() {
  await requirePagePermission("dashboard:view");
  return (
    <ComingSoon title="Dashboard" phase={8}>
      KPI cards, money-in by channel, branch comparison, inventory panel and alerts.
    </ComingSoon>
  );
}
