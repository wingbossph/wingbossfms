import { SectionTabs } from "@/components/shell/section-tabs";
import { requireUser } from "@/server/auth/session";

export default async function InventoryLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const can = (p: string) => user.access.canAnywhere(p);
  const tabs = [
    ...(can("inventory:view") ? [{ href: "/inventory", label: "Stock" }] : []),
    ...(can("inventory:count") ? [{ href: "/inventory/count", label: "Count" }] : []),
    ...(can("inventory:adjust") || can("inventory:items:manage") ? [{ href: "/inventory/adjustments", label: "Waste & adjustments" }] : []),
    ...(can("reports:inventory:view") ? [{ href: "/inventory/variance", label: "Variance & per-pax" }] : []),
    ...(can("inventory:items:manage") ? [{ href: "/inventory/items", label: "Items" }, { href: "/inventory/recipes", label: "Recipes & standards" }, { href: "/inventory/import", label: "Import sheet" }] : []),
  ];
  return (
    <>
      {tabs.length > 1 && <SectionTabs tabs={tabs} />}
      {children}
    </>
  );
}
