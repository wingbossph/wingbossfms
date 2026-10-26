import { PageHeader } from "@/components/shell/page-header";
import { getActiveLocationId, locationsWithAny, requirePagePermission } from "@/server/auth/session";
import { db } from "@/server/db";
import { manilaDateString } from "@/lib/dates";
import { getSetting } from "@/domains/admin/settings";
import { ImportWizard } from "./import-wizard";
import { SyncButton } from "./sync-button";

export const metadata = { title: "Import Loyverse" };

export default async function ImportPage() {
  const user = await requirePagePermission("sales:import");
  const ids = locationsWithAny(user, "sales:import");
  const [products, channels, recent] = await Promise.all([
    db.product.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" }, select: { id: true, name: true, paxPerUnit: true } }),
    db.paymentChannel.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" }, include: { locations: true } }),
    db.loyverseImport.findMany({ where: { locationId: { in: ids } }, orderBy: { createdAt: "desc" }, take: 10, include: { location: true } }),
  ]);
  const active = await getActiveLocationId(user);
  const synced = process.env.LOYVERSE_API_TOKEN ? (await Promise.all(ids.map(async (id) => ((await getSetting(db, "loyverse.storeId", id)) ? id : null)))).filter((x): x is string => !!x) : [];

  return (
    <>
      <PageHeader
        title="Import Loyverse"
        description="Export from Loyverse Back Office → Reports → Receipts → Export (choose “Receipts by item”). Re-importing the same day is safe: receipts already imported are skipped."
      />
      {synced.length > 0 && (
        <section className="mb-6 rounded-lg border p-4">
          <p className="mb-2 text-sm">Loyverse sync is on: receipts are pulled automatically every night. Pull them now:</p>
          <SyncButton locations={user.locations.filter((l) => synced.includes(l.id)).map((l) => ({ id: l.id, name: l.name }))} />
        </section>
      )}
      <ImportWizard
        locations={user.locations.filter((l) => ids.includes(l.id)).map((l) => ({ id: l.id, name: l.name }))}
        defaultLocationId={ids.includes(active) ? active : ids[0]}
        products={products.map((p) => ({ id: p.id, name: `${p.name}${Number(p.paxPerUnit) ? ` (${Number(p.paxPerUnit)} pax)` : ""}` }))}
        channels={channels.map((c) => ({ id: c.id, name: c.name, locationIds: c.locations.map((l) => l.locationId) }))}
        today={manilaDateString()}
      />
      <section className="mt-10">
        <h2 className="mb-2 text-xl">Recent imports</h2>
        <ul className="divide-y rounded-md border text-sm">
          {recent.map((r) => (
            <li key={r.id} className="flex flex-wrap justify-between gap-2 px-3 py-2">
              <span>
                {r.location.name} · {r.fileName ?? r.kind}
              </span>
              <span className="text-muted-foreground">
                {r.newCount} new · {r.duplicateCount} skipped · {r.createdAt.toLocaleString("en-PH", { timeZone: "Asia/Manila" })}
              </span>
            </li>
          ))}
          {recent.length === 0 && <li className="px-3 py-2 text-muted-foreground">No imports yet.</li>}
        </ul>
      </section>
    </>
  );
}
