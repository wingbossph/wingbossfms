"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, selectClass } from "@/components/forms/field";
import { SimpleTable } from "@/components/data-table/simple-table";
import { checkImportAction, type ImportCheck } from "@/domains/migration/actions";
import { cn } from "cn";

type Kind = { kind: string; title: string; description: string; fields: { key: string; label: string; required: boolean; help: string }[] };

async function toBase64(file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

export function ImportWizard({ kinds }: { kinds: Kind[] }) {
  const router = useRouter();
  const [kind, setKind] = useState<Kind | null>(null);
  const [file, setFile] = useState<{ name: string; content: string } | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [dateOrder, setDateOrder] = useState<"MDY" | "DMY" | "YMD">("MDY");
  const [headerRow, setHeaderRow] = useState(0);
  const [check, setCheck] = useState<ImportCheck | null>(null);
  const [pending, start] = useTransition();

  function run(opts: { commit?: boolean; map?: Record<string, string>; f?: typeof file; order?: typeof dateOrder; header?: number } = {}) {
    const f = opts.f ?? file;
    if (!kind || !f) return;
    start(async () => {
      const res = await checkImportAction({ kind: kind.kind, fileName: f.name, content: f.content, mapping: opts.map ?? mapping, dateOrder: opts.order ?? dateOrder, headerRow: opts.header ?? headerRow, commit: !!opts.commit });
      if (!res.ok || !res.check) return void toast.error(res.message ?? "Could not read the file.");
      setCheck(res.check);
      setMapping(res.check.mapping);
      if (res.check.committed) {
        toast.success(res.message ?? "Imported.");
        router.refresh();
      } else if (res.message) (res.check.errors.length ? toast.warning : toast.success)(res.message);
    });
  }

  if (!kind)
    return (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {kinds.map((k) => (
          <button key={k.kind} type="button" onClick={() => setKind(k)} className="rounded-lg border p-4 text-left transition hover:border-foreground">
            <span className="block font-display text-xl tracking-wide">{k.title}</span>
            <span className="text-sm text-muted-foreground">{k.description}</span>
          </button>
        ))}
      </div>
    );

  const ready = !!check && check.errors.length === 0 && check.validRows > 0 && !check.committed;
  return (
    <div className="max-w-5xl space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="outline" onClick={() => (setKind(null), setFile(null), setCheck(null), setMapping({}))}>
          ← Choose another
        </Button>
        <h2 className="text-2xl">{kind.title}</h2>
        <a href={`/api/import/template/${kind.kind}`} className="text-sm underline underline-offset-4">
          Download a template
        </a>
      </div>
      <p className="text-sm text-muted-foreground">{kind.description}</p>

      <div className="flex flex-wrap items-end gap-3">
        <Field id="imp-file" label="File (CSV or .xlsx)">
          <Input
            id="imp-file"
            type="file"
            accept=".csv,.txt,.xlsx"
            onChange={async (e) => {
              const fl = e.target.files?.[0];
              if (!fl) return;
              const loaded = { name: fl.name, content: await toBase64(fl) };
              setFile(loaded);
              setMapping({});
              run({ f: loaded, map: {} });
            }}
          />
        </Field>
        <Field id="imp-order" label="Dates are written">
          <select id="imp-order" className={selectClass} value={dateOrder} onChange={(e) => (setDateOrder(e.target.value as typeof dateOrder), run({ order: e.target.value as typeof dateOrder }))}>
            <option value="MDY">Month/day/year</option>
            <option value="DMY">Day/month/year</option>
            <option value="YMD">Year-month-day</option>
          </select>
        </Field>
        <Field id="imp-header" label="Rows above the headers">
          <Input id="imp-header" type="number" min={0} max={30} value={headerRow} onChange={(e) => (setHeaderRow(Number(e.target.value) || 0), run({ header: Number(e.target.value) || 0, map: {} }))} className="w-24" />
        </Field>
      </div>

      {check && (
        <>
          <section>
            <h3 className="mb-2 text-lg font-semibold">Match the columns</h3>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {kind.fields.map((f) => (
                <Field key={f.key} id={`map-${f.key}`} label={`${f.label}${f.required ? " *" : ""}`} hint={f.help || undefined}>
                  <select id={`map-${f.key}`} className={cn(selectClass, f.required && !mapping[f.key] && "border-destructive")} value={mapping[f.key] ?? ""} onChange={(e) => setMapping((m) => ({ ...m, [f.key]: e.target.value }))}>
                    <option value="">— not in this file —</option>
                    {check.headers.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                </Field>
              ))}
            </div>
          </section>

          <div className="flex flex-wrap items-center gap-3">
            <Button variant="outline" disabled={pending} onClick={() => run()}>
              {pending ? "Checking…" : "Check again (dry run)"}
            </Button>
            <Button disabled={!ready || pending} onClick={() => confirm(`Import ${check.validRows} row(s) of ${kind.title.toLowerCase()}?`) && run({ commit: true })}>
              Import {check.validRows} row(s)
            </Button>
            <span className="text-sm">
              {check.rowCount} row(s) read · {check.errors.length ? <strong className="text-destructive">{check.errors.length} problem(s)</strong> : check.committed ? <strong className="text-success">imported</strong> : <strong className="text-success">no problems</strong>}
            </span>
          </div>

          {check.errors.length > 0 && (
            <SimpleTable head={["Row", "Problem"]} rows={check.errors.map((e) => [e.row || "—", e.message])} />
          )}
          {check.sample.length > 0 && (
            <section>
              <h3 className="mb-2 text-lg font-semibold">Preview (first rows, as they will be read)</h3>
              <SimpleTable head={kind.fields.filter((f) => mapping[f.key]).map((f) => f.label)} rows={check.sample.map((r) => kind.fields.filter((f) => mapping[f.key]).map((f) => r[f.key]))} />
            </section>
          )}
        </>
      )}
    </div>
  );
}
