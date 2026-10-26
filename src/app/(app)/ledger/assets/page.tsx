import { PageHeader } from "@/components/shell/page-header";
import { requirePagePermission } from "@/server/auth/session";
import { db } from "@/server/db";
import { formatBusinessDate, manilaDateString } from "@/lib/dates";
import { formatPeso } from "@/lib/money";
import { AssetsEditor } from "./assets-editor";

export const metadata = { title: "Fixed assets" };

export default async function AssetsPage() {
  const user = await requirePagePermission("ledger:view");
  const ids = user.access.locationsWith("ledger:view");
  const [assets, assetAccounts, depAccounts] = await Promise.all([
    db.fixedAsset.findMany({ where: { locationId: { in: ids } }, include: { location: true, depreciations: true }, orderBy: [{ isActive: "desc" }, { acquiredOn: "desc" }] }),
    db.account.findMany({ where: { group: { code: "PPE" }, isPostable: true, NOT: { systemKey: "ACCUM_DEPRECIATION" } }, orderBy: { code: "asc" } }),
    db.account.findMany({ where: { group: { kpiTag: "DEPRECIATION" }, isPostable: true }, orderBy: { code: "asc" } }),
  ]);
  return (
    <>
      <PageHeader title="Fixed assets" description="Equipment and renovations, depreciated straight-line each month (starting the month after purchase). Buying the asset itself is recorded as an expense to the asset account." />
      <AssetsEditor
        canEdit={user.access.canAnywhere("ledger:journal:create")}
        thisMonth={manilaDateString().slice(0, 7)}
        locations={user.locations.filter((l) => ids.includes(l.id)).map((l) => ({ id: l.id, name: l.name }))}
        assetAccounts={assetAccounts.map((a) => ({ id: a.id, name: a.name }))}
        depAccounts={depAccounts.map((a) => ({ id: a.id, name: a.name }))}
        assets={assets.map((a) => {
          const dep = a.depreciations.reduce((s, d) => s + d.amountCents, 0n);
          return {
            id: a.id,
            name: a.name,
            locationId: a.locationId,
            location: a.location.name,
            category: a.category,
            acquiredOn: a.acquiredOn.toISOString().slice(0, 10),
            acquiredLabel: formatBusinessDate(a.acquiredOn),
            cost: formatPeso(a.costCents, { symbol: false }),
            salvage: formatPeso(a.salvageCents, { symbol: false }),
            usefulLifeMonths: a.usefulLifeMonths,
            assetAccountId: a.assetAccountId,
            depExpenseAccountId: a.depExpenseAccountId,
            disposedOn: a.disposedOn?.toISOString().slice(0, 10) ?? "",
            accumulated: formatPeso(dep),
            bookValue: formatPeso(a.costCents - dep),
            isActive: a.isActive,
          };
        })}
      />
    </>
  );
}
