"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SimpleTable } from "@/components/data-table/simple-table";
import { Field, selectClass } from "@/components/forms/field";
import { useAction } from "@/components/forms/use-action";
import { runDepreciationAction, saveAssetAction } from "@/domains/ledger/actions";

type Option = { id: string; name: string };
type Asset = {
  id: string;
  name: string;
  locationId: string;
  location: string;
  category: string;
  acquiredOn: string;
  acquiredLabel: string;
  cost: string;
  salvage: string;
  usefulLifeMonths: number;
  assetAccountId: string;
  depExpenseAccountId: string;
  disposedOn: string;
  accumulated: string;
  bookValue: string;
  isActive: boolean;
};

export function AssetsEditor(props: { canEdit: boolean; thisMonth: string; locations: Option[]; assetAccounts: Option[]; depAccounts: Option[]; assets: Asset[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<Asset | null>(null);
  const [month, setMonth] = useState(props.thisMonth);
  const run = useAction(runDepreciationAction, { onSuccess: () => router.refresh() });
  return (
    <>
      {props.canEdit && (
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div className="flex items-end gap-2">
            <Field id="dmonth" label="Post depreciation for">
              <Input id="dmonth" type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
            </Field>
            <Button variant="outline" disabled={run.pending} onClick={() => run.run(month)}>
              Run depreciation
            </Button>
          </div>
          <Button
            onClick={() =>
              setEditing({
                id: "",
                name: "",
                locationId: props.locations[0]?.id ?? "",
                location: "",
                category: "Kitchen equipment",
                acquiredOn: `${props.thisMonth}-01`,
                acquiredLabel: "",
                cost: "",
                salvage: "0",
                usefulLifeMonths: 60,
                assetAccountId: props.assetAccounts[0]?.id ?? "",
                depExpenseAccountId: props.depAccounts[0]?.id ?? "",
                disposedOn: "",
                accumulated: "",
                bookValue: "",
                isActive: true,
              })
            }
          >
            <Plus className="size-4" /> Add asset
          </Button>
        </div>
      )}
      <SimpleTable
        head={["Asset", "Location", "Acquired", "Cost", "Life", "Accumulated", "Book value", ""]}
        rows={props.assets.map((a) => [
          <span key="n" className="font-semibold">
            {a.name} {!a.isActive && <Badge variant="outline">Disposed</Badge>}
            <span className="block text-xs font-normal text-muted-foreground">{a.category}</span>
          </span>,
          a.location,
          a.acquiredLabel,
          `₱${a.cost}`,
          `${a.usefulLifeMonths} mo`,
          a.accumulated,
          <b key="b">{a.bookValue}</b>,
          props.canEdit ? (
            <Button key="e" variant="ghost" size="sm" aria-label={`Edit ${a.name}`} onClick={() => setEditing(a)}>
              <Pencil className="size-4" />
            </Button>
          ) : null,
        ])}
        empty="No fixed assets registered."
      />
      {editing && <AssetDialog value={editing} {...props} onClose={() => setEditing(null)} />}
    </>
  );
}

function AssetDialog({ value, locations, assetAccounts, depAccounts, onClose }: { value: Asset; locations: Option[]; assetAccounts: Option[]; depAccounts: Option[]; onClose: () => void }) {
  const router = useRouter();
  const [a, setA] = useState(value);
  const save = useAction(saveAssetAction, {
    onSuccess: () => {
      onClose();
      router.refresh();
    },
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{a.id ? `Edit ${value.name}` : "Add fixed asset"}</DialogTitle>
        </DialogHeader>
        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            save.run({ ...a, id: a.id || undefined });
          }}
        >
          <Field id="fname" label="Name" error={save.fieldError("name")}>
            <Input id="fname" value={a.name} onChange={(e) => setA({ ...a, name: e.target.value })} placeholder="Deep fryer 2×25L" required />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field id="floc" label="Location">
              <select id="floc" className={selectClass} value={a.locationId} onChange={(e) => setA({ ...a, locationId: e.target.value })}>
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field id="fcat" label="Category">
              <Input id="fcat" value={a.category} onChange={(e) => setA({ ...a, category: e.target.value })} />
            </Field>
            <Field id="facq" label="Acquired on">
              <Input id="facq" type="date" value={a.acquiredOn} onChange={(e) => setA({ ...a, acquiredOn: e.target.value })} />
            </Field>
            <Field id="flife" label="Useful life (months)">
              <Input id="flife" type="number" min={1} value={a.usefulLifeMonths} onChange={(e) => setA({ ...a, usefulLifeMonths: Number(e.target.value) })} />
            </Field>
            <Field id="fcost" label="Cost (₱)" error={save.fieldError("cost")}>
              <Input id="fcost" inputMode="decimal" value={a.cost} onChange={(e) => setA({ ...a, cost: e.target.value })} />
            </Field>
            <Field id="fsal" label="Salvage value (₱)">
              <Input id="fsal" inputMode="decimal" value={a.salvage} onChange={(e) => setA({ ...a, salvage: e.target.value })} />
            </Field>
          </div>
          <Field id="facct" label="Asset account">
            <select id="facct" className={selectClass} value={a.assetAccountId} onChange={(e) => setA({ ...a, assetAccountId: e.target.value })}>
              {assetAccounts.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </select>
          </Field>
          <Field id="fdep" label="Depreciation expense account">
            <select id="fdep" className={selectClass} value={a.depExpenseAccountId} onChange={(e) => setA({ ...a, depExpenseAccountId: e.target.value })}>
              {depAccounts.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </select>
          </Field>
          {a.id && (
            <Field id="fdisp" label="Disposed on (stops depreciation)">
              <Input id="fdisp" type="date" value={a.disposedOn} onChange={(e) => setA({ ...a, disposedOn: e.target.value })} />
            </Field>
          )}
          <Button type="submit" disabled={save.pending}>
            Save
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
