import { PageHeader } from "@/components/shell/page-header";
import { requirePagePermission } from "@/server/auth/session";
import { db } from "@/server/db";
import { formatDateTime, manilaDateString } from "@/lib/dates";
import { PeriodsList } from "./periods-list";

export const metadata = { title: "Accounting periods" };

export default async function PeriodsPage() {
  const user = await requirePagePermission("ledger:view");
  const periods = await db.accountingPeriod.findMany({ orderBy: [{ year: "desc" }, { month: "desc" }] });
  const closers = await db.user.findMany({ where: { id: { in: periods.flatMap((p) => (p.closedById ? [p.closedById] : [])) } }, select: { id: true, name: true } });
  const today = manilaDateString();
  // Show the last 12 months even if nothing was posted yet.
  const months = new Map(periods.map((p) => [`${p.year}-${p.month}`, p]));
  const rows = [];
  for (let i = 0; i < 12; i++) {
    const d = new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 1 - i, 1));
    const y = d.getUTCFullYear();
    const m = d.getUTCMonth() + 1;
    const p = months.get(`${y}-${m}`);
    months.delete(`${y}-${m}`);
    rows.push({ year: y, month: m, status: p?.status ?? "OPEN", closedBy: p?.closedById ? closers.find((c) => c.id === p.closedById)?.name ?? "" : "", closedAt: p?.closedAt ? formatDateTime(p.closedAt) : "" });
  }
  for (const p of months.values()) rows.push({ year: p.year, month: p.month, status: p.status, closedBy: closers.find((c) => c.id === p.closedById)?.name ?? "", closedAt: p.closedAt ? formatDateTime(p.closedAt) : "" });

  return (
    <>
      <PageHeader title="Accounting periods" description="Closing a month locks every posting in it, so reports for that month can't change. Only the Owner can close or reopen, and every reopen is logged." />
      <PeriodsList rows={rows} canClose={user.access.canAnywhere("ledger:period:close")} />
    </>
  );
}
