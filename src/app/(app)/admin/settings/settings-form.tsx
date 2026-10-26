"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { selectClass } from "@/components/forms/field";
import { useAction } from "@/components/forms/use-action";
import { saveSettingAction } from "@/domains/sales/setup-actions";

export type SettingField = { key: string; section: string; label: string; kind: "bool" | "int" | "text" | "time" | "pesoCents" | "percentBp" | "select"; options?: { value: string; label: string }[]; value: string | number | boolean };

/** Shown value ↔ stored value. */
const toShown = (f: SettingField) => (f.kind === "pesoCents" ? (Number(f.value) / 100).toFixed(2) : f.kind === "percentBp" ? String(Number(f.value) / 100) : String(f.value));
const toStored = (f: SettingField, v: string): unknown => {
  if (f.kind === "pesoCents") return String(Math.round(Number(v.replace(/,/g, "")) * 100));
  if (f.kind === "percentBp") return Math.round(Number(v) * 100);
  if (f.kind === "int") return Number(v);
  return v;
};

function Row({ f }: { f: SettingField }) {
  const router = useRouter();
  const [v, setV] = useState(toShown(f));
  const save = useAction(saveSettingAction, { onSuccess: () => router.refresh() });
  const run = (value: unknown) => save.run({ key: f.key, locationId: null, value });
  if (f.kind === "bool")
    return (
      <label className="flex items-center gap-3 py-2 text-sm">
        <Switch checked={!!f.value} onCheckedChange={(c) => run(c)} disabled={save.pending} />
        {f.label}
      </label>
    );
  return (
    <form
      className="flex flex-wrap items-center gap-3 py-2"
      onSubmit={(e) => {
        e.preventDefault();
        run(toStored(f, v));
      }}
    >
      <label htmlFor={`s-${f.key}`} className="min-w-64 flex-1 text-sm">
        {f.label}
      </label>
      {f.kind === "select" ? (
        <select id={`s-${f.key}`} className={selectClass + " w-auto"} value={v} onChange={(e) => (setV(e.target.value), run(e.target.value))}>
          {f.options!.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      ) : (
        <>
          <Input id={`s-${f.key}`} type={f.kind === "time" ? "time" : "text"} inputMode={f.kind === "text" || f.kind === "time" ? undefined : "decimal"} value={v} onChange={(e) => setV(e.target.value)} className={f.kind === "text" ? "w-80" : "w-32"} />
          <Button type="submit" variant="outline" size="sm" disabled={save.pending || v === toShown(f)}>
            Save
          </Button>
        </>
      )}
    </form>
  );
}

export function SettingsForm({ fields }: { fields: SettingField[] }) {
  const sections = [...new Set(fields.map((f) => f.section))];
  return (
    <div className="max-w-3xl space-y-8">
      {sections.map((s) => (
        <section key={s}>
          <h2 className="mb-1 text-2xl">{s}</h2>
          <div className="divide-y rounded-lg border px-4">
            {fields
              .filter((f) => f.section === s)
              .map((f) => (
                <Row key={f.key} f={f} />
              ))}
          </div>
        </section>
      ))}
    </div>
  );
}
