import { PageHeader } from "@/components/shell/page-header";
import { ReportFilters } from "@/components/reports/report-filters";
import { ReportView } from "@/components/reports/report-view";
import { REPORTS, buildReport } from "@/domains/reports/registry";
import { filterSpecFor } from "@/domains/reports/filter-spec";
import { locationsWithAny, requirePagePermission } from "@/server/auth/session";
import { db } from "@/server/db";
import { manilaDateString } from "@/lib/dates";
import { SettleForm } from "./settle-form";

export const metadata = { title: "Commissary statement" };

export default async function StatementPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const user = await requirePagePermission("reports:inventory:view");
  const p = await searchParams;
  const def = REPORTS["commissary-statement"];
  const [spec, { doc }] = await Promise.all([filterSpecFor(def, user, p), buildReport("commissary-statement", user, p)]);
  const query = new URLSearchParams(Object.entries(p).filter(([k]) => k !== "format")).toString();
  const settleIds = locationsWithAny(user, "payables:manage");
  const [locations, accounts] = settleIds.length
    ? await Promise.all([
        db.location.findMany({ where: { id: { in: settleIds }, isActive: true }, orderBy: { sortOrder: "asc" }, select: { id: true, name: true, type: true } }),
        db.moneyAccount.findMany({ where: { isActive: true, kind: { in: ["BANK", "EWALLET", "PETTY_CASH", "OWNER_PERSONAL"] } }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
      ])
    : [[], []];
  const payees = locations.filter((l) => l.type === "COMMISSARY");
  const payers = locations.filter((l) => l.type !== "COMMISSARY");
  return (
    <>
      <PageHeader title="Commissary statement" description="What each branch received from the commissary at cost, what it has paid, and what it still owes." />
      <ReportFilters spec={spec} />
      <ReportView doc={doc} exportBase={`/api/export/report/commissary-statement${query ? `?${query}` : ""}`} />
      {payees.length > 0 && payers.length > 0 && (
        <section className="no-print mt-10 max-w-2xl">
          <h2 className="mb-1 text-2xl">Record a settlement</h2>
          <p className="mb-3 text-sm text-muted-foreground">When a branch pays the commissary for deliveries. This clears what the branch owes; it does not touch profit.</p>
          <SettleForm today={manilaDateString()} payers={payers} payees={payees} accounts={accounts} />
        </section>
      )}
    </>
  );
}
