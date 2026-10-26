"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/forms/field";
import { useAction } from "@/components/forms/use-action";
import { completeReconciliationAction } from "@/domains/banking/actions";
import { formatPeso } from "@/lib/money";

export function ReconcileForm(props: { moneyAccountId: string; asOf: string; statementBalance: string; fromFile: boolean; difference: string | null; unresolved: number; lockedThrough: string | null; canReconcile: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const [asOf, setAsOf] = useState(props.asOf);
  const [balance, setBalance] = useState(props.statementBalance);
  const complete = useAction(completeReconciliationAction, { onSuccess: () => router.refresh() });
  const recalc = () => router.replace(`${pathname}?tab=reconcile&asOf=${asOf}${balance ? `&balance=${encodeURIComponent(balance)}` : ""}`);
  const diff = props.difference === null ? null : BigInt(props.difference);
  const ready = diff === 0n && props.unresolved === 0 && (!props.lockedThrough || props.asOf > props.lockedThrough);
  return (
    <div className="no-print space-y-3 rounded-lg border p-4">
      <div className="flex flex-wrap items-end gap-3">
        <Field id="ra" label="Reconcile as of">
          <Input id="ra" type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} />
        </Field>
        <Field id="rb" label="Statement ending balance (₱)" hint={props.fromFile ? "From the imported statement" : "Type it from the statement"}>
          <Input id="rb" inputMode="decimal" value={balance} onChange={(e) => setBalance(e.target.value)} />
        </Field>
        <Button variant="outline" onClick={recalc}>
          Recalculate
        </Button>
      </div>
      <p className="text-lg">
        Difference:{" "}
        <strong className={diff === 0n ? "text-success" : "text-destructive"}>{diff === null ? "enter the statement balance" : diff === 0n ? "₱0.00 ✓" : formatPeso(diff)}</strong>
        {props.unresolved > 0 && <span className="ml-3 text-sm text-destructive">{props.unresolved} statement line(s) still to match or book</span>}
      </p>
      {props.lockedThrough && <p className="text-sm text-muted-foreground">Already reconciled and locked through {props.lockedThrough}.</p>}
      {props.canReconcile && (
        <Button disabled={!ready || complete.pending || asOf !== props.asOf} onClick={() => confirm(`Complete and lock this account through ${props.asOf}? Nothing dated on or before it can be posted to this account afterwards.`) && complete.run({ moneyAccountId: props.moneyAccountId, asOf: props.asOf, statementBalance: balance })}>
          Complete &amp; lock
        </Button>
      )}
    </div>
  );
}
