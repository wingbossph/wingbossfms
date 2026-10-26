import { ComingSoon } from "@/components/shell/coming-soon";
import { requirePagePermission } from "@/server/auth/session";

export const metadata = { title: "Cash & deposits" };

export default async function Page() {
  await requirePagePermission("cash:count", "cash:deposit", "money:view");
  return (
    <ComingSoon title="Cash & deposits" phase={2}>
      Cash counts, deposits, undeposited cash and money account balances.
    </ComingSoon>
  );
}
