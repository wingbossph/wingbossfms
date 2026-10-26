"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type FilterOption = { value: string; label: string };

type Props = {
  /** Show from/to date inputs (?from=YYYY-MM-DD&to=YYYY-MM-DD). */
  dateRange?: boolean;
  /** Location options (?location=id). "All" is always offered. */
  locations?: FilterOption[];
  /** Category options (?category=value), label configurable per list. */
  categories?: FilterOption[];
  categoryLabel?: string;
  /** Extra select filters, each bound to its own query param. */
  extra?: { param: string; label: string; options: FilterOption[] }[];
};

/** Standard list filters (date range, location, category) kept in the URL. */
export function ListFilters({ dateRange, locations, categories, categoryLabel = "Category", extra = [] }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  function set(param: string, value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(param, value);
    else next.delete(param);
    startTransition(() => router.replace(`${pathname}?${next.toString()}`));
  }

  const selects = [
    ...(locations ? [{ param: "location", label: "Location", options: locations }] : []),
    ...(categories ? [{ param: "category", label: categoryLabel, options: categories }] : []),
    ...extra,
  ];

  return (
    <div className="no-print mb-4 flex flex-wrap items-end gap-3" aria-busy={pending}>
      {dateRange && (
        <>
          <div className="space-y-1">
            <Label htmlFor="f-from" className="text-xs uppercase tracking-wider">From</Label>
            <Input id="f-from" type="date" className="h-10 w-40" defaultValue={params.get("from") ?? ""} onChange={(e) => set("from", e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="f-to" className="text-xs uppercase tracking-wider">To</Label>
            <Input id="f-to" type="date" className="h-10 w-40" defaultValue={params.get("to") ?? ""} onChange={(e) => set("to", e.target.value)} />
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
