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
import { runAllocationAction, saveAllocationRuleAction, setAllocationEnabledAction } from "@/domains/ledger/actions";

type Option = { id: string; name: string };
type Rule = {
  id: string;
  name: string;
  method: "FIXED_SHARES" | "TRANSFER_VALUE";
  sourceLocationId: string;
  sourceName: string;
  accountId: string;
  accountName: string;
  isActive: boolean;
  shares: { locationId: string; percent: number }[];
};

export function AllocationsEditor(props: {
  enabled: boolean;
  lastMonth: string;
  locations: (Option & { type: string })[];
  accounts: Option[];
  runs: { key: string; memo: string }[];
  rules: Rule[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<Rule | null>(null);
  const [month, setMonth] = useState(props.lastMonth);
  const toggle = useAction(setAllocationEnabledAction, { onSuccess: () => router.refresh() });
  const run = useAction(runAllocationAction, { onSuccess: () => router.refresh() });
  const commissary = props.locations.find((l) => l.type === "COMMISSARY");

  return (
    <div className="max-w-4xl space-y-6">
      <label className="flex items-center gap-3 rounded-lg border p-4">
        <Switch checked={props.enabled} disabled={toggle.pending} onCheckedChange={(v) => toggle.run(v)} />
        <span>
          <b>Allocations {props.enabled ? "on" : "off"}</b>
          <span className="block text-sm text-muted-foreground">When off, rules can be set up but nothing is posted.</span>
        </span>
      </label>
      <div className="flex justify-end gap-2">
        {commissary && !props.rules.some((r) => r.method === "TRANSFER_VALUE") && (
          <Button
            variant="outline"
            onClick={() =>
              setEditing({ id: "", name: "Commissary cost to branches", method: "TRANSFER_VALUE", sourceLocationId: commissary.id, sourceName: "", accountId: "", accountName: "", isActive: true, shares: [] })
            }
          >
            Commissary → branches by transfers
          </Button>
        )}
        <Button onClick={() => setEditing({ id: "", name: "", method: "FIXED_SHARES", sourceLocationId: props.locations[0]?.id ?? "", sourceName: "", accountId: "", accountName: "", isActive: true, shares: [] })}>
          <Plus className="size-4" /> New rule
        </Button>
      </div>
      <SimpleTable
        head={["Rule", "From", "What", "Split", "", ""]}
        rows={props.rules.map((r) => [
          <span key="n" className="font-semibold">
            {r.name} {!r.isActive && <Badge variant="outline">Off</Badge>}
          </span>,
          r.sourceName,
          r.accountName,
          r.method === "TRANSFER_VALUE"
            ? "By value of transfers received that month"
            : r.shares.map((s) => `${props.locations.find((l) => l.id === s.locationId)?.name} ${s.percent}%`).join(", "),
          <Button key="r" variant="outline" size="sm" disabled={!props.enabled || run.pending} onClick={() => run.run({ ruleId: r.id, month })}>
            Run for {month}
          </Button>,
          <Button key="e" variant="ghost" size="sm" aria-label={`Edit ${r.name}`} onClick={() => setEditing(r)}>
            <Pencil className="size-4" />
          </Button>,
        ])}
        empty="No allocation rules."
      />
      <Field id="amonth" label="Month to run" className="max-w-xs">
        <Input id="amonth" type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
      </Field>
      {props.runs.length > 0 && (
        <section>
          <h2 className="mb-2 text-xl">Posted allocations</h2>
          <ul className="space-y-1 text-sm">
            {props.runs.map((r) => (
              <li key={r.key}>{r.memo}</li>
            ))}
          </ul>
        </section>
      )}
      {editing && <RuleDialog value={editing} locations={props.locations} accounts={props.accounts} onClose={() => setEditing(null)} />}
    </div>
  );
}

function RuleDialog({ value, locations, accounts, onClose }: { value: Rule; locations: Option[]; accounts: Option[]; onClose: () => void }) {
  const router = useRouter();
  const [r, setR] = useState(value);
  const save = useAction(saveAllocationRuleAction, {
    onSuccess: () => {
      onClose();
      router.refresh();
    },
  });
  const pctOf = (id: string) => r.shares.find((s) => s.locationId === id)?.percent ?? 0;
  const total = r.shares.reduce((s, x) => s + x.percent, 0);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{r.id ? `Edit ${value.name}` : "New allocation rule"}</DialogTitle>
        </DialogHeader>
        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            save.run({ ...r, id: r.id || undefined });
          }}
        >
          <Field id="rn" label="Name">
            <Input id="rn" value={r.name} onChange={(e) => setR({ ...r, name: e.target.value })} required />
          </Field>
          <Field id="rsrc" label="Costs recorded at">
            <select id="rsrc" className={selectClass} value={r.sourceLocationId} onChange={(e) => setR({ ...r, sourceLocationId: e.target.value })}>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </Field>
          <Field id="racct" label="Which costs">
            <select id="racct" className={selectClass} value={r.accountId} onChange={(e) => setR({ ...r, accountId: e.target.value })}>
              <option value="">All costs and income (net)</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </Field>
          <Field id="rmeth" label="Split">
            <select id="rmeth" className={selectClass} value={r.method} onChange={(e) => setR({ ...r, method: e.target.value as Rule["method"] })}>
              <option value="FIXED_SHARES">Fixed % per location</option>
              <option value="TRANSFER_VALUE">By value of transfers each location received</option>
            </select>
          </Field>
          {r.method === "FIXED_SHARES" && (
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">Shares (must total 100%)</legend>
              {locations
                .filter((l) => l.id !== r.sourceLocationId)
                .map((l) => (
                  <label key={l.id} className="flex items-center justify-between gap-2 text-sm">
                    {l.name}
                    <Input
                      className="w-24 text-right"
                      inputMode="decimal"
                      value={pctOf(l.id) || ""}
                      onChange={(e) => {
                        const percent = Number(e.target.value) || 0;
                        setR({ ...r, shares: [...r.shares.filter((s) => s.locationId !== l.id), { locationId: l.id, percent }] });
                      }}
                      aria-label={`${l.name} share`}
                    />
                  </label>
                ))}
              <p className={`text-sm ${total === 100 ? "text-success" : "text-destructive"}`}>Total {total}%</p>
            </fieldset>
          )}
          <label className="flex items-center gap-3 text-sm">
            <Switch checked={r.isActive} onCheckedChange={(v) => setR({ ...r, isActive: v })} /> Active
          </label>
          <Button type="submit" disabled={save.pending}>
            Save
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
