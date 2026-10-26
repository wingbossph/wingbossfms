import { PageHeader } from "@/components/shell/page-header";
import { locationsWithAny, requirePagePermission } from "@/server/auth/session";
import { db } from "@/server/db";
import { moneyAccountBalances } from "@/domains/cash/service";
import { manilaDateString } from "@/lib/dates";
import { formatPeso } from "@/lib/money";
import { PettyCashCards } from "./petty-cash-cards";

export const metadata = { title: "Petty cash" };

export default async function PettyCashPage() {
  const user = await requirePagePermission("payables:manage");
  const ids = locationsWithAny(user, "payables:manage");
  const petty = (await moneyAccountBalances(db)).filter((m) => m.kind === "PETTY_CASH" && m.locationId && ids.includes(m.locationId));
  const [funds, sources, lastTopUps] = await Promise.all([
    db.pettyCashFund.findMany({ where: { moneyAccountId: { in: petty.map((p) => p.id) } } }),
    db.moneyAccount.findMany({ where: { isActive: true, kind: { in: ["BANK", "EWALLET", "UNDEPOSITED_CASH", "CASH_DRAWER", "OWNER_PERSONAL"] } }, select: { id: true, name: true, locationId: true } }),
    db.moneyTransfer.findMany({ where: { type: "PETTY_REPLENISH", toAccountId: { in: petty.map((p) => p.id) } }, orderBy: { date: "desc" }, distinct: ["toAccountId"] }),
  ]);
  const fundBy = new Map(funds.map((f) => [f.moneyAccountId, f]));
  const lastBy = new Map(lastTopUps.map((t) => [t.toAccountId, t.date]));
  const spentSince = await Promise.all(
    petty.map(async (p) => {
      const since = lastBy.get(p.id);
      const agg = await db.expensePayment.aggregate({
        _sum: { amountCents: true },
        where: { moneyAccountId: p.id, expense: { status: "POSTED" }, ...(since ? { date: { gte: since } } : {}) },
      });
      return [p.id, agg._sum.amountCents ?? 0n] as const;
    }),
  );
  const spent = new Map(spentSince);

  return (
    <>
      <PageHeader
        title="Petty cash"
        description="Each fund has a fixed amount. Spending is recorded as expenses paid from petty cash; topping up brings it back to the full amount."
      />
      <PettyCashCards
        today={manilaDateString()}
        funds={petty.map((p) => {
          const fund = fundBy.get(p.id);
          const imprest = fund?.imprestCents ?? 0n;
          const topUp = imprest > p.balanceCents ? imprest - p.balanceCents : 0n;
          return {
            moneyAccountId: p.id,
            locationId: p.locationId!,
            location: p.location?.name ?? "",
            balance: formatPeso(p.balanceCents),
            imprest: formatPeso(imprest, { symbol: false }),
            imprestSet: !!fund,
            spentSinceTopUp: formatPeso(spent.get(p.id) ?? 0n),
            topUp: formatPeso(topUp, { symbol: false }),
            needsTopUp: topUp > 0n,
          };
        })}
        sources={sources}
      />
    </>
  );
}
