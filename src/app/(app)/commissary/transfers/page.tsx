import Link from "next/link";
import { PageHeader } from "@/components/shell/page-header";
import { SimpleTable } from "@/components/data-table/simple-table";
import { Badge } from "@/components/ui/badge";
import { locationsWithAny, requirePagePermission } from "@/server/auth/session";
import { db } from "@/server/db";
import { formatDateTime } from "@/lib/dates";
import { formatPeso } from "@/lib/money";

export const metadata = { title: "Transfers" };

const STATUS: Record<string, string> = { DRAFT: "Draft", DISPATCHED: "In transit", RECEIVED: "Received", RECEIVED_WITH_DISCREPANCY: "Received (short)", CANCELLED: "Cancelled" };

export default async function TransfersPage() {
  const user = await requirePagePermission("transfers:create", "transfers:receive", "inventory:view");
  const ids = locationsWithAny(user, "transfers:create", "transfers:receive", "inventory:view");
  const receiveIds = locationsWithAny(user, "transfers:receive");
  const transfers = await db.transfer.findMany({
    where: { OR: [{ fromLocationId: { in: ids } }, { toLocationId: { in: ids } }] },
    include: { fromLocation: true, toLocation: true, lines: { include: { item: true } } },
    orderBy: [{ createdAt: "desc" }],
    take: 200,
  });
  const incoming = transfers.filter((t) => t.status === "DISPATCHED" && receiveIds.includes(t.toLocationId));
  const showValues = user.access.canAnywhere("reports:inventory:view");
  const row = (t: (typeof transfers)[number]) => [
    <Link key="n" href={`/commissary/transfers/${t.id}`} className="font-semibold underline underline-offset-4">
      #{t.number}
    </Link>,
    `${t.fromLocation.name} → ${t.toLocation.name}`,
    t.lines.map((l) => `${l.item.name} ${Number(l.qtySent)} ${l.item.baseUnit}`).join(", "),
    t.dispatchedAt ? formatDateTime(t.dispatchedAt) : "—",
    <Badge key="s" variant={t.status === "DISPATCHED" ? "destructive" : "outline"}>{STATUS[t.status]}</Badge>,
    ...(showValues ? [formatPeso(t.valueCents)] : []),
  ];
  const head = ["#", "Route", "Items", "Dispatched", "Status", ...(showValues ? ["Value"] : [])];
  return (
    <>
      <PageHeader title="Transfers" description="Deliveries between the commissary and branches. The receiving branch confirms what arrived." />
      {incoming.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-2 text-2xl">To receive</h2>
          <SimpleTable head={head} rows={incoming.map(row)} />
        </section>
      )}
      <h2 className="mb-2 text-2xl">All transfers</h2>
      <SimpleTable head={head} rows={transfers.map(row)} empty="No transfers yet." />
    </>
  );
}
