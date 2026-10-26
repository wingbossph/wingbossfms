import { ComingSoon } from "@/components/shell/coming-soon";
import { requirePagePermission } from "@/server/auth/session";

export const metadata = { title: "Inventory" };

export default async function Page() {
  await requirePagePermission("inventory:view", "inventory:count");
  return (
    <ComingSoon title="Inventory" phase={5}>
      Items, daily counts, waste, usage and variance, and wings-per-pax KPIs.
    </ComingSoon>
  );
}
