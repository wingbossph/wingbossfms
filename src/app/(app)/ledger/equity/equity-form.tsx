"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, selectClass } from "@/components/forms/field";
import { useAction } from "@/components/forms/use-action";
import { ownerEquityAction } from "@/domains/ledger/actions";

type Option = { id: string; name: string };

export function EquityForm({ today, locations, accounts }: { today: string; locations: Option[]; accounts: (Option & { locationId: string | null })[] }) {
  const router = useRouter();
  const [v, setV] = useState({ type: "DRAWING", date: today, locationId: locations[0]?.id ?? "", moneyAccountId: "", amount: "", memo: "" });
  const save = useAction(ownerEquityAction, {
    onSuccess: () => {
      setV((s) => ({ ...s, amount: "", memo: "" }));
      router.refresh();
    },
  });
  const options = accounts.filter((a) => !a.locationId || a.locationId === v.locationId);
  return (
    <form
      className="grid max-w-3xl gap-3 rounded-lg border p-4 sm:grid-cols-3"
      onSubmit={(e) => {
        e.preventDefault();
        save.run(v);
      }}
    >
      <Field id="qtype" label="Type">
        <select id="qtype" className={selectClass} value={v.type} onChange={(e) => setV({ ...v, type: e.target.value })}>
          <option value="DRAWING">Drawing (owner takes money out)</option>
          <option value="CAPITAL_CONTRIBUTION">Capital (owner puts money in)</option>
        </select>
      </Field>
      <Field id="qdate" label="Date">
        <Input id="qdate" type="date" value={v.date} max={today} onChange={(e) => setV({ ...v, date: e.target.value })} />
      </Field>
      <Field id="qloc" label="Booked to">
        <select id="qloc" className={selectClass} value={v.locationId} onChange={(e) => setV({ ...v, locationId: e.target.value, moneyAccountId: "" })}>
          {locations.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
      </Field>
      <Field id="qacct" label={v.type === "DRAWING" ? "Taken from" : "Put into"}>
        <select id="qacct" className={selectClass} value={v.moneyAccountId} onChange={(e) => setV({ ...v, moneyAccountId: e.target.value })}>
          <option value="">Choose…</option>
          {options.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </Field>
      <Field id="qamt" label="Amount (₱)" error={save.fieldError("amount")}>
        <Input id="qamt" inputMode="decimal" value={v.amount} onChange={(e) => setV({ ...v, amount: e.target.value })} />
      </Field>
      <Field id="qmemo" label="Note">
        <Input id="qmemo" value={v.memo} onChange={(e) => setV({ ...v, memo: e.target.value })} />
      </Field>
      <div className="sm:col-span-3">
        <Button type="submit" disabled={save.pending}>
          Record
        </Button>
      </div>
    </form>
  );
}
