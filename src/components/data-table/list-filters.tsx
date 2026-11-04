"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MONTH_NAMES, rangeOfYearMonth, recentYears, yearMonthOf } from "@/lib/year-month";

export type FilterOption = { value: string; label: string };

type Props = {
  /** Show from/to date inputs (?from=YYYY-MM-DD&to=YYYY-MM-DD). */
  dateRange?: boolean;
  /** With dateRange: Year and Month (or Whole year) selects that set from/to in one pick. Pass today (Manila). */
  yearMonth?: { today: string };
  /** Location options (?location=id). "All" is always offered. */
  locations?: FilterOption[];
  /** Category options (?category=value), label configurable per list. */
  categories?: FilterOption[];
  categoryLabel?: string;
  /** Extra select filters, each bound to its own query param. */
  extra?: { param: string; label: string; options: FilterOption[] }[];
};

/** Standard list filters (date range, location, category) kept in the URL. */
export function ListFilters({ dateRange, yearMonth, locations, categories, categoryLabel = "Category", extra = [] }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  function set(param: string, value: string) {
    setMany({ [param]: value });
  }
  function setMany(patch: Record<string, string>) {
    const next = new URLSearchParams(params);
    for (const [param, value] of Object.entries(patch)) {
      if (value) next.set(param, value);
      else next.delete(param);
    }
    startTransition(() => router.replace(`${pathname}?${next.toString()}`));
  }
  const ym = yearMonth ? yearMonthOf(params.get("from") ?? undefined, params.get("to") ?? undefined, yearMonth.today) : null;
  const pick = (year: number, month: number) => setMany(rangeOfYearMonth(year, month, yearMonth!.today));
  const selectClass = "h-10 rounded-md border border-input bg-background px-3 text-sm";

  const selects = [
    ...(locations ? [{ param: "location", label: "Location", options: locations }] : []),
    ...(categories ? [{ param: "category", label: categoryLabel, options: categories }] : []),
    ...extra,
  ];

  return (
    <div className="no-print mb-4 flex flex-wrap items-end gap-3" aria-busy={pending}>
      {dateRange && ym && yearMonth && (
        <>
          <div className="space-y-1">
            <Label htmlFor="f-year" className="text-xs uppercase tracking-wider">Year</Label>
            <select id="f-year" className={selectClass} value={ym.year} onChange={(e) => pick(Number(e.target.value), ym.month === -1 ? 0 : ym.month)}>
              {recentYears(yearMonth.today).map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="f-month" className="text-xs uppercase tracking-wider">Month</Label>
            <select id="f-month" className={selectClass} value={ym.month} onChange={(e) => pick(ym.year, Number(e.target.value))}>
              {ym.month === -1 && <option value={-1}>Month…</option>}
              <option value={0}>Whole year</option>
              {MONTH_NAMES.map((name, i) => (
                <option key={name} value={i + 1} disabled={`${ym.year}-${String(i + 1).padStart(2, "0")}-01` > yearMonth.today}>
                  {name}
                </option>
              ))}
            </select>
          </div>
        </>
      )}
      {dateRange && (
        <>
          <div className="space-y-1">
            <Label htmlFor="f-from" className="text-xs uppercase tracking-wider">From</Label>
            <Input key={`from-${params.get("from") ?? ""}`} id="f-from" type="date" className="h-10 w-40" defaultValue={params.get("from") ?? ""} onChange={(e) => set("from", e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="f-to" className="text-xs uppercase tracking-wider">To</Label>
            <Input key={`to-${params.get("to") ?? ""}`} id="f-to" type="date" className="h-10 w-40" defaultValue={params.get("to") ?? ""} onChange={(e) => set("to", e.target.value)} />
          </div>
        </>
      )}
      {selects.map((s) => (
        <div key={s.param} className="space-y-1">
          <Label htmlFor={`f-${s.param}`} className="text-xs uppercase tracking-wider">{s.label}</Label>
          <select
            id={`f-${s.param}`}
            value={params.get(s.param) ?? ""}
            onChange={(e) => set(s.param, e.target.value)}
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="">All</option>
            {s.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      ))}
      {params.size > 0 && (
        <Button variant="ghost" onClick={() => startTransition(() => router.replace(pathname))}>
          Clear filters
        </Button>
      )}
    </div>
  );
}
