import Link from "next/link";
import { PageHeader } from "@/components/shell/page-header";
import { SimpleTable } from "@/components/data-table/simple-table";
import { Badge } from "@/components/ui/badge";
import { requirePagePermission } from "@/server/auth/session";
import { db } from "@/server/db";
import { formatDate, manilaDateString, toDbDate } from "@/lib/dates";
import { formatPeso } from "@/lib/money";

export const metadata = { title: "Card & Grab payouts" };

export default async function PayoutsPage() {
  const user = await requirePagePermission("banking:view");
  const ids = user.access.locationsWith("banking:view");
  const today = toDbDate(manilaDateString());
  const [open, recent] = await Promise.all([
    db.channelSettlement.findMany({ where: { status: "EXPECTED", locationId: { in: ids } }, include: { channel: true, location: true }, orderBy: { expectedOn: "asc" }, take: 300 }),
    db.channelSettlement.findMany({ where: { status: { not: "EXPECTED" }, locationId: { in: ids } }, include: { channel: true, location: true }, orderBy: { businessDate: "desc" }, take: 60 }),
  ]);
  const landing = await db.moneyAccount.findMany({ where: { id: { in: open.flatMap((s) => (s.channel.settlesToMoneyAccountId ? [s.channel.settlesToMoneyAccountId] : [])) } }, select: { id: true, name: true } });
  const landsIn = (id: string | null) => landing.find((m) => m.id === id);
  const totalOpen = open.reduce((a, s) => a + s.expectedNetCents, 0n);
  const rate = (fee: bigint | null, gross: bigint) => (fee === null || gross === 0n ? "—" : `${(Number((fee * 10000n) / gross) / 100).toFixed(2)}%`);
  return (
    <>
      <PageHeader title="Card & Grab payouts" description={`Money from Maya and Grab that hasn't reached the bank yet: ${formatPeso(totalOpen)}. Import the bank statement and auto-match to settle them.`} />
      <h2 className="mb-2 text-2xl">Waiting for payout</h2>
      <SimpleTable
        head={["Channel", "Location", "Sales date", "Due", "Gross", "Expected payout", "Lands in"]}
        rows={open.map((s) => [
          s.channel.name,
          s.location.name,
          formatDate(s.businessDate),
          s.expectedOn < today ? (
            <Badge key="d" variant="destructive">
              {formatDate(s.expectedOn)}
            </Badge>
          ) : (
            formatDate(s.expectedOn)
          ),
          formatPeso(s.grossCents),
          formatPeso(s.expectedNetCents),
          landsIn(s.channel.settlesToMoneyAccountId) ? (
            <Link key="m" href={`/banking/${s.channel.settlesToMoneyAccountId}`} className="underline underline-offset-4">
              {landsIn(s.channel.settlesToMoneyAccountId)!.name}
            </Link>
          ) : (
            "—"
          ),
        ])}
        empty="Nothing waiting: every card, QR and Grab sale has been paid out."
      />
      <h2 className="mt-10 mb-2 text-2xl">Recently settled</h2>
      <SimpleTable
        head={["Channel", "Location", "Sales date", "Gross", "Expected fee", "Actual fee", "Actual rate", "Received"]}
        rows={recent.map((s) => [s.channel.name, s.location.name, formatDate(s.businessDate), formatPeso(s.grossCents), formatPeso(s.expectedFeeCents), s.actualFeeCents === null ? "—" : formatPeso(s.actualFeeCents), rate(s.actualFeeCents, s.grossCents), s.actualNetCents === null ? "—" : formatPeso(s.actualNetCents)])}
        empty="No payouts settled yet."
      />
      <p className="mt-4 text-sm">
        <Link href="/reports/channel-settlements" className="underline underline-offset-4">
          Full payout report with export
        </Link>
      </p>
    </>
  );
}
