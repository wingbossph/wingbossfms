import Link from "next/link";
import { PageHeader } from "@/components/shell/page-header";
import { SimpleTable } from "@/components/data-table/simple-table";
import { Badge } from "@/components/ui/badge";
import { requirePagePermission } from "@/server/auth/session";
import { db } from "@/server/db";
import { formatDateTime } from "@/lib/dates";

export const metadata = { title: "Correction requests" };

const LINK: Record<string, (id: string) => string> = {
  SalesReport: (id) => `/sales/${id}`,
  Expense: (id) => `/expenses/${id}`,
  StockCount: (id) => `/inventory/counts/${id}`,
  Transfer: (id) => `/commissary/transfers/${id}`,
};

export default async function AdjustmentsPage() {
  const user = await requirePagePermission("adjustments:approve");
  const requests = await db.adjustmentRequest.findMany({
    where: { locationId: { in: user.access.locationsWith("adjustments:approve") } },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take: 200,
  });
  const users = await db.user.findMany({ where: { id: { in: requests.flatMap((r) => [r.requestedById, r.reviewedById ?? ""]) } }, select: { id: true, name: true } });
  const name = new Map(users.map((u) => [u.id, u.name]));
  const locs = new Map(user.locations.map((l) => [l.id, l.name]));

  return (
    <>
      <PageHeader title="Correction requests" description="Staff can't edit submitted records. They request a correction here; open the record to reopen or fix it." />
      <SimpleTable
        head={["Requested", "By", "Location", "Record", "Reason", "Status"]}
        rows={requests.map((r) => [
          formatDateTime(r.createdAt),
          name.get(r.requestedById) ?? "",
          locs.get(r.locationId) ?? "",
          LINK[r.entityType] ? (
            <Link key="l" href={LINK[r.entityType](r.entityId)} className="font-semibold underline underline-offset-4">
              {r.entityType}
            </Link>
          ) : (
            r.entityType
          ),
          r.reason,
          <Badge key="s" variant={r.status === "PENDING" ? "destructive" : "outline"}>
            {r.status === "PENDING" ? "Waiting" : `${r.status.toLowerCase()} by ${name.get(r.reviewedById ?? "") ?? "—"}`}
          </Badge>,
        ])}
        empty="No correction requests."
      />
    </>
  );
}
