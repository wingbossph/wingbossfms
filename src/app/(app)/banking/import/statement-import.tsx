"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, selectClass } from "@/components/forms/field";
import { SimpleTable } from "@/components/data-table/simple-table";
import { importStatementAction, previewStatementAction, type StatementPreview } from "@/domains/banking/actions";
import type { StatementConfig } from "@/domains/banking/formats";
import { formatPeso } from "@/lib/money";

type Account = { id: string; name: string; formatId: string | null };
type Format = { id: string; name: string; config: StatementConfig };

const COLUMNS: { key: keyof StatementConfig["columns"]; label: string; required?: boolean }[] = [
  { key: "date", label: "Date", required: true },
  { key: "description", label: "Description", required: true },
  { key: "reference", label: "Reference" },
  { key: "debit", label: "Money out (debit)" },
  { key: "credit", label: "Money in (credit)" },
  { key: "amount", label: "Signed amount (instead of debit/credit)" },
  { key: "balance", label: "Balance" },
];

async function toBase64(file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

export function StatementImport(props: { accounts: Account[]; defaultAccountId: string; formats: Format[] }) {
  const router = useRouter();
  const [accountId, setAccountId] = useState(props.defaultAccountId);
  const account = props.accounts.find((a) => a.id === accountId);
  const [formatId, setFormatId] = useState(account?.formatId ?? props.formats[0]?.id ?? "");
  const [file, setFile] = useState<{ name: string; content: string } | null>(null);
  const [preview, setPreview] = useState<StatementPreview | null>(null);
  const [config, setConfig] = useState<StatementConfig | null>(null);
  const [saveAs, setSaveAs] = useState("");
  const [autoMatch, setAutoMatch] = useState(true);
  const [pending, start] = useTransition();

  function runPreview(f = file, cfg: StatementConfig | null = config, fmt = formatId) {
    if (!f) return;
    start(async () => {
      const res = await previewStatementAction({ moneyAccountId: accountId, fileName: f.name, content: f.content, formatId: fmt || undefined, config: cfg ?? undefined });
      if (!res.ok || !res.preview) return void toast.error(res.message ?? "Could not read the file.");
      setPreview(res.preview);
      setConfig(res.preview.config);
    });
  }

  function setCol(k: keyof StatementConfig["columns"], v: string) {
    if (!config) return;
    const next = { ...config, columns: { ...config.columns, [k]: v || undefined } };
    if (k === "amount" && v) next.columns = { ...next.columns, debit: undefined, credit: undefined };
    if ((k === "debit" || k === "credit") && v) next.columns = { ...next.columns, amount: undefined };
    setConfig(next);
    runPreview(file, next);
  }

  function doImport() {
    if (!file || !config) return;
    start(async () => {
      const res = await importStatementAction({ moneyAccountId: accountId, fileName: file.name, content: file.content, formatId: formatId || undefined, config, saveFormatAs: saveAs, autoMatch });
      if (!res.ok) return void toast.error(res.message ?? "Import failed.");
      toast.success(res.message ?? "Imported.");
      router.push(`/banking/${accountId}`);
    });
  }

  if (!props.accounts.length) return <p className="text-sm">No accounts you can reconcile.</p>;
  return (
    <div className="max-w-4xl space-y-6">
      <div className="grid gap-3 sm:grid-cols-3">
        <Field id="ia" label="Account">
          <select
            id="ia"
            className={selectClass}
            value={accountId}
            onChange={(e) => {
              setAccountId(e.target.value);
              const fmt = props.accounts.find((a) => a.id === e.target.value)?.formatId;
              if (fmt) setFormatId(fmt);
            }}
          >
            {props.accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </Field>
        <Field id="if" label="Statement format">
          <select
            id="if"
            className={selectClass}
            value={formatId}
            onChange={(e) => {
              setFormatId(e.target.value);
              setConfig(null);
              runPreview(file, null, e.target.value);
            }}
          >
            <option value="">Detect from the file</option>
            {props.formats.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </Field>
        <Field id="ifile" label="File (CSV or .xlsx)">
          <Input
            id="ifile"
            type="file"
            accept=".csv,.txt,.xlsx"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              const loaded = { name: f.name, content: await toBase64(f) };
              setFile(loaded);
              setConfig(null);
              runPreview(loaded, null);
            }}
          />
        </Field>
      </div>

      {preview && config && (
        <>
          <details className="rounded-lg border p-3" open={preview.errors.length > 0}>
            <summary className="cursor-pointer text-sm font-semibold">Column mapping {preview.errors.length ? "(needs attention)" : ""}</summary>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              {COLUMNS.map((c) => (
                <Field key={c.key} id={`col-${c.key}`} label={c.label}>
                  <select id={`col-${c.key}`} className={selectClass} value={config.columns[c.key] ?? ""} onChange={(e) => setCol(c.key, e.target.value)}>
                    {!c.required && <option value="">—</option>}
                    {preview.headers.map((h, i) => (
                      <option key={`${h}-${i}`} value={h}>
                        {h || `(column ${i + 1})`}
                      </option>
                    ))}
                  </select>
                </Field>
              ))}
              <Field id="col-skip" label="Rows above the header">
                <Input
                  id="col-skip"
                  type="number"
                  min={0}
                  max={50}
                  value={config.skipRows}
                  onChange={(e) => {
                    const next = { ...config, skipRows: Math.max(0, Number(e.target.value) || 0) };
                    setConfig(next);
                    runPreview(file, next);
                  }}
                />
              </Field>
              <Field id="col-order" label="Date order">
                <select
                  id="col-order"
                  className={selectClass}
                  value={config.dateOrder}
                  onChange={(e) => {
                    const next = { ...config, dateOrder: e.target.value as StatementConfig["dateOrder"] };
                    setConfig(next);
                    runPreview(file, next);
                  }}
                >
                  <option value="MDY">Month/day/year</option>
                  <option value="DMY">Day/month/year</option>
                  <option value="YMD">Year-month-day</option>
                </select>
              </Field>
              {config.columns.amount && (
                <Field id="col-sign" label="Money in is">
                  <select
                    id="col-sign"
                    className={selectClass}
                    value={config.sign}
                    onChange={(e) => {
                      const next = { ...config, sign: e.target.value as StatementConfig["sign"] };
                      setConfig(next);
                      runPreview(file, next);
                    }}
                  >
                    <option value="inflowPositive">Positive</option>
                    <option value="inflowNegative">Negative</option>
                  </select>
                </Field>
              )}
            </div>
          </details>

          {preview.errors.length > 0 && (
            <ul className="space-y-1 rounded-md border border-warning p-3 text-sm" role="alert">
              {preview.errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          )}

          <p className="text-sm">
            <strong>{preview.count}</strong> transactions{preview.from ? ` from ${preview.from} to ${preview.to}` : ""} · money in {formatPeso(BigInt(preview.inflowCents))} · money out {formatPeso(BigInt(preview.outflowCents))}
          </p>
          <SimpleTable
            head={["Date", "Description", "Reference", "Amount", "Balance"]}
            rows={preview.sample.map((l) => [
              l.date,
              l.description,
              l.reference ?? "",
              <span key="a" className={BigInt(l.amountCents) < 0n ? "text-destructive" : ""}>
                {formatPeso(BigInt(l.amountCents))}
              </span>,
              l.balanceCents ? formatPeso(BigInt(l.balanceCents)) : "",
            ])}
          />

          <div className="flex flex-wrap items-end gap-4">
            <Field id="isave" label="Save this mapping as (optional)">
              <Input id="isave" value={saveAs} onChange={(e) => setSaveAs(e.target.value)} placeholder="BDO checking CSV" />
            </Field>
            <label className="flex h-10 items-center gap-2 text-sm">
              <input type="checkbox" checked={autoMatch} onChange={(e) => setAutoMatch(e.target.checked)} className="size-4" />
              Auto-match after import
            </label>
            <Button className="h-11 px-8" disabled={pending || preview.errors.length > 0 || preview.count === 0} onClick={doImport}>
              {pending ? "Working…" : `Import ${preview.count} lines`}
            </Button>
          </div>
        </>
      )}
      {pending && !preview && <p className="text-sm text-muted-foreground">Reading the file…</p>}
    </div>
  );
}
