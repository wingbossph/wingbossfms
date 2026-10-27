import Link from "next/link";
import { PageHeader } from "@/components/shell/page-header";
import { SimpleTable } from "@/components/data-table/simple-table";
import { Badge } from "@/components/ui/badge";
import { requirePagePermission } from "@/server/auth/session";
import { db } from "@/server/db";
import { statementAccountsFor } from "@/domains/banking/queries";
import { formatDate } from "@/lib/dates";
import { formatPeso } from "@/lib/money";

export const metadata = { title: "Banking" };

const KIND: Record<string, string> = { BANK: "Bank", EWALLET: "E-wallet", CARD_CLEARING: "Card / QR clearing", PLATFORM_RECEIVABLE: "Delivery platform" };

export default async function BankingPage() {
  const user = await requirePagePermission("banking:view");
  const accounts = await statementAccountsFor(user);
  const ids = accounts.map((a) => a.id);
  const [balances, lastLines, open, recs] = await Promise.all([
    db.journalLine.groupBy({ by: ["accountId"], where: { accountId: { in: accounts.map((a) => a.glAccountId) } }, _sum: { debitCents: true, creditCents: true } }),
    db.bankStatement.groupBy({ by: ["moneyAccountId"], where: { moneyAccountId: { in: ids } }, _max: { periodEnd: true } }),
    db.bankStatementLine.groupBy({ by: ["statementId"], where: { status: { in: ["UNMATCHED", "INVESTIGATE"] }, statement: { moneyAccountId: { in: ids } } }, _count: true }),
    db.bankStatement.findMany({ where: { moneyAccountId: { in: ids } }, select: { id: true, moneyAccountId: true } }),
  ]);
  const stmtAccount = new Map(recs.map((r) => [r.id, r.moneyAccountId]));
  const openBy = new Map<string, number>();
  for (const o of open) {
    const a = stmtAccount.get(o.statementId)!;
    openBy.set(a, (openBy.get(a) ?? 0) + o._count);
  }
  return (
    <>
      <PageHeader title="Banking" description="Import statements, match them to the books, and reconcile each account to ₱0." />
      <SimpleTable
        head={["Account", "Type", "Book balance", "Statement through", "To match", "Reconciled through"]}
        rows={accounts.map((a) => {
          const b = balances.find((x) => x.accountId === a.glAccountId);
          const last = lastLines.find((x) => x.moneyAccountId === a.id)?._max.periodEnd;
          const n = openBy.get(a.id) ?? 0;
          return [
            <Link key="a" href={`/banking/${a.id}`} className="font-semibold underline underline-offset-4">
              {a.name}
            </Link>,
            <span key="k">
              {KIND[a.kind]}
              {a.isPersonal ? " · personal" : ""}
              {a.location ? ` · ${a.location.name}` : ""}
            </span>,
            formatPeso((b?._sum.debitCents ?? 0n) - (b?._sum.creditCents ?? 0n)),
            last ? formatDate(last) : <span key="n" className="text-muted-foreground">No statement yet</span>,
            n ? <Badge key="o" variant="destructive">{n}</Badge> : "—",
            a.lockedThrough ? formatDate(a.lockedThrough) : "—",
          ];
        })}
        empty="No bank or e-wallet accounts yet. Add them in Admin → Payments."
      />
      <p className="mt-4 text-sm text-muted-foreground">
        Reports:{" "}
        <Link href="/reports/bank-reconciliation" className="underline underline-offset-4">
          Bank reconciliation
        </Link>{" "}
        ·{" "}
        <Link href="/reports/channel-settlements" className="underline underline-offset-4">
          Card, QR and Grab payouts
        </Link>
      </p>
    </>
  );
}
