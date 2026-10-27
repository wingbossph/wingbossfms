"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SimpleTable } from "@/components/data-table/simple-table";
import { Field, selectClass } from "@/components/forms/field";
import { useAction } from "@/components/forms/use-action";
import { saveItemAction } from "@/domains/inventory/actions";

type Option = { id: string; name: string };
type Loc = { locationId: string; isStocked: boolean; parLevel: string; reorderPoint: string; storageArea: string; varianceTolerancePct: string };
type Item = {
  id: string;
  sku: string;
  name: string;
  categoryId: string;
  category: string;
  costClass: string;
  baseUnit: string;
  purchaseUnit: string;
  purchaseToBase: string;
  countFrequency: string;
  isProduced: boolean;
  inventoryAccountId: string;
  consumptionAccountId: string;
  preferredSupplierId: string;
  isActive: boolean;
  locations: Loc[];
};

const FREQ: Record<string, string> = { DAILY: "Daily", WEEKLY: "Weekly", MONTHLY: "Monthly" };

export function ItemsEditor(props: { items: Item[]; categories: Option[]; inventoryAccounts: Option[]; costAccounts: Option[]; suppliers: Option[]; locations: Option[] }) {
  const [editing, setEditing] = useState<Item | null>(null);
  const [q, setQ] = useState("");
  const shown = props.items.filter((i) => `${i.name} ${i.category} ${i.sku}`.toLowerCase().includes(q.toLowerCase()));
  const locName = new Map(props.locations.map((l) => [l.id, l.name]));
  return (
    <>
      <div className="mb-3 flex flex-wrap justify-between gap-2">
        <Input className="max-w-xs" placeholder="Search items…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search items" />
        <Button
          onClick={() =>
            setEditing({
              id: "",
              sku: "",
              name: "",
              categoryId: props.categories[0]?.id ?? "",
              category: "",
              costClass: "COGS",
              baseUnit: "kg",
              purchaseUnit: "",
              purchaseToBase: "1",
              countFrequency: "WEEKLY",
              isProduced: false,
              inventoryAccountId: props.inventoryAccounts[0]?.id ?? "",
              consumptionAccountId: props.costAccounts[0]?.id ?? "",
              preferredSupplierId: "",
              isActive: true,
              locations: props.locations.map((l) => ({ locationId: l.id, isStocked: false, parLevel: "", reorderPoint: "", storageArea: "", varianceTolerancePct: "" })),
            })
          }
        >
          <Plus className="size-4" /> Add item
        </Button>
      </div>
      <SimpleTable
        head={["Item", "Category", "Unit", "Purchase pack", "Counted", "Stocked at", ""]}
        rows={shown.map((i) => [
          <span key="n" className="font-semibold">
            {i.name} {i.isProduced && <Badge variant="outline">made at commissary</Badge>} {!i.isActive && <Badge variant="outline">inactive</Badge>}
          </span>,
          i.category,
          i.baseUnit,
          i.purchaseUnit ? `1 ${i.purchaseUnit} = ${Number(i.purchaseToBase)} ${i.baseUnit}` : "—",
          FREQ[i.countFrequency],
          i.locations.filter((l) => l.isStocked).map((l) => locName.get(l.locationId)).join(", ") || "—",
          <Button key="e" variant="ghost" size="sm" aria-label={`Edit ${i.name}`} onClick={() => setEditing(i)}>
            <Pencil className="size-4" />
          </Button>,
        ])}
      />
      {editing && <ItemDialog value={editing} {...props} onClose={() => setEditing(null)} />}
    </>
  );
}

