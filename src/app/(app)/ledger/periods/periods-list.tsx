"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAction } from "@/components/forms/use-action";
import { periodChecklistAction, setPeriodStatusAction } from "@/domains/ledger/actions";

type Row = { year: number; month: number; status: string; closedBy: string; closedAt: string };
type Check = { label: string; count: number }[];

const monthName = (y: number, m: number) => new Date(Date.UTC(y, m - 1, 1)).toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });

export function PeriodsList({ rows, canClose }: { rows: Row[]; canClose: boolean }) {
  const router = useRouter();
  const [active, setActive] = useState<Row | null>(null);
  const [checks, setChecks] = useState<Check | null>(null);
  const [reason, setReason] = useState("");
  const [pending, start] = useTransition();
  const act = useAction(setPeriodStatusAction, {
    onSuccess: () => {
      setActive(null);
      router.refresh();
    },
  });

  function choose(r: Row) {
    setActive(r);
    setReason("");
    setChecks(null);
    if (r.status === "OPEN") start(async () => setChecks(await periodChecklistAction(r.year, r.month)));
  }

  return (
    <div className="max-w-3xl space-y-4">
      <ul className="divide-y rounded-lg border">
        {rows.map((r) => (
          <li key={`${r.year}-${r.month}`} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
            <span className="w-48 font-semibold">{monthName(r.year, r.month)}</span>
            <Badge variant={r.status === "CLOSED" ? "default" : "outline"}>{r.status === "CLOSED" ? "Closed" : "Open"}</Badge>
            {r.closedBy && (
              <span className="text-xs text-muted-foreground">
                by {r.closedBy} · {r.closedAt}
              </span>
            )}
            {canClose && (
              <Button className="ml-auto" variant="outline" size="sm" onClick={() => choose(r)}>
                {r.status === "CLOSED" ? "Reopen" : "Close"}
              </Button>
            )}
          </li>
        ))}
      </ul>
      {active && (
        <section className="space-y-3 rounded-lg border-2 border-foreground p-4">
          <h2 className="text-xl">
            {active.status === "CLOSED" ? "Reopen" : "Close"} {monthName(active.year, active.month)}
          </h2>
          {active.status === "OPEN" && (
            <>
              {pending && <p className="text-sm text-muted-foreground">Checking…</p>}
              {checks && (
                <ul className="space-y-1 text-sm">
                  {checks.map((c) => (
                    <li key={c.label} className={c.count ? "text-warning" : "text-success"}>
                      {c.count ? `⚠ ${c.count} ${c.label.toLowerCase()}` : `✓ No ${c.label.toLowerCase()}`}
                    </li>
                  ))}
                </ul>
              )}
              <p className="text-xs text-muted-foreground">Anything still open in this month can&apos;t be posted after closing; finish or move it first.</p>
            </>
          )}
          {active.status === "CLOSED" && <Input placeholder="Why reopen? (required)" value={reason} onChange={(e) => setReason(e.target.value)} aria-label="Reason for reopening" />}
          <div className="flex gap-2">
            <Button disabled={act.pending} onClick={() => act.run({ year: active.year, month: active.month, status: active.status === "CLOSED" ? "OPEN" : "CLOSED", reason })}>
              {active.status === "CLOSED" ? "Reopen month" : "Close month"}
            </Button>
            <Button variant="ghost" onClick={() => setActive(null)}>
              Cancel
            </Button>
          </div>
        </section>
      )}
    </div>
  );
}
