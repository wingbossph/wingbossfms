import { SectionTabs } from "@/components/shell/section-tabs";
import { requirePagePermission } from "@/server/auth/session";
import { db } from "@/server/db";

export default async function BankingLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePagePermission("banking:view");
  const overdue = await db.channelSettlement.count({ where: { status: "EXPECTED", expectedOn: { lt: new Date(Date.now() - 2 * 86_400_000) }, locationId: { in: user.access.locationsWith("banking:view") } } });
  const tabs = [
    { href: "/banking", label: "Accounts" },
    ...(user.access.canAnywhere("banking:reconcile") ? [{ href: "/banking/import", label: "Import statement" }] : []),
    { href: "/banking/payouts", label: "Card & Grab payouts", count: overdue },
  ];
  return (
    <>
      <SectionTabs tabs={tabs} />
      {children}
    </>
  );
}
