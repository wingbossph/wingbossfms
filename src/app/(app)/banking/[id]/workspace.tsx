"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { selectClass } from "@/components/forms/field";
import { useAction } from "@/components/forms/use-action";
import {
  autoMatchAction,
  createFromLineAction,
  deleteStatementAction,
  manualMatchAction,
  setLineStatusAction,
  settlePayoutAction,
  undoReconciliationAction,
  unmatchAction,
} from "@/domains/banking/actions";
import { formatPeso } from "@/lib/money";
import { cn } from "cn";

type Option = { id: string; name: string };
type Stmt = { id: string; date: string; description: string; reference: string | null; amountCents: string; status: string; note: string | null };
type Book = { id: string; date: string; text: string; location: string; amountCents: string; href: string };
type Settlement = { id: string; channel: string; businessDate: string; expectedOn: string; grossCents: string; netCents: string };
type Ignored = { id: string; date: string; description: string; amountCents: string; note: string | null };

const money = (c: bigint) => <span className={cn("tabular-nums", c < 0n && "text-destructive")}>{formatPeso(c)}</span>;
const sum = (xs: bigint[]) => xs.reduce((a, b) => a + b, 0n);

export function AutoMatchButton({ moneyAccountId }: { moneyAccountId: string }) {
  const router = useRouter();
  const a = useAction(autoMatchAction, { onSuccess: () => router.refresh() });
  return (
    <Button size="sm" onClick={() => a.run(moneyAccountId)} disabled={a.pending}>
      {a.pending ? "Matching…" : "Auto-match"}
    </Button>
  );
}

export function UnmatchButton({ moneyAccountId, matchId }: { moneyAccountId: string; matchId: string }) {
  const router = useRouter();
  const a = useAction(unmatchAction, { onSuccess: () => router.refresh() });
  return (
    <Button size="sm" variant="outline" disabled={a.pending} onClick={() => confirm("Unmatch? Payouts and transactions booked from the statement will be voided.") && a.run({ moneyAccountId, matchId })}>
      Unmatch
    </Button>
  );
}

export function DeleteStatementButton({ statementId }: { statementId: string }) {
  const router = useRouter();
  const a = useAction(deleteStatementAction, { onSuccess: () => router.refresh() });
  return (
    <Button size="sm" variant="outline" disabled={a.pending} onClick={() => confirm("Remove this imported statement?") && a.run(statementId)}>
      Remove
    </Button>
  );
}

export function UndoReconciliationButton({ reconciliationId }: { reconciliationId: string }) {
  const router = useRouter();
  const a = useAction(undoReconciliationAction, { onSuccess: () => router.refresh() });
  return (
    <Button size="sm" variant="outline" disabled={a.pending} onClick={() => confirm("Undo this reconciliation and unlock the period?") && a.run({ reconciliationId })}>
      Undo
    </Button>
  );
}

