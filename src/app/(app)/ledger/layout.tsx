import { SectionTabs } from "@/components/shell/section-tabs";
import { requirePagePermission } from "@/server/auth/session";

export default async function LedgerLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePagePermission("ledger:view");
  const can = (p: string) => user.access.canAnywhere(p);
  const tabs = [
    { href: "/ledger", label: "Journal" },
    { href: "/ledger/accounts", label: "Chart of accounts" },
    { href: "/reports/trial-balance", label: "Trial balance" },
    { href: "/ledger/periods", label: "Periods" },
    { href: "/ledger/assets", label: "Fixed assets" },
    ...(user.isOwner ? [{ href: "/ledger/equity", label: "Owner's equity" }] : []),
    ...(can("ledger:journal:create") ? [{ href: "/ledger/opening", label: "Opening balances" }] : []),
    ...(can("settings:manage") ? [{ href: "/ledger/allocations", label: "Allocations" }] : []),
  ];
  return (
    <>
      <SectionTabs tabs={tabs} />
      {children}
    </>
  );
}
