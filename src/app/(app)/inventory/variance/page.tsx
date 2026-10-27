import Link from "next/link";
import { PageHeader } from "@/components/shell/page-header";
import { SimpleTable } from "@/components/data-table/simple-table";
import { ReportFilters } from "@/components/reports/report-filters";
import { ReportView } from "@/components/reports/report-view";
import { requirePagePermission } from "@/server/auth/session";
import { db } from "@/server/db";
import { perPaxKpis, suggestWingsStandard } from "@/domains/inventory/analytics";
import { reportScope } from "@/domains/reports/registry";
import { varianceDoc } from "@/domains/reports/inventory-reports";
import { rangeOf } from "@/domains/reports/params";
import { formatPeso } from "@/lib/money";
import { manilaDateString } from "@/lib/dates";

export const metadata = { title: "Variance & per-pax" };

export default async function VariancePage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const user = await requirePagePermission("reports:inventory:view");
  const p = await searchParams;
  const { from, to } = rangeOf({ from: p.from ?? manilaDateString(new Date(Date.now() - 13 * 86_400_000)), to: p.to });
  const scope = await reportScope(user, "reports:inventory:view", p);
  const branches = scope.locations.filter((l) => l.type === "BRANCH");
  const [doc, kpis, suggestion] = await Promise.all([
    varianceDoc(scope, from, to),
    Promise.all(branches.map(async (b) => ({ b, k: await perPaxKpis(db, b.id, from, to) }))),
    suggestWingsStandard(db, branches.map((b) => b.id), manilaDateString()),
  ]);
  const allowed = user.access.locationsWith("reports:inventory:view");

  return (
    <>
      <PageHeader title="Variance & per-pax" description="How many kg of wings each guest ate, and whether usage matches what was sold." />
      <ReportFilters spec={{ range: { from, to }, locations: user.locations.filter((l) => allowed.includes(l.id)).map((l) => ({ value: l.id, label: l.name })), location: p.location ?? "all" }} />
      <SimpleTable
        head={["Branch", "Pax", "Kg wings / pax", "Standard", "Weekday", "Fri–Sun", "Wing cost / pax", "Sauce cost / pax", "Food cost / pax", "Net sales / pax"]}
        rows={kpis.map(({ b, k }) => [
          <b key="b">{b.name}</b>,
          k.pax.toLocaleString(),
          <span key="w" className={k.wingsKgPerPax && k.standardKgPerPax && k.wingsKgPerPax > k.standardKgPerPax * 1.05 ? "font-bold text-destructive" : ""}>
            {k.wingsKgPerPax?.toFixed(3) ?? "—"}
          </span>,
          k.standardKgPerPax?.toFixed(3) ?? "not set",
          k.weekdayKgPerPax?.toFixed(3) ?? "—",
          k.weekendKgPerPax?.toFixed(3) ?? "—",
          k.wingsCostPerPaxCents === null ? "—" : formatPeso(k.wingsCostPerPaxCents),
          k.sauceCostPerPaxCents === null ? "—" : formatPeso(k.sauceCostPerPaxCents),
          k.foodCostPerPaxCents === null ? "—" : formatPeso(k.foodCostPerPaxCents),
          k.netSalesPerPaxCents === null ? "—" : formatPeso(k.netSalesPerPaxCents),
        ])}
      />
      <p className="mb-8 mt-3 text-sm">
        {suggestion.suggestion !== null ? (
          <>
            Suggested standard from the last {suggestion.days} days of counts: <b>{suggestion.suggestion} kg per pax</b>.{" "}
            {user.access.canAnywhere("inventory:items:manage") && (
              <Link href={`/inventory/recipes?suggest=${suggestion.suggestion}`} className="underline underline-offset-4">
                Use it
              </Link>
            )}
          </>
        ) : (
          <span className="text-muted-foreground">
            A standard will be suggested after 14+ days of daily wing counts (currently {suggestion.days}).
          </span>
        )}
      </p>
      <ReportView doc={doc} exportBase={`/api/export/report/variance?${new URLSearchParams({ from, to, ...(p.location ? { location: p.location } : {}) }).toString()}`} />
    </>
  );
}
