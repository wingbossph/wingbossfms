import { PageHeader } from "@/components/shell/page-header";
import { requirePagePermission } from "@/server/auth/session";
import { db } from "@/server/db";
import { ItemsEditor } from "./items-editor";

export const metadata = { title: "Items" };

export default async function ItemsPage() {
  await requirePagePermission("inventory:items:manage");
  const [items, categories, accounts, suppliers, locations] = await Promise.all([
    db.item.findMany({ include: { category: true, locationSettings: true }, orderBy: { name: "asc" } }),
    db.itemCategory.findMany({ orderBy: { sortOrder: "asc" } }),
    db.account.findMany({ where: { isPostable: true, group: { section: { in: ["CURRENT_ASSET", "COGS", "OPERATING_EXPENSE", "LABOR"] } } }, include: { group: true }, orderBy: { code: "asc" } }),
    db.supplier.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.location.findMany({ where: { isActive: true, type: { in: ["BRANCH", "COMMISSARY"] } }, orderBy: { sortOrder: "asc" }, select: { id: true, name: true } }),
  ]);
  return (
    <>
      <PageHeader title="Items" description="What you stock: units, purchase packs, how often it's counted, par levels and where it's stored per location." />
      <ItemsEditor
        categories={categories.map((c) => ({ id: c.id, name: c.name }))}
        inventoryAccounts={accounts.filter((a) => a.group.code === "INVENTORY").map((a) => ({ id: a.id, name: a.name }))}
        costAccounts={accounts.filter((a) => a.group.code !== "INVENTORY" && a.group.section !== "CURRENT_ASSET").map((a) => ({ id: a.id, name: `${a.code} ${a.name}` }))}
        suppliers={suppliers}
        locations={locations}
        items={items.map((i) => ({
          id: i.id,
          sku: i.sku ?? "",
          name: i.name,
          categoryId: i.categoryId,
          category: i.category.name,
          costClass: i.costClass,
          baseUnit: i.baseUnit,
          purchaseUnit: i.purchaseUnit ?? "",
          purchaseToBase: i.purchaseToBase.toString(),
          countFrequency: i.countFrequency,
          isProduced: i.isProduced,
          inventoryAccountId: i.inventoryAccountId,
          consumptionAccountId: i.consumptionAccountId,
          preferredSupplierId: i.preferredSupplierId ?? "",
          isActive: i.isActive,
          locations: locations.map((l) => {
            const s = i.locationSettings.find((x) => x.locationId === l.id);
            return {
              locationId: l.id,
              isStocked: s?.isStocked ?? false,
              parLevel: s?.parLevel?.toString() ?? "",
              reorderPoint: s?.reorderPoint?.toString() ?? "",
              storageArea: s?.storageArea ?? "",
              varianceTolerancePct: s?.varianceToleranceBp ? String(s.varianceToleranceBp / 100) : "",
            };
          }),
        }))}
      />
    </>
  );
}
