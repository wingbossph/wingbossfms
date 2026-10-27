"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "cn";

const PRESETS = [
  { value: "today", label: "Today" },
  { value: "week", label: "This week" },
  { value: "month", label: "This month" },
  { value: "custom", label: "Custom" },
];

export function DashboardFilters({ preset, from, to, location, compare, locations }: { preset: string; from: string; to: string; location: string; compare: string; locations: { id: string; name: string }[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, start] = useTransition();
  const set = (patch: Record<string, string>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) next.set(k, v);
    start(() => router.replace(`${pathname}?${next}`));
  };
  const sel = "h-10 rounded-md border border-input bg-background px-3 text-sm";
  return (
    <div className={cn("no-print mb-6 flex flex-wrap items-center gap-2", pending && "opacity-60")}>
      <div role="group" aria-label="Period" className="flex overflow-hidden rounded-md border">
        {PRESETS.map((p) => (
          <button key={p.value} type="button" onClick={() => set({ preset: p.value, ...(p.value === "custom" ? { from, to } : {}) })} aria-pressed={preset === p.value} className={cn("h-10 px-3 text-sm", preset === p.value ? "bg-foreground text-background" : "hover:bg-muted")}>
            {p.label}
          </button>
        ))}
      </div>
      {preset === "custom" && (
        <>
          <Input type="date" value={from} onChange={(e) => set({ from: e.target.value })} className="w-auto" aria-label="From" />
          <Input type="date" value={to} onChange={(e) => set({ to: e.target.value })} className="w-auto" aria-label="To" />
        </>
      )}
      <select className={sel} value={location} onChange={(e) => set({ location: e.target.value })} aria-label="Location">
        {locations.length > 1 && <option value="all">All locations (consolidated)</option>}
        {locations.map((l) => (
          <option key={l.id} value={l.id}>
            {l.name}
          </option>
        ))}
      </select>
      <select className={sel} value={compare} onChange={(e) => set({ compare: e.target.value })} aria-label="Compare with">
        <option value="prev">vs previous period</option>
        <option value="yoy">vs same period last year</option>
      </select>
    </div>
  );
}
