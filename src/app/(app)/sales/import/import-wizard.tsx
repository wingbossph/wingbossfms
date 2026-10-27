"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, selectClass } from "@/components/forms/field";
import { commitImportAction, previewImportAction } from "@/domains/sales/actions";
import { saveLoyverseMappingAction } from "@/domains/sales/setup-actions";
import { formatPeso } from "@/lib/money";

type Option = { id: string; name: string };
type Preview = NonNullable<Awaited<ReturnType<typeof previewImportAction>>["preview"]>;
type FileState = { name: string; csv: string; preview?: Preview; error?: string };

const KIND_LABEL: Record<string, string> = {
  RECEIPTS: "Receipts",
  RECEIPTS_BY_ITEM: "Receipts by item",
  SALES_BY_PAYMENT_TYPE: "Sales by payment type (one day)",
  SALES_BY_ITEM: "Sales by item (one day)",
  SALES_SUMMARY: "Sales summary (check only)",
};

export function ImportWizard({
  locations,
  defaultLocationId,
  products,
  channels,
  today,
}: {
  locations: Option[];
  defaultLocationId: string;
  products: Option[];
  channels: (Option & { locationIds: string[] })[];
  today: string;
}) {
  const [locationId, setLocationId] = useState(defaultLocationId);
  const [files, setFiles] = useState<FileState[]>([]);
  const [summaryDate, setSummaryDate] = useState(today);
  const [dateOrder, setDateOrder] = useState<"MDY" | "DMY">("MDY");
  const [itemMap, setItemMap] = useState<Record<string, { productId: string; pax: string }>>({});
  const [payMap, setPayMap] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();
  const [reports, setReports] = useState<string[]>([]);

  const needsDate = files.some((f) => f.preview && ["SALES_BY_PAYMENT_TYPE", "SALES_BY_ITEM", "SALES_SUMMARY"].includes(f.preview.kind));
  const unmappedItems = [...new Set(files.flatMap((f) => f.preview?.unmappedItems ?? []))];
  const unmappedPays = [...new Set(files.flatMap((f) => f.preview?.unmappedPaymentTypes ?? []))];
  const locChannels = channels.filter((c) => c.locationIds.includes(locationId));

  async function previewAll(list: FileState[], loc = locationId) {
    const out: FileState[] = [];
    for (const f of list) {
      const res = await previewImportAction({ locationId: loc, fileName: f.name, csv: f.csv, summaryDate, dateOrder });
      out.push({ ...f, preview: res.preview, error: res.ok ? undefined : res.message });
    }
    setFiles(out);
  }

  function onFiles(list: FileList | null) {
    if (!list?.length) return;
    start(async () => {
      const loaded = await Promise.all(Array.from(list).map(async (file) => ({ name: file.name, csv: await file.text() })));
      setReports([]);
      await previewAll(loaded);
    });
  }

  function saveMappings() {
    start(async () => {
      for (const name of unmappedItems) {
        const m = itemMap[name];
        if (!m?.productId) continue;
        const r = await saveLoyverseMappingAction({ kind: "ITEM", locationId, externalName: name, targetId: m.productId, paxOverride: m.pax });
        if (!r?.ok) return void toast.error(r?.message ?? "Could not save mapping");
      }
      for (const name of unmappedPays) {
        const id = payMap[name];
        if (!id) continue;
        const r = await saveLoyverseMappingAction({ kind: "PAYMENT_TYPE", locationId, externalName: name, targetId: id });
        if (!r?.ok) return void toast.error(r?.message ?? "Could not save mapping");
      }
      toast.success("Mappings saved.");
      await previewAll(files);
    });
  }

  function importAll() {
    start(async () => {
      const ids: string[] = [];
      for (const f of files) {
        if (!f.preview || f.preview.kind === "SALES_SUMMARY") continue;
        const res = await commitImportAction({ locationId, fileName: f.name, csv: f.csv, summaryDate, dateOrder });
        if (res.ok) {
          toast.success(`${f.name}: ${res.message}`);
          ids.push(...(res.reportIds ?? []));
        } else toast.error(`${f.name}: ${res.message}`);
      }
      setReports([...new Set(ids)]);
      await previewAll(files);
    });
  }

  const ready = files.length > 0 && files.every((f) => f.preview && !f.error) && unmappedItems.length === 0 && unmappedPays.length === 0;

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex flex-wrap items-end gap-3">
        {locations.length > 1 && (
          <Field id="il" label="Location">
            <select
              id="il"
              className={`${selectClass} h-12`}
              value={locationId}
              onChange={(e) => {
                setLocationId(e.target.value);
                if (files.length) start(() => previewAll(files, e.target.value));
              }}
            >
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </Field>
        )}
        <Field id="if" label="Loyverse CSV file(s)">
          <Input id="if" type="file" accept=".csv,text/csv" multiple onChange={(e) => onFiles(e.target.files)} className="h-12" />
        </Field>
        <Field id="do" label="Dates in the file look like">
          <select id="do" className={`${selectClass} h-12`} value={dateOrder} onChange={(e) => setDateOrder(e.target.value as "MDY" | "DMY")}>
            <option value="MDY">10/26/2026 (month first)</option>
            <option value="DMY">26/10/2026 (day first)</option>
          </select>
        </Field>
        {needsDate && (
          <Field id="sd" label="Business date of the summary">
            <Input id="sd" type="date" max={today} value={summaryDate} onChange={(e) => setSummaryDate(e.target.value)} className="h-12" />
          </Field>
        )}
        {files.length > 0 && (
          <Button variant="outline" className="h-12" disabled={pending} onClick={() => start(() => previewAll(files))}>
            Check again
          </Button>
        )}
      </div>

      {pending && <p className="text-sm text-muted-foreground">Working…</p>}

      {files.map((f) => (
        <div key={f.name} className="rounded-lg border p-4 text-sm">
          <p className="font-semibold">{f.name}</p>
          {f.error && <p className="text-destructive">{f.error}</p>}
          {f.preview && (
            <div className="mt-1 space-y-1">
              <p>
                {KIND_LABEL[f.preview.kind]} · {f.preview.dates.length ? `${f.preview.dates[0]}${f.preview.dates.length > 1 ? ` to ${f.preview.dates.at(-1)}` : ""}` : "—"}
              </p>
              {f.preview.receiptCount > 0 && (
                <p>
                  {f.preview.receiptCount} receipts: <b>{f.preview.newCount} new</b>, {f.preview.duplicateCount} already imported · net {formatPeso(BigInt(f.preview.netCents))}
                </p>
              )}
              {f.preview.kind === "SALES_SUMMARY" && <p>Net sales {formatPeso(BigInt(f.preview.netCents))} (used only to check against receipts).</p>}
              {f.preview.splitPaymentReceipts > 0 && (
                <p className="text-warning">
                  {f.preview.splitPaymentReceipts} receipts were paid with split payments. Their payment amounts can&apos;t be read from this export: also import “Sales by payment type” for that day, or assign them on the sales screen.
                </p>
              )}
              {f.preview.storeWarning && <p className="text-warning">{f.preview.storeWarning}</p>}
              {f.preview.errors.length > 0 && (
                <details>
                  <summary className="cursor-pointer text-destructive">{f.preview.errors.length} rows couldn&apos;t be read</summary>
                  <ul className="ml-4 list-disc">
                    {f.preview.errors.map((e) => (
                      <li key={e}>{e}</li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          )}
        </div>
      ))}

      {(unmappedItems.length > 0 || unmappedPays.length > 0) && (
        <section className="space-y-4 rounded-lg border-2 border-warning p-4">
          <h2 className="text-xl">Match Loyverse names</h2>
          <p className="text-sm text-muted-foreground">One time only: the system remembers these for next time.</p>
          {unmappedItems.map((name) => (
            <div key={name} className="grid items-center gap-2 sm:grid-cols-[1fr_1fr_7rem]">
              <span className="font-mono text-sm">{name}</span>
              <select
                className={selectClass}
                value={itemMap[name]?.productId ?? ""}
                onChange={(e) => setItemMap((m) => ({ ...m, [name]: { productId: e.target.value, pax: m[name]?.pax ?? "" } }))}
                aria-label={`Menu item for ${name}`}
              >
                <option value="">Choose menu item…</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <Input
                placeholder="Pax (opt.)"
                inputMode="decimal"
                value={itemMap[name]?.pax ?? ""}
                onChange={(e) => setItemMap((m) => ({ ...m, [name]: { productId: m[name]?.productId ?? "", pax: e.target.value } }))}
                aria-label={`Pax per unit override for ${name}`}
              />
            </div>
          ))}
          {unmappedPays.map((name) => (
            <div key={name} className="grid items-center gap-2 sm:grid-cols-[1fr_1fr_7rem]">
              <span className="font-mono text-sm">Payment: {name}</span>
              <select className={selectClass} value={payMap[name] ?? ""} onChange={(e) => setPayMap((m) => ({ ...m, [name]: e.target.value }))} aria-label={`Channel for ${name}`}>
                <option value="">Choose payment channel…</option>
                {locChannels.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          ))}
          <Button onClick={saveMappings} disabled={pending}>
            Save matches
          </Button>
        </section>
      )}

      {files.length > 0 && (
        <Button className="h-12 px-8 text-base" disabled={!ready || pending} onClick={importAll}>
          Import
        </Button>
      )}

      {reports.length > 0 && (
        <section className="rounded-lg border p-4">
          <h2 className="text-xl">Next: confirm the day</h2>
          <p className="mb-2 text-sm text-muted-foreground">Open each day, add anything not in Loyverse, check payments, submit, then close the shift.</p>
          <ul className="space-y-1">
            {reports.map((id, i) => (
              <li key={id}>
                <Link href={`/sales/${id}`} className="font-semibold underline underline-offset-4">
                  Open sales report {reports.length > 1 ? i + 1 : ""}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
