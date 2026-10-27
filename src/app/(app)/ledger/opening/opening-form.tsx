"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, selectClass } from "@/components/forms/field";
import { useAction } from "@/components/forms/use-action";
import { openingBalancesAction } from "@/domains/ledger/actions";

type Option = { id: string; name: string };
type Line = { accountId: string; locationId: string; amount: string };

export function OpeningForm({
  today,
  locations,
  accounts,
  suggestions,
}: {
  today: string;
  locations: Option[];
  accounts: (Option & { kind: string })[];
  suggestions: { accountId: string; locationId: string }[];
}) {
  const router = useRouter();
  const [date, setDate] = useState(today);
  const [lines, setLines] = useState<Line[]>(suggestions.map((s) => ({ ...s, amount: "" })));
  const post = useAction(openingBalancesAction, { onSuccess: () => router.push("/ledger") });
  const set = (i: number, patch: Partial<Line>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  return (
    <form
      className="max-w-3xl space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        post.run({ date, lines: lines.filter((l) => l.accountId && l.amount).map((l) => ({ ...l })) });
      }}
    >
      <Field id="odate" label="As of (go-live date)" className="max-w-xs">
        <Input id="odate" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </Field>
      <p className="text-sm text-muted-foreground">Enter normal balances as positive amounts: money you have, or money you owe.</p>
      <div className="space-y-2">
        {lines.map((l, i) => (
          <div key={i} className="grid gap-2 sm:grid-cols-[1fr_12rem_9rem_auto]">
            <select className={selectClass} value={l.accountId} onChange={(e) => set(i, { accountId: e.target.value })} aria-label="Account">
              <option value="">Choose account…</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
            <select className={selectClass} value={l.locationId} onChange={(e) => set(i, { locationId: e.target.value })} aria-label="Location">
              {locations.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
            <Input inputMode="decimal" placeholder="0.00" className="text-right" value={l.amount} onChange={(e) => set(i, { amount: e.target.value })} aria-label="Amount" />
            <Button type="button" variant="ghost" size="icon" aria-label="Remove" onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}>
              <Trash2 className="size-4" />
            </Button>
          </div>
        ))}
      </div>
      <Button type="button" variant="outline" onClick={() => setLines((ls) => [...ls, { accountId: "", locationId: locations[0]?.id ?? "", amount: "" }])}>
        <Plus className="size-4" /> Add balance
      </Button>
      <div>
        <Button type="submit" className="h-11 px-6" disabled={post.pending}>
          Post opening balances
        </Button>
      </div>
    </form>
  );
}
