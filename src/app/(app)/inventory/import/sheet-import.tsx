"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, selectClass } from "@/components/forms/field";
import { applyInventorySheetDayAction, prepareInventorySheetAction, readInventorySheetAction } from "@/domains/inventory/actions";

type Sheet = NonNullable<Awaited<ReturnType<typeof readInventorySheetAction>>["sheet"]>;
type Option = { id: string; name: string };

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

async function toBase64(file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

export function SheetImport({ locations, defaultLocationId }: { locations: Option[]; defaultLocationId: string }) {
  const [locationId, setLocationId] = useState(defaultLocationId);
  const [file, setFile] = useState<{ name: string; base64: string } | null>(null);
  const [tabs, setTabs] = useState<string[]>([]);
  const [tab, setTab] = useState("");
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [progress, setProgress] = useState<string[]>([]);
  const [pending, start] = useTransition();

  function load(f: File | undefined) {
    if (!f) return;
    start(async () => {
      const base64 = await toBase64(f);
      const res = await readInventorySheetAction({ base64 });
      if (!res.ok) return void toast.error(res.message);
      setFile({ name: f.name, base64 });
      setTabs(res.tabs);
      const guess = res.tabs.find((t) => t === MONTHS[new Date().getMonth()]) ?? res.tabs[0] ?? "";
      pick(guess, base64);
    });
  }

  function pick(t: string, base64 = file?.base64) {
    setTab(t);
    setSheet(null);
    setProgress([]);
    if (!t || !base64) return;
    start(async () => {
      const res = await readInventorySheetAction({ base64, tab: t });
      if (!res.ok) return void toast.error(res.message);
      setSheet(res.sheet);
    });
  }

  function run() {
    if (!sheet || !file) return;
    start(async () => {
      const prep = await prepareInventorySheetAction({ locationId, items: sheet.items.map((i) => ({ name: i.name, section: i.section })) });
      if (!prep.ok || !prep.itemIds) return void toast.error(prep.message ?? "Couldn't set up the items.");
      const log = [`Items ready (${prep.created ?? 0} new).`];
      setProgress([...log]);
      const today = new Date().toISOString().slice(0, 10);
      for (const [d, date] of sheet.dates.entries()) {
        if (date > today) break;
        const lines = sheet.items.map((i) => ({ itemId: prep.itemIds![i.name], ...i.days[d] })).filter((l) => l.start !== null || l.in !== null || l.transfer !== null || l.end !== null);
        const res = await applyInventorySheetDayAction({ locationId, date, fileName: `${file.name} · ${sheet.tab}`, lines });
        log.push(res.ok ? res.message ?? date : `${date}: ${res.message}`);
        setProgress([...log]);
        if (!res.ok) return void toast.error(`${date}: ${res.message}`);
      }
      toast.success("Inventory sheet imported.");
    });
  }

  const sections = sheet ? [...new Set(sheet.items.map((i) => i.section))].map((s) => `${s.charAt(0)}${s.slice(1).toLowerCase()} (${sheet.items.filter((i) => i.section === s).length})`) : [];

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex flex-wrap items-end gap-3">
        {locations.length > 1 && (
          <Field id="loc" label="Location">
            <select id="loc" className={`${selectClass} h-12`} value={locationId} onChange={(e) => setLocationId(e.target.value)}>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </Field>
        )}
        <Field id="file" label="Workbook (.xlsx)">
          <Input id="file" type="file" accept=".xlsx" className="h-12" disabled={pending} onChange={(e) => load(e.target.files?.[0])} />
        </Field>
        {tabs.length > 0 && (
          <Field id="tab" label="Month tab">
            <select id="tab" className={`${selectClass} h-12`} value={tab} disabled={pending} onChange={(e) => pick(e.target.value)}>
              {tabs.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </Field>
        )}
      </div>
      <p className="text-sm text-muted-foreground">Google Sheets: File → Download → Microsoft Excel (.xlsx).</p>

      {pending && !progress.length && <p className="text-sm text-muted-foreground">Reading…</p>}

      {sheet && (
        <section className="space-y-2 rounded-lg border p-4 text-sm">
          <p>
            <b>{sheet.tab}</b>: {sheet.dates[0]} to {sheet.dates.at(-1)} · {sheet.items.length} items with stock
          </p>
          <p className="text-muted-foreground">{sections.join(" · ")}</p>
          <p className="text-muted-foreground">
            New items are created with a guessed unit and category (edit them under Items). The sheet has no costs, so stock is valued at each item&apos;s current unit cost. Days already counted are skipped, so importing again is safe.
          </p>
          <Button className="mt-2 h-11 px-6" disabled={pending} onClick={run}>
            {pending && progress.length ? "Importing…" : `Import ${sheet.tab} into ${locations.find((l) => l.id === locationId)?.name ?? "location"}`}
          </Button>
        </section>
      )}

      {progress.length > 0 && (
        <ul className="max-h-80 overflow-y-auto rounded-lg border p-3 text-sm tabular-nums">
          {progress.map((p, i) => (
            <li key={i}>{p}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
