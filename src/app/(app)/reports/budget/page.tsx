import Link from "next/link";
import { PageHeader } from "@/components/shell/page-header";
import { requirePagePermission } from "@/server/auth/session";
import { db } from "@/server/db";
import { manilaDateString } from "@/lib/dates";
import { BudgetEditor } from "./budget-editor";

export const metadata = { title: "Budget" };

export default async function BudgetPage({ searchParams }: { searchParams: Promise<{ location?: string; year?: string }> }) {
  const user = await requirePagePermission("reports:pnl:view");
  const sp = await searchParams;
  const locs = user.locations.filter((l) => user.access.can("reports:pnl:view", l.id));
  const location = locs.find((l) => l.id === sp.location) ?? locs[0];
  const year = /^\d{4}$/.test(sp.year ?? "") ? Number(sp.year) : Number(manilaDateString().slice(0, 4));
  const [accounts, lines] = await Promise.all([
    db.account.findMany({ where: { isPostable: true, isActive: true, isIntercompany: false, group: { section: { in: ["REVENUE", "CONTRA_REVENUE", "COGS", "LABOR", "OPERATING_EXPENSE"] } } }, include: { group: true }, orderBy: [{ group: { sortOrder: "asc" } }, { code: "asc" }] }),
    db.budgetLine.findMany({ where: { locationId: location.id, year } }),
  ]);
  return (
    <>
      <PageHeader title="Budget" description="Monthly budget per account for each location. Compare it in the Budget vs actual report." />
      <p className="mb-4 text-sm">
        <Link href={`/reports/budget-vs-actual?location=${location.id}&from=${year}-01-01&to=${year}-12-31`} className="underline underline-offset-4">
          Budget vs actual for {location.name} {year}
        </Link>
      </p>
      <BudgetEditor
        key={`${location.id}-${year}`}
        canEdit={user.isOwner}
        locations={locs.map((l) => ({ id: l.id, name: l.name }))}
        locationId={location.id}
        year={year}
        rows={accounts.map((a) => ({
          accountId: a.id,
          name: `${a.code} ${a.name}`,
          group: a.group.name,
          months: Array.from({ length: 12 }, (_, i) => {
            const c = lines.find((l) => l.accountId === a.id && l.month === i + 1)?.amountCents;
            return c ? (Number(c) / 100).toFixed(2) : "";
          }),
        }))}
      />
    </>
  );
}
