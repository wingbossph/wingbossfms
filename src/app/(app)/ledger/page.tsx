import { ComingSoon } from "@/components/shell/coming-soon";
import { requirePagePermission } from "@/server/auth/session";

export const metadata = { title: "Ledger" };

export default async function Page() {
  await requirePagePermission("ledger:view");
  return (
    <ComingSoon title="Ledger" phase={4}>
      Journal, general ledger, manual entries, period close and fixed assets.
    </ComingSoon>
  );
}
