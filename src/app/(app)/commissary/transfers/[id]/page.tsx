import { notFound, redirect } from "next/navigation";
import { PageHeader } from "@/components/shell/page-header";
import { SimpleTable } from "@/components/data-table/simple-table";
import { Badge } from "@/components/ui/badge";
import { requireUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { formatDateTime, manilaDateString } from "@/lib/dates";
import { formatPeso } from "@/lib/money";
import { ReceiveForm } from "./receive-form";

export const metadata = { title: "Transfer" };

export default async function TransferPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const t = await db.transfer.findUnique({ where: { id }, include: { fromLocation: true, toLocation: true, lines: { include: { item: true } } } });
  if (!t) notFound();
  const involved = [t.fromLocationId, t.toLocationId].some((l) => user.access.locationIds.includes(l));
  if (!involved) redirect("/forbidden");
  const people = await db.user.findMany({ where: { id: { in: [t.createdById, t.dispatchedById ?? "", t.receivedById ?? ""] } }, select: { id: true, name: true } });
  const who = (uid: string | null) => people.find((p) => p.id === uid)?.name ?? "—";
  const canReceive = t.status === "DISPATCHED" && user.access.can("transfers:receive", t.toLocationId);
  const showValues = user.access.canAnywhere("reports:inventory:view");

  return (
    <>
      <PageHeader title={`Transfer #${t.number}`} description={`${t.fromLocation.name} → ${t.toLocation.name}`} actions={<Badge className="h-8 px-3 text-sm">{t.status.replaceAll("_", " ").toLowerCase()}</Badge>} />
      <div className="max-w-3xl space-y-6">
        <p className="text-sm text-muted-foreground">
          Dispatched by {who(t.dispatchedById)} {t.dispatchedAt ? `· ${formatDateTime(t.dispatchedAt)}` : ""}
          {t.receivedAt ? ` · received by ${who(t.receivedById)} · ${formatDateTime(t.receivedAt)}` : ""}
        </p>
        {canReceive ? (
          <ReceiveForm
            transferId={t.id}
            today={manilaDateString()}
            lines={t.lines.map((l) => ({ id: l.id, name: l.item.name, unit: l.item.baseUnit, sent: Number(l.qtySent).toString() }))}
          />
        ) : (
          <SimpleTable
            head={["Item", "Sent", "Received", "Note", ...(showValues ? ["Cost"] : [])]}
            rows={t.lines.map((l) => [
              l.item.name,
              `${Number(l.qtySent)} ${l.item.baseUnit}`,
              l.qtyReceived === null ? "—" : `${Number(l.qtyReceived)} ${l.item.baseUnit}`,
              l.discrepancyReason ?? "",
              ...(showValues ? [formatPeso(l.costCents)] : []),
            ])}
          />
        )}
      </div>
    </>
  );
}
