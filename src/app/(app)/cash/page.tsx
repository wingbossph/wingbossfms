import { PageHeader } from "@/components/shell/page-header";
import { SimpleTable } from "@/components/data-table/simple-table";
import { ListFilters } from "@/components/data-table/list-filters";
import { Badge } from "@/components/ui/badge";
import { locationsWithAny, requirePagePermission, scopeLocationsAny } from "@/server/auth/session";
import { db } from "@/server/db";
import { moneyAccountBalances } from "@/domains/cash/service";
import { formatBusinessDate, manilaDateString, toDbDate } from "@/lib/dates";
import { formatPeso } from "@/lib/money";
import { TransferForms } from "./transfer-forms";

export const metadata = { title: "Cash & deposits" };

const TYPE_LABEL = { TRANSFER: "Transfer", CASH_DEPOSIT: "Deposit", PETTY_REPLENISH: "Petty cash top-up", WITHDRAWAL: "Withdrawal" } as const;

export default async function CashPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string; location?: string; category?: string }> }) {
  const user = await requirePagePermission("cash:count", "cash:deposit", "money:view", "money:transfer");
  const f = await searchParams;
  const viewIds = locationsWithAny(user, "money:view", "cash:deposit", "money:transfer", "cash:count");
  const scoped = scopeLocationsAny(user, ["money:view", "cash:deposit", "money:transfer", "cash:count"], f.location);
  // Shared accounts (BPI, GCash, Maya, Grab) are visible only with money:view at every location.
  const activeCount = await db.location.count({ where: { isActive: true } });
  const seesShared = user.access.locationsWith("money:view").length === activeCount;
  const today = manilaDateString();
  const from = f.from ?? new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
  const to = f.to ?? today;

  const balances = await moneyAccountBalances(db);
  const visible = balances.filter((b) => (b.locationId ? viewIds.includes(b.locationId) : seesShared));
  const canViewBalances = locationsWithAny(user, "money:view").length > 0;

  const undeposited = balances.filter((b) => b.kind === "UNDEPOSITED_CASH" && b.locationId && viewIds.includes(b.locationId));

  const [settlements, movements] = await Promise.all([
    db.channelSettlement.findMany({
      where: { locationId: { in: scoped }, status: { in: ["EXPECTED", "PARTIAL"] } },
      include: { channel: true, location: true },
      orderBy: { expectedOn: "asc" },
      take: 200,
    }),
    db.moneyTransfer.findMany({
      where: {
        locationId: { in: scoped },
        date: { gte: toDbDate(from), lte: toDbDate(to) },
        ...(f.category && f.category in TYPE_LABEL ? { type: f.category as keyof typeof TYPE_LABEL } : {}),
      },
      include: { fromAccount: true, toAccount: true },
      orderBy: { date: "desc" },
      take: 300,
    }),
  ]);
  const locName = new Map(user.locations.map((l) => [l.id, l.name]));
  const totalCash = visible.filter((b) => !["CARD_CLEARING", "PLATFORM_RECEIVABLE", "OWNER_PERSONAL"].includes(b.kind)).reduce((a, b) => a + b.balanceCents, 0n);
  const personal = visible.filter((b) => b.isPersonal).reduce((a, b) => a + b.balanceCents, 0n);

  const depositLocations = user.locations.filter((l) => user.access.can("cash:deposit", l.id));
  const transferLocations = user.locations.filter((l) => user.access.can("money:transfer", l.id));

  return (
    <>
      <PageHeader title="Cash & deposits" description="Where the money is right now, cash waiting to be deposited, and card/QR/Grab payouts still to arrive." />

      {(depositLocations.length > 0 || transferLocations.length > 0) && (
        <TransferForms
          today={today}
          depositLocations={depositLocations.map((l) => ({ id: l.id, name: l.name }))}
          transferLocations={transferLocations.map((l) => ({ id: l.id, name: l.name }))}
          accounts={balances
            .filter((b) => (b.locationId ? viewIds.includes(b.locationId) : true))
            .map((b) => ({ id: b.id, name: b.name, kind: b.kind, locationId: b.locationId, balance: canViewBalances ? formatPeso(b.balanceCents) : "" }))}
        />
      )}

      <section className="mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {undeposited.map((u) => (
          <div key={u.id} className="rounded-lg border p-4">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Undeposited · {u.location?.name}</p>
            <p className="font-display text-3xl">{formatPeso(u.balanceCents)}</p>
          </div>
        ))}
        {canViewBalances && (
          <div className="rounded-lg border p-4">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Cash on hand + banks + wallets</p>
            <p className="font-display text-3xl">{formatPeso(totalCash)}</p>
            {personal > 0n && <p className="text-xs text-warning">{formatPeso(personal)} in personal wallets</p>}
          </div>
        )}
      </section>

      {canViewBalances && (
        <section className="mb-10">
          <h2 className="mb-2 text-2xl">Money accounts</h2>
          <SimpleTable
            head={["Account", "Location", "Book balance"]}
            rows={visible.map((b) => [
              <span key="n" className="font-semibold">
                {b.name} {b.isPersonal && <Badge variant="outline">Personal</Badge>}
              </span>,
              b.location?.name ?? "Shared",
              <span key="b" className={`tabular-nums ${b.balanceCents < 0n ? "text-destructive" : ""}`}>{formatPeso(b.balanceCents)}</span>,
            ])}
          />
        </section>
      )}

      <section className="mb-10">
        <h2 className="mb-2 text-2xl">Expected card / QR / Grab payouts</h2>
        <SimpleTable
          head={["Sales date", "Location", "Channel", "Gross", "Expected fee", "Expected payout", "Due"]}
          rows={settlements.map((s) => [
            formatBusinessDate(s.businessDate),
            s.location.name,
            s.channel.name,
            formatPeso(s.grossCents),
            formatPeso(s.expectedFeeCents + s.expectedWhtCents),
            <b key="n">{formatPeso(s.expectedNetCents)}</b>,
            <span key="d" className={s.expectedOn.toISOString().slice(0, 10) < today ? "font-semibold text-destructive" : ""}>
              {formatBusinessDate(s.expectedOn)}
            </span>,
          ])}
          empty="Nothing pending. Payouts are matched in Banking."
        />
      </section>

      <section>
        <h2 className="mb-2 text-2xl">Deposits &amp; transfers</h2>
        <ListFilters
          dateRange
          locations={user.locations.filter((l) => viewIds.includes(l.id)).map((l) => ({ value: l.id, label: l.name }))}
          categoryLabel="Type"
          categories={Object.entries(TYPE_LABEL).map(([value, label]) => ({ value, label }))}
        />
        <SimpleTable
          head={["Date", "Location", "Type", "From", "To", "Amount", "Reference"]}
          rows={movements.map((m) => [
            formatBusinessDate(m.date),
            locName.get(m.locationId) ?? "",
            TYPE_LABEL[m.type],
            m.fromAccount.name,
            m.toAccount.name,
            <span key="a" className="tabular-nums">{formatPeso(m.amountCents)}</span>,
            m.reference ?? "",
          ])}
          empty="No deposits or transfers in this range."
        />
      </section>
    </>
  );
}
