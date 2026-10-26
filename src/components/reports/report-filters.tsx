"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

type Option = { value: string; label: string };

export type FilterSpec = {
  range?: { from: string; to: string };
  asOf?: string;
  locations?: Option[];
  location?: string;
  columns?: { value: string; options: Option[] };
  basis?: string;
  accounts?: Option[];
  account?: string;
  sources?: Option[];
  source?: string;
  extra?: { param: string; label: string; value: string; options: Option[] }[];
};

const selectCls = "h-10 rounded-md border border-input bg-background px-3 text-sm";

/** Report filters kept in the URL (so exports and bookmarks use the same parameters). */
export function ReportFilters({ spec }: { spec: FilterSpec }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, start] = useTransition();
  const set = (patch: Record<string, string>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    start(() => router.replace(`${pathname}?${next.toString()}`));
  };
  const presets: { label: string; from: string; to: string }[] = (() => {
    const today = new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10);
    const [y, m] = today.split("-").map(Number);
    const iso = (d: Date) => d.toISOString().slice(0, 10);
    const lastMonthEnd = iso(new Date(Date.UTC(y, m - 1, 0)));
    return [
      { label: "This month", from: `${today.slice(0, 7)}-01`, to: today },
      { label: "Last month", from: `${lastMonthEnd.slice(0, 7)}-01`, to: lastMonthEnd },
      { label: "This year", from: `${y}-01-01`, to: today },
    ];
  })();

  return (
    <div className="no-print mb-6 flex flex-wrap items-end gap-3" aria-busy={pending}>
      {spec.range && (
        <>
          <div className="space-y-1">
            <Label htmlFor="rf-from" className="text-xs uppercase tracking-wider">From</Label>
            <Input id="rf-from" type="date" className="h-10 w-40" value={spec.range.from} onChange={(e) => set({ from: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="rf-to" className="text-xs uppercase tracking-wider">To</Label>
            <Input id="rf-to" type="date" className="h-10 w-40" value={spec.range.to} onChange={(e) => set({ to: e.target.value })} />
          </div>
          <div className="flex gap-1">
            {presets.map((p) => (
              <Button key={p.label} variant="ghost" size="sm" onClick={() => set({ from: p.from, to: p.to })}>
                {p.label}
              </Button>
            ))}
          </div>
        </>
      )}
      {spec.asOf !== undefined && (
        <div className="space-y-1">
          <Label htmlFor="rf-asof" className="text-xs uppercase tracking-wider">As of</Label>
          <Input id="rf-asof" type="date" className="h-10 w-40" value={spec.asOf} onChange={(e) => set({ asOf: e.target.value })} />
        </div>
      )}
      {spec.locations && spec.locations.length > 1 && (
        <Sel label="Location" id="rf-loc" value={spec.location ?? "all"} options={[{ value: "all", label: "All locations" }, ...spec.locations]} onChange={(v) => set({ location: v === "all" ? "" : v })} />
      )}
      {spec.columns && <Sel label="Columns" id="rf-cols" value={spec.columns.value} options={spec.columns.options} onChange={(v) => set({ columns: v })} />}
      {spec.basis !== undefined && (
        <Sel
          label="Costs"
          id="rf-basis"
          value={spec.basis}
          options={[
            { value: "allocated", label: "After allocations" },
            { value: "direct", label: "Direct only" },
          ]}
          onChange={(v) => set({ basis: v })}
        />
      )}
      {spec.accounts && <Sel label="Account" id="rf-acct" value={spec.account ?? ""} options={[{ value: "", label: "Choose…" }, ...spec.accounts]} onChange={(v) => set({ account: v })} />}
      {spec.sources && <Sel label="Source" id="rf-src" value={spec.source ?? ""} options={[{ value: "", label: "All" }, ...spec.sources]} onChange={(v) => set({ source: v })} />}
      {spec.extra?.map((x) => <Sel key={x.param} label={x.label} id={`rf-${x.param}`} value={x.value} options={x.options} onChange={(v) => set({ [x.param]: v })} />)}
    </div>
  );
}

function Sel({ label, id, value, options, onChange }: { label: string; id: string; value: string; options: Option[]; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-xs uppercase tracking-wider">
        {label}
      </Label>
      <select id={id} className={selectCls} value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
