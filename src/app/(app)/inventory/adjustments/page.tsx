import { PageHeader } from "@/components/shell/page-header";
import { SimpleTable } from "@/components/data-table/simple-table";
import { getActiveLocationId, locationsWithAny, requirePagePermission } from "@/server/auth/session";
import { db } from "@/server/db";
import { formatBusinessDate, manilaDateString } from "@/lib/dates";
import { formatPeso } from "@/lib/money";
import { AdjustmentForm } from "./adjustment-form";

export const metadata = { title: "Waste & adjustments" };

const LABEL = { WASTE: "Waste", STAFF_MEAL: "Staff meal", ADJUSTMENT: "Adjustment", OPENING: "Opening stock" } as const;

export default async function AdjustmentsPage() {
  const user = await requirePagePermission("inventory:adjust", "inventory:items:manage");
  const ids = locationsWithAny(user, "inventory:adjust", "inventory:items:manage");
  const [items, docs, values] = await Promise.all([
    db.item.findMany({ where: { isActive: true }, include: { locationSettings: true }, orderBy: { name: "asc" } }),
    db.stockAdjustment.findMany({ where: { locationId: { in: ids } }, include: { location: true, lines: { include: { item: true } } }, orderBy: { createdAt: "desc" }, take: 50 }),
    db.stockMovement.groupBy({ by: ["sourceId"], where: { sourceType: "StockAdjustment" }, _sum: { valueCents: true } }),
  ]);
  const valueOf = new Map(values.map((v) => [v.sourceId, v._sum.valueCents ?? 0n]));
  const active = await getActiveLocationId(user);
  return (
    <>
      <PageHeader title="Waste & adjustments" description="Record spoilage, staff meals and corrections as they happen, with a reason (and a photo for waste)." />
      <AdjustmentForm
        today={manilaDateString()}
        locations={user.locations.filter((l) => ids.includes(l.id)).map((l) => ({ id: l.id, name: l.name }))}
        defaultLocationId={ids.includes(active) ? active : ids[0]}
        canOpening={user.access.canAnywhere("inventory:items:manage")}
        items={items.map((i) => ({ id: i.id, name: i.name, unit: i.baseUnit, locationIds: i.locationSettings.filter((s) => s.isStocked).map((s) => s.locationId) }))}
      />
      <h2 className="mb-2 mt-10 text-2xl">Recent</h2>
      <SimpleTable
        head={["Date", "Location", "Type", "Items", "Reason", "Value"]}
        rows={docs.map((d) => [
          formatBusinessDate(d.date),
          d.location.name,
          LABEL[d.type],
          d.lines.map((l) => `${l.item.name} ${Math.abs(Number(l.qty))} ${l.item.baseUnit}`).join(", "),
          d.reason,
          formatPeso((valueOf.get(d.id) ?? 0n) < 0n ? -(valueOf.get(d.id) ?? 0n) : valueOf.get(d.id) ?? 0n),
        ])}
        empty="Nothing recorded yet."
      />
    </>
  );
}
