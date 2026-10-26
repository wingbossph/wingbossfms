"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Minus, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, selectClass } from "@/components/forms/field";
import { useAction } from "@/components/forms/use-action";
import { savePresetAction, saveTransferAction } from "@/domains/inventory/actions";

type Option = { id: string; name: string };
type Item = { itemId: string; locationId: string; name: string; unit: string; onHand: number };
type Preset = { id: string; name: string; fromLocationId: string; toLocationId: string | null; lines: { itemId: string; qty: string }[] };

export function DispatchForm(props: { today: string; fromLocations: Option[]; defaultFromId: string; toLocations: Option[]; items: Item[]; presets: Preset[] }) {
  const router = useRouter();
  const [fromId, setFromId] = useState(props.defaultFromId);
  const destinations = props.toLocations.filter((l) => l.id !== fromId);
  const [toId, setToId] = useState(destinations[0]?.id ?? "");
  const [qty, setQty] = useState<Record<string, string>>({});
  const [date, setDate] = useState(props.today);
  const [presetName, setPresetName] = useState("");
  const items = props.items.filter((i) => i.locationId === fromId);
  const dispatch = useAction(saveTransferAction, {
    onSuccess: () => {
      setQty({});
      router.refresh();
    },
  });
  const savePreset = useAction(savePresetAction, { onSuccess: () => router.refresh() });
  const picked = Object.entries(qty).filter(([, v]) => v && Number(v) > 0);
  const bump = (id: string, d: number) => setQty((q) => ({ ...q, [id]: String(Math.max(0, Number(q[id] || 0) + d)) }));

  return (
    <div className="max-w-2xl space-y-5 pb-28">
      <div className="grid grid-cols-2 gap-3">
        {props.fromLocations.length > 1 ? (
          <Field id="df" label="From">
            <select id="df" className={`${selectClass} h-12`} value={fromId} onChange={(e) => setFromId(e.target.value)}>
              {props.fromLocations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </Field>
        ) : (
          <Field id="dfs" label="From">
            <p className="flex h-12 items-center font-semibold">{props.fromLocations[0]?.name}</p>
          </Field>
        )}
        <Field id="dt" label="To">
          <select id="dt" className={`${selectClass} h-12`} value={toId} onChange={(e) => setToId(e.target.value)}>
            {destinations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </Field>
      </div>

      {props.presets.filter((p) => p.fromLocationId === fromId).length > 0 && (
        <div className="flex flex-wrap gap-2">
          {props.presets
            .filter((p) => p.fromLocationId === fromId)
            .map((p) => (
              <Button
                key={p.id}
                variant="outline"
                className="h-11"
                onClick={() => {
                  setQty(Object.fromEntries(p.lines.map((l) => [l.itemId, String(Number(l.qty))])));
                  if (p.toLocationId) setToId(p.toLocationId);
                }}
              >
                {p.name}
              </Button>
            ))}
        </div>
      )}

      <div className="divide-y rounded-lg border">
        {items.map((i) => (
          <div key={i.itemId} className={`flex items-center gap-2 px-3 py-2 ${Number(qty[i.itemId] || 0) > 0 ? "bg-muted/40" : ""}`}>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-semibold">{i.name}</span>
              <span className={`text-xs ${i.onHand <= 0 ? "text-destructive" : "text-muted-foreground"}`}>
                {i.onHand.toLocaleString()} {i.unit} on hand
              </span>
            </span>
            <Button type="button" variant="outline" size="icon" className="size-11" onClick={() => bump(i.itemId, -1)} aria-label={`Less ${i.name}`}>
              <Minus className="size-5" />
            </Button>
            <Input inputMode="decimal" value={qty[i.itemId] ?? ""} placeholder="0" onChange={(e) => setQty((q) => ({ ...q, [i.itemId]: e.target.value.replace(/[^\d.]/g, "") }))} className="h-11 w-20 text-center text-lg" aria-label={`${i.name} quantity in ${i.unit}`} />
            <Button type="button" variant="outline" size="icon" className="size-11" onClick={() => bump(i.itemId, 1)} aria-label={`More ${i.name}`}>
              <Plus className="size-5" />
            </Button>
            <span className="w-8 text-xs text-muted-foreground">{i.unit}</span>
          </div>
        ))}
      </div>

      <details className="rounded-lg border p-3 text-sm">
        <summary className="cursor-pointer font-semibold">More: date, save as pick list</summary>
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <Field id="dd" label="Date">
            <Input id="dd" type="date" max={props.today} value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field id="pn" label="Save current items as pick list">
            <Input id="pn" value={presetName} onChange={(e) => setPresetName(e.target.value)} placeholder="Lanang daily sauces" />
          </Field>
          <Button
            variant="outline"
            disabled={!presetName || picked.length === 0 || savePreset.pending}
            onClick={() => savePreset.run({ name: presetName, fromLocationId: fromId, toLocationId: toId, lines: picked.map(([itemId, q]) => ({ itemId, qty: q })) })}
          >
            Save pick list
          </Button>
        </div>
      </details>

      <div className="fixed inset-x-0 bottom-0 z-20 flex items-center gap-3 border-t bg-background/95 px-4 py-3 backdrop-blur md:left-64 md:px-8">
        <span className="text-sm">{picked.length} item(s)</span>
        <Button
          className="h-12 flex-1 text-base sm:flex-none sm:px-8"
          disabled={picked.length === 0 || !toId || dispatch.pending}
          onClick={() => {
            const over = picked.filter(([id, q]) => Number(q) > (items.find((i) => i.itemId === id)?.onHand ?? 0));
            if (over.length && !confirm(`${over.length} item(s) are more than the recorded stock. Dispatch anyway?`)) return;
            if (!toId) return toast.error("Choose where it's going.");
            dispatch.run({ fromLocationId: fromId, toLocationId: toId, date, notes: "", dispatch: true, lines: picked.map(([itemId, q]) => ({ itemId, qty: q })) });
          }}
        >
          {dispatch.pending ? "Dispatching…" : `Dispatch to ${destinations.find((d) => d.id === toId)?.name ?? "…"}`}
        </Button>
      </div>
    </div>
  );
}
