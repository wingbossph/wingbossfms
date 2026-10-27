import { SectionTabs } from "@/components/shell/section-tabs";
import { locationsWithAny, requireUser } from "@/server/auth/session";
import { db } from "@/server/db";

export default async function CommissaryLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const can = (p: string) => user.access.canAnywhere(p);
  const receiveIds = locationsWithAny(user, "transfers:receive");
  const incoming = receiveIds.length ? await db.transfer.count({ where: { status: "DISPATCHED", toLocationId: { in: receiveIds } } }) : 0;
  const tabs = [
    ...(can("transfers:create") ? [{ href: "/commissary", label: "Dispatch" }] : []),
    { href: "/commissary/transfers", label: "Transfers", count: incoming },
    ...(can("production:create") ? [{ href: "/commissary/production", label: "Production" }] : []),
    ...(can("reports:inventory:view") ? [{ href: "/commissary/statement", label: "Statement" }] : []),
  ];
  return (
    <>
      {tabs.length > 1 && <SectionTabs tabs={tabs} />}
      {children}
    </>
  );
}
