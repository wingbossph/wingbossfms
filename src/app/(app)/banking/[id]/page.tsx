import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { PageHeader } from "@/components/shell/page-header";
import { SimpleTable } from "@/components/data-table/simple-table";
import { ReportView } from "@/components/reports/report-view";
import { requireUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { canUseAccount } from "@/domains/banking/queries";
import { expectedSettlementsInto, openBookLines, openStatementLines, reconciliationPreview } from "@/domains/banking/service";
import { bankReconciliationDoc } from "@/domains/reports/banking-reports";
import { sourceHref } from "@/domains/reports/ledger-reports";
import { formatDate, formatDateTime, manilaDateString } from "@/lib/dates";
import { formatPeso, parsePeso } from "@/lib/money";
import { cn } from "cn";
import { AutoMatchButton, DeleteStatementButton, MatchWorkspace, UndoReconciliationButton, UnmatchButton } from "./workspace";
import { ReconcileForm } from "./reconcile-form";

export const metadata = { title: "Bank account" };

const TABS = [
  { key: "match", label: "To match" },
  { key: "matched", label: "Matched" },
  { key: "reconcile", label: "Reconcile" },
  { key: "statements", label: "Statements" },
] as const;

const ymdOf = (d: Date) => d.toISOString().slice(0, 10);

export default async function BankAccountPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string; asOf?: string; balance?: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const sp = await searchParams;
  const ma = await db.moneyAccount.findUnique({ where: { id }, include: { location: true } });
  if (!ma) notFound();
  if (!canUseAccount(user, ma, "banking:view")) redirect("/forbidden");
  const canReconcile = canUseAccount(user, ma, "banking:reconcile");
  const tab = TABS.find((t) => t.key === sp.tab)?.key ?? "match";
  const bal = await db.journalLine.aggregate({ where: { accountId: ma.glAccountId }, _sum: { debitCents: true, creditCents: true } });
  const book = (bal._sum.debitCents ?? 0n) - (bal._sum.creditCents ?? 0n);

  let body: React.ReactNode = null;
  if (tab === "match") {
    const [stmt, bookLines, settlements, ignored, accounts] = await Promise.all([
      openStatementLines(db, ma.id),
      openBookLines(db, ma.glAccountId),
      expectedSettlementsInto(db, ma.id),
      db.bankStatementLine.findMany({ where: { status: "IGNORED", statement: { moneyAccountId: ma.id } }, orderBy: { txnDate: "desc" }, take: 50 }),
      db.account.findMany({ where: { isPostable: true, isActive: true, id: { not: ma.glAccountId } }, orderBy: { code: "asc" }, select: { id: true, code: true, name: true } }),
    ]);
    const locations = user.locations.filter((l) => user.access.can("banking:reconcile", l.id));
    const firstStatement = await db.bankStatement.findFirst({ where: { moneyAccountId: ma.id }, orderBy: { periodStart: "asc" } });
    const sysKey = await db.account.findMany({ where: { systemKey: { in: ["BANK_CHARGES"] } }, select: { id: true, systemKey: true } });
    body = (
      <MatchWorkspace
        moneyAccountId={ma.id}
        canReconcile={canReconcile}
        firstStatementStart={firstStatement ? ymdOf(firstStatement.periodStart) : null}
        statementLines={stmt.map((l) => ({ id: l.id, date: ymdOf(l.txnDate), description: l.description, reference: l.reference, amountCents: l.amountCents.toString(), status: l.status, note: l.note }))}
        bookLines={bookLines.map((l) => ({
          id: l.id,
          date: ymdOf(l.date),
          text: `#${l.entry.number} ${l.entry.memo}`,
          location: l.location.code,
          amountCents: (l.debitCents - l.creditCents).toString(),
          href: sourceHref(l.entry.source, l.entry.sourceId) ?? `/ledger/entries/${l.entryId}`,
        }))}
        settlements={settlements.map((s) => ({ id: s.id, channel: s.channelName, businessDate: s.businessDate, expectedOn: s.expectedOn, grossCents: s.grossCents.toString(), netCents: s.expectedNetCents.toString() }))}
        ignored={ignored.map((l) => ({ id: l.id, date: ymdOf(l.txnDate), description: l.description, amountCents: l.amountCents.toString(), note: l.note }))}
        accounts={accounts.map((a) => ({ id: a.id, name: `${a.code} ${a.name}` }))}
        defaultAccountId={sysKey.find((a) => a.systemKey === "BANK_CHARGES")?.id ?? ""}
        locations={locations.map((l) => ({ id: l.id, name: l.name }))}
        defaultLocationId={ma.locationId ?? locations.find((l) => l.type === "OFFICE")?.id ?? locations[0]?.id ?? ""}
      />
    );
  } else if (tab === "matched") {
    const matches = await db.bankMatch.findMany({
      where: { OR: [{ lines: { some: { statementLine: { statement: { moneyAccountId: ma.id } } } } }, { items: { some: { journalLine: { accountId: ma.glAccountId } } } }] },
      include: { lines: { include: { statementLine: true } }, items: { include: { journalLine: { include: { entry: true } } } }, settlements: { include: { channel: true } } },
      orderBy: { createdAt: "desc" },
      take: 150,
    });
    body = (
      <SimpleTable
        head={["Statement", "Books", "How", ""]}
        rows={matches.map((m) => {
          const reconciled = m.items.some((i) => i.journalLine.reconciliationId);
          return [
            <div key="s" className="space-y-0.5">
              {m.lines.length === 0 && <span className="text-muted-foreground">Cleared before the first statement</span>}
              {m.lines.map((l) => (
                <div key={l.statementLineId}>
                  {formatDate(l.statementLine.txnDate)} · {l.statementLine.description} · <strong>{formatPeso(l.statementLine.amountCents)}</strong>
                </div>
              ))}
            </div>,
            <div key="b" className="space-y-0.5">
              {m.items.map((i) => (
                <div key={i.journalLineId}>
                  <Link href={`/ledger/entries/${i.journalLine.entryId}`} className="underline underline-offset-4">
                    #{i.journalLine.entry.number}
                  </Link>{" "}
                  {formatDate(i.journalLine.date)} · {i.journalLine.entry.memo} · <strong>{formatPeso(i.journalLine.debitCents - i.journalLine.creditCents)}</strong>
                </div>
              ))}
              {m.settlements.length > 0 && <div className="text-xs text-muted-foreground">{m.settlements.length} {m.settlements[0].channel.name} payout(s) settled</div>}
            </div>,
            <span key="h" className="text-xs">
              {m.method === "AUTO" ? `Auto (${m.score ?? "—"})` : m.lines.some((l) => l.statementLine.status === "CREATED") ? "Booked from statement" : "Manual"}
              <br />
              {formatDateTime(m.createdAt)}
            </span>,
            reconciled ? <span key="r" className="text-xs text-muted-foreground">Reconciled</span> : canReconcile ? <UnmatchButton key="u" moneyAccountId={ma.id} matchId={m.id} /> : null,
          ];
        })}
        empty="Nothing matched yet."
      />
    );
  } else if (tab === "reconcile") {
    const latestLine = await db.bankStatementLine.findFirst({ where: { statement: { moneyAccountId: ma.id }, txnDate: { lte: new Date(`${manilaDateString()}T00:00:00Z`) } }, orderBy: [{ txnDate: "desc" }] });
    const asOf = sp.asOf && /^\d{4}-\d{2}-\d{2}$/.test(sp.asOf) ? sp.asOf : latestLine ? ymdOf(latestLine.txnDate) : manilaDateString();
    const override = sp.balance ? parsePeso(sp.balance) : null;
    const [preview, doc, history] = await Promise.all([
      reconciliationPreview(db, ma.id, asOf, override),
      bankReconciliationDoc(ma.id, asOf, override),
      db.reconciliation.findMany({ where: { moneyAccountId: ma.id }, orderBy: { asOfDate: "desc" }, take: 24 }),
    ]);
    const people = await db.user.findMany({ where: { id: { in: history.flatMap((h) => (h.completedById ? [h.completedById] : [])) } }, select: { id: true, name: true } });
    const latestPosted = history.find((h) => h.status === "POSTED");
    body = (
      <div className="space-y-8">
        <ReconcileForm
          moneyAccountId={ma.id}
          asOf={asOf}
          statementBalance={preview.statementBalance === null ? "" : (Number(preview.statementBalance) / 100).toFixed(2)}
          fromFile={preview.statementBalanceFromFile !== null}
          difference={preview.difference?.toString() ?? null}
          unresolved={preview.unresolved.length}
          lockedThrough={ma.lockedThrough ? ymdOf(ma.lockedThrough) : null}
          canReconcile={canReconcile}
        />
        <ReportView doc={doc} exportBase={`/api/export/report/bank-reconciliation?moneyAccount=${ma.id}&asOf=${asOf}`} />
        <section>
          <h2 className="mb-2 text-2xl">History</h2>
          <SimpleTable
            head={["As of", "Statement", "Books", "Status", "By", ""]}
            rows={history.map((h) => [
              formatDate(h.asOfDate),
              formatPeso(h.statementBalanceCents),
              formatPeso(h.bookBalanceCents),
              h.status === "POSTED" ? "Completed & locked" : "Undone",
              `${people.find((p) => p.id === h.completedById)?.name ?? ""}${h.completedAt ? ` · ${formatDateTime(h.completedAt)}` : ""}`,
              h.id === latestPosted?.id && user.access.canAnywhere("ledger:period:close") ? <UndoReconciliationButton key="u" reconciliationId={h.id} /> : null,
            ])}
            empty="No reconciliations yet."
          />
        </section>
      </div>
    );
  } else {
    const statements = await db.bankStatement.findMany({ where: { moneyAccountId: ma.id }, include: { format: true, lines: { select: { status: true } } }, orderBy: { periodStart: "desc" } });
    const people = await db.user.findMany({ where: { id: { in: statements.map((s) => s.importedById) } }, select: { id: true, name: true } });
    body = (
      <SimpleTable
        head={["Period", "Format", "Lines", "Still open", "Closing balance", "Imported", ""]}
        rows={statements.map((s) => {
          const open = s.lines.filter((l) => l.status === "UNMATCHED" || l.status === "INVESTIGATE").length;
          return [
            `${formatDate(s.periodStart)} – ${formatDate(s.periodEnd)}`,
            s.format.name,
            s.lines.length,
            open || "—",
            s.closingBalanceCents === null ? "—" : formatPeso(s.closingBalanceCents),
            `${people.find((p) => p.id === s.importedById)?.name ?? ""} · ${formatDateTime(s.createdAt)}`,
            canReconcile && s.lines.every((l) => l.status === "UNMATCHED") ? <DeleteStatementButton key="d" statementId={s.id} /> : null,
          ];
        })}
        empty="No statements imported yet."
      />
    );
  }

  return (
    <>
      <PageHeader
        title={ma.name}
        description={`Book balance ${formatPeso(book)}${ma.lockedThrough ? ` · reconciled through ${formatDate(ma.lockedThrough)}` : ""}`}
        actions={
          canReconcile ? (
            <div className="flex gap-2">
              <AutoMatchButton moneyAccountId={ma.id} />
              <Link href={`/banking/import?account=${ma.id}`} className="inline-flex h-9 items-center rounded-md border px-3 text-sm font-medium">
                Import statement
              </Link>
            </div>
          ) : undefined
        }
      />
      <nav aria-label="Account" className="mb-6 flex gap-1 overflow-x-auto border-b">
        {TABS.map((t) => (
          <Link key={t.key} href={`/banking/${ma.id}?tab=${t.key}`} aria-current={tab === t.key ? "page" : undefined} className={cn("border-b-2 border-transparent px-3 py-2 text-sm font-medium text-muted-foreground", tab === t.key && "border-foreground text-foreground")}>
            {t.label}
          </Link>
        ))}
      </nav>
      {body}
    </>
  );
}
