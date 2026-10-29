"use client";

import { useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "cn";

export type CategoryGroup = { group: string; accounts: { id: string; name: string; code?: string }[] };

/** Expense category select with a search box on top (matches the category, its group or code). */
export function CategoryPicker({
  value,
  onChange,
  groups,
  placeholder = "Choose category…",
  className,
  ariaLabel = "Category",
}: {
  value: string;
  onChange: (id: string) => void;
  groups: CategoryGroup[];
  placeholder?: string;
  className?: string;
  ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const selected = useMemo(() => groups.flatMap((g) => g.accounts).find((a) => a.id === value), [groups, value]);
  const filtered = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) return groups;
    return groups
      .map((g) => ({ ...g, accounts: g.accounts.filter((a) => words.every((w) => `${a.name} ${g.group} ${a.code ?? ""}`.toLowerCase().includes(w))) }))
      .filter((g) => g.accounts.length);
  }, [groups, q]);
  const first = filtered[0]?.accounts[0];

  function pick(id: string) {
    onChange(id);
    setOpen(false);
    setQ("");
  }

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setQ("");
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={ariaLabel}
          aria-haspopup="listbox"
          className={cn(
            "flex h-9 w-full items-center justify-between gap-2 rounded-md border border-input bg-transparent px-3 text-left text-sm shadow-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
            !selected && "text-muted-foreground",
            className,
          )}
        >
          <span className="truncate">{selected?.name ?? placeholder}</span>
          <ChevronDown className="size-4 shrink-0 opacity-60" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] min-w-64 p-0" onOpenAutoFocus={(e) => (e.preventDefault(), input.current?.focus())}>
        <div className="flex items-center gap-2 border-b px-3">
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <input
            ref={input}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && first) {
                e.preventDefault();
                pick(first.id);
              }
            }}
            placeholder="Search category…"
            aria-label="Search category"
            className="h-10 w-full bg-transparent text-sm outline-none"
          />
        </div>
        <div role="listbox" aria-label={ariaLabel} className="max-h-72 overflow-y-auto py-1">
          {filtered.length === 0 && <p className="px-3 py-2 text-sm text-muted-foreground">No category matches “{q}”.</p>}
          {filtered.map((g) => (
            <div key={g.group}>
              <p className="px-3 pt-2 pb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{g.group}</p>
              {g.accounts.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  role="option"
                  aria-selected={a.id === value}
                  onClick={() => pick(a.id)}
                  className={cn("flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-sm hover:bg-muted", a.id === first?.id && q && "bg-muted")}
                >
                  <span>{a.name}</span>
                  {a.id === value && <Check className="size-4" />}
                </button>
              ))}
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
