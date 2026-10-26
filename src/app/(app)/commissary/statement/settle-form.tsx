"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, selectClass } from "@/components/forms/field";
import { useAction } from "@/components/forms/use-action";
import { settleIntercoAction } from "@/domains/inventory/actions";

type Option = { id: string; name: string };

export function SettleForm(props: { today: string; payers: Option[]; payees: Option[]; accounts: Option[] }) {
  const router = useRouter();
  const [v, setV] = useState({ date: props.today, payerLocationId: props.payers[0].id, payeeLocationId: props.payees[0].id, amount: "", moneyAccountId: props.accounts[0]?.id ?? "", notes: "" });
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setV((s) => ({ ...s, [k]: e.target.value }));
  const settle = useAction(settleIntercoAction, {
    onSuccess: () => {
      setV((s) => ({ ...s, amount: "", notes: "" }));
      router.refresh();
    },
  });
  const select = (id: string, label: string, k: "payerLocationId" | "payeeLocationId" | "moneyAccountId", opts: Option[]) => (
    <Field id={id} label={label}>
      <select id={id} className={selectClass} value={v[k]} onChange={set(k)}>
        {opts.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
    </Field>
  );
  return (
    <form
      className="grid gap-3 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        settle.run(v);
      }}
    >
      {select("sp", "Paid by", "payerLocationId", props.payers)}
      {select("sq", "Paid to", "payeeLocationId", props.payees)}
      <Field id="sa" label="Amount (₱)">
        <Input id="sa" inputMode="decimal" value={v.amount} onChange={set("amount")} />
      </Field>
      {select("sm", "Paid through", "moneyAccountId", props.accounts)}
      <Field id="sd" label="Date">
        <Input id="sd" type="date" max={props.today} value={v.date} onChange={set("date")} />
      </Field>
      <Field id="sn" label="Note (optional)">
        <Input id="sn" value={v.notes} onChange={set("notes")} />
      </Field>
      <div className="sm:col-span-2">
        <Button type="submit" disabled={settle.pending || !v.amount || !v.moneyAccountId}>
          {settle.pending ? "Saving…" : "Record settlement"}
        </Button>
      </div>
    </form>
  );
}
