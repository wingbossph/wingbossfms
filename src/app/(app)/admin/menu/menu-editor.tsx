"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, selectClass } from "@/components/forms/field";
import { useAction } from "@/components/forms/use-action";
import {
  importLoyverseItemsAction,
  newPriceListAction,
  savePricesAction,
  saveProductAction,
} from "@/domains/sales/setup-actions";
import { manilaDateString } from "@/lib/dates";

type Product = {
  id: string;
  name: string;
  category?: string;
  type: string;
  paxPerUnit: string;
  revenueAccountId: string;
  revenueAccount: string;
  isActive: boolean;
  sortOrder: number;
};
type PriceList = {
  id: string;
  name: string;
  scope: string;
  locationId: string | null;
  period: string;
  isOpen: boolean;
  prices: Record<string, string>;
};
type Option = { id: string; name: string };

const TYPES: Record<string, string> = {
  PACKAGE: "Unlimited package (counts pax)",
  ALA_CARTE: "À la carte",
  ADDON: "Add-on",
  BEVERAGE: "Beverage",
  TAKEOUT: "Take-out",
  OTHER: "Other",
};

export function MenuEditor({
  products,
  priceLists,
  revenueAccounts,
  locations,
}: {
  products: Product[];
  priceLists: PriceList[];
  revenueAccounts: Option[];
  locations: Option[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<Product | null>(null);
  const [listId, setListId] = useState(
    priceLists.find((l) => l.isOpen)?.id ?? priceLists[0]?.id ?? "",
  );
  const list = priceLists.find((l) => l.id === listId);
  const [prices, setPrices] = useState<Record<string, string>>(
    list?.prices ?? {},
  );
  const savePrices = useAction(savePricesAction, {
    onSuccess: () => router.refresh(),
  });
  const [importing, setImporting] = useState(false);

  async function importItems(file: File | undefined) {
    if (!file) return;
    setImporting(true);
    try {
      const res = await importLoyverseItemsAction({ csv: await file.text() });
      if (res?.ok) {
        toast.success(res.message);
        router.refresh();
      } else toast.error(res?.message ?? "Import failed");
    } finally {
      setImporting(false);
    }
  }

  function chooseList(id: string) {
    setListId(id);
    setPrices(priceLists.find((l) => l.id === id)?.prices ?? {});
  }

  return (
    <div className="space-y-10">
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-2xl">Menu items</h2>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" asChild disabled={importing}>
              <label className="cursor-pointer">
                <Upload className="size-4" />{" "}
                {importing ? "Importing…" : "Import Loyverse items"}
                <input
                  type="file"
                  accept=".csv,text/csv"
                  className="sr-only"
                  disabled={importing}
                  onChange={(e) => {
                    void importItems(e.target.files?.[0]);
                    e.target.value = "";
                  }}
                />
              </label>
            </Button>
            <Button
              onClick={() =>
                setEditing({
                  id: "",
                  name: "",
                  type: "PACKAGE",
                  paxPerUnit: "1",
                  revenueAccountId: revenueAccounts[0]?.id ?? "",
                  revenueAccount: "",
                  isActive: true,
                  sortOrder: products.length,
                })
              }
            >
              <Plus className="size-4" /> Add item
            </Button>
          </div>
        </div>
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase tracking-wider">
              <tr>
                <th className="p-3">Name</th>
                <th className="p-3">Category</th>
                <th className="p-3">Type</th>
                <th className="p-3 text-right">Pax per unit</th>
                <th className="p-3">Revenue account</th>
                <th className="p-3">Status</th>
                <th className="p-3" />
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.id} className="border-t">
                  <td className="p-3 font-semibold">{p.name}</td>
                  <td className="p-3 text-muted-foreground">
                    {p.category || "—"}
                  </td>
                  <td className="p-3">{TYPES[p.type]}</td>
                  <td className="p-3 text-right tabular-nums">
                    {p.paxPerUnit}
                  </td>
                  <td className="p-3">{p.revenueAccount}</td>
                  <td className="p-3">
                    {p.isActive ? (
                      <Badge>Active</Badge>
                    ) : (
                      <Badge variant="outline">Hidden</Badge>
                    )}
                  </td>
                  <td className="p-3 text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setEditing(p)}
                      aria-label={`Edit ${p.name}`}
                    >
                      <Pencil className="size-4" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="mb-1 text-2xl">Prices</h2>
        <p className="mb-3 text-sm text-muted-foreground">
          A branch list overrides the &quot;All branches&quot; list. To change
          prices from a date (keeping history), create a new version.
        </p>
        <div className="mb-4 flex flex-wrap items-end gap-3">
          <Field id="pl" label="Price list" className="min-w-72">
            <select
              id="pl"
              className={selectClass}
              value={listId}
              onChange={(e) => chooseList(e.target.value)}
            >
              {priceLists.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name} · {l.scope} · {l.period}
                </option>
              ))}
            </select>
          </Field>
          <NewListForm priceLists={priceLists} locations={locations} />
        </div>
        {list && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              savePrices.run({
                priceListId: list.id,
                prices: products.map((p) => ({
                  productId: p.id,
                  price: prices[p.id] ?? "0",
                })),
              });
            }}
            className="max-w-xl space-y-2"
          >
            {products.map((p) => (
              <label
                key={p.id}
                className="flex items-center justify-between gap-3 border-b py-1.5 text-sm"
              >
                <span className={p.isActive ? "" : "text-muted-foreground"}>
                  {p.name}
                </span>
                <span className="flex items-center gap-1">
                  ₱
                  <Input
                    inputMode="decimal"
                    className="h-9 w-32 text-right tabular-nums"
                    value={prices[p.id] ?? "0.00"}
                    onChange={(e) =>
                      setPrices((s) => ({ ...s, [p.id]: e.target.value }))
                    }
                    aria-label={`${p.name} price`}
                  />
                </span>
              </label>
            ))}
            <Button
              type="submit"
              disabled={savePrices.pending}
              className="mt-3"
            >
              {savePrices.pending ? "Saving…" : "Save prices"}
            </Button>
          </form>
        )}
      </section>

      {editing && (
        <ProductDialog
          product={editing}
          revenueAccounts={revenueAccounts}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function ProductDialog({
  product,
  revenueAccounts,
  onClose,
}: {
  product: Product;
  revenueAccounts: Option[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [p, setP] = useState(product);
  const save = useAction(saveProductAction, {
    onSuccess: () => {
      onClose();
      router.refresh();
    },
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {p.id ? `Edit ${product.name}` : "Add menu item"}
          </DialogTitle>
        </DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            save.run({ ...p, id: p.id || undefined });
          }}
        >
          <Field id="pname" label="Name" error={save.fieldError("name")}>
            <Input
              id="pname"
              value={p.name}
              onChange={(e) => setP({ ...p, name: e.target.value })}
              required
            />
          </Field>
          <Field id="ptype" label="Type">
            <select
              id="ptype"
              className={selectClass}
              value={p.type}
              onChange={(e) =>
                setP({
                  ...p,
                  type: e.target.value,
                  paxPerUnit:
                    e.target.value === "PACKAGE" ? p.paxPerUnit || "1" : "0",
                })
              }
            >
              {Object.entries(TYPES).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </Field>
          <Field
            id="ppax"
            label="Pax per unit sold"
            error={save.fieldError("paxPerUnit")}
            hint="1 for one person's unlimited package, 4 for a barkada set, 0 for drinks and add-ons"
          >
            <Input
              id="ppax"
              inputMode="decimal"
              value={p.paxPerUnit}
              onChange={(e) => setP({ ...p, paxPerUnit: e.target.value })}
            />
          </Field>
          <Field id="prev" label="Revenue account">
            <select
              id="prev"
              className={selectClass}
              value={p.revenueAccountId}
              onChange={(e) => setP({ ...p, revenueAccountId: e.target.value })}
            >
              {revenueAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </Field>
          <Field id="psort" label="Order on the entry screen">
            <Input
              id="psort"
              type="number"
              min={0}
              value={p.sortOrder}
              onChange={(e) =>
                setP({ ...p, sortOrder: Number(e.target.value) })
              }
            />
          </Field>
          <label className="flex items-center gap-3 text-sm">
            <Switch
              checked={p.isActive}
              onCheckedChange={(c) => setP({ ...p, isActive: c })}
            />{" "}
            Active (shown to cashiers)
          </label>
          <Button type="submit" disabled={save.pending}>
            {save.pending ? "Saving…" : "Save"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function NewListForm({
  priceLists,
  locations,
}: {
  priceLists: PriceList[];
  locations: Option[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("New prices");
  const [locationId, setLocationId] = useState<string>("");
  const [from, setFrom] = useState(manilaDateString());
  const [copyFrom, setCopyFrom] = useState(
    priceLists.find((l) => l.isOpen)?.id ?? "",
  );
  const create = useAction(newPriceListAction, {
    onSuccess: () => {
      setOpen(false);
      router.refresh();
    },
  });
  if (!open) {
    return (
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Plus className="size-4" /> New price version
      </Button>
    );
  }
  return (
    <form
      className="flex flex-wrap items-end gap-2 rounded-md border p-3"
      onSubmit={(e) => {
        e.preventDefault();
        create.run({
          name,
          locationId: locationId || null,
          effectiveFrom: from,
          copyFromId: copyFrom || undefined,
        });
      }}
    >
      <Field id="nlname" label="Name">
        <Input
          id="nlname"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </Field>
      <Field id="nlloc" label="For">
        <select
          id="nlloc"
          className={selectClass}
          value={locationId}
          onChange={(e) => setLocationId(e.target.value)}
        >
          <option value="">All branches</option>
          {locations.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name} only
            </option>
          ))}
        </select>
      </Field>
      <Field id="nlfrom" label="Effective from">
        <Input
          id="nlfrom"
          type="date"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
        />
      </Field>
      <Field id="nlcopy" label="Copy prices from">
        <select
          id="nlcopy"
          className={selectClass}
          value={copyFrom}
          onChange={(e) => setCopyFrom(e.target.value)}
        >
          <option value="">Start at ₱0.00</option>
          {priceLists.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name} · {l.scope}
            </option>
          ))}
        </select>
      </Field>
      <Button type="submit" disabled={create.pending}>
        Create
      </Button>
      <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
        Cancel
      </Button>
    </form>
  );
}
