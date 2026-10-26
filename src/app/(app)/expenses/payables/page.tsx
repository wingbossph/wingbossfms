import Link from "next/link";
import { PageHeader } from "@/components/shell/page-header";
import { SimpleTable } from "@/components/data-table/simple-table";
import { ListFilters } from "@/components/data-table/list-filters";
import { requirePagePermission, scopeLocations } from "@/server/auth/session";
import { db } from "@/server/db";
import { agingBucket, agingSummary } from "@/domains/expenses/rules";
import { formatBusinessDate, manilaDateString } from "@/lib/dates";
import { formatPeso } from "@/lib/money";

export const metadata = { title: "Bills to pay" };

const BUCKET_LABEL = { current: "Current", d1_30: "1–30 days", d31_60: "31–60 days", d60_plus: "Over 60 days" } as const;

export default async function PayablesPage({ searchParams }: { searchParams: Promise<{ location?: string; supplier?: string }> }) {
  const user = await requirePagePermission("payables:manage");
  const f = await searchParams;
  const locationIds = scopeLocations(user, "payables:manage", f.location);
  const today = manilaDateString();

  const [bills, suppliers] = await Promise.all([
    db.expense.findMany({
      where: { terms: "ON_ACCOUNT", status: "POSTED", locationId: { in: locationIds }, ...(f.supplier ? { supplierId: f.supplier } : {}) },
      include: { supplier: true, location: true },
      orderBy: { dueDate: "asc" },
    }),
    db.supplier.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  const open = bills.filter((b) => b.totalCents > b.paidCents);
  const rows = open.map((b) => ({ b, due: (b.dueDate ?? b.date).toISOString().slice(0, 10), balance: b.totalCents - b.paidCents }));
  const summary = agingSummary(rows.map((r) => ({ dueYmd: r.due, balanceCents: r.balance })), today);
  const dueSoon = rows.filter((r) => r.due >= today && Date.parse(r.due) - Date.parse(today) <= 7 * 86_400_000);

  return (
    <>
      <PageHeader title="Bills to pay" description="Supplier bills entered as “pay later”, oldest due first." />
      <ListFilters
        locations={user.locations.filter((l) => user.access.can("payables:manage", l.id)).map((l) => ({ value: l.id, label: l.name }))}
        extra={[{ param: "supplier", label: "Supplier", options: suppliers.map((s) => ({ value: s.id, label: s.name })) }]}
      />
      <section className="mb-6 grid gap-3 sm:grid-cols-4">
        {(Object.keys(BUCKET_LABEL) as (keyof typeof BUCKET_LABEL)[]).map((k) => (
          <div key={k} className={`rounded-lg border p-4 ${k !== "current" && summary[k] > 0n ? "border-destructive" : ""}`}>
            <p className="text-xs uppercase tracking-wider text-muted-foreground">{BUCKET_LABEL[k]}</p>
            <p className="font-display text-3xl">{formatPeso(summary[k])}</p>
          </div>
        ))}
      </section>
      {dueSoon.length > 0 && <p className="mb-3 text-sm text-warning">{dueSoon.length} bill(s) due within 7 days.</p>}
      <SimpleTable
        head={["Bill", "Supplier", "Location", "Bill date", "Due", "Age", "Total", "Paid", "Balance"]}
        rows={rows.map(({ b, due, balance }) => [
          <Link key="l" href={`/expenses/${b.id}`} className="font-semibold underline underline-offset-4">
            #{b.number}
          </Link>,
          b.supplier?.name ?? "—",
          b.location.name,
          formatBusinessDate(b.date),
          formatBusinessDate(new Date(`${due}T00:00:00Z`)),
          BUCKET_LABEL[agingBucket(due, today)],
          formatPeso(b.totalCents),
          formatPeso(b.paidCents),
          <b key="b" className="tabular-nums">{formatPeso(balance)}</b>,
        ])}
        empty="No unpaid bills."
      />
    </>
  );
}
