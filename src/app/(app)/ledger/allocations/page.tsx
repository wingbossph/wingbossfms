import { PageHeader } from "@/components/shell/page-header";
import { requirePagePermission } from "@/server/auth/session";
import { db } from "@/server/db";
import { getSetting } from "@/domains/admin/settings";
import { manilaDateString } from "@/lib/dates";
import { AllocationsEditor } from "./allocations-editor";

export const metadata = { title: "Cost allocations" };

export default async function AllocationsPage() {
  await requirePagePermission("settings:manage");
  const [enabled, rules, locations, accounts, runs] = await Promise.all([
    getSetting(db, "allocation.enabled"),
    db.allocationRule.findMany({ include: { shares: true, sourceLocation: true, account: true }, orderBy: { name: "asc" } }),
    db.location.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" }, select: { id: true, name: true, type: true } }),
    db.account.findMany({ where: { isPostable: true, group: { section: { in: ["COGS", "LABOR", "OPERATING_EXPENSE"] } } }, orderBy: { code: "asc" }, select: { id: true, code: true, name: true } }),
    db.journalEntry.findMany({ where: { source: "ALLOCATION", status: "POSTED" }, orderBy: { date: "desc" }, take: 24, select: { sourceId: true, memo: true, date: true } }),
  ]);
  const thisMonth = manilaDateString().slice(0, 7);
  return (
    <>
      <PageHeader
        title="Cost allocations"
        description="Off by default: each location's costs stay where they were recorded. Turn this on to share a location's costs (for example, the commissary's staff and utilities) with the branches it serves. The P&L can show costs before or after allocation."
      />
      <AllocationsEditor
        enabled={enabled}
        lastMonth={new Date(Date.UTC(Number(thisMonth.slice(0, 4)), Number(thisMonth.slice(5, 7)) - 2, 1)).toISOString().slice(0, 7)}
        locations={locations}
        accounts={accounts.map((a) => ({ id: a.id, name: `${a.code} ${a.name}` }))}
        runs={runs.map((r) => ({ key: r.sourceId ?? "", memo: r.memo }))}
        rules={rules.map((r) => ({
          id: r.id,
          name: r.name,
          method: r.method,
          sourceLocationId: r.sourceLocationId,
          sourceName: r.sourceLocation.name,
          accountId: r.accountId ?? "",
          accountName: r.account?.name ?? "All costs and income",
          isActive: r.isActive,
          shares: r.shares.map((s) => ({ locationId: s.locationId, percent: s.shareBp / 100 })),
        }))}
      />
    </>
  );
}
