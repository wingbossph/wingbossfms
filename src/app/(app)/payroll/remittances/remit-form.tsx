"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, selectClass } from "@/components/forms/field";
import { useAction } from "@/components/forms/use-action";
import { remitAction } from "@/domains/payroll/actions";

export function RemitForm({ accounts, today, month, owed }: { accounts: { id: string; name: string }[]; today: string; month: string; owed: Record<string, string> }) {
  const router = useRouter();
  const [v, setV] = useState({ kind: "SSS", month, amount: owed.SSS ?? "", moneyAccountId: accounts[0]?.id ?? "", date: today, reference: "" });
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setV((x) => ({ ...x, [k]: e.target.value, ...(k === "kind" ? { amount: owed[e.target.value] ?? "" } : {}) }));
  const a = useAction(remitAction, { onSuccess: () => router.refresh() });
  return (
    <form
      className="grid gap-3 sm:grid-cols-3"
      onSubmit={(e) => {
        e.preventDefault();
        a.run(v);
      }}
    >
      <Field id="rm-k" label="Agency">
        <select id="rm-k" className={selectClass} value={v.kind} onChange={set("kind")}>
          <option value="SSS">SSS</option>
          <option value="PHILHEALTH">PhilHealth</option>
          <option value="PAGIBIG">Pag-IBIG</option>
          <option value="WITHHOLDING_TAX">BIR withholding tax</option>
        </select>
      </Field>
      <Field id="rm-m" label="For month">
        <Input id="rm-m" type="month" value={v.month} onChange={set("month")} />
      </Field>
      <Field id="rm-a" label="Amount (₱)">
        <Input id="rm-a" inputMode="decimal" value={v.amount} onChange={set("amount")} />
      </Field>
      <Field id="rm-ma" label="Paid from">
        <select id="rm-ma" className={selectClass} value={v.moneyAccountId} onChange={set("moneyAccountId")}>
          {accounts.map((x) => (
            <option key={x.id} value={x.id}>
              {x.name}
            </option>
          ))}
        </select>
      </Field>
      <Field id="rm-d" label="Date paid">
        <Input id="rm-d" type="date" max={today} value={v.date} onChange={set("date")} />
      </Field>
      <Field id="rm-r" label="Reference no.">
        <Input id="rm-r" value={v.reference} onChange={set("reference")} />
      </Field>
      <div className="sm:col-span-3">
        <Button type="submit" disabled={a.pending}>
          Record payment
        </Button>
      </div>
    </form>
  );
}
