import Link from "next/link";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shell/page-header";
import { ListFilters } from "@/components/data-table/list-filters";
import { getActiveLocationId, locationsWithAny, requirePagePermission, scopeLocationsAny } from "@/server/auth/session";
import { db } from "@/server/db";
import { getSetting } from "@/domains/admin/settings";
import { formatBusinessDate, manilaDateString, toDbDate } from "@/lib/dates";
import { formatPeso } from "@/lib/money";
import { SalesTable, type SalesRow } from "./sales-table";
import { StartSalesForm } from "./start-sales-form";

export const metadata = { title: "Sales" };

const STATUS = { DRAFT: "Draft", POSTED: "Submitted", VOIDED: "Voided", SUBMITTED: "Submitted", APPROVED: "Reviewed", REJECTED: "Rejected" } as const;

export default async function SalesPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; location?: string; category?: string }>;
}) {
  const user = await requirePagePermission("sales:view", "sales:create");
  const f = await searchParams;
  const locationIds = scopeLocationsAny(user, ["sales:view", "sales:create"], f.location);
  const today = manilaDateString();
  const from = f.from ?? new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
  const to = f.to ?? today;

  const reports = await db.salesReport.findMany({
    where: {
      locationId: { in: locationIds },
      businessDate: { gte: toDbDate(from), lte: toDbDate(to) },
      ...(f.category === "DRAFT" ? { status: "DRAFT" } : f.category === "POSTED" ? { status: "POSTED" } : {}),
    },
    include: { location: true, cashCount: true },
    orderBy: [{ businessDate: "desc" }, { shiftNo: "desc" }],
    take: 500,
  });
  const cashiers = await db.user.findMany({ where: { id: { in: [...new Set(reports.map((r) => r.cashierUserId))] } }, select: { id: true, name: true } });
  const cashierName = new Map(cashiers.map((c) => [c.id, c.name]));

  const rows: SalesRow[] = reports.map((r) => ({
    id: r.id,
    date: formatBusinessDate(r.businessDate),
    ymd: r.businessDate.toISOString().slice(0, 10),
    location: r.location.name,
    shift: r.shiftNo,
    source: r.source === "MANUAL" ? "Manual" : r.source === "MIXED" ? "Loyverse + manual" : "Loyverse",
    pax: Number(r.pax),
    net: formatPeso(r.netCents),
    netCents: Number(r.netCents),
    status: r.status === "POSTED" && r.approvedAt ? "Reviewed" : STATUS[r.status],
    cash: r.cashCount ? (r.cashCount.overShortCents === 0n ? "Balanced" : `${r.cashCount.overShortCents > 0n ? "Over" : "Short"} ${formatPeso(r.cashCount.overShortCents < 0n ? -r.cashCount.overShortCents : r.cashCount.overShortCents)}`) : r.status === "POSTED" ? "Not closed" : "—",
    cashier: cashierName.get(r.cashierUserId) ?? "",
  }));

  const createIds = locationsWithAny(user, "sales:create");
  const createLocations = user.locations.filter((l) => createIds.includes(l.id));
  const active = await getActiveLocationId(user);
  const shifts = Object.fromEntries(await Promise.all(createLocations.map(async (l) => [l.id, await getSetting(db, "sales.shiftsPerDay", l.id)] as const)));
  const totalNet = reports.filter((r) => r.status === "POSTED").reduce((a, r) => a + r.netCents, 0n);
  const totalPax = reports.filter((r) => r.status === "POSTED").reduce((a, r) => a + Number(r.pax), 0);

  return (
    <>
      <PageHeader
        title="Sales"
        description="Daily sales per branch and shift. Import from Loyverse, confirm, then close the shift with a cash count."
        actions={
          locationsWithAny(user, "sales:import").length > 0 && (
            <Button variant="outline" asChild>
              <Link href="/sales/import">
                <Upload className="size-4" /> Import Loyverse
              </Link>
            </Button>
          )
        }
      />
      {createLocations.length > 0 && (
        <StartSalesForm
          locations={createLocations.map((l) => ({ id: l.id, name: l.name, shifts: shifts[l.id] ?? 1 }))}
          defaultLocationId={createIds.includes(active) ? active : createLocations[0].id}
          today={today}
        />
      )}
      <ListFilters
        dateRange
        locations={user.locations.filter((l) => locationsWithAny(user, "sales:view", "sales:create").includes(l.id)).map((l) => ({ value: l.id, label: l.name }))}
        categoryLabel="Status"
        categories={[
          { value: "DRAFT", label: "Draft" },
          { value: "POSTED", label: "Submitted" },
        ]}
      />
      <p className="mb-2 text-sm text-muted-foreground">
        {formatBusinessDate(toDbDate(from))} – {formatBusinessDate(toDbDate(to))}: submitted net sales <b className="text-foreground">{formatPeso(totalNet)}</b> · {totalPax.toLocaleString()} pax
      </p>
      <SalesTable data={rows} />
    </>
  );
}
