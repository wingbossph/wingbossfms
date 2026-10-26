import { ComingSoon } from "@/components/shell/coming-soon";
import { requirePagePermission } from "@/server/auth/session";

export const metadata = { title: "Sales" };

export default async function Page() {
  await requirePagePermission("sales:view", "sales:create");
  return (
    <ComingSoon title="Sales" phase={2}>
      Loyverse CSV import, daily sales entry with payment split, and shift close.
    </ComingSoon>
  );
}
