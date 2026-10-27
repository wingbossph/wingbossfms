import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/shell/page-header";
import { ListFilters } from "@/components/data-table/list-filters";
import { SimpleTable } from "@/components/data-table/simple-table";
import { Badge } from "@/components/ui/badge";
import { requireUser, scopeLocations } from "@/server/auth/session";
import { db } from "@/server/db";
import { lowStock, perPaxKpis } from "@/domains/inventory/analytics";
import { formatPeso } from "@/lib/money";
import { manilaDateString } from "@/lib/dates";
import { StockTable } from "./stock-table";

export const metadata = { title: "Inventory" };

export default async function InventoryPage({ searchParams }: { searchParams: Promise<{ location?: string; category?: string }> }) {
  const user = await requireUser();
  if (!user.access.canAnywhere("inventory:view")) redirect(user.access.canAnywhere("inventory:count") ? "/inventory/count" : "/forbidden");
  const f = await searchParams;
  const ids = scopeLocations(user, "inventory:view", f.location);
  const [balances, categories, low] = await Promise.all([
    db.stockBalance.findMany({
      where: { locationId: { in: ids }, ...(f.category ? { item: { categoryId: f.category } } : {}) },
      include: { item: { include: { category: true } }, location: true },
      orderBy: [{ location: { sortOrder: "asc" } }, { item: { name: "asc" } }],
    }),
    db.itemCategory.findMany({ orderBy: { sortOrder: "asc" } }),
    lowStock(db, ids),
  ]);
  const today = manilaDateString();
  const weekAgo = manilaDateString(new Date(Date.now() - 6 * 86_400_000));
  const branches = user.locations.filter((l) => ids.includes(l.id) && l.type === "BRANCH");
  const kpis = user.access.canAnywhere("reports:inventory:view") ? await Promise.all(branches.map(async (b) => ({ b, k: await perPaxKpis(db, b.id, weekAgo, today) }))) : [];
  const total = balances.reduce((a, b) => a + b.valueCents, 0n);
  const needsStandard = kpis.some(({ k }) => k.standardKgPerPax === null);

  return (
    <>
      <PageHeader title="Inventory" description={`Stock on hand at weighted-average cost: ${formatPeso(total)}`} />
      {needsStandard && user.access.canAnywhere("inventory:items:manage") && (
        <div className="mb-6 rounded-lg border-2 border-warning p-4 text-sm">
          <b>Set the standard consumption.</b> The kg of wings per pax for each package is still 0, so theoretical usage and variance can&apos;t be calculated.{" "}
          <Link href="/inventory/recipes" className="font-semibold underline underline-offset-4">
            Set it now
          </Link>{" "}
          (after 2–4 weeks of daily counts the system suggests a value).
        </div>
      )}
      {kpis.length > 0 && (
        <section className="mb-8 grid gap-3 md:grid-cols-2">
          {kpis.map(({ b, k }) => (
            <div key={b.id} className="rounded-lg border p-4">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">{b.name} · last 7 days</p>
              <div className="mt-2 grid grid-cols-3 gap-3 text-sm">
                <Kpi label="Kg wings / pax" value={k.wingsKgPerPax?.toFixed(3) ?? "—"} sub={k.standardKgPerPax ? `standard ${k.standardKgPerPax}` : "no standard"} warn={!!(k.wingsKgPerPax && k.standardKgPerPax && k.wingsKgPerPax > k.standardKgPerPax * 1.05)} />
                <Kpi label="Wing cost / pax" value={k.wingsCostPerPaxCents === null ? "—" : formatPeso(k.wingsCostPerPaxCents)} />
                <Kpi label="Food cost / pax" value={k.foodCostPerPaxCents === null ? "—" : formatPeso(k.foodCostPerPaxCents)} sub={k.netSalesPerPaxCents ? `sales ${formatPeso(k.netSalesPerPaxCents)}/pax` : undefined} />
              </div>
            </div>
          ))}
        </section>
      )}
      {low.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-2 text-2xl">Below reorder point</h2>
          <SimpleTable
            head={["Item", "Location", "On hand", "Reorder at", "Par"]}
            rows={low.map((r) => [<b key="i">{r.item}</b>, r.location, <Badge key="q" variant="destructive">{`${r.qty} ${r.unit}`}</Badge>, `${r.reorderAt} ${r.unit}`, r.par ? `${r.par} ${r.unit}` : "—"])}
          />
        </section>
      )}
      <ListFilters
        locations={user.locations.filter((l) => user.access.can("inventory:view", l.id)).map((l) => ({ value: l.id, label: l.name }))}
        categories={categories.map((c) => ({ value: c.id, label: c.name }))}
      />
      <StockTable
        data={balances.map((b) => ({
          item: b.item.name,
          category: b.item.category.name,
          location: b.location.name,
          qty: Number(b.qty),
          unit: b.item.baseUnit,
          avg: formatPeso(BigInt(Math.round(Number(b.avgUnitCost)))),
          value: formatPeso(b.valueCents),
          valueCents: Number(b.valueCents),
        }))}
      />
    </>
  );
}

function Kpi({ label, value, sub, warn }: { label: string; value: string; sub?: string; warn?: boolean }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`font-display text-2xl ${warn ? "text-destructive" : ""}`}>{value}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}
