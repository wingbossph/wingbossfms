"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, selectClass } from "@/components/forms/field";
import { useAction } from "@/components/forms/use-action";
import { PhotoInput, type UploadedFile } from "@/components/forms/photo-input";
import { recordTransferAction } from "@/domains/cash/actions";

type Account = { id: string; name: string; kind: string; locationId: string | null; balance: string };
type Loc = { id: string; name: string };

export function TransferForms({
  today,
  depositLocations,
  transferLocations,
  accounts,
}: {
  today: string;
  depositLocations: Loc[];
  transferLocations: Loc[];
  accounts: Account[];
}) {
  const [mode, setMode] = useState<"deposit" | "transfer" | null>(null);
  return (
    <div className="no-print mb-8">
      <div className="flex flex-wrap gap-2">
        {depositLocations.length > 0 && (
          <Button className="h-12" variant={mode === "deposit" ? "default" : "outline"} onClick={() => setMode(mode === "deposit" ? null : "deposit")}>
            Record cash deposit
          </Button>
        )}
        {transferLocations.length > 0 && (
          <Button className="h-12" variant={mode === "transfer" ? "default" : "outline"} onClick={() => setMode(mode === "transfer" ? null : "transfer")}>
            Transfer between accounts
          </Button>
        )}
      </div>
      {mode && (
        <TransferForm
          key={mode}
          mode={mode}
          today={today}
          locations={mode === "deposit" ? depositLocations : transferLocations}
          accounts={accounts}
          onDone={() => setMode(null)}
        />
      )}
    </div>
  );
}

function TransferForm({ mode, today, locations, accounts, onDone }: { mode: "deposit" | "transfer"; today: string; locations: Loc[]; accounts: Account[]; onDone: () => void }) {
  const router = useRouter();
  const [locationId, setLocationId] = useState(locations[0]?.id ?? "");
  const deposit = mode === "deposit";
  const fromOptions = accounts.filter((a) =>
    deposit ? a.locationId === locationId && ["UNDEPOSITED_CASH", "CASH_DRAWER"].includes(a.kind) : !a.locationId || a.locationId === locationId,
  );
  const toOptions = accounts.filter((a) => (deposit ? ["BANK", "EWALLET"].includes(a.kind) : !a.locationId || a.locationId === locationId));
  const [v, setV] = useState({
    date: today,
    fromAccountId: fromOptions.find((a) => a.kind === "UNDEPOSITED_CASH")?.id ?? fromOptions[0]?.id ?? "",
    toAccountId: toOptions.find((a) => a.kind === "BANK")?.id ?? toOptions[0]?.id ?? "",
    type: deposit ? "CASH_DEPOSIT" : "TRANSFER",
    amount: "",
    fee: "",
    reference: "",
    notes: "",
  });
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const save = useAction(recordTransferAction, {
    onSuccess: () => {
      onDone();
      router.refresh();
    },
  });

  return (
    <form
      className="mt-4 grid max-w-3xl gap-4 rounded-lg border p-4 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        save.run({ ...v, locationId, fee: v.fee || "0", attachmentIds: files.map((f) => f.id) });
      }}
    >
      {locations.length > 1 && (
        <Field id="tl" label="Location">
          <select id="tl" className={selectClass} value={locationId} onChange={(e) => setLocationId(e.target.value)}>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </Field>
      )}
      <Field id="td" label="Date">
        <Input id="td" type="date" max={today} value={v.date} onChange={(e) => setV({ ...v, date: e.target.value })} />
      </Field>
      {!deposit && (
        <Field id="tt" label="Kind">
          <select id="tt" className={selectClass} value={v.type} onChange={(e) => setV({ ...v, type: e.target.value })}>
            <option value="TRANSFER">Transfer (e.g. GCash → BPI)</option>
            <option value="PETTY_REPLENISH">Petty cash top-up</option>
            <option value="WITHDRAWAL">Withdrawal (bank → cash)</option>
          </select>
        </Field>
      )}
      <Field id="tf" label="From">
        <select id="tf" className={selectClass} value={v.fromAccountId} onChange={(e) => setV({ ...v, fromAccountId: e.target.value })}>
          {fromOptions.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
              {a.balance ? ` (${a.balance})` : ""}
            </option>
          ))}
        </select>
      </Field>
      <Field id="tto" label="To">
        <select id="tto" className={selectClass} value={v.toAccountId} onChange={(e) => setV({ ...v, toAccountId: e.target.value })}>
          {toOptions.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </Field>
      <Field id="ta" label="Amount (₱)" error={save.fieldError("amount")}>
        <Input id="ta" inputMode="decimal" value={v.amount} onChange={(e) => setV({ ...v, amount: e.target.value })} required className="h-12 text-lg" />
      </Field>
      <Field id="tfee" label="Fee charged (₱)" hint="e.g. GCash cash-out or bank transfer fee">
        <Input id="tfee" inputMode="decimal" value={v.fee} onChange={(e) => setV({ ...v, fee: e.target.value })} />
      </Field>
      <Field id="tr" label={deposit ? "Deposit slip reference no." : "Reference no."}>
        <Input id="tr" value={v.reference} onChange={(e) => setV({ ...v, reference: e.target.value })} />
      </Field>
      <Field id="tn" label="Notes">
        <Input id="tn" value={v.notes} onChange={(e) => setV({ ...v, notes: e.target.value })} />
      </Field>
      <div className="sm:col-span-2">
        <PhotoInput locationId={locationId} value={files} onChange={setFiles} label={deposit ? "Photo of deposit slip" : "Attach proof"} />
      </div>
      <div className="flex gap-2 sm:col-span-2">
        <Button type="submit" className="h-12 px-6" disabled={save.pending}>
          {save.pending ? "Saving…" : deposit ? "Record deposit" : "Record transfer"}
        </Button>
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
