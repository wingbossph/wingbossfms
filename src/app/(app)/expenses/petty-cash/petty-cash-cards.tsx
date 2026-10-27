"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, selectClass } from "@/components/forms/field";
import { useAction } from "@/components/forms/use-action";
import { savePettyFundAction } from "@/domains/expenses/actions";
import { recordTransferAction } from "@/domains/cash/actions";

type Fund = {
  moneyAccountId: string;
  locationId: string;
  location: string;
  balance: string;
  imprest: string;
  imprestSet: boolean;
  spentSinceTopUp: string;
  topUp: string;
  needsTopUp: boolean;
};

export function PettyCashCards({ funds, sources, today }: { funds: Fund[]; sources: { id: string; name: string; locationId: string | null }[]; today: string }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {funds.map((f) => (
        <FundCard key={f.moneyAccountId} fund={f} today={today} sources={sources.filter((s) => !s.locationId || s.locationId === f.locationId)} />
      ))}
      {funds.length === 0 && <p className="text-sm text-muted-foreground">No petty cash accounts. Add one in Admin → Payments & settings.</p>}
    </div>
  );
}

function FundCard({ fund, sources, today }: { fund: Fund; sources: { id: string; name: string }[]; today: string }) {
  const router = useRouter();
  const [imprest, setImprest] = useState(fund.imprest);
  const [from, setFrom] = useState(sources[0]?.id ?? "");
  const [amount, setAmount] = useState(fund.topUp);
  const saveFund = useAction(savePettyFundAction, { onSuccess: () => router.refresh() });
  const topUp = useAction(recordTransferAction, { onSuccess: () => router.refresh() });

  return (
    <section className="space-y-3 rounded-lg border p-4">
      <div className="flex items-baseline justify-between">
        <h2 className="text-xl">{fund.location}</h2>
        <p className="font-display text-3xl">{fund.balance}</p>
      </div>
      <p className="text-sm text-muted-foreground">Spent since last top-up: {fund.spentSinceTopUp}</p>
      <form
        className="flex items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          saveFund.run({ moneyAccountId: fund.moneyAccountId, imprest });
        }}
      >
        <Field id={`imp-${fund.moneyAccountId}`} label="Fund amount (₱)" className="flex-1">
          <Input id={`imp-${fund.moneyAccountId}`} inputMode="decimal" value={imprest} onChange={(e) => setImprest(e.target.value)} />
        </Field>
        <Button type="submit" variant="outline" disabled={saveFund.pending}>
          Save
        </Button>
      </form>
      {fund.imprestSet && (
        <form
          className="grid gap-2 border-t pt-3 sm:grid-cols-[1fr_8rem_auto]"
          onSubmit={(e) => {
            e.preventDefault();
            topUp.run({ type: "PETTY_REPLENISH", date: today, locationId: fund.locationId, fromAccountId: from, toAccountId: fund.moneyAccountId, amount, fee: "0", reference: "", notes: "Petty cash top-up" });
          }}
        >
          <select className={selectClass} value={from} onChange={(e) => setFrom(e.target.value)} aria-label="Top up from">
            {sources.map((s) => (
              <option key={s.id} value={s.id}>
                From {s.name}
              </option>
            ))}
          </select>
          <Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} aria-label="Top-up amount" />
          <Button type="submit" disabled={topUp.pending} variant={fund.needsTopUp ? "default" : "outline"}>
            Top up
          </Button>
        </form>
      )}
    </section>
  );
}
