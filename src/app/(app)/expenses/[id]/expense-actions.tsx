"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, selectClass } from "@/components/forms/field";
import { useAction } from "@/components/forms/use-action";
import { approveExpenseAction, payBillAction, rejectExpenseAction, submitExpenseAction, voidExpenseAction } from "@/domains/expenses/actions";

export function ExpenseActions(props: {
  expenseId: string;
  status: string;
  today: string;
  canSubmit: boolean;
  canApprove: boolean;
  needsOwner: boolean;
  canPay: boolean;
  balance: string;
  canVoid: boolean;
  moneyAccounts: { id: string; name: string }[];
}) {
  const router = useRouter();
  const refresh = () => router.refresh();
  const submit = useAction(submitExpenseAction, { onSuccess: refresh });
  const approve = useAction(approveExpenseAction, { onSuccess: refresh });
  const reject = useAction(rejectExpenseAction, { onSuccess: refresh });
  const pay = useAction(payBillAction, { onSuccess: refresh });
  const voidIt = useAction(voidExpenseAction, { onSuccess: refresh });
  const [note, setNote] = useState("");
  const [payment, setPayment] = useState({ date: props.today, moneyAccountId: props.moneyAccounts[0]?.id ?? "", amount: props.balance, reference: "" });
  const [voidReason, setVoidReason] = useState("");

  return (
    <aside className="no-print space-y-6">
      {props.canSubmit && (
        <Button className="h-12 w-full" disabled={submit.pending} onClick={() => submit.run(props.expenseId)}>
          Submit for approval
        </Button>
      )}

      {props.canApprove && (
        <section className="space-y-2 rounded-lg border-2 border-foreground p-4">
          <h2 className="text-xl">Approval</h2>
          {props.needsOwner && <p className="text-xs text-muted-foreground">Above the threshold: Owner approval.</p>}
          <Button className="h-12 w-full" disabled={approve.pending} onClick={() => approve.run(props.expenseId)}>
            Approve &amp; post
          </Button>
          <Button variant="outline" className="w-full" asChild>
            <Link href={`/expenses/${props.expenseId}?edit=1`}>Correct before approving</Link>
          </Button>
          <Textarea placeholder="Reason for rejecting" value={note} onChange={(e) => setNote(e.target.value)} aria-label="Reason for rejecting" />
          <Button variant="outline" className="w-full" disabled={reject.pending} onClick={() => reject.run({ expenseId: props.expenseId, note })}>
            Reject
          </Button>
        </section>
      )}

      {props.canPay && (
        <form
          className="space-y-3 rounded-lg border p-4"
          onSubmit={(e) => {
            e.preventDefault();
            pay.run({ expenseId: props.expenseId, ...payment });
          }}
        >
          <h2 className="text-xl">Pay this bill</h2>
          <Field id="pdate" label="Date">
            <Input id="pdate" type="date" max={props.today} value={payment.date} onChange={(e) => setPayment({ ...payment, date: e.target.value })} />
          </Field>
          <Field id="pfrom" label="Paid from">
            <select id="pfrom" className={selectClass} value={payment.moneyAccountId} onChange={(e) => setPayment({ ...payment, moneyAccountId: e.target.value })}>
              {props.moneyAccounts.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </Field>
          <Field id="pamt" label="Amount (₱)" error={pay.fieldError("amount")}>
            <Input id="pamt" inputMode="decimal" value={payment.amount} onChange={(e) => setPayment({ ...payment, amount: e.target.value })} />
          </Field>
          <Field id="pref" label="Reference / check no.">
            <Input id="pref" value={payment.reference} onChange={(e) => setPayment({ ...payment, reference: e.target.value })} />
          </Field>
          <Button type="submit" className="w-full" disabled={pay.pending}>
            Record payment
          </Button>
        </form>
      )}

      {props.canVoid && (
        <details className="rounded-lg border p-4">
          <summary className="cursor-pointer text-sm font-semibold text-destructive">Void this expense (Owner)</summary>
          <p className="my-2 text-xs text-muted-foreground">Reverses its postings, payments and any stock it added. It stays in the records as voided.</p>
          <Textarea placeholder="Reason" value={voidReason} onChange={(e) => setVoidReason(e.target.value)} aria-label="Reason for voiding" />
          <Button
            variant="destructive"
            className="mt-2 w-full"
            disabled={voidIt.pending}
            onClick={() => {
              if (confirm("Void this expense?")) voidIt.run({ expenseId: props.expenseId, note: voidReason });
            }}
          >
            Void
          </Button>
        </details>
      )}
    </aside>
  );
}
