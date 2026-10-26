"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SimpleTable } from "@/components/data-table/simple-table";
import { Field, selectClass } from "@/components/forms/field";
import { useAction } from "@/components/forms/use-action";
import { saveRecipeAction } from "@/domains/inventory/actions";

type Option = { id: string; name: string };
type Line = { itemId: string; qty: string; label?: string };
type Recipe = {
  id: string;
  name: string;
  kind: "PRODUCTION" | "MENU_ITEM" | "PACKAGE_PER_PAX";
  productId: string;
  productName: string;
  outputItemId: string;
  outputName: string;
  outputQty: string;
  overheadPerUnit: string;
  effectiveFrom: string;
  lines: Line[];
};

const KIND: Record<Recipe["kind"], string> = { PACKAGE_PER_PAX: "Per-pax standards (unlimited packages)", PRODUCTION: "Production recipes (commissary)", MENU_ITEM: "À la carte recipes" };

export function RecipesEditor(props: {
  today: string;
  suggestion: string | null;
  products: (Option & { type: string })[];
  items: (Option & { isProduced: boolean; isWings: boolean })[];
  recipes: Recipe[];
}) {
  const [editing, setEditing] = useState<Recipe | null>(null);
  const wingsId = props.items.find((i) => i.isWings)?.id;
  const blank = (kind: Recipe["kind"]): Recipe => ({ id: "", name: "", kind, productId: "", productName: "", outputItemId: "", outputName: "", outputQty: "", overheadPerUnit: "0", effectiveFrom: props.today, lines: [] });

  return (
    <div className="max-w-5xl space-y-10">
      {props.suggestion && (
        <p className="rounded-md border-2 border-warning p-3 text-sm">
          Suggested from your counts: <b>{props.suggestion} kg of wings per pax</b>. Open a package below to apply it.
        </p>
      )}
      {(Object.keys(KIND) as Recipe["kind"][]).map((kind) => (
        <section key={kind}>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-2xl">{KIND[kind]}</h2>
            <Button variant="outline" onClick={() => setEditing(blank(kind))}>
              <Plus className="size-4" /> Add
            </Button>
          </div>
          <SimpleTable
            head={kind === "PRODUCTION" ? ["Recipe", "Makes", "Ingredients", ""] : ["Recipe", "Menu item", kind === "PACKAGE_PER_PAX" ? "Per pax" : "Per unit sold", ""]}
            rows={props.recipes
              .filter((r) => r.kind === kind)
              .map((r) => {
                const wings = r.lines.find((l) => l.itemId === wingsId);
                const unset = kind === "PACKAGE_PER_PAX" && (!wings || Number(wings.qty) === 0);
                return [
                  <span key="n" className="font-semibold">
                    {r.name}
                  </span>,
                  kind === "PRODUCTION" ? r.outputName : r.productName,
                  <span key="l" className={unset ? "font-semibold text-destructive" : ""}>
                    {unset ? "Set the kg of wings per pax" : r.lines.filter((l) => Number(l.qty) > 0).map((l) => l.label).join(", ") || "—"}
                  </span>,
                  <Button
                    key="e"
                    variant="ghost"
                    size="sm"
                    aria-label={`Edit ${r.name}`}
                    onClick={() =>
                      setEditing(
                        props.suggestion && kind === "PACKAGE_PER_PAX" && wingsId
                          ? { ...r, lines: [...r.lines.filter((l) => l.itemId !== wingsId), { itemId: wingsId, qty: props.suggestion }] }
                          : r,
                      )
                    }
                  >
                    <Pencil className="size-4" />
                  </Button>,
                ];
              })}
            empty="None yet."
          />
        </section>
      ))}
      {editing && <RecipeDialog value={editing} products={props.products} items={props.items} onClose={() => setEditing(null)} />}
    </div>
  );
}

