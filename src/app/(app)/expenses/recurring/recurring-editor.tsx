"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SimpleTable } from "@/components/data-table/simple-table";
import { Field, selectClass } from "@/components/forms/field";
import { useAction } from "@/components/forms/use-action";
import { saveRecurringAction } from "@/domains/expenses/actions";

type Template = {
  id: string;
  name: string;
  locationId: string;
  locationName: string;
  supplierId: string;
  supplierName: string;
  accountId: string;
  accountName: string;
  amount: string;
  terms: "PAID_NOW" | "ON_ACCOUNT";
  moneyAccountId: string;
  frequency: string;
  dayOfMonth?: number;
  nextRunOn: string;
  nextRunLabel: string;
  endOn: string;
  isActive: boolean;
};
type Option = { id: string; name: string };
type Categories = { group: string; groupId: string; accounts: Option[] }[];

const FREQ: Record<string, string> = { WEEKLY: "Weekly", SEMI_MONTHLY: "Twice a month", MONTHLY: "Monthly", QUARTERLY: "Quarterly", YEARLY: "Yearly" };

export function RecurringEditor(props: {
  today: string;
  locations: Option[];
  categories: Categories;
  suppliers: Option[];
  moneyAccounts: (Option & { locationId: string | null })[];
  templates: Template[];
}) {
  const [editing, setEditing] = useState<Template | null>(null);
  return (
    <>
      <div className="mb-3 flex justify-end">
        <Button
          onClick={() =>
            setEditing({
              id: "",
              name: "",
              locationId: props.locations[0]?.id ?? "",
              locationName: "",
              supplierId: "",
              supplierName: "",
              accountId: "",
              accountName: "",
              amount: "",
              terms: "ON_ACCOUNT",
              moneyAccountId: "",
              frequency: "MONTHLY",
              dayOfMonth: 1,
              nextRunOn: props.today,
              nextRunLabel: "",
              endOn: "",
              isActive: true,
            })
          }
        >
          <Plus className="size-4" /> Add recurring expense
        </Button>
      </div>
      <SimpleTable
        head={["Name", "Location", "Category", "Amount", "How often", "Next draft", ""]}
        rows={props.templates.map((t) => [
          <span key="n" className="font-semibold">
            {t.name} {!t.isActive && <Badge variant="outline">Ended</Badge>}
          </span>,
          t.locationName,
          t.accountName,
          `₱${t.amount}`,
          FREQ[t.frequency],
          t.nextRunLabel,
          <Button key="e" variant="ghost" size="sm" aria-label={`Edit ${t.name}`} onClick={() => setEditing(t)}>
            <Pencil className="size-4" />
          </Button>,
        ])}
        empty="No recurring expenses yet."
      />
      {editing && <RecurringDialog value={editing} {...props} onClose={() => setEditing(null)} />}
    </>
  );
}

function RecurringDialog({
  value,
  locations,
  categories,
  suppliers,
  moneyAccounts,
  onClose,
}: {
  value: Template;
  locations: Option[];
  categories: Categories;
  suppliers: Option[];
  moneyAccounts: (Option & { locationId: string | null })[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [t, setT] = useState(value);
  const save = useAction(saveRecurringAction, {
    onSuccess: () => {
      onClose();
      router.refresh();
    },
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t.id ? `Edit ${value.name}` : "Add recurring expense"}</DialogTitle>
        </DialogHeader>
        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            save.run({ ...t, id: t.id || undefined });
          }}
        >
          <Field id="rname" label="Name" error={save.fieldError("name")}>
            <Input id="rname" value={t.name} onChange={(e) => setT({ ...t, name: e.target.value })} placeholder="Lanang rent" required />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field id="rloc" label="Location">
              <select id="rloc" className={selectClass} value={t.locationId} onChange={(e) => setT({ ...t, locationId: e.target.value })}>
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field id="ramt" label="Amount (₱)" error={save.fieldError("amount")}>
              <Input id="ramt" inputMode="decimal" value={t.amount} onChange={(e) => setT({ ...t, amount: e.target.value })} />
            </Field>
          </div>
          <Field id="racc" label="Category" error={save.fieldError("accountId")}>
            <select id="racc" className={selectClass} value={t.accountId} onChange={(e) => setT({ ...t, accountId: e.target.value })}>
              <option value="">Choose…</option>
              {categories.map((g) => (
                <optgroup key={g.groupId} label={g.group}>
                  {g.accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </Field>
          <Field id="rsup" label="Supplier">
            <select id="rsup" className={selectClass} value={t.supplierId} onChange={(e) => setT({ ...t, supplierId: e.target.value })}>
              <option value="">None</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field id="rterms" label="Paid">
              <select id="rterms" className={selectClass} value={t.terms} onChange={(e) => setT({ ...t, terms: e.target.value as Template["terms"] })}>
                <option value="ON_ACCOUNT">As a bill (pay later)</option>
                <option value="PAID_NOW">Automatically from an account</option>
              </select>
            </Field>
            {t.terms === "PAID_NOW" && (
              <Field id="rma" label="From">
                <select id="rma" className={selectClass} value={t.moneyAccountId} onChange={(e) => setT({ ...t, moneyAccountId: e.target.value })}>
                  <option value="">Choose…</option>
                  {moneyAccounts
                    .filter((m) => !m.locationId || m.locationId === t.locationId)
                    .map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                </select>
              </Field>
            )}
            <Field id="rfreq" label="How often">
              <select id="rfreq" className={selectClass} value={t.frequency} onChange={(e) => setT({ ...t, frequency: e.target.value })}>
                {Object.entries(FREQ).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </Field>
            <Field id="rday" label="Day of month">
              <Input id="rday" type="number" min={1} max={31} value={t.dayOfMonth ?? ""} onChange={(e) => setT({ ...t, dayOfMonth: e.target.value ? Number(e.target.value) : undefined })} />
            </Field>
            <Field id="rnext" label="Next draft on">
              <Input id="rnext" type="date" value={t.nextRunOn} onChange={(e) => setT({ ...t, nextRunOn: e.target.value })} />
            </Field>
            <Field id="rend" label="Ends on (optional)">
              <Input id="rend" type="date" value={t.endOn} onChange={(e) => setT({ ...t, endOn: e.target.value })} />
            </Field>
          </div>
          <label className="flex items-center gap-3 text-sm">
            <Switch checked={t.isActive} onCheckedChange={(v) => setT({ ...t, isActive: v })} /> Active
          </label>
          <Button type="submit" disabled={save.pending}>
            Save
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
