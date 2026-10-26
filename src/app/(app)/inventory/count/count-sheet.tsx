"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, selectClass } from "@/components/forms/field";
import { useAction } from "@/components/forms/use-action";
import { useDraft } from "@/components/forms/use-draft";
import { saveCountAction } from "@/domains/inventory/actions";

type Item = { itemId: string; name: string; unit: string; storageArea: string; category: string };

export function CountSheet(props: {
  locations: { id: string; name: string }[];
  locationId: string;
  type: string;
  date: string;
  today: string;
  items: Item[];
  status: string | null;
  initial: Record<string, string>;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [counts, setCounts] = useState<Record<string, string>>(props.initial);
  const posted = props.status === "POSTED";
  const draft = useDraft(`count:${props.locationId}:${props.type}:${props.date}`, counts, props.status ? "9999" : "0000", !posted);
  const save = useAction(saveCountAction, {
    onSuccess: () => {
      draft.clear();
      router.refresh();
    },
  });
  const go = (patch: Record<string, string>) => {
    const sp = new URLSearchParams({ location: props.locationId, type: props.type, date: props.date, ...patch });
    router.replace(`${pathname}?${sp.toString()}`);
  };
  const areas = [...new Set(props.items.map((i) => i.storageArea))];
  const filled = props.items.filter((i) => counts[i.itemId] !== undefined && counts[i.itemId] !== "").length;
  const submit = (post: boolean) =>
    save.run({ locationId: props.locationId, date: props.date, type: props.type, notes: "", post, lines: props.items.map((i) => ({ itemId: i.itemId, counted: counts[i.itemId] ?? "" })) });

  return (
    <div className="max-w-2xl space-y-6 pb-28">
      <div className="flex flex-wrap items-end gap-3">
        {props.locations.length > 1 && (
          <Field id="cl" label="Location">
            <select id="cl" className={`${selectClass} h-12`} value={props.locationId} onChange={(e) => go({ location: e.target.value })}>
              {props.locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </Field>
        )}
        <Field id="ct" label="Count">
          <select id="ct" className={`${selectClass} h-12`} value={props.type} onChange={(e) => go({ type: e.target.value })}>
            <option value="DAILY">Daily (key items)</option>
            <option value="WEEKLY">Weekly</option>
            <option value="MONTHLY">Monthly (everything)</option>
          </select>
        </Field>
        <Field id="cd" label="Date">
          <Input id="cd" type="date" max={props.today} value={props.date} onChange={(e) => go({ date: e.target.value })} className="h-12" />
        </Field>
      </div>

      {draft.restorable && !posted && (
        <div className="flex items-center gap-3 rounded-md border border-warning bg-warning/10 p-3 text-sm">
          Unsaved counts on this device.
          <Button size="sm" onClick={() => { setCounts(draft.restorable!); draft.dismiss(); }}>
            Restore
          </Button>
        </div>
      )}
      {posted && <p className="rounded-md border p-3 text-sm">This count is posted. Ask an admin if something needs correcting.</p>}

      {areas.map((area) => (
        <section key={area}>
          <h2 className="mb-2 text-xl">{area}</h2>
          <div className="divide-y rounded-lg border">
            {props.items
              .filter((i) => i.storageArea === area)
              .map((i) => (
                <label key={i.itemId} className="flex items-center gap-3 px-3 py-2">
                  <span className="flex-1">
                    <span className="block font-semibold">{i.name}</span>
                    <span className="text-xs text-muted-foreground">{i.category}</span>
                  </span>
                  <Input
                    inputMode="decimal"
                    disabled={posted}
                    value={counts[i.itemId] ?? ""}
                    onChange={(e) => setCounts((c) => ({ ...c, [i.itemId]: e.target.value.replace(/[^\d.]/g, "") }))}
                    className="h-12 w-28 text-right text-lg tabular-nums"
                    aria-label={`${i.name} counted in ${i.unit}`}
                    placeholder="—"
                  />
                  <span className="w-10 text-sm text-muted-foreground">{i.unit}</span>
                </label>
              ))}
          </div>
        </section>
      ))}
      {props.items.length === 0 && <p className="text-sm text-muted-foreground">No items are set up for this count at this location.</p>}

      {!posted && props.items.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-20 flex flex-wrap items-center gap-3 border-t bg-background/95 px-4 py-3 backdrop-blur md:left-64 md:px-8">
          <span className="text-sm">
            {filled} of {props.items.length} counted
          </span>
          <Button variant="outline" className="h-11" disabled={save.pending} onClick={() => submit(false)}>
            Save draft
          </Button>
          <Button className="h-11 px-6" disabled={save.pending || filled === 0} onClick={() => confirm(`Post the count (${filled} items)? Usage will be recorded.`) && submit(true)}>
            Post count
          </Button>
        </div>
      )}
    </div>
  );
}