function ItemDialog({ value, categories, inventoryAccounts, costAccounts, suppliers, locations, onClose }: { value: Item; categories: Option[]; inventoryAccounts: Option[]; costAccounts: Option[]; suppliers: Option[]; locations: Option[]; onClose: () => void }) {
  const router = useRouter();
  const [i, setI] = useState(value);
  const save = useAction(saveItemAction, {
    onSuccess: () => {
      onClose();
      router.refresh();
    },
  });
  const setLoc = (id: string, patch: Partial<Loc>) => setI({ ...i, locations: i.locations.map((l) => (l.locationId === id ? { ...l, ...patch } : l)) });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92dvh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{i.id ? `Edit ${value.name}` : "Add item"}</DialogTitle>
        </DialogHeader>
        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            save.run({ ...i, id: i.id || undefined });
          }}
        >
          <div className="grid grid-cols-2 gap-3">
            <Field id="iname" label="Name" error={save.fieldError("name")} className="col-span-2">
              <Input id="iname" value={i.name} onChange={(e) => setI({ ...i, name: e.target.value })} required />
            </Field>
            <Field id="icat" label="Category">
              <select id="icat" className={selectClass} value={i.categoryId} onChange={(e) => setI({ ...i, categoryId: e.target.value })}>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field id="isku" label="SKU / code">
              <Input id="isku" value={i.sku} onChange={(e) => setI({ ...i, sku: e.target.value })} />
            </Field>
            <Field id="iunit" label="Base unit (counted in)">
              <Input id="iunit" value={i.baseUnit} onChange={(e) => setI({ ...i, baseUnit: e.target.value })} placeholder="kg, L, pc, pack" />
            </Field>
            <Field id="ifreq" label="Count">
              <select id="ifreq" className={selectClass} value={i.countFrequency} onChange={(e) => setI({ ...i, countFrequency: e.target.value })}>
                {Object.entries(FREQ).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </Field>
            <Field id="ipu" label="Purchase pack (optional)">
              <Input id="ipu" value={i.purchaseUnit} onChange={(e) => setI({ ...i, purchaseUnit: e.target.value })} placeholder="box" />
            </Field>
            <Field id="ipb" label={`Base units per pack`}>
              <Input id="ipb" inputMode="decimal" value={i.purchaseToBase} onChange={(e) => setI({ ...i, purchaseToBase: e.target.value })} />
            </Field>
            <Field id="iclass" label="Cost type">
              <select id="iclass" className={selectClass} value={i.costClass} onChange={(e) => setI({ ...i, costClass: e.target.value })}>
                <option value="COGS">Food / COGS</option>
                <option value="OPERATING_SUPPLY">Operating supplies</option>
                <option value="FIXED_ASSET">Fixed asset</option>
              </select>
            </Field>
            <Field id="isup" label="Usual supplier">
              <select id="isup" className={selectClass} value={i.preferredSupplierId} onChange={(e) => setI({ ...i, preferredSupplierId: e.target.value })}>
                <option value="">—</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field id="iinv" label="Inventory account">
              <select id="iinv" className={selectClass} value={i.inventoryAccountId} onChange={(e) => setI({ ...i, inventoryAccountId: e.target.value })}>
                {inventoryAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field id="icost" label="Cost account when used">
              <select id="icost" className={selectClass} value={i.consumptionAccountId} onChange={(e) => setI({ ...i, consumptionAccountId: e.target.value })}>
                {costAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <label className="flex items-center gap-3 text-sm">
            <Switch checked={i.isProduced} onCheckedChange={(v) => setI({ ...i, isProduced: v })} /> Made at the commissary
          </label>
          <label className="flex items-center gap-3 text-sm">
            <Switch checked={i.isActive} onCheckedChange={(v) => setI({ ...i, isActive: v })} /> Active
          </label>
          <fieldset className="space-y-2">
            <legend className="mb-1 text-sm font-medium">Per location</legend>
            {locations.map((l) => {
              const s = i.locations.find((x) => x.locationId === l.id)!;
              return (
                <div key={l.id} className="grid items-center gap-2 rounded-md border p-2 sm:grid-cols-[10rem_repeat(4,1fr)]">
                  <label className="flex items-center gap-2 text-sm font-semibold">
                    <Checkbox checked={s.isStocked} onCheckedChange={(v) => setLoc(l.id, { isStocked: !!v })} /> {l.name}
                  </label>
                  <Input placeholder="Storage area" value={s.storageArea} disabled={!s.isStocked} onChange={(e) => setLoc(l.id, { storageArea: e.target.value })} aria-label={`${l.name} storage area`} />
                  <Input placeholder="Par" inputMode="decimal" value={s.parLevel} disabled={!s.isStocked} onChange={(e) => setLoc(l.id, { parLevel: e.target.value })} aria-label={`${l.name} par level`} />
                  <Input placeholder="Reorder at" inputMode="decimal" value={s.reorderPoint} disabled={!s.isStocked} onChange={(e) => setLoc(l.id, { reorderPoint: e.target.value })} aria-label={`${l.name} reorder point`} />
                  <Input placeholder="Tolerance %" inputMode="decimal" value={s.varianceTolerancePct} disabled={!s.isStocked} onChange={(e) => setLoc(l.id, { varianceTolerancePct: e.target.value })} aria-label={`${l.name} variance tolerance`} />
                </div>
              );
            })}
          </fieldset>
          <Button type="submit" disabled={save.pending}>
            Save
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
