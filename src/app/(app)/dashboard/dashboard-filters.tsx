"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "cn";
import { MONTH_NAMES, rangeOfYearMonth, recentYears, yearMonthOf } from "@/lib/year-month";

const PRESETS = [
  { value: "today", label: "Today" },
  { value: "week", label: "This week" },
  { value: "month", label: "This month" },
  { value: "custom", label: "Custom" },
];

export function DashboardFilters({ preset, from, to, location, compare, locations, today }: { preset: string; from: string; to: string; location: string; compare: string; locations: { id: string; name: string }[]; today: string }) {
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
  const ym = yearMonthOf(from, to, today);
  const years = recentYears(today);
  // A year/month choice is a custom range; a period that hasn't ended stops at today.
  const pick = (year: number, month: number) => set({ preset: "custom", ...rangeOfYearMonth(year, month, today) });
  return (
    <div className={cn("no-print mb-6 flex flex-wrap items-center gap-2", pending && "opacity-60")}>
      <div role="group" aria-label="Period" className="flex overflow-hidden rounded-md border">
        {PRESETS.map((p) => (
          <button key={p.value} type="button" onClick={() => set({ preset: p.value, ...(p.value === "custom" ? { from, to } : {}) })} aria-pressed={preset === p.value} className={cn("h-10 px-3 text-sm", preset === p.value ? "bg-foreground text-background" : "hover:bg-muted")}>
            {p.label}
          </button>
        ))}
      </div>
      <select className={sel} value={ym.year} onChange={(e) => pick(Number(e.target.value), ym.month === -1 ? 0 : ym.month)} aria-label="Year">
        {years.map((y) => (
          <option key={y} value={y}>
            {y}
          </option>
        ))}
      </select>
      <select className={sel} value={ym.month} onChange={(e) => pick(ym.year, Number(e.target.value))} aria-label="Month">
        {ym.month === -1 && <option value={-1}>Month…</option>}
        <option value={0}>Whole year</option>
        {MONTH_NAMES.map((name, i) => (
          <option key={name} value={i + 1} disabled={`${ym.year}-${String(i + 1).padStart(2, "0")}-01` > today}>
            {name}
          </option>
        ))}
      </select>
      {preset === "custom" && (
        <>
          <Input type="date" value={from} onChange={(e) => set({ from: e.target.value })} className="w-auto" aria-label="From" />
          <Input type="date" value={to} onChange={(e) => set({ to: e.target.value })} className="w-auto" aria-label="To" />
        </>
      )}
      <select className={sel} value={location} onChange={(e) => set({ location: e.target.value })} aria-label="Location">
        {locations.length > 1 && <option value="all">All locations (consolidated)</option>}
        {locations.length > 1 && <option value="leaderboard">Leaderboard (rank all locations)</option>}
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