function BookItForm(props: { moneyAccountId: string; line: Stmt; accounts: Option[]; defaultAccountId: string; locations: Option[]; defaultLocationId: string; onDone: () => void }) {
  const router = useRouter();
  const [accountId, setAccountId] = useState(props.defaultAccountId);
  const [locationId, setLocationId] = useState(props.defaultLocationId);
  const [memo, setMemo] = useState(props.line.description);
  const a = useAction(createFromLineAction, {
    onSuccess: () => {
      props.onDone();
      router.refresh();
    },
  });
  return (
    <div className="mt-2 grid gap-2 rounded-md bg-muted/50 p-2 sm:grid-cols-[1fr_10rem]">
      <select className={selectClass} value={accountId} onChange={(e) => setAccountId(e.target.value)} aria-label="Account to book against">
        <option value="">Choose the account…</option>
        {props.accounts.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
      <select className={selectClass} value={locationId} onChange={(e) => setLocationId(e.target.value)} aria-label="Location">
        {props.locations.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
      <Input value={memo} onChange={(e) => setMemo(e.target.value)} aria-label="Memo" />
      <Button disabled={!accountId || a.pending} onClick={() => a.run({ moneyAccountId: props.moneyAccountId, statementLineId: props.line.id, accountId, locationId, memo })}>
        Book &amp; match
      </Button>
    </div>
  );
}

export function MatchWorkspace(props: {
  moneyAccountId: string;
  canReconcile: boolean;
  firstStatementStart: string | null;
  statementLines: Stmt[];
  bookLines: Book[];
  settlements: Settlement[];
  ignored: Ignored[];
  accounts: Option[];
  defaultAccountId: string;
  locations: Option[];
  defaultLocationId: string;
}) {
  const router = useRouter();
  const [selS, setSelS] = useState<Set<string>>(new Set());
  const [selB, setSelB] = useState<Set<string>>(new Set());
  const [selP, setSelP] = useState<Set<string>>(new Set());
  const [q, setQ] = useState("");
  const [booking, setBooking] = useState<string | null>(null);
  const reset = () => {
    setSelS(new Set());
    setSelB(new Set());
    setSelP(new Set());
    router.refresh();
  };
  const match = useAction(manualMatchAction, { onSuccess: reset });
  const payout = useAction(settlePayoutAction, { onSuccess: reset });
  const status = useAction(setLineStatusAction, { onSuccess: () => router.refresh() });

  const filter = <T extends { amountCents: string }>(rows: T[], text: (r: T) => string) => {
    const needle = q.trim().toLowerCase().replace(/[₱,]/g, "");
    if (!needle) return rows;
    return rows.filter((r) => text(r).toLowerCase().includes(needle) || formatPeso(BigInt(r.amountCents), { symbol: false }).replace(/,/g, "").includes(needle));
  };
  const stmt = filter(props.statementLines, (r) => `${r.date} ${r.description} ${r.reference ?? ""}`);
  const book = filter(props.bookLines, (r) => `${r.date} ${r.text} ${r.location}`);
  const sTotal = sum(props.statementLines.filter((l) => selS.has(l.id)).map((l) => BigInt(l.amountCents)));
  const bTotal = sum(props.bookLines.filter((l) => selB.has(l.id)).map((l) => BigInt(l.amountCents)));
  const pNet = sum(props.settlements.filter((s) => selP.has(s.id)).map((s) => BigInt(s.netCents)));
  const pGross = sum(props.settlements.filter((s) => selP.has(s.id)).map((s) => BigInt(s.grossCents)));
  const preStatement = useMemo(() => selS.size === 0 && selB.size > 0 && !!props.firstStatementStart && props.bookLines.filter((l) => selB.has(l.id)).every((l) => l.date < props.firstStatementStart!), [selS, selB, props.bookLines, props.firstStatementStart]);
  const toggle = (set: Set<string>, setter: (s: Set<string>) => void, id: string) => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setter(next);
  };
  const oneInflow = selS.size === 1 && sTotal > 0n && selB.size === 0;

  return (
    <div className="space-y-6 pb-28">
      <Input placeholder="Search description, reference or amount" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-md" aria-label="Search lines" />
      <div className="grid gap-6 lg:grid-cols-2">
        <section>
          <h2 className="mb-2 text-xl">
            Statement <span className="text-sm text-muted-foreground">({props.statementLines.length} to match)</span>
          </h2>
          <ul className="divide-y rounded-lg border">
            {stmt.length === 0 && <li className="p-4 text-sm text-muted-foreground">All statement lines are matched.</li>}
            {stmt.map((l) => (
              <li key={l.id} className={cn("p-2", selS.has(l.id) && "bg-muted/60")}>
                <label className="flex cursor-pointer items-start gap-2">
                  <input type="checkbox" className="mt-1 size-4" checked={selS.has(l.id)} onChange={() => toggle(selS, setSelS, l.id)} aria-label={`Select statement ${l.description} ${l.amountCents}`} disabled={!props.canReconcile} />
                  <span className="min-w-0 flex-1 text-sm">
                    <span className="block truncate">
                      {l.description}
                      {l.status === "INVESTIGATE" && <span className="ml-2 rounded bg-warning/30 px-1 text-xs">investigate</span>}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {l.date}
                      {l.reference ? ` · ${l.reference}` : ""}
                      {l.note ? ` · ${l.note}` : ""}
                    </span>
                  </span>
                  <span className="font-semibold">{money(BigInt(l.amountCents))}</span>
                </label>
                {props.canReconcile && (
                  <div className="mt-1 flex gap-3 pl-6 text-xs">
                    <button type="button" className="underline underline-offset-2" onClick={() => setBooking(booking === l.id ? null : l.id)}>
                      Book it
                    </button>
                    <button type="button" className="underline underline-offset-2" onClick={() => status.run({ moneyAccountId: props.moneyAccountId, statementLineId: l.id, status: l.status === "INVESTIGATE" ? "UNMATCHED" : "INVESTIGATE" })}>
                      {l.status === "INVESTIGATE" ? "Clear flag" : "Investigate"}
                    </button>
                    <button type="button" className="underline underline-offset-2" onClick={() => confirm("Ignore this line? Use this only for bank errors that reverse themselves.") && status.run({ moneyAccountId: props.moneyAccountId, statementLineId: l.id, status: "IGNORED" })}>
                      Ignore
                    </button>
                  </div>
                )}
                {booking === l.id && <BookItForm moneyAccountId={props.moneyAccountId} line={l} accounts={props.accounts} defaultAccountId={props.defaultAccountId} locations={props.locations} defaultLocationId={props.defaultLocationId} onDone={() => setBooking(null)} />}
              </li>
            ))}
          </ul>
        </section>
        <section>
          <h2 className="mb-2 text-xl">
            Books <span className="text-sm text-muted-foreground">({props.bookLines.length} not on a statement yet)</span>
          </h2>
          <ul className="divide-y rounded-lg border">
            {book.length === 0 && <li className="p-4 text-sm text-muted-foreground">Every book entry is matched.</li>}
            {book.map((l) => (
              <li key={l.id} className={cn("p-2", selB.has(l.id) && "bg-muted/60")}>
                <label className="flex cursor-pointer items-start gap-2">
                  <input type="checkbox" className="mt-1 size-4" checked={selB.has(l.id)} onChange={() => toggle(selB, setSelB, l.id)} aria-label={`Select book ${l.text} ${l.amountCents}`} disabled={!props.canReconcile} />
                  <span className="min-w-0 flex-1 text-sm">
                    <span className="block truncate">{l.text}</span>
                    <span className="text-xs text-muted-foreground">
                      {l.date} · {l.location} ·{" "}
                      <Link href={l.href} className="underline underline-offset-2">
                        open
                      </Link>
                    </span>
                  </span>
                  <span className="font-semibold">{money(BigInt(l.amountCents))}</span>
                </label>
              </li>
            ))}
          </ul>
        </section>
      </div>

      {props.settlements.length > 0 && (
        <section>
          <h2 className="mb-1 text-xl">Expected card / QR / Grab payouts into this account</h2>
          <p className="mb-2 text-sm text-muted-foreground">Select one money-in statement line above, tick the payouts it covers, and match. The difference from the expected amount is posted as the actual fee.</p>
          <ul className="divide-y rounded-lg border">
            {props.settlements.map((s) => (
              <li key={s.id} className={cn("p-2", selP.has(s.id) && "bg-muted/60")}>
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <input type="checkbox" className="size-4" checked={selP.has(s.id)} onChange={() => toggle(selP, setSelP, s.id)} disabled={!props.canReconcile} aria-label={`Select payout ${s.channel} ${s.businessDate}`} />
                  <span className="flex-1">
                    {s.channel} · sales {s.businessDate} · due {s.expectedOn}
                  </span>
                  <span className="text-xs text-muted-foreground">gross {formatPeso(BigInt(s.grossCents))}</span>
                  <span className="font-semibold">{money(BigInt(s.netCents))}</span>
                </label>
              </li>
            ))}
          </ul>
        </section>
      )}

      {props.ignored.length > 0 && (
        <details className="rounded-lg border p-3 text-sm">
          <summary className="cursor-pointer font-semibold">Ignored lines ({props.ignored.length})</summary>
          <ul className="mt-2 divide-y">
            {props.ignored.map((l) => (
              <li key={l.id} className="flex items-center gap-2 py-1.5">
                <span className="flex-1">
                  {l.date} · {l.description}
                </span>
                {money(BigInt(l.amountCents))}
                {props.canReconcile && (
                  <Button size="sm" variant="outline" onClick={() => status.run({ moneyAccountId: props.moneyAccountId, statementLineId: l.id, status: "UNMATCHED" })}>
                    Restore
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}

      {props.canReconcile && (selS.size > 0 || selB.size > 0 || selP.size > 0) && (
        <div className="fixed inset-x-0 bottom-0 z-20 flex flex-wrap items-center gap-x-6 gap-y-2 border-t bg-background/95 px-4 py-3 text-sm backdrop-blur md:left-64 md:px-8">
          <span>Statement {money(sTotal)}</span>
          {selP.size > 0 ? (
            <>
              <span>
                Payouts {money(pNet)} <span className="text-xs text-muted-foreground">(gross {formatPeso(pGross)})</span>
              </span>
              <span>Fee difference {money(pNet - sTotal)}</span>
              <Button disabled={!oneInflow || payout.pending} onClick={() => payout.run({ moneyAccountId: props.moneyAccountId, statementLineId: [...selS][0], settlementIds: [...selP] })}>
                Match payout
              </Button>
            </>
          ) : (
            <>
              <span>Books {money(bTotal)}</span>
              <span className={cn("font-semibold", sTotal !== bTotal && "text-destructive")}>Difference {formatPeso(sTotal - bTotal)}</span>
              {preStatement ? (
                <Button disabled={match.pending} onClick={() => match.run({ moneyAccountId: props.moneyAccountId, statementLineIds: [], journalLineIds: [...selB] })}>
                  Mark cleared (before first statement)
                </Button>
              ) : (
                <Button disabled={selS.size === 0 || selB.size === 0 || sTotal !== bTotal || match.pending} onClick={() => match.run({ moneyAccountId: props.moneyAccountId, statementLineIds: [...selS], journalLineIds: [...selB] })}>
                  Match {selS.size}:{selB.size}
                </Button>
              )}
            </>
          )}
          <Button variant="ghost" onClick={() => (setSelS(new Set()), setSelB(new Set()), setSelP(new Set()))}>
            Clear
          </Button>
        </div>
      )}
    </div>
  );
}
