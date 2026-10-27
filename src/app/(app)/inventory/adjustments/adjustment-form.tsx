"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, selectClass } from "@/components/forms/field";
import { useAction } from "@/components/forms/use-action";
import { PhotoInput, type UploadedFile } from "@/components/forms/photo-input";
import { postAdjustmentAction } from "@/domains/inventory/actions";

type Item = { id: string; name: string; unit: string; locationIds: string[] };
type Line = { itemId: string; qty: string; direction: "OUT" | "IN"; unitCost: string };
type Kind = "WASTE" | "STAFF_MEAL" | "ADJUSTMENT" | "OPENING";

export function AdjustmentForm({
  today,
  locations,
  defaultLocationId,
  canOpening,
  items,
}: {
  today: string;
  locations: { id: string; name: string }[];
  defaultLocationId: string;
  canOpening: boolean;
  items: Item[];
}) {
  const router = useRouter();
  const [type, setType] = useState<Kind>("WASTE");
  const [locationId, setLocationId] = useState(defaultLocationId);
  const [date, setDate] = useState(today);
  const [reason, setReason] = useState("");
  const [lines, setLines] = useState<Line[]>([{ itemId: "", qty: "", direction: "OUT", unitCost: "" }]);
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const save = useAction(postAdjustmentAction, {
    onSuccess: () => {
      setReason("");
      setLines([{ itemId: "", qty: "", direction: "OUT", unitCost: "" }]);
      setFiles([]);
      router.refresh();
    },
  });
  const available = items.filter((i) => i.locationIds.includes(locationId));
  const set = (i: number, patch: Partial<Line>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const kinds: [Kind, string][] = [
    ["WASTE", "Waste / spoilage"],
    ["STAFF_MEAL", "Staff meal"],
    ["ADJUSTMENT", "Correction"],
    ...(canOpening ? ([["OPENING", "Opening stock"]] as [Kind, string][]) : []),
  ];

  return (
    <form
      className="max-w-3xl space-y-4 rounded-lg border p-4"
      onSubmit={(e) => {
        e.preventDefault();
        save.run({ locationId, date, type, reason, lines: lines.filter((l) => l.itemId && l.qty).map((l) => ({ ...l, unitCost: l.unitCost || undefined })), attachmentIds: files.map((f) => f.id) });
      }}
    >
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="What happened">
        {kinds.map(([k, label]) => (
          <button
            key={k}
            type="button"
            role="radio"
            aria-checked={type === k}
            onClick={() => setType(k)}
            className={`h-11 rounded-full border px-4 text-sm ${type === k ? "border-foreground bg-foreground text-background" : ""}`}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {locations.length > 1 && (
          <Field id="al" label="Location">
            <select id="al" className={`${selectClass} h-11`} value={locationId} onChange={(e) => setLocationId(e.target.value)}>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </Field>
        )}
        <Field id="ad" label="Date">
          <Input id="ad" type="date" max={today} value={date} onChange={(e) => setDate(e.target.value)} className="h-11" />
        </Field>
        <Field id="ar" label="Reason" error={save.fieldError("reason")}>
          <Input id="ar" value={reason} onChange={(e) => setReason(e.target.value)} placeholder={type === "WASTE" ? "Spoiled, dropped, burnt…" : type === "OPENING" ? "Go-live stock count" : ""} className="h-11" />
        </Field>
      </div>
      {lines.map((l, i) => {
        const unit = items.find((x) => x.id === l.itemId)?.unit ?? "";
        return (
          <div key={i} className="grid gap-2 sm:grid-cols-[1fr_7rem_auto_auto]">
            <select className={`${selectClass} h-11`} value={l.itemId} onChange={(e) => set(i, { itemId: e.target.value })} aria-label="Item">
              <option value="">Choose item…</option>
              {available.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </select>
            <Input inputMode="decimal" placeholder={`Qty ${unit}`} value={l.qty} onChange={(e) => set(i, { qty: e.target.value })} className="h-11" aria-label="Quantity" />
            {type === "ADJUSTMENT" && (
              <select className={`${selectClass} h-11`} value={l.direction} onChange={(e) => set(i, { direction: e.target.value as Line["direction"] })} aria-label="Direction">
                <option value="OUT">Less than recorded</option>
                <option value="IN">More than recorded</option>
              </select>
            )}
            {type === "OPENING" && (
              <Input inputMode="decimal" placeholder={`₱ per ${unit || "unit"}`} value={l.unitCost} onChange={(e) => set(i, { unitCost: e.target.value })} className="h-11 w-32" aria-label="Unit cost" />
            )}
            {lines.length > 1 && (
              <Button type="button" variant="ghost" size="icon" aria-label="Remove" onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}>
                <Trash2 className="size-4" />
              </Button>
            )}
          </div>
        );
      })}
      <Button type="button" variant="outline" onClick={() => setLines((ls) => [...ls, { itemId: "", qty: "", direction: "OUT", unitCost: "" }])}>
        <Plus className="size-4" /> Add item
      </Button>
      {type === "WASTE" && <PhotoInput locationId={locationId} value={files} onChange={setFiles} label="Photo of the waste" />}
      <div>
        <Button type="submit" className="h-11 px-6" disabled={save.pending}>
          {save.pending ? "Saving…" : "Record"}
        </Button>
      </div>
    </form>
  );
}
