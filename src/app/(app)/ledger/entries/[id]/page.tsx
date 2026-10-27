import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { PageHeader } from "@/components/shell/page-header";
import { SimpleTable } from "@/components/data-table/simple-table";
import { Badge } from "@/components/ui/badge";
import { requireUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { SOURCE_LABEL, sourceHref } from "@/domains/reports/ledger-reports";
import { formatBusinessDate, formatDateTime } from "@/lib/dates";
import { formatPeso } from "@/lib/money";
import { VoidEntryForm } from "./void-entry-form";

export const metadata = { title: "Journal entry" };

export default async function EntryPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const e = await db.journalEntry.findUnique({
    where: { id },
    include: { lines: { include: { account: true, location: true } }, reverses: true, reversedBy: true, period: true },
  });
  if (!e) notFound();
  if (!e.lines.some((l) => user.access.can("ledger:view", l.locationId))) redirect("/forbidden");
  const poster = e.postedById ? await db.user.findUnique({ where: { id: e.postedById }, select: { name: true } }) : null;
  const debit = e.lines.reduce((a, l) => a + l.debitCents, 0n);
  const credit = e.lines.reduce((a, l) => a + l.creditCents, 0n);
  const docHref = sourceHref(e.source, e.sourceId);
  const voidable = ["MANUAL", "OPENING_BALANCE", "OWNER_EQUITY", "DEPRECIATION", "ALLOCATION"].includes(e.source) && e.status === "POSTED" && !e.reversesId;
  const canVoid = voidable && e.lines.every((l) => user.access.can("records:void", l.locationId));

  return (
    <>
      <PageHeader
        title={`Entry #${e.number}`}
        description={`${SOURCE_LABEL[e.source]} · ${formatBusinessDate(e.date)}`}
        actions={<Badge className="h-8 px-3 text-sm" variant={e.status === "VOIDED" ? "destructive" : "outline"}>{e.status === "VOIDED" ? "Voided" : "Posted"}</Badge>}
      />
      <div className="max-w-4xl space-y-6">
        <p>{e.memo}</p>
        <p className="text-sm text-muted-foreground">
          Posted by {poster?.name ?? "the system"} · {formatDateTime(e.createdAt)} · period {e.period.year}-{String(e.period.month).padStart(2, "0")} ({e.period.status.toLowerCase()})
          {docHref && (
            <>
              {" · "}
              <Link href={docHref} className="underline underline-offset-4">
                Open source document
              </Link>
            </>
          )}
        </p>
        {e.reverses && (
          <p className="text-sm">
            Reverses{" "}
            <Link href={`/ledger/entries/${e.reverses.id}`} className="underline underline-offset-4">
              entry #{e.reverses.number}
            </Link>
          </p>
        )}
        {e.reversedBy && (
          <p className="text-sm">
            Voided by{" "}
            <Link href={`/ledger/entries/${e.reversedBy.id}`} className="underline underline-offset-4">
              reversal #{e.reversedBy.number}
            </Link>
          </p>
        )}
        <SimpleTable
          head={["Account", "Location", "Memo", "Debit", "Credit"]}
          rows={[
            ...e.lines.map((l) => [
              <Link key="a" href={`/ledger/accounts/${l.accountId}`} className="underline-offset-4 hover:underline">
                {l.account.code} {l.account.name}
              </Link>,
              l.location.name,
              l.memo ?? "",
              <span key="d" className="tabular-nums">{l.debitCents ? formatPeso(l.debitCents) : ""}</span>,
              <span key="c" className="tabular-nums">{l.creditCents ? formatPeso(l.creditCents) : ""}</span>,
            ]),
            [<b key="t">Totals</b>, "", "", <b key="d">{formatPeso(debit)}</b>, <b key="c">{formatPeso(credit)}</b>],
          ]}
        />
        {canVoid && <VoidEntryForm entryId={e.id} />}
      </div>
    </>
  );
}
