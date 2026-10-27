import { PageHeader } from "@/components/shell/page-header";
import { SimpleTable } from "@/components/data-table/simple-table";
import { locationsWithAny, requirePagePermission } from "@/server/auth/session";
import { db } from "@/server/db";
import { formatDate, manilaDateString } from "@/lib/dates";
import { formatPeso } from "@/lib/money";
import { ProductionForm } from "./production-form";

export const metadata = { title: "Production" };

export default async function ProductionPage() {
  const user = await requirePagePermission("production:create");
  const ids = locationsWithAny(user, "production:create");
  const [locations, recipes, batches] = await Promise.all([
    db.location.findMany({ where: { id: { in: ids }, isActive: true }, orderBy: { sortOrder: "asc" }, select: { id: true, name: true, type: true } }),
    db.recipe.findMany({ where: { kind: "PRODUCTION", isActive: true }, include: { outputItem: true, lines: { include: { item: true } } }, orderBy: { name: "asc" } }),
    db.productionBatch.findMany({ where: { locationId: { in: ids } }, include: { outputItem: true, location: true }, orderBy: [{ batchDate: "desc" }, { number: "desc" }], take: 50 }),
  ]);
  const showValues = user.access.canAnywhere("reports:inventory:view");
  const defaultLoc = locations.find((l) => l.type === "COMMISSARY") ?? locations[0];
  return (
    <>
      <PageHeader title="Production" description="Record a batch: ingredients come out of stock and the finished item goes in at their cost." />
      {recipes.length === 0 ? (
        <p className="rounded-md border p-4 text-sm">No production recipes yet. Add one under Inventory → Recipes.</p>
      ) : (
        <ProductionForm
          today={manilaDateString()}
          locations={locations.map((l) => ({ id: l.id, name: l.name }))}
          defaultLocationId={defaultLoc?.id ?? ""}
          recipes={recipes.map((r) => ({
            id: r.id,
            name: r.name,
            unit: r.outputItem?.baseUnit ?? "",
            yield: r.outputQty?.toString() ?? "1",
            lines: r.lines.map((l) => ({ itemId: l.itemId, name: l.item.name, unit: l.item.baseUnit, qty: l.qty.toString() })),
          }))}
        />
      )}
      <h2 className="mt-10 mb-2 text-2xl">Recent batches</h2>
      <SimpleTable
        head={["#", "Date", "Location", "Item", "Quantity", "Lot", ...(showValues ? ["Cost", "Unit cost"] : [])]}
        rows={batches.map((b) => [
          `#${b.number}`,
          formatDate(b.batchDate),
          b.location.name,
          b.outputItem.name,
          `${Number(b.outputQty)} ${b.outputItem.baseUnit}`,
          b.lotCode ?? "",
          ...(showValues ? [formatPeso(b.totalCostCents), `₱${(Number(b.unitCost) / 100).toFixed(2)}`] : []),
        ])}
        empty="No batches recorded yet."
      />
    </>
  );
}