function RecipeDialog({ value, products, items, onClose }: { value: Recipe; products: (Option & { type: string })[]; items: (Option & { isProduced: boolean })[]; onClose: () => void }) {
  const router = useRouter();
  const [r, setR] = useState<Recipe>(value.lines.length ? value : { ...value, lines: [{ itemId: "", qty: "" }] });
  const save = useAction(saveRecipeAction, {
    onSuccess: () => {
      onClose();
      router.refresh();
    },
  });
  const setLine = (i: number, patch: Partial<Line>) => setR({ ...r, lines: r.lines.map((l, j) => (j === i ? { ...l, ...patch } : l)) });
  const productOptions = products.filter((p) => (r.kind === "PACKAGE_PER_PAX" ? p.type === "PACKAGE" : p.type !== "PACKAGE"));
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92dvh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{r.id ? `Edit ${value.name}` : KIND[r.kind]}</DialogTitle>
        </DialogHeader>
        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            save.run({ ...r, id: r.id || undefined, overheadPerUnit: r.overheadPerUnit || "0", lines: r.lines.filter((l) => l.itemId && l.qty !== "") });
          }}
        >
          <Field id="rname" label="Name" error={save.fieldError("name")}>
            <Input id="rname" value={r.name} onChange={(e) => setR({ ...r, name: e.target.value })} required />
          </Field>
          {r.kind === "PRODUCTION" ? (
            <div className="grid grid-cols-2 gap-3">
              <Field id="rout" label="Makes">
                <select id="rout" className={selectClass} value={r.outputItemId} onChange={(e) => setR({ ...r, outputItemId: e.target.value })}>
                  <option value="">Choose…</option>
                  {items
                    .filter((i) => i.isProduced)
                    .map((i) => (
                      <option key={i.id} value={i.id}>
                        {i.name}
                      </option>
                    ))}
                </select>
              </Field>
              <Field id="rqty" label="One batch yields">
                <Input id="rqty" inputMode="decimal" value={r.outputQty} onChange={(e) => setR({ ...r, outputQty: e.target.value })} />
              </Field>
              <Field id="roh" label="Labor/overhead ₱ per unit (optional)" className="col-span-2" hint="Added to the batch cost and credited to the commissary.">
                <Input id="roh" inputMode="decimal" value={r.overheadPerUnit} onChange={(e) => setR({ ...r, overheadPerUnit: e.target.value })} />
              </Field>
            </div>
          ) : (
            <Field id="rprod" label="Menu item">
              <select id="rprod" className={selectClass} value={r.productId} onChange={(e) => setR({ ...r, productId: e.target.value })}>
                <option value="">Choose…</option>
                {productOptions.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </Field>
          )}
          <Field id="reff" label="Effective from">
            <Input id="reff" type="date" value={r.effectiveFrom} onChange={(e) => setR({ ...r, effectiveFrom: e.target.value })} />
          </Field>
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">
              {r.kind === "PRODUCTION" ? "Ingredients per batch" : r.kind === "PACKAGE_PER_PAX" ? "Standard consumption per pax" : "Used per unit sold"}
            </legend>
            {r.lines.map((l, i) => (
              <div key={i} className="grid grid-cols-[1fr_7rem_auto] gap-2">
                <select className={selectClass} value={l.itemId} onChange={(e) => setLine(i, { itemId: e.target.value })} aria-label="Item">
                  <option value="">Choose item…</option>
                  {items.map((it) => (
                    <option key={it.id} value={it.id}>
                      {it.name}
                    </option>
                  ))}
                </select>
                <Input inputMode="decimal" placeholder="Qty" value={l.qty} onChange={(e) => setLine(i, { qty: e.target.value })} aria-label="Quantity" />
                <Button type="button" variant="ghost" size="icon" aria-label="Remove" onClick={() => setR({ ...r, lines: r.lines.filter((_, j) => j !== i) })}>
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ))}
            <Button type="button" variant="outline" size="sm" onClick={() => setR({ ...r, lines: [...r.lines, { itemId: "", qty: "" }] })}>
              <Plus className="size-4" /> Ingredient
            </Button>
          </fieldset>
          <Button type="submit" disabled={save.pending}>
            Save
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
