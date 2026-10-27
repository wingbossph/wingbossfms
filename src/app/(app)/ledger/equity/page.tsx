import { redirect } from "next/navigation";
import { PageHeader } from "@/components/shell/page-header";
import { SimpleTable } from "@/components/data-table/simple-table";
import { requireUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { moneyAccountBalances } from "@/domains/cash/service";
import { formatBusinessDate, manilaDateString } from "@/lib/dates";
import { formatPeso } from "@/lib/money";
import { EquityForm } from "./equity-form";

export const metadata = { title: "Owner's equity" };

export default async function EquityPage() {
  const user = await requireUser();
  if (!user.isOwner) redirect("/forbidden");
  const [txns, accounts] = await Promise.all([
    db.ownerEquityTransaction.findMany({ include: { moneyAccount: true, location: true }, orderBy: { date: "desc" }, take: 200 }),
    moneyAccountBalances(db),
  ]);
  const ownerFunds = accounts.filter((a) => a.kind === "OWNER_PERSONAL");
  return (
    <>
      <PageHeader title="Owner's equity" description="Money you put into the business (capital) or take out for yourself (drawings)." />
      {ownerFunds.some((a) => a.balanceCents > 0n) && (
        <p className="mb-4 max-w-3xl rounded-md border p-3 text-sm">
          The business owes you {formatPeso(ownerFunds.reduce((s, a) => s + a.balanceCents, 0n))} for expenses you paid from your own money. Record a capital contribution from
          &quot;Owner&apos;s personal funds&quot; to turn it into capital instead of a debt.
        </p>
      )}
      <EquityForm
        today={manilaDateString()}
        locations={user.locations.map((l) => ({ id: l.id, name: l.name }))}
        accounts={accounts.filter((a) => ["BANK", "EWALLET", "CASH_DRAWER", "PETTY_CASH", "UNDEPOSITED_CASH", "OWNER_PERSONAL"].includes(a.kind)).map((a) => ({ id: a.id, name: a.name, locationId: a.locationId }))}
      />
      <h2 className="mb-2 mt-10 text-2xl">History</h2>
      <SimpleTable
        head={["Date", "Type", "Location", "Account", "Amount", "Note"]}
        rows={txns.map((t) => [
          formatBusinessDate(t.date),
          t.type === "DRAWING" ? "Drawing" : "Capital",
          t.location.name,
          t.moneyAccount.name,
          <span key="a" className="tabular-nums">{formatPeso(t.amountCents)}</span>,
          `${t.memo ?? ""}${t.journalEntryId ? "" : " (voided)"}`,
        ])}
        empty="No capital or drawings recorded."
      />
    </>
  );
}
