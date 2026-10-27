import { PageHeader } from "@/components/shell/page-header";
import { requirePagePermission } from "@/server/auth/session";
import { db } from "@/server/db";
import { formatBusinessDate } from "@/lib/dates";
import { formatPeso } from "@/lib/money";
import { MenuEditor } from "./menu-editor";

export const metadata = { title: "Menu & prices" };

export default async function MenuPage() {
  await requirePagePermission("settings:manage");
  const [products, priceLists, revenueAccounts, locations] = await Promise.all([
    db.product.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }], include: { revenueAccount: true } }),
    db.priceList.findMany({ include: { items: true, location: true }, orderBy: [{ effectiveFrom: "desc" }] }),
    db.account.findMany({ where: { group: { section: "REVENUE" }, isPostable: true, isIntercompany: false, isActive: true }, orderBy: { code: "asc" } }),
    db.location.findMany({ where: { isActive: true, type: "BRANCH" }, orderBy: { sortOrder: "asc" }, select: { id: true, name: true } }),
  ]);

  const zeroPriced = priceLists.filter((l) => !l.effectiveTo).flatMap((l) => l.items).filter((i) => i.priceCents === 0n).length;

  return (
    <>
      <PageHeader
        title="Menu & prices"
        description="Packages and items cashiers sell, how many pax each counts as, and their prices per branch."
      />
      {zeroPriced > 0 && (
        <p className="mb-4 rounded-md border border-warning bg-warning/10 p-3 text-sm">
          {zeroPriced} price{zeroPriced > 1 ? "s are" : " is"} still ₱0.00. Enter your real prices below.
        </p>
      )}
      <MenuEditor
        products={products.map((p) => ({
          id: p.id,
          name: p.name,
          type: p.type,
          paxPerUnit: p.paxPerUnit.toString(),
          revenueAccountId: p.revenueAccountId,
          revenueAccount: `${p.revenueAccount.code} ${p.revenueAccount.name}`,
          isActive: p.isActive,
          sortOrder: p.sortOrder,
        }))}
        priceLists={priceLists.map((l) => ({
          id: l.id,
          name: l.name,
          scope: l.location?.name ?? "All branches",
          locationId: l.locationId,
          period: `${formatBusinessDate(l.effectiveFrom)} – ${l.effectiveTo ? formatBusinessDate(l.effectiveTo) : "open"}`,
          isOpen: !l.effectiveTo,
          prices: Object.fromEntries(l.items.map((i) => [i.productId, formatPeso(i.priceCents, { symbol: false })])),
        }))}
        revenueAccounts={revenueAccounts.map((a) => ({ id: a.id, name: `${a.code} ${a.name}` }))}
        locations={locations}
      />
    </>
  );
}
