import { ComingSoon } from "@/components/shell/coming-soon";
import { requirePagePermission } from "@/server/auth/session";

export const metadata = { title: "Banking" };

export default async function Page() {
  await requirePagePermission("banking:view");
  return (
    <ComingSoon title="Banking" phase={6}>
      Statement import (BPI, GCash, Maya, Grab), auto-matching and reconciliation.
    </ComingSoon>
  );
}
