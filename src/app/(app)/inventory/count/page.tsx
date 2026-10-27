import { PageHeader } from "@/components/shell/page-header";
import { SimpleTable } from "@/components/data-table/simple-table";
import { getActiveLocationId, locationsWithAny, requirePagePermission } from "@/server/auth/session";
import { db } from "@/server/db";
import { countSheet } from "@/domains/inventory/documents";
import { manilaDateString, toDbDate, formatBusinessDate } from "@/lib/dates";
import { formatPeso } from "@/lib/money";
import { CountSheet } from "./count-sheet";

export const metadata = { title: "Stock count" };

const TYPES = ["DAILY", "WEEKLY", "MONTHLY", "FULL"] as const;

export default async function CountPage({ searchParams }: { searchParams: Promise<{ location?: string; type?: string; date?: string }> }) {
  const user = await requirePagePermission("inventory:count");
  const p = await searchParams;
  const ids = locationsWithAny(user, "inventory:count");
  const active = await getActiveLocationId(user);
  const locationId = p.location && ids.includes(p.location) ? p.location : ids.includes(active) ? active : ids[0];
  const type = TYPES.includes(p.type as (typeof TYPES)[number]) ? (p.type as (typeof TYPES)[number]) : "DAILY";
  const today = manilaDateString();
  const date = p.date && /^\d{4}-\d{2}-\d{2}$/.test(p.date) && p.date <= today ? p.date : today;

  const [sheet, existing, recent] = await Promise.all([
    countSheet(db, locationId, type),
    db.stockCount.findUnique({
      where: { locationId_countDate_type: { locationId, countDate: toDbDate(date), type } },
      include: { lines: { include: { item: true } } },
    }),
    db.stockCount.findMany({ where: { locationId }, orderBy: { countDate: "desc" }, take: 10 }),
  ]);
  const canSeeResults = user.access.can("inventory:view", locationId);

  return (
    <>
      <PageHeader title="Stock count" description="Count what's physically there. Daily counts cover the key items (wings, oil, main sauces); weekly and monthly counts add the rest." />
      <CountSheet
        key={`${locationId}-${type}-${date}`}
        locations={user.locations.filter((l) => ids.includes(l.id)).map((l) => ({ id: l.id, name: l.name }))}
        locationId={locationId}
        type={type}
        date={date}
        today={today}
        items={sheet}
        status={existing?.status ?? null}
        initial={Object.fromEntries(existing?.lines.map((l) => [l.itemId, l.countedQty.toString()]) ?? [])}
      />
      {existing?.status === "POSTED" && canSeeResults && (
        <section className="mt-8 max-w-3xl">
          <h2 className="mb-2 text-2xl">Result</h2>
          <SimpleTable
            head={["Item", "Book", "Counted", "Used", "Cost"]}
            rows={existing.lines.map((l) => [
              l.item.name,
              `${Number(l.systemQty)} ${l.item.baseUnit}`,
              `${Number(l.countedQty)} ${l.item.baseUnit}`,
              `${Number(l.usageQty)} ${l.item.baseUnit}`,
              formatPeso(l.usageCents),
            ])}
          />
        </section>
      )}
      <section className="mt-8 max-w-3xl">
        <h2 className="mb-2 text-xl">Recent counts</h2>
        <SimpleTable head={["Date", "Type", "Status"]} rows={recent.map((c) => [formatBusinessDate(c.countDate), c.type.toLowerCase(), c.status === "POSTED" ? "Posted" : "Draft"])} empty="No counts yet." />
      </section>
    </>
  );
}
